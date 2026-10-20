package engine

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"

	"github.com/luckylucky0001/codewiki/internal/model"
)

// RouteChange explains why a route is affected (consumed by e2epilot:
// `e2e graph invalidate --changed-routes` / `e2e impact`).
type RouteChange struct {
	RouteID   string   `json:"route_id"`
	Platforms []string `json:"platforms"`
	Reasons   []string `json:"reasons"` // symbol_changed | route_added | route_removed | route_changed | testid_changed
	Symbols   []string `json:"symbols,omitempty"`
}

// LoadRoutes reads facts/routes.json from a wiki dir (nil if missing).
func LoadRoutes(wikiDir string) []model.Route {
	b, err := os.ReadFile(filepath.Join(wikiDir, "facts", "routes.json"))
	if err != nil {
		return nil
	}
	var doc struct {
		Routes []model.Route `json:"routes"`
	}
	if json.Unmarshal(b, &doc) != nil {
		return nil
	}
	return doc.Routes
}

// LoadTestIDs reads facts/testids.json from a wiki dir.
func LoadTestIDs(wikiDir string) []model.TestID {
	b, err := os.ReadFile(filepath.Join(wikiDir, "facts", "testids.json"))
	if err != nil {
		return nil
	}
	var doc struct {
		TestIDs []model.TestID `json:"testids"`
	}
	if json.Unmarshal(b, &doc) != nil {
		return nil
	}
	return doc.TestIDs
}

// ComputeImpact fills d.ChangedRouteIDs / d.ChangedRoutes: a route is changed
// when a symbol reachable from its screen (≤3 reference hops, in the old or the
// new graph) changed, when the route itself was added/removed/re-patterned, or
// when its testIDs changed.
func ComputeImpact(d *Diff, old, cur *model.Graph, oldRoutes []model.Route, oldTids []model.TestID, f *model.Facts) {
	changed := map[string]bool{}
	for _, c := range d.Changes {
		changed[c.ID] = true
		if c.OldID != "" {
			changed[c.OldID] = true
		}
	}
	type acc struct {
		plats, reasons, syms map[string]bool
	}
	res := map[string]*acc{}
	mark := func(rid, plat, reason, sym string) {
		a := res[rid]
		if a == nil {
			a = &acc{map[string]bool{}, map[string]bool{}, map[string]bool{}}
			res[rid] = a
		}
		a.plats[plat] = true
		a.reasons[reason] = true
		if sym != "" {
			a.syms[sym] = true
		}
	}
	check := func(g *model.Graph, routes []model.Route) {
		if g == nil || len(g.Symbols) == 0 {
			return
		}
		children := map[string][]string{}
		for _, s := range g.Symbols {
			if s.Parent != "" {
				children[s.Parent] = append(children[s.Parent], s.ID)
			}
		}
		for _, r := range routes {
			if g.Get(r.Symbol) == nil {
				continue
			}
			for id := range reach(g, children, r.Symbol, parityDepth) {
				if changed[id] {
					mark(r.RouteID, r.Platform, "symbol_changed", id)
				}
			}
		}
	}
	check(cur, f.Routes)
	check(old, oldRoutes)
	// conservative: anything the feature page anchors (e.g. the screen's view model)
	for _, rid := range routeIDs(f) {
		for _, id := range FeatureSymbols(cur, f, rid) {
			if changed[id] {
				if s := cur.Get(id); s != nil {
					mark(rid, s.Platform, "symbol_changed", id)
				}
			}
		}
	}
	if oldRoutes != nil {
		key := func(r model.Route) string { return r.Platform + "\x00" + r.RouteID }
		om := map[string]model.Route{}
		for _, r := range oldRoutes {
			om[key(r)] = r
		}
		nm := map[string]model.Route{}
		for _, r := range f.Routes {
			nm[key(r)] = r
			o, ok := om[key(r)]
			switch {
			case !ok:
				mark(r.RouteID, r.Platform, "route_added", "")
			case o.Pattern != r.Pattern || o.Deeplink != r.Deeplink || o.Symbol != r.Symbol:
				mark(r.RouteID, r.Platform, "route_changed", "")
			}
		}
		for k, r := range om {
			if _, ok := nm[k]; !ok {
				mark(r.RouteID, r.Platform, "route_removed", "")
			}
		}
	}
	if oldTids != nil {
		set := func(ts []model.TestID) map[string]bool {
			m := map[string]bool{}
			for _, t := range ts {
				if t.RouteID != "" {
					m[t.Platform+"\x00"+t.RouteID+"\x00"+t.Tid] = true
				}
			}
			return m
		}
		a, b := set(oldTids), set(f.TestIDs)
		for _, t := range f.TestIDs {
			if t.RouteID != "" && !a[t.Platform+"\x00"+t.RouteID+"\x00"+t.Tid] {
				mark(t.RouteID, t.Platform, "testid_changed", "")
			}
		}
		for _, t := range oldTids {
			if t.RouteID != "" && !b[t.Platform+"\x00"+t.RouteID+"\x00"+t.Tid] {
				mark(t.RouteID, t.Platform, "testid_changed", "")
			}
		}
	}
	d.ChangedRouteIDs = []string{}
	d.ChangedRoutes = []RouteChange{}
	for rid, a := range res {
		d.ChangedRouteIDs = append(d.ChangedRouteIDs, rid)
		d.ChangedRoutes = append(d.ChangedRoutes, RouteChange{RouteID: rid, Platforms: sortedKeys(a.plats), Reasons: sortedKeys(a.reasons), Symbols: sortedKeys(a.syms)})
	}
	sort.Strings(d.ChangedRouteIDs)
	sort.Slice(d.ChangedRoutes, func(i, j int) bool { return d.ChangedRoutes[i].RouteID < d.ChangedRoutes[j].RouteID })
}
