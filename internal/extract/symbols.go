package extract

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"hash/fnv"
	"math/bits"
	"sort"
	"strings"

	sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/luckylucky0001/codewiki/internal/model"
)

// Part is one piece of a statically evaluated string expression.
type Part struct {
	Lit   string `json:"lit,omitempty"`
	Ref   string `json:"ref,omitempty"`   // identifier / qualified name, resolved later against constants
	Param string `json:"param,omitempty"` // interpolated expression (dynamic)
}

// Arg is one call argument.
type Arg struct {
	Label string            `json:"label,omitempty"`
	Text  string            `json:"text"`
	Parts []Part            `json:"parts,omitempty"`
	Props map[string]string `json:"props,omitempty"` // object literal key -> value text
}

// Call is a call site (or annotation / decorator) found in a file.
type Call struct {
	Callee     string   `json:"callee"`      // last identifier of the callee expression
	CalleeText string   `json:"callee_text"` // full callee expression text (whitespace-compacted)
	Args       []Arg    `json:"args"`
	Line       int      `json:"line"`
	Enclosing  string   `json:"enclosing"`          // symbol id of the innermost enclosing symbol
	Inner      []string `json:"inner,omitempty"`    // callee names of calls nested in this call
	Receiver   string   `json:"receiver,omitempty"` // text of the receiver of a chained call
}

// FileResult is the outcome of parsing one file.
type FileResult struct {
	Symbols []*model.Symbol
	Calls   []Call
	Failure *model.ParseFailure
}

type symNode struct {
	sym        *model.Symbol
	node       *sitter.Node
	start, end uint
}

type fileCtx struct {
	spec     *langSpec
	src      []byte
	platform string
	relPath  string // path relative to platform root (used in ids)
	repoPath string // path relative to repo root
	syms     []*symNode
	members  map[[2]uint]*symNode
	seen     map[string]int
}

// ParseFile parses src and extracts symbols and call sites. It never panics:
// internal errors are reported through FileResult.Failure.
func ParseFile(ps *Parsers, lang, platform, relPath, repoPath string, src []byte) (res FileResult) {
	defer func() {
		if r := recover(); r != nil {
			res = FileResult{Failure: &model.ParseFailure{File: repoPath, Error: fmt.Sprintf("extractor panic: %v", r)}}
		}
	}()
	parser, spec, err := ps.get(lang)
	if err != nil {
		return FileResult{Failure: &model.ParseFailure{File: repoPath, Error: err.Error()}}
	}
	tree := parser.Parse(src, nil)
	if tree == nil {
		return FileResult{Failure: &model.ParseFailure{File: repoPath, Error: "parser returned no tree"}}
	}
	defer tree.Close()
	root := tree.RootNode()
	c := &fileCtx{spec: spec, src: src, platform: platform, relPath: relPath, repoPath: repoPath,
		members: map[[2]uint]*symNode{}, seen: map[string]int{}}
	c.walkDecls(root, nil)
	for _, sn := range c.syms {
		c.finishSymbol(sn)
	}
	c.collectCalls(root, &res.Calls)
	for _, sn := range c.syms {
		res.Symbols = append(res.Symbols, sn.sym)
	}
	if root.HasError() {
		line, msg := firstError(root)
		res.Failure = &model.ParseFailure{File: repoPath, Line: line, Error: msg}
	}
	return res
}

func firstError(n *sitter.Node) (int, string) {
	if n.IsError() || n.IsMissing() {
		kind := "syntax error"
		if n.IsMissing() {
			kind = "missing " + n.Kind()
		}
		return int(n.StartPosition().Row) + 1, kind
	}
	for i := uint(0); i < n.ChildCount(); i++ {
		ch := n.Child(i)
		if ch.HasError() || ch.IsMissing() {
			return firstError(ch)
		}
	}
	return int(n.StartPosition().Row) + 1, "syntax error"
}

func (c *fileCtx) text(n *sitter.Node) string { return string(c.src[n.StartByte():n.EndByte()]) }

// walkDecls finds declarations; parent is the enclosing container symbol.
func (c *fileCtx) walkDecls(n *sitter.Node, parent *symNode) {
	for i := uint(0); i < n.NamedChildCount(); i++ {
		ch := n.NamedChild(i)
		kind := ch.Kind()
		if symKind, ok := c.spec.decls[kind]; ok && c.declAllowed(ch, parent) {
			sn := c.newSymbol(ch, symKind, parent)
			if sn != nil && c.spec.containers[kind] {
				c.walkDecls(ch, sn)
			} else if sn == nil && c.spec.transparent[kind] {
				c.walkDecls(ch, parent)
			}
			continue
		}
		if c.spec.transparent[kind] || (parent != nil && c.spec.bodies[kind]) {
			c.walkDecls(ch, parent)
		}
	}
}

func (c *fileCtx) declAllowed(n *sitter.Node, parent *symNode) bool {
	if n.Kind() == "variable_declarator" {
		// only top-level const/let/var (parent chain: lexical_declaration -> program/export)
		p := n.Parent()
		if p == nil {
			return false
		}
		gp := p.Parent()
		return parent == nil && gp != nil && (gp.Kind() == "program" || gp.Kind() == "export_statement")
	}
	return true
}

func (c *fileCtx) declName(n *sitter.Node) string {
	switch n.Kind() {
	case "property_declaration":
		if c.spec.name == "kotlin" {
			for i := uint(0); i < n.NamedChildCount(); i++ {
				ch := n.NamedChild(i)
				if ch.Kind() == "variable_declaration" || ch.Kind() == "multi_variable_declaration" {
					return firstIdent(ch, c.src)
				}
			}
		}
		if f := n.ChildByFieldName("name"); f != nil {
			if b := f.ChildByFieldName("bound_identifier"); b != nil {
				return c.text(b)
			}
			return firstIdent(f, c.src)
		}
	case "field_declaration":
		if d := n.ChildByFieldName("declarator"); d != nil {
			if nm := d.ChildByFieldName("name"); nm != nil {
				return c.text(nm)
			}
		}
	case "init_declaration":
		return "init"
	case "secondary_constructor":
		return "constructor"
	case "class_declaration":
		if c.spec.name == "swift" && hasToken(n, "extension") {
			if f := n.ChildByFieldName("name"); f != nil {
				return compact(c.text(f))
			}
		}
	}
	if f := n.ChildByFieldName("name"); f != nil {
		return compact(c.text(f))
	}
	return firstIdent(n, c.src)
}

func firstIdent(n *sitter.Node, src []byte) string {
	for i := uint(0); i < n.NamedChildCount(); i++ {
		ch := n.NamedChild(i)
		switch ch.Kind() {
		case "identifier", "simple_identifier", "type_identifier", "property_identifier":
			return string(src[ch.StartByte():ch.EndByte()])
		}
	}
	return ""
}

func hasToken(n *sitter.Node, tok string) bool {
	for i := uint(0); i < n.ChildCount(); i++ {
		ch := n.Child(i)
		if !ch.IsNamed() && ch.Kind() == tok {
			return true
		}
	}
	return false
}

func (c *fileCtx) newSymbol(n *sitter.Node, kind string, parent *symNode) *symNode {
	if n.Kind() == "variable_declarator" {
		if f := n.ChildByFieldName("name"); f == nil || f.Kind() != "identifier" {
			return nil // destructuring patterns are not declarations of their own
		}
	}
	name := c.declName(n)
	if name == "" || strings.ContainsAny(name, "{}[] ") {
		return nil
	}
	kind = c.refineKind(n, kind)
	qual := name
	if parent != nil {
		qual = parent.sym.Qual + "." + name
		if strings.HasSuffix(parent.sym.Qual, "+ext") {
			qual = strings.TrimSuffix(parent.sym.Qual, "+ext") + "." + name
		}
	}
	if kind == "extension" {
		qual = name + "+ext"
	}
	if k := c.seen[qual]; k > 0 {
		c.seen[qual] = k + 1
		qual = fmt.Sprintf("%s~%d", qual, k+1)
	} else {
		c.seen[qual] = 1
	}
	// Extend the range over a wrapping export statement / preceding decorators.
	start, end := n.StartByte(), n.EndByte()
	startRow := n.StartPosition().Row
	if p := n.Parent(); p != nil && p.Kind() == "export_statement" && n.Kind() != "variable_declarator" {
		start, startRow = p.StartByte(), p.StartPosition().Row
	}
	for prev := n.PrevNamedSibling(); prev != nil && prev.Kind() == "decorator"; prev = prev.PrevNamedSibling() {
		start, startRow = prev.StartByte(), prev.StartPosition().Row
	}
	sym := &model.Symbol{
		ID:        c.platform + "://" + c.relPath + "#" + qual,
		Platform:  c.platform,
		Lang:      c.spec.name,
		Kind:      kind,
		Name:      name,
		Qual:      qual,
		File:      c.repoPath,
		StartLine: int(startRow) + 1,
		EndLine:   int(n.EndPosition().Row) + 1,
	}
	if parent != nil {
		sym.Parent = parent.sym.ID
	}
	sn := &symNode{sym: sym, node: n, start: start, end: end}
	c.syms = append(c.syms, sn)
	if parent != nil {
		c.members[[2]uint{n.StartByte(), n.EndByte()}] = sn
	}
	return sn
}

func (c *fileCtx) refineKind(n *sitter.Node, kind string) string {
	switch c.spec.name {
	case "kotlin":
		if n.Kind() == "class_declaration" {
			if hasToken(n, "interface") {
				return "interface"
			}
			if hasModifier(n, c.src, "enum") {
				return "enum"
			}
		}
		if n.Kind() == "function_declaration" && hasModifier(n, c.src, "@Composable") {
			return "composable"
		}
	case "swift":
		if n.Kind() == "class_declaration" {
			for _, k := range []string{"struct", "enum", "extension", "actor", "class"} {
				if hasToken(n, k) {
					return k
				}
			}
		}
	case "arkts", "typescript", "javascript", "tsx":
		if n.Kind() == "variable_declarator" {
			if v := n.ChildByFieldName("value"); v != nil && (v.Kind() == "arrow_function" || v.Kind() == "function_expression" || v.Kind() == "function") {
				return "function"
			}
		}
		if n.Kind() == "struct_declaration" {
			return "component"
		}
	}
	return kind
}

func hasModifier(n *sitter.Node, src []byte, mod string) bool {
	for i := uint(0); i < n.NamedChildCount(); i++ {
		ch := n.NamedChild(i)
		if ch.Kind() == "modifiers" {
			return strings.Contains(string(src[ch.StartByte():ch.EndByte()]), mod)
		}
	}
	return false
}

// token is a normalized leaf.
type token struct {
	text  string
	ident bool
	start uint
}

// tokens returns the comment-free leaf tokens of n. Member declarations of a
// container are replaced by their signature tokens so that a container's hash
// only changes when its own header or its members' signatures change.
func (c *fileCtx) tokens(n *sitter.Node, self *symNode, out []token) []token {
	if c.spec.comments[n.Kind()] {
		return out
	}
	if self != nil && !(n.StartByte() == self.node.StartByte() && n.EndByte() == self.node.EndByte()) {
		if m, ok := c.members[[2]uint{n.StartByte(), n.EndByte()}]; ok && m != self && m.node.Kind() == n.Kind() {
			out = append(out, token{text: "⟪"})
			out = append(out, c.sigTokens(m)...)
			return append(out, token{text: "⟫"})
		}
	}
	if n.ChildCount() == 0 {
		t := strings.TrimSpace(c.text(n))
		if t == "" {
			return out
		}
		for _, f := range strings.Fields(t) {
			out = append(out, token{text: f, ident: c.spec.idents[n.Kind()], start: n.StartByte()})
		}
		return out
	}
	for i := uint(0); i < n.ChildCount(); i++ {
		out = c.tokens(n.Child(i), self, out)
	}
	return out
}

func (c *fileCtx) bodyChild(n *sitter.Node) *sitter.Node {
	for i := uint(0); i < n.ChildCount(); i++ {
		ch := n.Child(i)
		if c.spec.bodies[ch.Kind()] {
			return ch
		}
	}
	return nil
}

// sigTokens = tokens of the declaration header (everything before the body,
// or before "=" for properties/constants).
func (c *fileCtx) sigTokens(sn *symNode) []token {
	all := c.tokens(sn.node, nil, nil)
	cut := uint(1 << 62)
	if b := c.bodyChild(sn.node); b != nil {
		cut = b.StartByte()
	}
	var out []token
	for _, t := range all {
		if t.start >= cut {
			break
		}
		if t.text == "=" && (sn.sym.Kind == "property" || sn.sym.Kind == "const" || sn.sym.Kind == "case") {
			break
		}
		out = append(out, t)
	}
	return out
}

func (c *fileCtx) finishSymbol(sn *symNode) {
	// full node range including decorators/export wrapper
	var toks []token
	if sn.start < sn.node.StartByte() {
		toks = append(toks, c.prefixTokens(sn)...)
	}
	toks = c.tokens(sn.node, sn, toks)
	sig := c.sigTokens(sn)
	texts := make([]string, len(toks))
	var normTexts []string
	refSet := map[string]bool{}
	for i, t := range toks {
		texts[i] = t.text
		if t.text == sn.sym.Name {
			normTexts = append(normTexts, "§")
		} else {
			normTexts = append(normTexts, t.text)
		}
		if t.ident && t.text != sn.sym.Name {
			refSet[t.text] = true
		}
	}
	sigTexts := make([]string, len(sig))
	for i, t := range sig {
		sigTexts[i] = t.text
	}
	sn.sym.Hash = sha(strings.Join(texts, " "))
	sn.sym.SigHash = sha(strings.Join(sigTexts, " "))
	sn.sym.NormHash = sha(strings.Join(normTexts, " "))
	sn.sym.SimHash = simhash(normTexts)
	sn.sym.Signature = truncate(c.sigDisplay(sn, sig, sigTexts), 240)
	for r := range refSet {
		sn.sym.RefNames = append(sn.sym.RefNames, r)
	}
	sort.Strings(sn.sym.RefNames)
	sn.sym.Value = c.literalValue(sn.node)
}

func (c *fileCtx) prefixTokens(sn *symNode) []token {
	// tokens of decorators / export keyword that precede the declaration node
	var out []token
	p := sn.node.Parent()
	if p != nil && p.Kind() == "export_statement" && p.StartByte() == sn.start {
		for i := uint(0); i < p.ChildCount(); i++ {
			ch := p.Child(i)
			if ch.StartByte() >= sn.node.StartByte() {
				break
			}
			out = c.tokens(ch, nil, out)
		}
		return out
	}
	for prev := sn.node.PrevNamedSibling(); prev != nil && prev.Kind() == "decorator" && prev.StartByte() >= sn.start; prev = prev.PrevNamedSibling() {
		out = append(c.tokens(prev, nil, nil), out...)
	}
	return out
}

// literalValue returns the literal initializer of a constant-like declaration.
func (c *fileCtx) literalValue(n *sitter.Node) string {
	var v *sitter.Node
	switch n.Kind() {
	case "property_declaration", "variable_declarator", "public_field_definition", "enum_entry":
		if f := n.ChildByFieldName("value"); f != nil {
			v = f
		} else if f := n.ChildByFieldName("raw_value"); f != nil {
			v = f
		} else {
			afterEq := false
			for i := uint(0); i < n.ChildCount(); i++ {
				ch := n.Child(i)
				if !ch.IsNamed() && ch.Kind() == "=" {
					afterEq = true
					continue
				}
				if afterEq && ch.IsNamed() {
					v = ch
					break
				}
			}
		}
	case "field_declaration":
		if d := n.ChildByFieldName("declarator"); d != nil {
			v = d.ChildByFieldName("value")
		}
	}
	if v == nil {
		return ""
	}
	k := v.Kind()
	if c.spec.strings[k] {
		parts := c.evalParts(v)
		if len(parts) == 1 && parts[0].Lit != "" || len(parts) == 0 {
			if len(parts) == 0 {
				return `""`
			}
			return parts[0].Lit
		}
		return ""
	}
	if strings.Contains(k, "literal") || k == "number" || k == "true" || k == "false" || k == "integer" || k == "float" {
		if strings.Contains(k, "string") {
			return ""
		}
		return strings.TrimSpace(c.text(v))
	}
	if k == "array" || k == "array_literal" || k == "collection_literal" {
		t := compact(c.text(v))
		if len(t) <= 200 {
			return t
		}
	}
	return ""
}

// sigDisplay renders the declaration header from source text (comments removed).
func (c *fileCtx) sigDisplay(sn *symNode, sig []token, texts []string) string {
	if len(sig) == 0 {
		return ""
	}
	last := sig[len(sig)-1]
	end := last.start + uint(len(last.text))
	if end > sn.end || last.start < sn.start {
		return joinSig(texts)
	}
	// find end of the last token in source (tokens may be split by Fields)
	for end < uint(len(c.src)) && end < sn.end && !isSpace(c.src[end]) && c.src[end] != '{' && c.src[end] != '=' {
		end++
	}
	raw := string(c.src[sn.start:end])
	if strings.Contains(raw, "//") || strings.Contains(raw, "/*") {
		return joinSig(texts)
	}
	return compact(raw)
}

func isSpace(b byte) bool { return b == ' ' || b == '\n' || b == '\t' || b == '\r' }

func joinSig(ts []string) string {
	var b strings.Builder
	for i, t := range ts {
		if i > 0 && !strings.ContainsAny(t, "().,:<>[]?") && !strings.HasSuffix(ts[i-1], "(") && !strings.HasSuffix(ts[i-1], "<") && !strings.HasSuffix(ts[i-1], "[") && !strings.HasSuffix(ts[i-1], ".") {
			b.WriteByte(' ')
		} else if i > 0 && (t == ":" || ts[i-1] == "," || ts[i-1] == ":") {
			b.WriteByte(' ')
		}
		if t == ":" && b.Len() > 0 {
			s := strings.TrimRight(b.String(), " ")
			b.Reset()
			b.WriteString(s)
		}
		b.WriteString(t)
	}
	return b.String()
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func compact(s string) string { return strings.Join(strings.Fields(s), " ") }

func sha(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// simhash computes a 64-bit simhash of token 3-shingles (hex encoded).
func simhash(toks []string) string {
	var v [64]int
	n := len(toks)
	if n == 0 {
		return "0000000000000000"
	}
	k := 3
	if n < k {
		k = n
	}
	for i := 0; i+k <= n; i++ {
		h := fnv.New64a()
		h.Write([]byte(strings.Join(toks[i:i+k], "\x00")))
		x := h.Sum64()
		for b := 0; b < 64; b++ {
			if x&(1<<uint(b)) != 0 {
				v[b]++
			} else {
				v[b]--
			}
		}
	}
	var out uint64
	for b := 0; b < 64; b++ {
		if v[b] > 0 {
			out |= 1 << uint(b)
		}
	}
	return fmt.Sprintf("%016x", out)
}

// Similarity returns 1 - hamming(a,b)/64 for two simhash hex strings.
func Similarity(a, b string) float64 {
	var x, y uint64
	fmt.Sscanf(a, "%x", &x)
	fmt.Sscanf(b, "%x", &y)
	return 1 - float64(bits.OnesCount64(x^y))/64
}
