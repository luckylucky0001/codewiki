// Package extract parses source files with tree-sitter and extracts symbols,
// reference names and call sites (used later for facts extraction).
package extract

import (
	"path/filepath"
	"strings"
	"unsafe"

	swift "github.com/alex-pinkus/tree-sitter-swift/bindings/go"
	kotlin "github.com/tree-sitter-grammars/tree-sitter-kotlin/bindings/go"
	sitter "github.com/tree-sitter/go-tree-sitter"
	arkts "github.com/tree-sitter/tree-sitter-arkts/bindings/go"
	java "github.com/tree-sitter/tree-sitter-java/bindings/go"
	javascript "github.com/tree-sitter/tree-sitter-javascript/bindings/go"
	typescript "github.com/tree-sitter/tree-sitter-typescript/bindings/go"
)

// langSpec describes how to read declarations out of one grammar.
type langSpec struct {
	name        string
	ptr         func() unsafe.Pointer
	comments    set
	decls       map[string]string // node kind -> symbol kind
	containers  set               // decl kinds whose body holds member decls
	transparent set               // non-decl kinds to descend into when looking for decls
	bodies      set               // child kinds that are the "body" of a decl
	idents      set               // leaf kinds that are identifiers (reference candidates)
	calls       set               // node kinds that are call sites
	strings     set               // string literal node kinds
}

type set map[string]bool

func mk(xs ...string) set {
	s := set{}
	for _, x := range xs {
		s[x] = true
	}
	return s
}

var tsLike = langSpec{
	comments: mk("comment", "html_comment"),
	decls: map[string]string{
		"function_declaration": "function", "generator_function_declaration": "function",
		"class_declaration": "class", "abstract_class_declaration": "class", "struct_declaration": "struct",
		"interface_declaration": "interface", "enum_declaration": "enum", "type_alias_declaration": "type",
		"method_definition": "method", "public_field_definition": "property", "field_definition": "property",
		"variable_declarator": "const",
	},
	containers:  mk("class_declaration", "abstract_class_declaration", "struct_declaration"),
	transparent: mk("program", "export_statement", "class_body", "struct_body", "lexical_declaration", "variable_declaration"),
	bodies:      mk("statement_block", "class_body", "struct_body", "interface_body", "object_type", "enum_body"),
	idents:      mk("identifier", "property_identifier", "type_identifier", "shorthand_property_identifier"),
	calls:       mk("call_expression", "arkui_component_expression", "new_expression"),
	strings:     mk("string", "template_string"),
}

var specs = map[string]*langSpec{
	"kotlin": {
		name: "kotlin", ptr: kotlin.Language,
		comments: mk("line_comment", "block_comment", "comment", "multiline_comment"),
		decls: map[string]string{
			"class_declaration": "class", "object_declaration": "object", "function_declaration": "function",
			"property_declaration": "property", "enum_entry": "case", "secondary_constructor": "constructor",
		},
		containers:  mk("class_declaration", "object_declaration"),
		transparent: mk("source_file", "class_body", "enum_class_body", "companion_object"),
		bodies:      mk("class_body", "enum_class_body", "function_body"),
		idents:      mk("identifier", "simple_identifier", "type_identifier"),
		calls:       mk("call_expression", "annotation"),
		strings:     mk("string_literal", "multiline_string_literal"),
	},
	"java": {
		name: "java", ptr: java.Language,
		comments: mk("line_comment", "block_comment"),
		decls: map[string]string{
			"class_declaration": "class", "interface_declaration": "interface", "enum_declaration": "enum",
			"record_declaration": "class", "method_declaration": "method", "constructor_declaration": "constructor",
			"field_declaration": "property", "enum_constant": "case",
		},
		containers:  mk("class_declaration", "interface_declaration", "enum_declaration", "record_declaration"),
		transparent: mk("program", "class_body", "interface_body", "enum_body", "enum_body_declarations"),
		bodies:      mk("class_body", "interface_body", "enum_body", "block", "constructor_body"),
		idents:      mk("identifier", "type_identifier"),
		calls:       mk("method_invocation", "annotation", "object_creation_expression"),
		strings:     mk("string_literal"),
	},
	"swift": {
		name: "swift", ptr: swift.Language,
		comments: mk("comment", "multiline_comment"),
		decls: map[string]string{
			"class_declaration": "class", "protocol_declaration": "protocol", "function_declaration": "function",
			"init_declaration": "constructor", "property_declaration": "property", "enum_entry": "case",
			"typealias_declaration": "type",
		},
		containers:  mk("class_declaration", "protocol_declaration"),
		transparent: mk("source_file", "class_body", "enum_class_body", "protocol_body"),
		bodies:      mk("class_body", "enum_class_body", "protocol_body", "function_body", "computed_property"),
		idents:      mk("simple_identifier", "type_identifier"),
		calls:       mk("call_expression"),
		strings:     mk("line_string_literal", "multi_line_string_literal"),
	},
}

func init() {
	ark := tsLike
	ark.name, ark.ptr = "arkts", arkts.Language
	specs["arkts"] = &ark
	js := tsLike
	js.name, js.ptr = "javascript", javascript.Language
	specs["javascript"] = &js
	ts := tsLike
	ts.name, ts.ptr = "typescript", typescript.LanguageTypescript
	specs["typescript"] = &ts
	tsx := tsLike
	tsx.name, tsx.ptr = "tsx", typescript.LanguageTSX
	specs["tsx"] = &tsx
}

// LangForPath maps a file extension to a supported language ("" if none).
func LangForPath(p string) string {
	switch strings.ToLower(filepath.Ext(p)) {
	case ".kt", ".kts":
		if strings.HasSuffix(p, ".gradle.kts") {
			return ""
		}
		return "kotlin"
	case ".java":
		return "java"
	case ".swift":
		return "swift"
	case ".ets":
		return "arkts"
	case ".js", ".mjs", ".cjs", ".jsx":
		return "javascript"
	case ".ts", ".mts", ".cts":
		if strings.HasSuffix(p, ".d.ts") {
			return "typescript"
		}
		return "typescript"
	case ".tsx":
		return "tsx"
	}
	return ""
}

// Languages lists supported language names.
func Languages() []string {
	return []string{"kotlin", "java", "swift", "arkts", "javascript", "typescript", "tsx"}
}

// Parsers caches one tree-sitter parser per language. Not goroutine-safe.
type Parsers struct {
	m map[string]*sitter.Parser
}

// NewParsers returns an empty parser cache.
func NewParsers() *Parsers { return &Parsers{m: map[string]*sitter.Parser{}} }

// Close releases all parsers.
func (p *Parsers) Close() {
	for _, ps := range p.m {
		ps.Close()
	}
	p.m = map[string]*sitter.Parser{}
}

func (p *Parsers) get(lang string) (*sitter.Parser, *langSpec, error) {
	spec, ok := specs[lang]
	if !ok {
		return nil, nil, errUnsupported(lang)
	}
	if ps, ok := p.m[lang]; ok {
		return ps, spec, nil
	}
	ps := sitter.NewParser()
	if err := ps.SetLanguage(sitter.NewLanguage(spec.ptr())); err != nil {
		ps.Close()
		return nil, nil, err
	}
	p.m[lang] = ps
	return ps, spec, nil
}

type errUnsupported string

func (e errUnsupported) Error() string { return "unsupported language: " + string(e) }
