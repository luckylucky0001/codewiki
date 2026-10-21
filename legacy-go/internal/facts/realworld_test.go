package facts_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/luckylucky0001/codewiki/internal/config"
	"github.com/luckylucky0001/codewiki/internal/facts"
	"github.com/luckylucky0001/codewiki/internal/model"
	"github.com/luckylucky0001/codewiki/internal/scan"
)

// Regression snippets distilled from real projects (nowinandroid, IceCubesApp,
// HarmonyOS-Cases); see docs/validation.md.
func writeTree(t *testing.T, files map[string]string) string {
	dir := t.TempDir()
	for rel, s := range files {
		p := filepath.Join(dir, rel)
		os.MkdirAll(filepath.Dir(p), 0o755)
		if err := os.WriteFile(p, []byte(s), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func extractTree(t *testing.T, dir string, plats ...config.Platform) *model.Facts {
	cfg := config.Default()
	cfg.Root = dir
	cfg.Platforms = plats
	res, err := scan.Scan(cfg, dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Graph.ParseFailures) > 0 {
		t.Fatalf("parse failures: %+v", res.Graph.ParseFailures)
	}
	return facts.Extract(cfg, res)
}

func routeMap(f *model.Facts) map[string]model.Route {
	m := map[string]model.Route{}
	for _, r := range f.Routes {
		m[r.RouteID] = r
	}
	return m
}

func TestKotlinTypeSafeNavigation(t *testing.T) {
	dir := writeTree(t, map[string]string{
		"a/Keys.kt": "package a\n\nobject ForYouNavKey : NavKey\n\ndata class TopicNavKey(val id: String) : NavKey\n\n@Serializable\ndata class BarRoute(val itemId: String)\n",
		"a/Nav.kt": `package a

fun EntryProviderScope<NavKey>.forYouEntry() {
    entry<ForYouNavKey> {
        ForYouScreen()
    }
    entry<TopicNavKey>(metadata = m) { key ->
        TopicScreen(key.id)
    }
}

fun NavGraphBuilder.bar() {
    composable<BarRoute> { BarScreen() }
}
`,
		"a/Screens.kt": "package a\n\n@Composable\nfun ForYouScreen() {}\n\n@Composable\nfun TopicScreen(id: String) {}\n\n@Composable\nfun BarScreen() {}\n",
	})
	rm := routeMap(extractTree(t, dir, config.Platform{Name: "android", Root: "."}))
	want := map[string]string{"for_you": "for_you", "topic": "topic/{id}", "bar": "bar/{itemId}"}
	for rid, pat := range want {
		r, ok := rm[rid]
		if !ok || r.Pattern != pat || !strings.HasSuffix(r.Symbol, "Screen") {
			t.Errorf("%s: %+v (all %v)", rid, r, rm)
		}
	}
}

func TestSwiftNavigationDestinationEnum(t *testing.T) {
	dir := writeTree(t, map[string]string{
		"Router.swift": "public enum RouterDestination: Hashable {\n  case accountDetail(id: String)\n  case settings\n}\n",
		"App.swift": `import SwiftUI
struct AccountDetailView: View { var body: some View { Text("x") } }
extension View {
  func withAppRouter() -> some View {
    navigationDestination(for: RouterDestination.self) { destination in
      switch destination {
      case .accountDetail(let id): AccountDetailView()
      case .settings: Text("s")
      }
    }
  }
}
`,
	})
	rm := routeMap(extractTree(t, dir, config.Platform{Name: "ios", Root: "."}))
	if r := rm["account_detail"]; r.Pattern != "account_detail/{id}" || !strings.HasSuffix(r.Symbol, "#AccountDetailView") {
		t.Fatalf("account_detail: %+v", r)
	}
	if _, ok := rm["settings"]; !ok {
		t.Fatalf("settings route missing: %v", rm)
	}
}

func TestHarmonyDanglingBuildFunctionAndSchemes(t *testing.T) {
	dir := writeTree(t, map[string]string{
		"entry/src/main/resources/base/profile/router_map.json": `{"routerMap":[{"name":"pageOne","pageSourceFile":"src/main/ets/pages/Second.ets","buildFunction":"PageOneBuilder"},
{"name":"pageTwo","pageSourceFile":"src/main/ets/pages/Second.ets","buildFunction":"PageTwoBuilder"}]}`,
		"entry/src/main/ets/pages/Second.ets": "@Builder\nexport function PageTwoBuilder() {\n  Text('x')\n}\n",
		"entry/src/main/module.json5":         `{ "module": { "name": "entry", "abilities": [ { "name": "A", "skills": [ { "uris": [ { "scheme": "file" }, { "scheme": "myapp" } ] } ] } ] } }`,
	})
	f := extractTree(t, dir, config.Platform{Name: "harmony", Root: "."})
	rm := routeMap(f)
	if rm["pageOne"].Symbol != "" || !strings.HasSuffix(rm["pageTwo"].Symbol, "#PageTwoBuilder") {
		t.Fatalf("routes: %+v", rm)
	}
	if len(f.Warnings) != 1 || !strings.Contains(f.Warnings[0], "PageOneBuilder") {
		t.Fatalf("warnings: %v", f.Warnings)
	}
	if s := f.Schemes["harmony"]; len(s) != 1 || s[0] != "myapp" {
		t.Fatalf("schemes: %v (file:// must be ignored)", s)
	}
}
