package extract

import (
	"strings"

	sitter "github.com/tree-sitter/go-tree-sitter"
)

// collectCalls walks the whole tree and records call sites.
func (c *fileCtx) collectCalls(n *sitter.Node, out *[]Call) {
	if c.spec.comments[n.Kind()] {
		return
	}
	if c.spec.calls[n.Kind()] {
		if call, ok := c.buildCall(n); ok {
			*out = append(*out, call)
		}
	}
	for i := uint(0); i < n.NamedChildCount(); i++ {
		c.collectCalls(n.NamedChild(i), out)
	}
}

func (c *fileCtx) enclosing(n *sitter.Node) string {
	var best *symNode
	s, e := n.StartByte(), n.EndByte()
	for _, sn := range c.syms {
		if sn.start <= s && e <= sn.end {
			if best == nil || (sn.end-sn.start) < (best.end-best.start) {
				best = sn
			}
		}
	}
	if best == nil {
		return ""
	}
	return best.sym.ID
}

func (c *fileCtx) buildCall(n *sitter.Node) (Call, bool) {
	call := Call{Line: int(n.StartPosition().Row) + 1, Enclosing: c.enclosing(n)}
	var calleeNode, argsNode *sitter.Node
	switch c.spec.name {
	case "kotlin":
		if n.Kind() == "annotation" {
			ci := childOfKind(n, "constructor_invocation")
			if ci == nil {
				ut := childOfKind(n, "user_type")
				if ut == nil {
					return call, false
				}
				call.Callee = "@" + compact(c.text(ut))
				call.CalleeText = call.Callee
				return call, true
			}
			calleeNode = childOfKind(ci, "user_type")
			argsNode = childOfKind(ci, "value_arguments")
			call.Callee = "@" + lastIdent(calleeNode, c.src)
			call.CalleeText = "@" + compact(c.text(calleeNode))
		} else {
			calleeNode = n.NamedChild(0)
			argsNode = childOfKind(n, "value_arguments")
		}
	case "swift":
		calleeNode = n.NamedChild(0)
		if cs := childOfKind(n, "call_suffix"); cs != nil {
			argsNode = childOfKind(cs, "value_arguments")
		}
	case "java":
		switch n.Kind() {
		case "annotation":
			calleeNode = n.ChildByFieldName("name")
			argsNode = n.ChildByFieldName("arguments")
			if calleeNode != nil {
				call.Callee = "@" + lastIdent(calleeNode, c.src)
				call.CalleeText = "@" + c.text(calleeNode)
			}
		case "object_creation_expression":
			calleeNode = n.ChildByFieldName("type")
			argsNode = n.ChildByFieldName("arguments")
		default:
			calleeNode = n.ChildByFieldName("name")
			argsNode = n.ChildByFieldName("arguments")
			if obj := n.ChildByFieldName("object"); obj != nil {
				call.Receiver = compact(c.text(obj))
			}
		}
	default: // ts-like
		calleeNode = n.ChildByFieldName("function")
		if calleeNode == nil {
			calleeNode = n.ChildByFieldName("constructor")
		}
		argsNode = n.ChildByFieldName("arguments")
	}
	if calleeNode == nil {
		return call, false
	}
	if call.Callee == "" {
		call.Callee = lastIdent(calleeNode, c.src)
		call.CalleeText = compact(c.text(calleeNode))
		if len(call.CalleeText) > 160 {
			call.CalleeText = call.CalleeText[len(call.CalleeText)-160:]
		}
	}
	if call.Receiver == "" {
		if obj := calleeNode.ChildByFieldName("object"); obj != nil {
			call.Receiver = truncate(compact(c.text(obj)), 160)
		} else if t := calleeNode.ChildByFieldName("target"); t != nil {
			call.Receiver = truncate(compact(c.text(t)), 160)
		} else if calleeNode.Kind() == "navigation_expression" && calleeNode.NamedChildCount() > 1 {
			call.Receiver = truncate(compact(c.text(calleeNode.NamedChild(0))), 160)
		}
	}
	if argsNode != nil {
		for i := uint(0); i < argsNode.NamedChildCount(); i++ {
			a := argsNode.NamedChild(i)
			if c.spec.comments[a.Kind()] {
				continue
			}
			call.Args = append(call.Args, c.buildArg(a))
		}
	}
	// nested callee names (lambda bodies, ArkUI children, trailing closures)
	var inner func(x *sitter.Node, depth int)
	inner = func(x *sitter.Node, depth int) {
		if depth > 12 {
			return
		}
		for i := uint(0); i < x.NamedChildCount(); i++ {
			ch := x.NamedChild(i)
			if c.spec.calls[ch.Kind()] && ch.Kind() != "annotation" {
				var cn *sitter.Node
				switch c.spec.name {
				case "kotlin", "swift":
					cn = ch.NamedChild(0)
				case "java":
					cn = ch.ChildByFieldName("name")
				default:
					cn = ch.ChildByFieldName("function")
				}
				if cn != nil {
					if name := lastIdent(cn, c.src); name != "" {
						call.Inner = append(call.Inner, name)
					}
				}
			}
			inner(ch, depth+1)
		}
	}
	for i := uint(0); i < n.NamedChildCount(); i++ {
		ch := n.NamedChild(i)
		if ch.StartByte() == calleeNode.StartByte() && ch.EndByte() == calleeNode.EndByte() {
			continue
		}
		inner(ch, 0)
	}
	return call, true
}

func (c *fileCtx) buildArg(a *sitter.Node) Arg {
	expr := a
	arg := Arg{}
	switch a.Kind() {
	case "value_argument":
		if c.spec.name == "swift" {
			if l := a.ChildByFieldName("name"); l != nil {
				arg.Label = strings.TrimSuffix(compact(c.text(l)), ":")
			}
			if v := a.ChildByFieldName("value"); v != nil {
				expr = v
			}
		} else { // kotlin: [identifier '='] expression
			cnt := a.NamedChildCount()
			if cnt >= 2 && hasToken(a, "=") {
				arg.Label = c.text(a.NamedChild(0))
			}
			if cnt > 0 {
				expr = a.NamedChild(cnt - 1)
			}
		}
	case "element_value_pair": // java annotation
		if k := a.ChildByFieldName("key"); k != nil {
			arg.Label = c.text(k)
		}
		if v := a.ChildByFieldName("value"); v != nil {
			expr = v
		}
	}
	arg.Text = truncate(compact(c.text(expr)), 200)
	arg.Parts = c.evalParts(expr)
	if expr.Kind() == "object" {
		arg.Props = map[string]string{}
		for i := uint(0); i < expr.NamedChildCount(); i++ {
			p := expr.NamedChild(i)
			if p.Kind() != "pair" {
				continue
			}
			k, v := p.ChildByFieldName("key"), p.ChildByFieldName("value")
			if k != nil && v != nil {
				arg.Props[strings.Trim(c.text(k), `"'`)] = truncate(compact(c.text(v)), 120)
			}
		}
	}
	return arg
}

// evalParts statically evaluates a string-ish expression into parts.
func (c *fileCtx) evalParts(n *sitter.Node) []Part {
	k := n.Kind()
	switch {
	case c.spec.strings[k]:
		var parts []Part
		var walk func(x *sitter.Node)
		walk = func(x *sitter.Node) {
			for i := uint(0); i < x.NamedChildCount(); i++ {
				ch := x.NamedChild(i)
				switch ch.Kind() {
				case "string_content", "string_fragment", "line_str_text", "multi_line_str_text", "escape_sequence", "str_escaped_char":
					parts = appendLit(parts, c.text(ch))
				case "interpolation", "interpolated_expression", "template_substitution", "line_string_interpolation":
					parts = append(parts, Part{Param: lastIdent(ch, c.src)})
				default:
					if c.spec.idents[ch.Kind()] { // kotlin "$id" form
						parts = append(parts, Part{Param: c.text(ch)})
					} else {
						walk(ch)
					}
				}
			}
		}
		walk(n)
		if len(parts) == 0 && n.NamedChildCount() == 0 && c.spec.name == "java" {
			parts = appendLit(parts, strings.Trim(c.text(n), `"`))
		}
		return parts
	case k == "parenthesized_expression":
		if n.NamedChildCount() == 1 {
			return c.evalParts(n.NamedChild(0))
		}
	case strings.Contains(k, "binary") || strings.Contains(k, "additive"):
		if n.NamedChildCount() == 2 && strings.Contains(c.text(n), "+") {
			l := c.evalParts(n.NamedChild(0))
			r := c.evalParts(n.NamedChild(1))
			return append(l, r...)
		}
	case c.spec.idents[k]:
		return []Part{{Ref: c.text(n)}}
	case k == "navigation_expression" || k == "member_expression" || k == "field_access" || k == "scoped_identifier":
		t := strings.ReplaceAll(compact(c.text(n)), " ", "")
		if !strings.ContainsAny(t, "()") {
			return []Part{{Ref: t}}
		}
	}
	return []Part{{Param: lastIdent(n, c.src)}}
}

func appendLit(parts []Part, s string) []Part {
	if len(parts) > 0 && parts[len(parts)-1].Lit != "" {
		parts[len(parts)-1].Lit += s
		return parts
	}
	if s == "" {
		return parts
	}
	return append(parts, Part{Lit: s})
}

func childOfKind(n *sitter.Node, kind string) *sitter.Node {
	if n == nil {
		return nil
	}
	for i := uint(0); i < n.NamedChildCount(); i++ {
		if ch := n.NamedChild(i); ch.Kind() == kind {
			return ch
		}
	}
	return nil
}

// lastIdent returns the last identifier-like leaf in n (depth-first).
func lastIdent(n *sitter.Node, src []byte) string {
	if n == nil {
		return ""
	}
	last := ""
	var walk func(x *sitter.Node)
	walk = func(x *sitter.Node) {
		switch x.Kind() {
		case "identifier", "simple_identifier", "type_identifier", "property_identifier", "field_identifier":
			last = string(src[x.StartByte():x.EndByte()])
			return
		case "value_arguments", "call_suffix", "arguments", "argument_list", "lambda_literal", "annotated_lambda":
			return
		}
		for i := uint(0); i < x.NamedChildCount(); i++ {
			walk(x.NamedChild(i))
		}
	}
	walk(n)
	return last
}
