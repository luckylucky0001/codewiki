package extract

import (
	"strings"

	sitter "github.com/tree-sitter/go-tree-sitter"
)

// imports returns the file's package and its imports as "name|source" pairs.
func (c *fileCtx) imports(root *sitter.Node) (string, []string) {
	pkg := ""
	var out []string
	for i := uint(0); i < root.NamedChildCount(); i++ {
		n := root.NamedChild(i)
		switch c.spec.name {
		case "kotlin":
			switch n.Kind() {
			case "package_header":
				if q := childOfKind(n, "qualified_identifier"); q != nil {
					pkg = compactNoSpace(c.text(q))
				} else {
					pkg = strings.TrimSpace(strings.TrimPrefix(c.text(n), "package"))
				}
			case "import", "import_header", "import_list":
				out = append(out, c.kotlinImports(n)...)
			}
		case "java":
			switch n.Kind() {
			case "package_declaration":
				pkg = strings.TrimSuffix(strings.TrimSpace(strings.TrimPrefix(c.text(n), "package")), ";")
			case "import_declaration":
				t := strings.TrimSuffix(strings.TrimSpace(strings.TrimPrefix(c.text(n), "import")), ";")
				t = strings.TrimSpace(strings.TrimPrefix(t, "static "))
				out = append(out, importPair(t))
			}
		case "arkts", "typescript", "tsx", "javascript":
			if n.Kind() == "import_statement" {
				out = append(out, c.esImports(n)...)
			}
		}
	}
	return pkg, out
}

func compactNoSpace(s string) string { return strings.Join(strings.Fields(s), "") }

// importPair maps "a.b.C" -> "C|a.b.C", "a.b.*" -> "*|a.b".
func importPair(path string) string {
	path = compactNoSpace(path)
	if strings.HasSuffix(path, ".*") {
		return "*|" + strings.TrimSuffix(path, ".*")
	}
	name := path
	if i := strings.LastIndex(path, "."); i >= 0 {
		name = path[i+1:]
	}
	return name + "|" + path
}

func (c *fileCtx) kotlinImports(n *sitter.Node) []string {
	if n.Kind() == "import_list" {
		var out []string
		for i := uint(0); i < n.NamedChildCount(); i++ {
			out = append(out, c.kotlinImports(n.NamedChild(i))...)
		}
		return out
	}
	t := strings.TrimSpace(strings.TrimPrefix(c.text(n), "import"))
	alias := ""
	if i := strings.Index(t, " as "); i >= 0 {
		alias = strings.TrimSpace(t[i+4:])
		t = t[:i]
	}
	p := importPair(t)
	if alias != "" {
		p = alias + "|" + compactNoSpace(t)
	}
	return []string{p}
}

func (c *fileCtx) esImports(n *sitter.Node) []string {
	src := ""
	if s := n.ChildByFieldName("source"); s != nil {
		src = strings.Trim(c.text(s), "'\"`")
	}
	var out []string
	var walk func(x *sitter.Node)
	walk = func(x *sitter.Node) {
		for i := uint(0); i < x.NamedChildCount(); i++ {
			ch := x.NamedChild(i)
			switch ch.Kind() {
			case "import_specifier":
				name := ch.ChildByFieldName("name")
				if alias := ch.ChildByFieldName("alias"); alias != nil {
					out = append(out, c.text(alias)+"|"+src+"#"+c.text(name))
				} else if name != nil {
					out = append(out, c.text(name)+"|"+src)
				}
			case "identifier": // default import
				out = append(out, c.text(ch)+"|"+src)
			case "namespace_import":
				out = append(out, "*|"+src)
			default:
				walk(ch)
			}
		}
	}
	if cl := childOfKind(n, "import_clause"); cl != nil {
		walk(cl)
	}
	return out
}
