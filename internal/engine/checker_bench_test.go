package engine

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/luckylucky0001/codewiki/internal/model"
)

// syntheticRepo writes nFiles Kotlin-ish files with perFile functions each
// (plus one container per file) and returns the graph.
func syntheticRepo(tb testing.TB, nFiles, perFile int) (*model.Graph, string) {
	dir := tb.TempDir()
	g := &model.Graph{}
	for f := 0; f < nFiles; f++ {
		var b strings.Builder
		name := fmt.Sprintf("src/F%d.kt", f)
		b.WriteString(fmt.Sprintf("class C%d {\n", f))
		for i := 0; i < perFile; i++ {
			fmt.Fprintf(&b, "  fun f%d_%d(x: Int): Int {\n    val v = helper%d(x) + CONST_%d\n    return v\n  }\n", f, i, i, f)
		}
		b.WriteString("}\n")
		lines := 2 + perFile*4
		g.Symbols = append(g.Symbols, &model.Symbol{ID: fmt.Sprintf("android://%s#C%d", name, f), File: name, Kind: "class", Name: fmt.Sprintf("C%d", f), Qual: fmt.Sprintf("C%d", f), StartLine: 1, EndLine: lines})
		for i := 0; i < perFile; i++ {
			q := fmt.Sprintf("C%d.f%d_%d", f, f, i)
			g.Symbols = append(g.Symbols, &model.Symbol{ID: "android://" + name + "#" + q, File: name, Kind: "function", Name: fmt.Sprintf("f%d_%d", f, i), Qual: q, StartLine: 2 + i*4, EndLine: 5 + i*4})
		}
		p := filepath.Join(dir, filepath.FromSlash(name))
		os.MkdirAll(filepath.Dir(p), 0o755)
		if err := os.WriteFile(p, []byte(b.String()), 0o644); err != nil {
			tb.Fatal(err)
		}
	}
	return g, dir
}

func syntheticClaims(n int) []Claim {
	out := make([]Claim, n)
	for i := range out {
		out[i] = Claim{ID: fmt.Sprintf("C-%d", i), Style: "statement",
			Text: fmt.Sprintf("The handler uses `helper%d`, `CONST_%d`, `missingThing%d` and the literal `x + 1` (`Foo%d.bar`).", i%50, i%300, i, i)}
	}
	return out
}

// Regression guard for the ingest scale bug: 300 files x 50 functions
// (15,300 symbols) and 500 claims used to be O(spans x symbols) regex scans
// (> 13 min on a 51k-symbol HarmonyOS repo); with the token index it is a few
// seconds even under -race. The bound is generous to avoid flakiness.
func TestCheckerScalesWithTokenIndex(t *testing.T) {
	if testing.Short() {
		t.Skip("short")
	}
	g, dir := syntheticRepo(t, 300, 50)
	ck := &Checker{G: g, F: &model.Facts{}, Dir: dir}
	claims := syntheticClaims(500)
	start := time.Now()
	for i := range claims {
		ck.Check(&claims[i])
	}
	el := time.Since(start)
	if el > 30*time.Second {
		t.Fatalf("checking 500 claims against %d symbols took %s", len(g.Symbols), el)
	}
	// semantics: helper names are found in the smallest enclosing function
	// (Foo7.bar does not exist -> conflict, by design)
	if c := claims[7]; c.Status != ClaimConflict || !strings.Contains(strings.Join(c.Anchors, " "), "#C0.f0_7") {
		t.Fatalf("claim 7: %s %v %v", c.Status, c.Anchors, c.Evidence)
	}
	t.Logf("500 claims x %d symbols: %s", len(g.Symbols), el)
}

func BenchmarkCheckerClaims(b *testing.B) {
	g, dir := syntheticRepo(b, 300, 50)
	claims := syntheticClaims(200)
	b.ResetTimer()
	for n := 0; n < b.N; n++ {
		ck := &Checker{G: g, F: &model.Facts{}, Dir: dir}
		for i := range claims {
			c := claims[i]
			ck.Check(&c)
		}
	}
}
