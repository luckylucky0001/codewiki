package engine

import (
	"fmt"
	"sort"
	"strings"

	"github.com/luckylucky0001/codewiki/internal/config"
	"github.com/luckylucky0001/codewiki/internal/model"
	"github.com/luckylucky0001/codewiki/internal/wiki"
)

// Task operations.
const (
	OpCreate  = "create"
	OpUpdate  = "update"
	OpRecheck = "recheck"
)

// Reason explains why a task exists.
type Reason struct {
	Code   string `json:"code"`
	Sym    string `json:"sym,omitempty"`
	Detail string `json:"detail,omitempty"`
}

// Task is one unit of LLM work with an explicit write set.
type Task struct {
	ID       string   `json:"id"`
	Op       string   `json:"op"`
	Kind     string   `json:"kind"` // feature | overview | conflicts
	Page     string   `json:"page"`
	Title    string   `json:"title"`
	RouteID  string   `json:"route_id,omitempty"`
	WriteSet []string `json:"write_set"`
	Reasons  []Reason `json:"reasons"`
	Context  []string `json:"context"` // symbol ids whose bodies are given to the writer
	// Priority is the task's rank for the LLM budget (1 = most valuable).
	Priority int `json:"priority"`
}

// Plan is written to .kb/plan.json and drives the LLM stage.
type Plan struct {
	Version int    `json:"version"`
	Base    string `json:"base"`
	Head    string `json:"head"`
	Mode    string `json:"mode"` // noop | incremental | full
	Reason  string `json:"reason"`
	Stats   struct {
		Symbols         int            `json:"symbols"`
		Changes         map[string]int `json:"changes"`
		ModuleRatio     float64        `json:"module_ratio"`
		StructuralRatio float64        `json:"structural_ratio"`
		Hops            int            `json:"hops"`
		Propagated      int            `json:"propagated_symbols"`
	} `json:"stats"`
	Tasks []Task `json:"tasks"`
	// e2epilot contract: routes and files affected by this change
	ChangedRouteIDs []string      `json:"changed_route_ids"`
	ChangedRoutes   []RouteChange `json:"changed_routes"`
	ChangedFiles    []string      `json:"changed_files"`
}

// PlanInput bundles everything the planner needs.
type PlanInput struct {
	Cfg       *config.Config
	Diff      *Diff
	Old, Cur  *model.Graph
	Facts     *model.Facts
	Pages     []*wiki.Page
	ForceFull bool
	HasDocs   bool // raw/docs contains ingested documents
}

// FeaturePage returns the page path for a route id.
func FeaturePage(rid string) string { return "pages/features/" + rid + ".md" }

// Well-known page paths.
const (
	OverviewPage  = "pages/overview.md"
	ConflictsPage = "pages/_conflicts.md"
	VerdictsFile  = ".kb/ingest/verdicts.json"
)

var containerKinds = map[string]bool{"class": true, "struct": true, "object": true, "interface": true, "enum": true, "component": true, "protocol": true, "extension": true}

func routeIDs(f *model.Facts) []string {
	m := map[string]bool{}
	for _, r := range f.Routes {
		m[r.RouteID] = true
	}
	var out []string
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// BuildPlan computes the plan.
func BuildPlan(in PlanInput) *Plan {
	p := &Plan{Version: 1, Base: in.Diff.Base, Head: in.Cur.Commit, Tasks: []Task{},
		ChangedRouteIDs: in.Diff.ChangedRouteIDs, ChangedRoutes: in.Diff.ChangedRoutes, ChangedFiles: in.Diff.FilesChanged}
	p.Stats.Symbols = len(in.Cur.Symbols)
	p.Stats.Changes = in.Diff.Counts
	p.Stats.ModuleRatio = round2(in.Diff.ModuleRatio())
	p.Stats.StructuralRatio = round2(in.Diff.StructuralRatio(max(len(in.Cur.Symbols), len(in.Old.Symbols))))
	p.Stats.Hops = in.Cfg.Plan.Hops
	pagesByPath := map[string]*wiki.Page{}
	for _, pg := range in.Pages {
		pagesByPath[pg.Path] = pg
	}
	switch {
	case in.ForceFull:
		p.Mode, p.Reason = "full", "forced (--full)"
	case in.Diff.Incompatible:
		p.Mode, p.Reason = "full", "no compatible baseline graph (first compound or graph version change)"
	case p.Stats.ModuleRatio > in.Cfg.Plan.RebuildModuleRatio:
		p.Mode, p.Reason = "full", fmt.Sprintf("module ratio %.2f > %.2f", p.Stats.ModuleRatio, in.Cfg.Plan.RebuildModuleRatio)
	case p.Stats.StructuralRatio > in.Cfg.Plan.RebuildStructuralPct:
		p.Mode, p.Reason = "full", fmt.Sprintf("structural change ratio %.2f > %.2f", p.Stats.StructuralRatio, in.Cfg.Plan.RebuildStructuralPct)
	default:
		p.Mode, p.Reason = "incremental", "anchors changed ∪ signature changes propagated along reference edges"
	}
	add := func(t Task) {
		for i := range p.Tasks {
			if p.Tasks[i].Page == t.Page {
				p.Tasks[i].Reasons = append(p.Tasks[i].Reasons, t.Reasons...)
				return
			}
		}
		p.Tasks = append(p.Tasks, t)
	}
	rids := routeIDs(in.Facts)
	featureTask := func(rid string, reasons []Reason) Task {
		op := OpCreate
		if pagesByPath[FeaturePage(rid)] != nil {
			op = OpUpdate
		}
		return Task{Op: op, Kind: "feature", Page: FeaturePage(rid), Title: rid, RouteID: rid, WriteSet: []string{FeaturePage(rid)},
			Reasons: reasons, Context: FeatureSymbols(in.Cur, in.Facts, rid)}
	}
	conflictsTask := func(reasons []Reason) Task {
		op := OpRecheck
		if pagesByPath[ConflictsPage] == nil {
			op = OpCreate
		}
		return Task{Op: op, Kind: "conflicts", Page: ConflictsPage, Title: "文档核对", WriteSet: []string{ConflictsPage, VerdictsFile}, Reasons: reasons}
	}
	overviewTask := func(reasons []Reason) Task {
		op := OpCreate
		if pagesByPath[OverviewPage] != nil {
			op = OpUpdate
		}
		return Task{Op: op, Kind: "overview", Page: OverviewPage, Title: "总览", WriteSet: []string{OverviewPage}, Reasons: reasons}
	}

	anchors := ComputeAnchors(in.Cur, in.Facts)
	conceptTask := func(page string, reasons []Reason) Task {
		op := OpCreate
		if pagesByPath[page] != nil {
			op = OpUpdate
		}
		ctx := anchors.Shared
		title := "共享组件"
		if page == NavigationPage {
			ctx, title = anchors.Navigation, "导航与深链"
		}
		return Task{Op: op, Kind: "concept", Page: page, Title: title, WriteSet: []string{page}, Reasons: reasons, Context: append([]string{}, ctx...)}
	}
	if p.Mode == "full" {
		add(conceptTask(NavigationPage, []Reason{{Code: "full_rebuild"}}))
		add(conceptTask(SharedPage, []Reason{{Code: "full_rebuild"}}))
		for _, rid := range rids {
			add(featureTask(rid, []Reason{{Code: "full_rebuild", Detail: p.Reason}}))
		}
		add(overviewTask([]Reason{{Code: "full_rebuild"}}))
		if in.HasDocs {
			add(conflictsTask([]Reason{{Code: "full_rebuild"}}))
		}
		finalize(p)
		return p
	}

	// ---- incremental ----
	class := map[string]Change{}
	added := map[string]bool{}
	for _, c := range in.Diff.Changes {
		if c.Class == ClassAdded || c.Class == ClassRenamed {
			added[c.ID] = true
		}
	}
	renamedTo := map[string]string{}
	breaking := map[string]bool{}
	for _, c := range in.Diff.Changes {
		switch c.Class {
		case ClassBody, ClassSignature:
			class[c.ID] = c
			if c.Class == ClassSignature {
				breaking[c.ID] = true
			}
		case ClassDeleted:
			class[c.ID] = c
			breaking[c.ID] = true
		case ClassRenamed:
			class[c.OldID] = c
			renamedTo[c.OldID] = c.ID
			breaking[c.OldID] = true
		}
	}
	// reverse edges (callers) from both graphs
	rev := map[string][]string{}
	for _, g := range []*model.Graph{in.Cur, in.Old} {
		for _, s := range g.Symbols {
			for _, r := range s.Refs {
				rev[r] = append(rev[r], s.ID)
			}
		}
	}
	propagated := map[string]string{} // caller id -> breaking symbol
	frontier := []string{}
	for id := range breaking {
		frontier = append(frontier, id)
	}
	sort.Strings(frontier)
	origin := map[string]string{}
	for _, id := range frontier {
		origin[id] = id
	}
	for hop := 0; hop < in.Cfg.Plan.Hops; hop++ {
		var next []string
		for _, id := range frontier {
			for _, caller := range rev[id] {
				if _, ok := propagated[caller]; ok || breaking[caller] {
					continue
				}
				propagated[caller] = origin[id]
				origin[caller] = origin[id]
				next = append(next, caller)
			}
		}
		frontier = next
	}
	p.Stats.Propagated = len(propagated)

	for _, pg := range in.Pages {
		if pg.Front.Generated || !strings.HasPrefix(pg.Path, "pages/") {
			continue
		}
		var reasons []Reason
		for _, a := range pg.Front.Sources {
			if c, ok := class[a.Sym]; ok {
				switch c.Class {
				case ClassRenamed:
					reasons = append(reasons, Reason{Code: "anchor_renamed", Sym: a.Sym, Detail: fmt.Sprintf("renamed to %s (similarity %.2f)", c.ID, c.Similarity)})
				case ClassDeleted:
					reasons = append(reasons, Reason{Code: "anchor_deleted", Sym: a.Sym})
				default:
					reasons = append(reasons, Reason{Code: "anchor_" + c.Class + "_changed", Sym: a.Sym})
				}
				continue
			}
			if src, ok := propagated[a.Sym]; ok {
				reasons = append(reasons, Reason{Code: "signature_propagation", Sym: a.Sym, Detail: "references changed signature of " + src})
				continue
			}
			if s := in.Cur.Get(a.Sym); s == nil {
				reasons = append(reasons, Reason{Code: "anchor_missing", Sym: a.Sym})
			} else if s.Hash != a.Hash {
				reasons = append(reasons, Reason{Code: "anchor_drift", Sym: a.Sym, Detail: "hash differs from page (manual edit or missed run)"})
			}
		}
		// anchor set drift: the CLI-computed anchor set gained symbols
		var want []string
		switch {
		case pg.Path == NavigationPage:
			want = anchors.Navigation
		case pg.Path == SharedPage:
			want = anchors.Shared
		case pg.Front.Kind == "feature" && len(pg.Front.Routes) == 1:
			want = anchors.Feature[pg.Front.Routes[0]]
		}
		have := map[string]bool{}
		for _, a := range pg.Front.Sources {
			have[a.Sym] = true
		}
		for _, id := range want {
			if have[id] {
				continue
			}
			_, isAdded := added[id]
			if isAdded || pg.Front.Kind == "concept" {
				reasons = append(reasons, Reason{Code: "anchor_added", Sym: id})
			}
		}
		for _, rid := range pg.Front.Routes {
			if !contains(rids, rid) {
				reasons = append(reasons, Reason{Code: "route_removed", Detail: rid})
			}
		}
		if len(reasons) == 0 {
			continue
		}
		switch {
		case pg.Path == ConflictsPage:
			add(conflictsTask(reasons))
		case pg.Path == OverviewPage:
			add(overviewTask(reasons))
		case pg.Path == NavigationPage || pg.Path == SharedPage:
			add(conceptTask(pg.Path, reasons))
		case pg.Front.Kind == "feature" && len(pg.Front.Routes) == 1 && contains(rids, pg.Front.Routes[0]):
			add(featureTask(pg.Front.Routes[0], reasons))
		default:
			ctx := []string{}
			for _, a := range pg.Front.Sources {
				if nid, ok := renamedTo[a.Sym]; ok {
					ctx = append(ctx, nid)
				} else if in.Cur.Get(a.Sym) != nil {
					ctx = append(ctx, a.Sym)
				}
			}
			add(Task{Op: OpUpdate, Kind: pg.Front.Kind, Page: pg.Path, Title: pg.Front.Title, WriteSet: []string{pg.Path}, Reasons: reasons, Context: ctx})
		}
	}
	// new routes -> new feature pages; route set change -> overview
	covered := map[string]bool{}
	for _, pg := range in.Pages {
		for _, rid := range pg.Front.Routes {
			covered[rid] = true
		}
	}
	routesChanged := false
	for _, rid := range rids {
		if !covered[rid] {
			add(featureTask(rid, []Reason{{Code: "route_added", Detail: rid}}))
			routesChanged = true
		}
	}
	if ov := pagesByPath[OverviewPage]; ov == nil || routesChanged || !sameSet(ov.Front.Routes, rids) {
		add(overviewTask([]Reason{{Code: "route_set_changed"}}))
	}
	for _, cp := range []string{NavigationPage, SharedPage} {
		if pagesByPath[cp] == nil {
			add(conceptTask(cp, []Reason{{Code: "page_missing"}}))
		}
	}
	if in.HasDocs && pagesByPath[ConflictsPage] == nil {
		add(conflictsTask([]Reason{{Code: "docs_unchecked"}}))
	}
	if len(p.Tasks) == 0 && len(in.Diff.Changes) == 0 {
		p.Mode, p.Reason = "noop", "no symbol changes affect the wiki"
	}
	finalize(p)
	return p
}

// kindRank orders task kinds by value for the LLM budget.
func kindRank(k string) int {
	switch k {
	case "feature":
		return 0
	case "flow":
		return 1
	case "concept":
		return 2
	}
	return 3
}

// changedAnchors counts reasons that point at changed code.
func changedAnchors(t Task) int {
	n := 0
	for _, r := range t.Reasons {
		if strings.HasPrefix(r.Code, "anchor_") || r.Code == "signature_propagation" || r.Code == "route_added" {
			n++
		}
	}
	return n
}

// RankForLLM returns task indexes ordered by value: features > flows >
// concepts > others, then by number of changed anchors, then by page path.
// `--max-llm-tasks N` gives the LLM the first N; the rest use the template.
func RankForLLM(tasks []Task) []int {
	idx := make([]int, len(tasks))
	for i := range idx {
		idx[i] = i
	}
	sort.SliceStable(idx, func(a, b int) bool {
		ta, tb := tasks[idx[a]], tasks[idx[b]]
		if ka, kb := kindRank(ta.Kind), kindRank(tb.Kind); ka != kb {
			return ka < kb
		}
		if ca, cb := changedAnchors(ta), changedAnchors(tb); ca != cb {
			return ca > cb
		}
		return ta.Page < tb.Page
	})
	return idx
}

func finalize(p *Plan) {
	sort.SliceStable(p.Tasks, func(i, j int) bool { return p.Tasks[i].Page < p.Tasks[j].Page })
	for i := range p.Tasks {
		t := &p.Tasks[i]
		slug := strings.NewReplacer("pages/", "", "/", "-", ".md", "").Replace(t.Page)
		t.ID = fmt.Sprintf("t%02d-%s", i+1, slug)
		if t.Context == nil {
			t.Context = []string{}
		}
	}
	for rank, i := range RankForLLM(p.Tasks) {
		p.Tasks[i].Priority = rank + 1
	}
}

func contains(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
}

func sameSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	m := map[string]bool{}
	for _, x := range a {
		m[x] = true
	}
	for _, x := range b {
		if !m[x] {
			return false
		}
	}
	return true
}
