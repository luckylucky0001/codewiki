package scan

import (
	"os"
	"path/filepath"
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
