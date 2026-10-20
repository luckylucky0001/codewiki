package scan

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/luckylucky0001/codewiki/internal/config"
	"github.com/luckylucky0001/codewiki/internal/extract"
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

func scanTree(t *testing.T, plats []config.Platform, files map[string]string) *Result {
	t.Helper()
	dir := t.TempDir()
	for rel, s := range files {
		p := filepath.Join(dir, rel)
		os.MkdirAll(filepath.Dir(p), 0o755)
		os.WriteFile(p, []byte(s), 0o644)
	}
	cfg := config.Default()
	cfg.Platforms = plats
	res, err := Scan(cfg, dir)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func refsOf(t *testing.T, r *Result, id string) string {
	t.Helper()
	s := r.Graph.Get(id)
	if s == nil {
		t.Fatalf("symbol %s missing", id)
	}
	return strings.Join(s.Refs, ",")
}

// The Compose `items(...)` DSL function is imported from androidx and must not
// resolve to an unrelated project member named `items`.
func TestKotlinImportShadowsProjectMember(t *testing.T) {
	r := scanTree(t, []config.Platform{{Name: "android", Root: "."}}, map[string]string{
		"cart/CartViewModel.kt": "package app.cart\n\nclass CartViewModel {\n    val items = mutableListOf<String>()\n    fun total(): Int = items.size\n}\n",
		"products/ProductsScreen.kt": `package app.products

import androidx.compose.foundation.lazy.items
import app.data.Repo

@Composable
fun ProductsScreen(vm: ProductsViewModel) {
    LazyColumn { items(vm.products) { p -> Text(p) } }
    Repo.load()
}
`,
		"products/ProductsViewModel.kt": "package app.products\n\nclass ProductsViewModel {\n    val products = listOf<String>()\n}\n",
		"data/Repo.kt":                  "package app.data\n\nobject Repo {\n    fun load() {}\n}\n",
	})
	refs := refsOf(t, r, "android://products/ProductsScreen.kt#ProductsScreen")
	if strings.Contains(refs, "CartViewModel.items") {
		t.Fatalf("Compose items() resolved to CartViewModel.items: %s", refs)
	}
	for _, want := range []string{"ProductsViewModel.products", "Repo.load", "#Repo"} {
		if !strings.Contains(refs, want) {
			t.Fatalf("missing %s in %s", want, refs)
		}
	}
}

func TestKotlinPackageScope(t *testing.T) {
	r := scanTree(t, []config.Platform{{Name: "android", Root: "."}}, map[string]string{
		"a/A.kt": "package p.a\n\nfun helper() = 1\n",
		"b/B.kt": "package p.b\n\nfun helper() = 2\n\nfun useIt() = helper()\n",
		"c/C.kt": "package p.c\n\nfun other() = helper()\n",
	})
	if refs := refsOf(t, r, "android://b/B.kt#useIt"); refs != "android://b/B.kt#helper" {
		t.Fatalf("same-file/package: %s", refs)
	}
	if refs := refsOf(t, r, "android://c/C.kt#other"); refs != "" {
		t.Fatalf("helper is not visible from package p.c without import: %s", refs)
	}
}

func TestArkTSImportResolution(t *testing.T) {
	r := scanTree(t, []config.Platform{{Name: "harmony", Root: "."}}, map[string]string{
		"common/Api.ets":   "export class Api {\n  static load(): void {}\n}\n",
		"other/Api.ets":    "export class Api {\n  static load(): void {}\n}\n",
		"pages/Page.ets":   "import { Api } from '../common/Api';\nimport { router } from '@kit.ArkUI';\n\nexport function go(): void {\n  Api.load();\n  router.back();\n}\n",
		"pages/router.ets": "export function back(): void {}\nexport const router = 1;\n",
	})
	refs := refsOf(t, r, "harmony://pages/Page.ets#go")
	if !strings.Contains(refs, "harmony://common/Api.ets#Api") || strings.Contains(refs, "other/Api.ets") {
		t.Fatalf("import must pick ../common/Api: %s", refs)
	}
	if strings.Contains(refs, "pages/router.ets") {
		t.Fatalf("@kit.ArkUI import must shadow the project symbol: %s", refs)
	}
	if !strings.Contains(refs, "common/Api.ets#Api.load") {
		t.Fatalf("member of imported class: %s", refs)
	}
}

func TestSwiftMemberViaPropertyType(t *testing.T) {
	r := scanTree(t, []config.Platform{{Name: "ios", Root: "."}}, map[string]string{
		"CartVM.swift":  "final class CartViewModel {\n  func total() -> Int { 1 }\n}\n",
		"OrderVM.swift": "final class OrderViewModel {\n  func total() -> Int { 2 }\n}\n",
		"CartView.swift": `struct CartView: View {
  @StateObject private var vm = CartViewModel()
  var body: some View { Text("\(vm.total())") }
}
`,
	})
	refs := refsOf(t, r, "ios://CartView.swift#CartView.body")
	if !strings.Contains(refs, "CartVM.swift#CartViewModel.total") || strings.Contains(refs, "OrderViewModel") {
		t.Fatalf("vm.total() must resolve through vm's type: %s", refs)
	}
}

func TestCacheRejectsOtherExtractorVersion(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "c.gob.gz")
	c := NewCache()
	c.put("a.kt", "h", "kotlin", "android", extract.FileResult{})
	if err := c.Save(p); err != nil {
		t.Fatal(err)
	}
	if LoadCache(p).Len() != 1 {
		t.Fatal("same version must load")
	}
	old := CacheVersion
	CacheVersion = old + "-different-extractor"
	defer func() { CacheVersion = old }()
	if LoadCache(p).Len() != 0 {
		t.Fatal("cache written by another extractor build must be ignored")
	}
}

// KMP repo (kotlinconf-app, DroidconKotlin): android "." overlaps ios
// "iosApp"; each file must be scanned once, under the most specific root.
func TestOverlappingPlatformRootsScanOnce(t *testing.T) {
	r := scanTree(t, []config.Platform{{Name: "android", Root: "."}, {Name: "ios", Root: "iosApp"}}, map[string]string{
		"shared/src/commonMain/kotlin/Repo.kt": "class Repo",
		"iosApp/iosApp/ContentView.swift":      "struct ContentView {}",
	})
	if got := r.Graph.Files["iosApp/iosApp/ContentView.swift"].Platform; got != "ios" {
		t.Fatalf("swift file platform = %q, want ios", got)
	}
	n := 0
	for _, s := range r.Graph.Symbols {
		if s.Name == "ContentView" {
			n++
		}
	}
	if n != 1 || r.Graph.Files["shared/src/commonMain/kotlin/Repo.kt"].Platform != "android" {
		t.Fatalf("ContentView symbols = %d, want 1; files=%v", n, r.Graph.Files)
	}
}
