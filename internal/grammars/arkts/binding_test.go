package arkts

import (
	"testing"

	sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestLanguageLoads(t *testing.T) {
	p := sitter.NewParser()
	defer p.Close()
	if err := p.SetLanguage(sitter.NewLanguage(Language())); err != nil {
		t.Fatal(err)
	}
	tree := p.Parse([]byte("@Component\nstruct A { build() { Text('x').id('t') } }\n"), nil)
	defer tree.Close()
	if tree.RootNode().HasError() {
		t.Fatal("unexpected parse error")
	}
}
