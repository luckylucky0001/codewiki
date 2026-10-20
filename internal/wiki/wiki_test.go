package wiki

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/luckylucky0001/codewiki/internal/model"
)

func graph() *model.Graph {
	g := &model.Graph{Version: model.GraphVersion, Symbols: []*model.Symbol{
		{ID: "android://a/B.kt#B.f", Name: "f", Hash: "h1"},
		{ID: "ios://A.swift#A", Name: "A", Hash: "h2"},
	}}
	g.Index()
	return g
}

func write(t *testing.T, dir, rel, s string) {
	t.Helper()
	if err := WriteFileAtomic(filepath.Join(dir, rel), []byte(s)); err != nil {
		t.Fatal(err)
	}
}

func setup(t *testing.T) string {
	dir := t.TempDir()
	if _, err := Init(dir, false); err != nil {
		t.Fatal(err)
	}
	write(t, dir, "pages/features/a.md", "---\nid: features/a\ntitle: A\nsources:\n  - sym: android://a/B.kt#B.f\n    hash: h1\nstatus: current\n---\n# A\n\nsee `ios://A.swift#A` and [b](b.md)\n")
	write(t, dir, "pages/features/b.md", "---\nid: features/b\ntitle: B\nsources:\n  - sym: ios://A.swift#A\n    hash: h2\n---\n# B\n[a](a.md)\n")
	if err := FixIndex(dir); err != nil {
		t.Fatal(err)
	}
	return dir
}

func codes(r *Report) string {
	var cs []string
	for _, e := range r.Errors {
		cs = append(cs, e.Code)
	}
	return strings.Join(cs, ",")
}

func TestVerifyPass(t *testing.T) {
	dir := setup(t)
	r := Verify(dir, graph(), VerifyOptions{})
	if !r.OK {
		t.Fatalf("expected pass: %+v", r.Errors)
	}
	if r.Anchors != 2 || r.Pages != 2 {
		t.Fatalf("counts %d %d", r.Anchors, r.Pages)
	}
}

func TestVerifyFailureModes(t *testing.T) {
	cases := []struct {
		name, code string
		mutate     func(dir string, g *model.Graph)
	}{
		{"stale anchor", "E_ANCHOR_STALE", func(dir string, g *model.Graph) { g.Get("android://a/B.kt#B.f").Hash = "changed" }},
		{"missing anchor", "E_ANCHOR_MISSING", func(dir string, g *model.Graph) {
			g.Symbols = g.Symbols[1:]
			g.Index()
		}},
		{"unknown symbol mention", "E_SYMBOL_UNKNOWN", func(dir string, g *model.Graph) {
			write(t, dir, "pages/features/b.md", "---\nid: features/b\ntitle: B\n---\n[a](a.md) `harmony://x.ets#Nope`\n")
		}},
		{"dead link", "E_DEAD_LINK", func(dir string, g *model.Graph) {
			write(t, dir, "pages/features/b.md", "---\nid: features/b\ntitle: B\n---\n[a](missing.md)\n")
		}},
		{"orphan + index coverage", "E_INDEX_COVERAGE", func(dir string, g *model.Graph) {
			write(t, dir, "pages/features/c.md", "---\nid: features/c\ntitle: C\n---\nnew\n")
		}},
		{"bad id", "E_FRONTMATTER", func(dir string, g *model.Graph) {
			write(t, dir, "pages/features/b.md", "---\nid: wrong\ntitle: B\n---\n[a](a.md)\n")
		}},
		{"no frontmatter", "E_FRONTMATTER", func(dir string, g *model.Graph) {
			write(t, dir, "pages/features/b.md", "# no fm\n[a](a.md)\n")
		}},
		{"stale status", "E_STATUS_STALE", func(dir string, g *model.Graph) {
			write(t, dir, "pages/features/b.md", "---\nid: features/b\ntitle: B\nstatus: stale\n---\n[a](a.md)\n")
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := setup(t)
			g := graph()
			tc.mutate(dir, g)
			r := Verify(dir, g, VerifyOptions{})
			if r.OK || !strings.Contains(codes(r), tc.code) {
				t.Fatalf("want %s, got ok=%v %s", tc.code, r.OK, codes(r))
			}
		})
	}
}

func TestVerifyOrphanAndFixIndex(t *testing.T) {
	dir := setup(t)
	write(t, dir, "pages/features/c.md", "---\nid: features/c\ntitle: C\n---\nnew\n")
	r := Verify(dir, graph(), VerifyOptions{})
	if !strings.Contains(codes(r), "E_ORPHAN") {
		t.Fatalf("orphan not detected: %s", codes(r))
	}
	if err := FixIndex(dir); err != nil {
		t.Fatal(err)
	}
	if r := Verify(dir, graph(), VerifyOptions{}); !r.OK {
		t.Fatalf("fix-index did not repair: %s", codes(r))
	}
}

func TestVerifyFactsStale(t *testing.T) {
	dir := setup(t)
	write(t, dir, "facts/routes.json", "{}\n")
	r := Verify(dir, graph(), VerifyOptions{ExpectedFacts: map[string][]byte{"facts/routes.json": []byte("{\"version\":1}\n")}})
	if !strings.Contains(codes(r), "E_FACTS_STALE") {
		t.Fatalf("facts staleness not detected: %s", codes(r))
	}
}

func TestPageRoundTrip(t *testing.T) {
	p := &Page{Path: "pages/x.md", Front: Front{ID: "x", Title: "X", Platforms: []string{"ios"}, Sources: []model.Anchor{{Sym: "ios://a#b", Hash: "h"}}, Status: StatusCurrent}, Body: "# X\n"}
	q, err := ParsePage(p.Path, p.Render())
	if err != nil || q.Front.Sources[0].Hash != "h" || q.Body != "# X\n" || q.Front.Platforms[0] != "ios" {
		t.Fatalf("round trip: %v %+v %q", err, q.Front, q.Body)
	}
}

func TestInitIdempotentAndLog(t *testing.T) {
	dir := t.TempDir()
	c1, _ := Init(dir, false)
	c2, _ := Init(dir, false)
	if len(c1) == 0 || len(c2) != 0 {
		t.Fatalf("init not idempotent: %v / %v", c1, c2)
	}
	if err := AppendLog(dir, "2026-10-20", "compound", "abc", []string{"x"}); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(filepath.Join(dir, "log.md"))
	if !strings.Contains(string(b), "## [2026-10-20] compound | abc") {
		t.Fatalf("log format: %s", b)
	}
}

// Large wikis get a hierarchical index: index.md lists modules, sub-indexes
// list the pages, and verify still sees every page as indexed and reachable.
func TestHierarchicalFeatureIndex(t *testing.T) {
	old := FeatureIndexMax
	FeatureIndexMax = 3
	defer func() { FeatureIndexMax = old }()
	dir := setup(t)
	for i := 0; i < 4; i++ {
		write(t, dir, fmt.Sprintf("pages/features/r%d.md", i), fmt.Sprintf("---\nid: features/r%d\ntitle: R%d\n---\nx\n", i, i))
	}
	if err := FixIndex(dir); err != nil {
		t.Fatal(err)
	}
	idx, _ := os.ReadFile(filepath.Join(dir, "index.md"))
	if strings.Contains(string(idx), "features/r0.md") || !strings.Contains(string(idx), "index/features-") {
		t.Fatalf("index.md should link sub-indexes only:\n%s", idx)
	}
	if r := Verify(dir, graph(), VerifyOptions{}); !r.OK {
		t.Fatalf("hierarchical index must verify: %s", codes(r))
	}
	if llms, _ := os.ReadFile(filepath.Join(dir, "llms.txt")); strings.Contains(string(llms), "features/r0.md") || !strings.Contains(string(llms), "index/features-") {
		t.Fatalf("llms.txt should list the sub-indexes, not every feature page:\n%s", llms)
	}
	// back under the threshold: sub-indexes are removed again
	FeatureIndexMax = 100
	if err := FixIndex(dir); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, SubIndexDir)); !os.IsNotExist(err) {
		t.Fatal("stale sub-indexes must be removed")
	}
	if r := Verify(dir, graph(), VerifyOptions{}); !r.OK {
		t.Fatalf("flat index must verify: %s", codes(r))
	}
}
