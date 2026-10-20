package scan

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/luckylucky0001/codewiki/internal/config"
)

func TestMatchGlob(t *testing.T) {
	cases := []struct {
		pat, path string
		want      bool
	}{
		{"**/build/**", "android/app/build/x.kt", true},
		{"**/build/**", "android/app/src/x.kt", false},
		{"lib/**/*.js", "lib/adapters/http.js", true},
		{"lib/**/*.js", "lib/a.js", true},
		{"lib/**/*.js", "test/a.js", false},
		{"*.kt", "a/b.kt", false},
	}
	for _, c := range cases {
		if got := MatchGlob(c.pat, c.path); got != c.want {
			t.Errorf("%s ~ %s = %v", c.pat, c.path, got)
		}
	}
}

func TestScanResolvesRefsAndRecordsFailures(t *testing.T) {
	dir := t.TempDir()
	w := func(rel, s string) {
		p := filepath.Join(dir, rel)
		os.MkdirAll(filepath.Dir(p), 0o755)
		os.WriteFile(p, []byte(s), 0o644)
	}
	w("android/A.kt", "class Cart {\n    fun add(x: Int): Int = limit() + x\n    fun limit(): Int = MAX\n}\nconst val MAX = 3\n")
	w("android/Broken.kt", "class X { fun ( }")
	w("android/build/Gen.kt", "class Gen")
	cfg := config.Default()
	cfg.Platforms = []config.Platform{{Name: "android", Root: "android"}}
	res, err := Scan(cfg, dir)
	if err != nil {
		t.Fatal(err)
	}
	g := res.Graph
	add := g.Get("android://A.kt#Cart.add")
	if add == nil || len(add.Refs) != 1 || add.Refs[0] != "android://A.kt#Cart.limit" {
		t.Fatalf("refs of add: %+v", add)
	}
	if l := g.Get("android://A.kt#Cart.limit"); l == nil || len(l.Refs) != 1 || l.Refs[0] != "android://A.kt#MAX" {
		t.Fatalf("refs of limit: %+v", l)
	}
	if len(g.ParseFailures) != 1 || g.ParseFailures[0].File != "android/Broken.kt" {
		t.Fatalf("parse failures: %+v", g.ParseFailures)
	}
	if _, ok := g.Files["android/build/Gen.kt"]; ok {
		t.Fatal("excluded build dir was scanned")
	}
}

func TestScanCache(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "android"), 0o755)
	os.WriteFile(filepath.Join(dir, "android/A.kt"), []byte("class A {\n    fun f(): Int = g()\n    fun g(): Int = 1\n}\n"), 0o644)
	os.WriteFile(filepath.Join(dir, "android/B.kt"), []byte("class B {\n    fun h(): Int = 2\n}\n"), 0o644)
	cfg := config.Default()
	cfg.Root = dir
	cfg.WikiDir = "wiki"
	cfg.Platforms = []config.Platform{{Name: "android", Root: "android"}}
	os.MkdirAll(cfg.WikiPath(), 0o755)
	r1, err := ScanRepo(cfg)
	if err != nil || r1.Stats.Parsed != 2 || r1.Stats.CacheHits != 0 {
		t.Fatalf("cold: %+v %v", r1.Stats, err)
	}
	r2, _ := ScanRepo(cfg)
	if r2.Stats.Parsed != 0 || r2.Stats.CacheHits != 2 {
		t.Fatalf("warm: %+v", r2.Stats)
	}
	if len(r1.Graph.Symbols) != len(r2.Graph.Symbols) {
		t.Fatal("symbol count differs")
	}
	for i, s := range r1.Graph.Symbols {
		w := r2.Graph.Symbols[i]
		if s.ID != w.ID || s.Hash != w.Hash || strings.Join(s.Refs, ",") != strings.Join(w.Refs, ",") {
			t.Fatalf("cached symbol differs: %+v vs %+v", s, w)
		}
	}
	os.WriteFile(filepath.Join(dir, "android/B.kt"), []byte("class B {\n    fun h(): Int = 3\n}\n"), 0o644)
	os.Remove(filepath.Join(dir, "android/A.kt"))
	r3, _ := ScanRepo(cfg)
	if r3.Stats.Parsed != 1 || r3.Stats.CacheHits != 0 || r3.Graph.Get("android://A.kt#A") != nil {
		t.Fatalf("after change: %+v", r3.Stats)
	}
	if c := LoadCache(filepath.Join(cfg.WikiPath(), CacheFile)); c.Len() != 1 {
		t.Fatalf("deleted file not pruned from cache: %d", c.Len())
	}
	t.Setenv("KB_NO_CACHE", "1")
	if r4, _ := ScanRepo(cfg); r4.Stats.CacheHits != 0 {
		t.Fatal("KB_NO_CACHE ignored")
	}
}
