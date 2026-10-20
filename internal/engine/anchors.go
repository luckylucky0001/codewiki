package engine

import (
	"regexp"
	"sort"
	"strings"
	"sync"

	"github.com/luckylucky0001/codewiki/internal/model"
)

// Page paths of the CLI-owned concept pages.
const (
	NavigationPage = "pages/concepts/navigation.md"
	SharedPage     = "pages/concepts/shared-components.md"
)

// SharedThreshold: a symbol reachable from this many routes (same platform)
// is shared infrastructure, not part of any single feature.
const SharedThreshold = 3

const (
	perPlatformAnchors = 12
	maxConceptAnchors  = 40
	featureDepth       = 2
)

var navRe = regexp.MustCompile(`(?i)(route|router|navhost|navigation|destination|deeplink|pathstack|testparams)`)

// AnchorSets partitions symbols into per-feature anchors, shared components
// and navigation infrastructure.
type AnchorSets struct {
	Feature    map[string][]string `json:"feature"`
	Shared     []string            `json:"shared"`
	Navigation []string            `json:"navigation"`
	UsedBy     map[string][]string `json:"used_by"` // symbol -> route ids reaching it
}

var anchorCache sync.Map // key: *model.Graph+*model.Facts

type cacheKey struct {
	g *model.Graph
	f *model.Facts
}

// FeatureSymbols returns the anchors of the feature page for a route: the
// route-owning screen and its members, its view model / store and the APIs
// reachable within two reference hops — minus shared components.
func FeatureSymbols(g *model.Graph, f *model.Facts, rid string) []string {
	out := ComputeAnchors(g, f).Feature[rid]
	if out == nil {
		return []string{}
	}
	return out
}

// ComputeAnchors computes (and memoizes) the anchor partition.
func ComputeAnchors(g *model.Graph, f *model.Facts) *AnchorSets {
	k := cacheKey{g, f}
	if v, ok := anchorCache.Load(k); ok {
		return v.(*AnchorSets)
	}
	a := computeAnchors(g, f)
	anchorCache.Store(k, a)
	return a
}

func computeAnchors(g *model.Graph, f *model.Facts) *AnchorSets {
	children := map[string][]string{}
	for _, s := range g.Symbols {
		if s.Parent != "" {
			children[s.Parent] = append(children[s.Parent], s.ID)
		}
	}
	owned := map[string]bool{} // route symbols and their members
	type cand struct {
		rid string
		ids []string // BFS order
	}
	var cands []cand
	count := map[string]map[string]bool{}
	for _, r := range f.Routes {
		if g.Get(r.Symbol) == nil {
			continue
		}
		owned[r.Symbol] = true
		for _, c := range children[r.Symbol] {
			owned[c] = true
		}
		ids, touched := bfsFeature(g, children, r.Symbol, r.RouteID)
		cands = append(cands, cand{r.RouteID, ids})
		for _, id := range append(append([]string{}, ids...), touched...) {
			if count[id] == nil {
				count[id] = map[string]bool{}
			}
			count[id][r.RouteID] = true
		}
	}
	shared := map[string]bool{}
	for id, rids := range count {
		if len(rids) >= SharedThreshold && !owned[id] {
			shared[id] = true
		}
	}
	nav := map[string]bool{}
	for _, s := range g.Symbols {
		if navRe.MatchString(s.Qual) && !owned[s.ID] {
			nav[s.ID] = true
		}
	}
	a := &AnchorSets{Feature: map[string][]string{}, UsedBy: map[string][]string{}}
	for id, rids := range count {
		a.UsedBy[id] = sortedKeys(rids)
	}
	perPlat := map[string]map[string]int{}
	for _, c := range cands {
		set := map[string]bool{}
		for _, id := range a.Feature[c.rid] {
			set[id] = true
		}
		if perPlat[c.rid] == nil {
			perPlat[c.rid] = map[string]int{}
		}
		for _, id := range c.ids {
			s := g.Get(id)
			if set[id] || shared[id] || (nav[id] && !owned[id]) || perPlat[c.rid][s.Platform] >= perPlatformAnchors {
				continue
			}
			set[id] = true
			perPlat[c.rid][s.Platform]++
			a.Feature[c.rid] = append(a.Feature[c.rid], id)
		}
	}
	for rid := range a.Feature {
		sort.Strings(a.Feature[rid])
	}
	for id := range nav {
		a.Navigation = append(a.Navigation, id)
	}
	inFeature := map[string]bool{}
	for _, ids := range a.Feature {
		for _, id := range ids {
			inFeature[id] = true
		}
	}
	sharedPage := map[string]bool{}
	for id := range shared {
		if nav[id] {
			continue
		}
		sharedPage[id] = true
		// a shared container's hash only covers member signatures: anchor the
		// members too (unless a feature page already owns them)
		if s := g.Get(id); s != nil && containerKinds[s.Kind] {
			for _, c := range children[id] {
				if !inFeature[c] && !owned[c] && !nav[c] {
					sharedPage[c] = true
				}
			}
		}
	}
	for id := range sharedPage {
		a.Shared = append(a.Shared, id)
	}
	a.Navigation = capSorted(g, a.Navigation)
	a.Shared = capSorted(g, a.Shared)
	return a
}

// capSorted keeps the most "central" symbols (most refs in) first, then sorts by id.
func capSorted(g *model.Graph, ids []string) []string {
	sort.Strings(ids)
	if len(ids) > maxConceptAnchors {
		in := map[string]int{}
		for _, s := range g.Symbols {
			for _, r := range s.Refs {
				in[r]++
			}
		}
		sort.SliceStable(ids, func(i, j int) bool { return in[ids[i]] > in[ids[j]] })
		ids = ids[:maxConceptAnchors]
		sort.Strings(ids)
	}
	if ids == nil {
		ids = []string{}
	}
	return ids
}

// bfsFeature walks references from a route symbol (same platform).
// It returns the candidate anchors in BFS order plus the container types that
// were referenced but not expanded (used to detect shared components).
func bfsFeature(g *model.Graph, children map[string][]string, root, rid string) ([]string, []string) {
	type item struct {
		id    string
		depth int
	}
	stem := strings.SplitN(rid, "_", 2)[0]
	if stem != "" {
		stem = strings.ToUpper(stem[:1]) + stem[1:]
	}
	seen := map[string]bool{}
	var out, touched []string
	queue := []item{{root, 0}}
	for len(queue) > 0 {
		it := queue[0]
		queue = queue[1:]
		if seen[it.id] {
			continue
		}
		seen[it.id] = true
		s := g.Get(it.id)
		if s == nil {
			continue
		}
		if !containerKinds[s.Kind] || it.id == root {
			out = append(out, s.ID)
		}
		if it.id == root {
			for _, c := range children[s.ID] {
				queue = append(queue, item{c, 0})
			}
		}
		if it.depth >= featureDepth {
			continue
		}
		for _, ref := range s.Refs {
			rs := g.Get(ref)
			if rs == nil || rs.Platform != s.Platform {
				continue
			}
			if containerKinds[rs.Kind] {
				// the screen's own view model / store / page component
				// contributes its members; other types do not
				if it.depth == 0 && (it.id == root || strings.HasPrefix(rs.Name, stem)) {
					for _, c := range children[rs.ID] {
						queue = append(queue, item{c, 1})
					}
				} else {
					touched = append(touched, rs.ID)
				}
				continue
			}
			queue = append(queue, item{ref, it.depth + 1})
		}
	}
	return out, touched
}
