package arkts

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
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

func TestGrammarHash(t *testing.T) {
	h := sha256.New()
	for _, f := range []string{"src/parser.c", "src/scanner.c", "common/scanner.h"} {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		h.Write(b)
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != GrammarHash {
		t.Fatalf("grammar sources changed: update GrammarHash in grammar_hash.go to %s", got)
	}
}

func TestTrailingCommaInArkUIArguments(t *testing.T) {
	p := sitter.NewParser()
	defer p.Close()
	_ = p.SetLanguage(sitter.NewLanguage(Language()))
	for _, src := range []string{
		"@Component\nstruct A {\n  build() {\n    Tabs() {\n      TabContent() {\n        Text('x')\n      }\n      .tabBar(this.B(1, 2),)\n    }\n  }\n}\n",
		"@Component\nstruct A {\n  build() {\n    Column() {\n      Image(this.x)\n        .gesture(\n          GestureGroup(GestureMode.Exclusive,\n            TapGesture().onAction(() => {\n              this.y();\n            })\n          ),\n        )\n    }\n  }\n}\n",
	} {
		tree := p.Parse([]byte(src), nil)
		if tree.RootNode().HasError() {
			t.Fatalf("trailing comma not accepted (codewiki grammar patch):\n%s", src)
		}
		tree.Close()
	}
}
