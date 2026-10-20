package facts_test

import (
	"encoding/json"
	"sort"
	"strings"
	"testing"

	"github.com/luckylucky0001/codewiki/internal/facts"
	"github.com/luckylucky0001/codewiki/internal/model"
	"github.com/luckylucky0001/codewiki/internal/scan"
	"github.com/luckylucky0001/codewiki/internal/testutil"
)

func extract(t *testing.T) (*model.Facts, *scan.Result) {
	t.Helper()
	cfg := testutil.MinishopConfig(testutil.Minishop())
	res, err := scan.Scan(cfg, cfg.Root)
	if err != nil {
		t.Fatal(err)
	}
	return facts.Extract(cfg, res), res
}

var canonicalRoutes = map[string]string{"login": "login", "products": "products", "product_detail": "product/{id}", "cart": "cart", "checkout": "checkout", "order_detail": "order/{id}"}

func TestRoutesAllPlatforms(t *testing.T) {
	f, res := extract(t)
	got := map[string]map[string]model.Route{}
	for _, r := range f.Routes {
		if got[r.Platform] == nil {
			got[r.Platform] = map[string]model.Route{}
		}
		got[r.Platform][r.RouteID] = r
	}
	for _, p := range []string{"android", "ios", "harmony"} {
		if len(got[p]) != len(canonicalRoutes) {
			t.Errorf("%s: %d routes, want %d: %v", p, len(got[p]), len(canonicalRoutes), got[p])
		}
		for rid, pat := range canonicalRoutes {
			r, ok := got[p][rid]
			if !ok {
				t.Errorf("%s: missing route %s", p, rid)
				continue
			}
			if r.Pattern != pat || r.Deeplink != "minishop://"+pat {
				t.Errorf("%s %s: pattern %q deeplink %q", p, rid, r.Pattern, r.Deeplink)
			}
			if res.Graph.Get(r.Symbol) == nil {
				t.Errorf("%s %s: route symbol %s not in graph", p, rid, r.Symbol)
			}
		}
	}
	if s := got["android"]["cart"].Symbol; !strings.HasSuffix(s, "#CartScreen") {
		t.Errorf("android cart symbol = %s", s)
	}
	if s := got["harmony"]["product_detail"].Symbol; s != "harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailBuilder" {
		t.Errorf("harmony symbol = %s", s)
	}
}

func TestTestIDs(t *testing.T) {
	f, _ := extract(t)
	want := []string{"add_to_cart", "cart_checkout", "checkout_submit", "login_password", "login_submit", "login_username", "nav_back", "order_status", "product_item_", "product_list", "tab_cart"}
	per := map[string][]string{}
	for _, x := range f.TestIDs {
		per[x.Platform] = append(per[x.Platform], x.Tid)
		if x.Line <= 0 || x.File == "" {
			t.Errorf("bad location %+v", x)
		}
	}
	for _, p := range []string{"android", "ios", "harmony"} {
		got := uniq(per[p])
		if strings.Join(got, ",") != strings.Join(want, ",") {
			t.Errorf("%s testids:\n got %v\nwant %v", p, got, want)
		}
	}
	for _, x := range f.TestIDs {
		if x.Tid == "add_to_cart" && x.RouteID != "product_detail" {
			t.Errorf("add_to_cart attributed to %q on %s", x.RouteID, x.Platform)
		}
	}
}

func TestAPIs(t *testing.T) {
	f, _ := extract(t)
	want := []string{"GET /api/products", "GET /api/products/{id}", "POST /api/cart", "POST /api/login", "POST /api/orders"}
	per := map[string][]string{}
	for _, a := range f.APIs {
		per[a.Platform] = append(per[a.Platform], a.Method+" "+a.Path)
	}
	for _, p := range []string{"android", "ios", "harmony"} {
		if got := uniq(per[p]); strings.Join(got, ",") != strings.Join(want, ",") {
			t.Errorf("%s apis: %v", p, got)
		}
	}
}

func TestInterchangeSchema(t *testing.T) {
	f, _ := extract(t)
	var doc map[string]any
	if err := json.Unmarshal(facts.RoutesJSON(f), &doc); err != nil {
		t.Fatal(err)
	}
	if doc["version"].(float64) != 1 {
		t.Fatal("version")
	}
	r := doc["routes"].([]any)[0].(map[string]any)
	for _, k := range []string{"platform", "route_id", "pattern", "deeplink", "file", "symbol"} {
		if _, ok := r[k]; !ok {
			t.Errorf("routes.json missing key %s", k)
		}
	}
	_ = json.Unmarshal(facts.TestIDsJSON(f), &doc)
	tid := doc["testids"].([]any)[0].(map[string]any)
	for _, k := range []string{"platform", "tid", "route_id", "file", "line"} {
		if _, ok := tid[k]; !ok {
			t.Errorf("testids.json missing key %s", k)
		}
	}
	_ = json.Unmarshal(facts.APIsJSON(f), &doc)
	api := doc["apis"].([]any)[0].(map[string]any)
	for _, k := range []string{"platform", "method", "path", "file", "symbol"} {
		if _, ok := api[k]; !ok {
			t.Errorf("apis.json missing key %s", k)
		}
	}
	// deterministic output
	f2, _ := extract(t)
	if string(facts.RoutesJSON(f)) != string(facts.RoutesJSON(f2)) || string(facts.TestIDsJSON(f)) != string(facts.TestIDsJSON(f2)) {
		t.Fatal("facts are not deterministic")
	}
}

func TestSchemesAndEntries(t *testing.T) {
	f, _ := extract(t)
	for _, p := range []string{"android", "ios", "harmony"} {
		if len(f.Schemes[p]) != 1 || f.Schemes[p][0] != "minishop" {
			t.Errorf("%s schemes %v", p, f.Schemes[p])
		}
	}
	kinds := map[string]bool{}
	for _, e := range f.Entries {
		kinds[e.Kind] = true
	}
	if !kinds["activity"] || !kinds["ability"] || !kinds["main_page"] {
		t.Errorf("entries %v", f.Entries)
	}
}

func TestJSON5(t *testing.T) {
	in := `{
  // comment
  module: { name: 'entry', list: [1, 2,], },
}`
	var v map[string]any
	if err := json.Unmarshal(facts.JSON5([]byte(in)), &v); err != nil {
		t.Fatalf("%v: %s", err, facts.JSON5([]byte(in)))
	}
}

func TestSnakePascal(t *testing.T) {
	if facts.Snake("productDetail") != "product_detail" || facts.Snake("ORDER_DETAIL") != "order_detail" || facts.Pascal("order_detail") != "OrderDetail" {
		t.Fatal("case conversion")
	}
}

func uniq(xs []string) []string {
	m := map[string]bool{}
	for _, x := range xs {
		m[x] = true
	}
	var out []string
	for x := range m {
		out = append(out, x)
	}
	sort.Strings(out)
	return out
}
