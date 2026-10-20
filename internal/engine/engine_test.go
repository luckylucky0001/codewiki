package engine

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/luckylucky0001/codewiki/internal/config"
	"github.com/luckylucky0001/codewiki/internal/facts"
	"github.com/luckylucky0001/codewiki/internal/model"
	"github.com/luckylucky0001/codewiki/internal/scan"
	"github.com/luckylucky0001/codewiki/internal/testutil"
	"github.com/luckylucky0001/codewiki/internal/wiki"
)

func scanDir(t *testing.T, cfg *config.Config, dir string) (*model.Graph, *model.Facts) {
	t.Helper()
	res, err := scan.Scan(cfg, dir)
	if err != nil {
		t.Fatal(err)
	}
	return res.Graph, facts.Extract(cfg, res)
}

func withChange(t *testing.T, changes ...string) (*config.Config, string) {
	t.Helper()
	dir := t.TempDir()
	testutil.CopyDir(t, testutil.Minishop(), dir)
	for _, c := range changes {
		testutil.ApplyChange(t, dir, c)
	}
	return testutil.MinishopConfig(dir), dir
}

func classes(d *Diff) map[string]string {
	m := map[string]string{}
	for _, c := range d.Changes {
		m[c.ID] = c.Class
		if c.OldID != "" {
			m[c.OldID] = c.Class
		}
	}
	return m
}

func TestDiffCommentOnlyAndBody(t *testing.T) {
	cfg, dir := withChange(t)
	old, _ := scanDir(t, cfg, dir)
	testutil.ApplyChange(t, dir, "01-cart-limit")
	cur, _ := scanDir(t, cfg, dir)
	d := DiffGraphs(old, cur)
	if d.Counts[ClassBody] != 2 || len(d.Changes) != 2 {
		t.Fatalf("want exactly 2 body changes (android + harmony cart limits), got %v %+v", d.Counts, d.Changes)
	}
	for _, c := range d.Changes {
		if !strings.Contains(strings.ToLower(c.ID), "max") {
			t.Errorf("unexpected change %s", c.ID)
		}
	}
	// LoginViewModel only had comment edits
	for id := range classes(d) {
		if strings.Contains(id, "LoginViewModel") {
			t.Errorf("comment-only change classified as change: %s", id)
		}
	}
}

func TestDiffRenameAndSignature(t *testing.T) {
	cfg, dir := withChange(t, "01-cart-limit")
	old, _ := scanDir(t, cfg, dir)
	testutil.ApplyChange(t, dir, "02-arkts-api-rename")
	cur, _ := scanDir(t, cfg, dir)
	d := DiffGraphs(old, cur)
	var ren *Change
	for i, c := range d.Changes {
		if c.Class == ClassRenamed {
			ren = &d.Changes[i]
		}
	}
	if ren == nil || !strings.HasSuffix(ren.OldID, "#Api.loadProducts") || !strings.HasSuffix(ren.ID, "#Api.fetchProducts") || ren.Similarity != 1 {
		t.Fatalf("rename not detected: %+v", d.Changes)
	}
	cl := classes(d)
	if cl["harmony://entry/src/main/ets/common/CartStore.ets#CartStore.addItem"] != ClassSignature {
		t.Fatalf("signature change not detected: %v", cl)
	}
	if d.Counts[ClassAdded] != 0 || d.Counts[ClassDeleted] != 0 {
		t.Fatalf("rename must not show as add/delete: %v", d.Counts)
	}
}

func TestDiffFuzzyRename(t *testing.T) {
	g1 := &model.Graph{Version: model.GraphVersion, Symbols: []*model.Symbol{{ID: "p://a#f", Kind: "function", Platform: "p", File: "a", Hash: "1", SigHash: "1", NormHash: "n1", SimHash: "ffffffffffffff00"}}}
	g2 := &model.Graph{Version: model.GraphVersion, Symbols: []*model.Symbol{{ID: "p://a#g", Kind: "function", Platform: "p", File: "a", Hash: "2", SigHash: "2", NormHash: "n2", SimHash: "ffffffffffffff01"}}}
	d := DiffGraphs(g1, g2)
	if len(d.Changes) != 1 || d.Changes[0].Class != ClassRenamed || d.Changes[0].Similarity < RenameThreshold {
		t.Fatalf("fuzzy rename: %+v", d.Changes)
	}
	g3 := &model.Graph{Version: model.GraphVersion, Symbols: []*model.Symbol{{ID: "p://a#g", Kind: "function", Platform: "p", File: "a", Hash: "2", SigHash: "2", NormHash: "n2", SimHash: "00000000000000ff"}}}
	d = DiffGraphs(g1, g3)
	if d.Counts[ClassAdded] != 1 || d.Counts[ClassDeleted] != 1 {
		t.Fatalf("dissimilar bodies must be add+delete: %v", d.Counts)
	}
}

func pagesFor(g *model.Graph, f *model.Facts) []*wiki.Page {
	var ps []*wiki.Page
	for _, rid := range routeIDs(f) {
		ps = append(ps, TemplateFeature(g, f, rid, "c0"))
	}
	ps = append(ps, TemplateOverview(f, []string{"android", "ios", "harmony"}, "c0"))
	return ps
}

func TestPlanIncrementalWriteSets(t *testing.T) {
	cfg, dir := withChange(t)
	old, f0 := scanDir(t, cfg, dir)
	pages := pagesFor(old, f0)
	testutil.ApplyChange(t, dir, "01-cart-limit")
	cur, f1 := scanDir(t, cfg, dir)
	p := BuildPlan(PlanInput{Cfg: cfg, Diff: DiffGraphs(old, cur), Old: old, Cur: cur, Facts: f1, Pages: pages})
	if p.Mode != "incremental" {
		t.Fatalf("mode %s (%s)", p.Mode, p.Reason)
	}
	got := map[string]Task{}
	for _, tk := range p.Tasks {
		got[tk.Page] = tk
		if len(tk.WriteSet) != 1 || tk.WriteSet[0] != tk.Page {
			t.Errorf("task %s write set %v", tk.ID, tk.WriteSet)
		}
		if len(tk.Reasons) == 0 {
			t.Errorf("task %s without reasons", tk.ID)
		}
	}
	if _, ok := got[FeaturePage("product_detail")]; !ok {
		t.Fatalf("product_detail page (anchors the cart limit via addItem) not planned: %v", p.Tasks)
	}
	if _, ok := got[FeaturePage("login")]; ok {
		t.Fatalf("login page planned although only comments changed")
	}
	if _, ok := got[OverviewPage]; ok {
		t.Fatalf("overview must not change when routes did not change")
	}
}

func TestPlanSignaturePropagation(t *testing.T) {
	cfg, dir := withChange(t, "01-cart-limit")
	old, f0 := scanDir(t, cfg, dir)
	callerID := "harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailPage.aboutToAppear"
	// a hand-written page that anchors only a *caller* of CartStore.addItem
	caller := old.Get("harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailPage.build")
	if caller == nil {
		t.Fatal("caller symbol missing")
	}
	flow := &wiki.Page{Path: "pages/flows/add-to-cart.md", Front: wiki.Front{ID: "flows/add-to-cart", Title: "flow", Kind: "flow",
		Sources: []model.Anchor{{Sym: caller.ID, Hash: caller.Hash}, {Sym: callerID, Hash: old.Get(callerID).Hash}}}}
	pages := append(pagesFor(old, f0), flow)
	testutil.ApplyChange(t, dir, "02-arkts-api-rename")
	cur, f1 := scanDir(t, cfg, dir)
	// make the caller's own body unchanged for the test: pretend hash identical
	cur.Get(caller.ID).Hash = caller.Hash
	cur.Get(caller.ID).SigHash = caller.SigHash
	p := BuildPlan(PlanInput{Cfg: cfg, Diff: DiffGraphs(old, cur), Old: old, Cur: cur, Facts: f1, Pages: pages})
	var ft *Task
	for i := range p.Tasks {
		if p.Tasks[i].Page == flow.Path {
			ft = &p.Tasks[i]
		}
	}
	if ft == nil {
		t.Fatalf("flow page not planned via propagation: %+v", p.Tasks)
	}
	found := false
	for _, r := range ft.Reasons {
		if r.Code == "signature_propagation" && strings.Contains(r.Detail, "CartStore.addItem") {
			found = true
		}
	}
	if !found {
		t.Fatalf("reasons %+v", ft.Reasons)
	}
	// with 0 hops propagation is disabled
	cfg.Plan.Hops = 0
	p = BuildPlan(PlanInput{Cfg: cfg, Diff: DiffGraphs(old, cur), Old: old, Cur: cur, Facts: f1, Pages: pages})
	for _, tk := range p.Tasks {
		if tk.Page == flow.Path {
			t.Fatalf("hops=0 still propagated: %+v", tk.Reasons)
		}
	}
}

func TestPlanNewRouteAndRebuild(t *testing.T) {
	cfg, dir := withChange(t, "01-cart-limit", "02-arkts-api-rename")
	old, f0 := scanDir(t, cfg, dir)
	pages := pagesFor(old, f0)
	testutil.ApplyChange(t, dir, "03-profile-route")
	cur, f1 := scanDir(t, cfg, dir)
	p := BuildPlan(PlanInput{Cfg: cfg, Diff: DiffGraphs(old, cur), Old: old, Cur: cur, Facts: f1, Pages: pages})
	var create, overview bool
	for _, tk := range p.Tasks {
		if tk.Page == FeaturePage("profile") && tk.Op == OpCreate {
			create = true
		}
		if tk.Page == OverviewPage {
			overview = true
		}
	}
	if !create || !overview {
		t.Fatalf("new route plan: %+v", p.Tasks)
	}
	// thresholds: make any change exceed them
	cfg.Plan.RebuildStructuralPct = 0.001
	p = BuildPlan(PlanInput{Cfg: cfg, Diff: DiffGraphs(old, cur), Old: old, Cur: cur, Facts: f1, Pages: pages})
	if p.Mode != "full" || !strings.Contains(p.Reason, "structural") {
		t.Fatalf("expected structural full rebuild, got %s %s", p.Mode, p.Reason)
	}
	cfg.Plan.RebuildStructuralPct = 0.3
	cfg.Plan.RebuildModuleRatio = 0.01
	p = BuildPlan(PlanInput{Cfg: cfg, Diff: DiffGraphs(old, cur), Old: old, Cur: cur, Facts: f1, Pages: pages})
	if p.Mode != "full" || !strings.Contains(p.Reason, "module") || len(p.Tasks) < 7 {
		t.Fatalf("expected module full rebuild with all pages, got %s %s %d", p.Mode, p.Reason, len(p.Tasks))
	}
	// no baseline -> full
	p = BuildPlan(PlanInput{Cfg: cfg, Diff: DiffGraphs(nil, cur), Old: &model.Graph{}, Cur: cur, Facts: f1})
	if p.Mode != "full" {
		t.Fatalf("no baseline: %s", p.Mode)
	}
}

func TestClaimsExtractionAndCheck(t *testing.T) {
	cfg := testutil.MinishopConfig(testutil.Minishop())
	g, f := scanDir(t, cfg, cfg.Root)
	spec, _ := os.ReadFile(filepath.Join(cfg.Root, "specs/001-cart/spec.md"))
	kiro, _ := os.ReadFile(filepath.Join(cfg.Root, ".kiro/specs/login/requirements.md"))
	legacy, _ := os.ReadFile(filepath.Join(cfg.Root, "docs/legacy/cart.md"))
	var claims []Claim
	claims = append(claims, ExtractClaims("specs/001-cart/spec.md", "raw/docs/specs/001-cart/spec.md", spec)...)
	claims = append(claims, ExtractClaims(".kiro/specs/login/requirements.md", "raw/x", kiro)...)
	claims = append(claims, ExtractClaims("docs/legacy/cart.md", "raw/y", legacy)...)
	byID := map[string]*Claim{}
	ck := &Checker{G: g, F: f, Dir: cfg.Root}
	for i := range claims {
		ck.Check(&claims[i])
		byID[claims[i].ID] = &claims[i]
	}
	want := map[string]string{"FR-001": ClaimVerified, "FR-002": ClaimVerified, "FR-003": ClaimVerified, "FR-004": ClaimConflict, "FR-005": ClaimVerified,
		"LOGIN-R1.1": ClaimVerified, "LOGIN-R1.2": ClaimVerified, "LOGIN-R2.1": ClaimVerified, "LOGIN-R2.2": ClaimConflict}
	for id, st := range want {
		c := byID[id]
		if c == nil {
			t.Errorf("claim %s not extracted", id)
			continue
		}
		if c.Status != st {
			t.Errorf("%s: status %s want %s (%v)", id, c.Status, st, c.Evidence)
		}
		if st == ClaimVerified && len(c.Anchors) == 0 {
			t.Errorf("%s verified without anchors", id)
		}
	}
	if !contains(byID["FR-005"].RouteIDs, "cart") {
		t.Errorf("FR-005 route ids %v", byID["FR-005"].RouteIDs)
	}
	// legacy doc: cart max 10 vs 99 and wrong order API are conflicts
	conflicts := 0
	for _, c := range claims {
		if c.Source == "docs/legacy/cart.md" && c.Status == ClaimConflict {
			conflicts++
			ev := strings.Join(c.Evidence, " ")
			if !strings.Contains(ev, "99") && !strings.Contains(ev, "/api/order/create") {
				t.Errorf("unexpected conflict evidence %s", ev)
			}
		}
	}
	if conflicts != 2 {
		t.Errorf("legacy cart conflicts = %d, want 2", conflicts)
	}
	// stable ids
	again := ExtractClaims("docs/legacy/cart.md", "raw/y", legacy)
	for i := range again {
		if again[i].ID != claims[len(claims)-len(again)+i].ID {
			t.Fatalf("claim ids not stable")
		}
	}
}

func TestClassifyDoc(t *testing.T) {
	cases := map[string]string{
		"specs/001-cart/spec.md": "spec", "specs/001-cart/plan.md": "design", "specs/001-cart/tasks.md": "tasks",
		".kiro/specs/login/requirements.md": "spec", ".kiro/steering/product.md": "agent-guide",
		"openspec/specs/auth/spec.md": "spec", "openspec/changes/add-x/proposal.md": "design",
		"docs/adr/0001-x.md": "adr", "doc/architecture/decisions/0002.md": "adr", "AGENTS.md": "agent-guide",
		"CLAUDE.md": "agent-guide", "lib/README.md": "readme", "docs/guide.md": "doc", "THREATMODEL.md": "design", "rfcs/0001.md": "design",
	}
	for p, want := range cases {
		if k, _, ok := ClassifyDoc(p); !ok || k != want {
			t.Errorf("%s: %s (%v), want %s", p, k, ok, want)
		}
	}
	if _, _, ok := ClassifyDoc("src/main.go"); ok {
		t.Error("non-doc classified")
	}
}

func TestLLMEvidenceDedupe(t *testing.T) {
	got := llmEvidence([]string{"[llm] [llm] 代码上限 50；接口 `POST /api/cart` 存在（android）", "代码上限 50"}, []string{"接口 `POST /api/cart` 存在（android）"})
	if got != "代码上限 50" {
		t.Fatalf("got %q", got)
	}
}

func TestSharedComponentEditDoesNotStaleFeatures(t *testing.T) {
	cfg, dir := withChange(t)
	old, f0 := scanDir(t, cfg, dir)
	pages := append(pagesFor(old, f0), TemplateConcept(old, f0, SharedPage, "c0"), TemplateConcept(old, f0, NavigationPage, "c0"))
	for _, rid := range routeIDs(f0) {
		for _, id := range FeatureSymbols(old, f0, rid) {
			if strings.Contains(id, "BackButton") || strings.Contains(id, "MiniShopTopBar") || strings.Contains(id, "AppRouter") {
				t.Fatalf("feature %s anchors shared symbol %s", rid, id)
			}
		}
	}
	p := filepath.Join(dir, "ios/MiniShop/Components/BackButton.swift")
	b, _ := os.ReadFile(p)
	os.WriteFile(p, []byte(strings.Replace(string(b), `Button("Back")`, `Button("Go back")`, 1)), 0o644)
	cur, f1 := scanDir(t, cfg, dir)
	plan := BuildPlan(PlanInput{Cfg: cfg, Diff: DiffGraphs(old, cur), Old: old, Cur: cur, Facts: f1, Pages: pages})
	if len(plan.Tasks) != 1 || plan.Tasks[0].Page != SharedPage {
		t.Fatalf("BackButton edit must only re-check %s, got %+v", SharedPage, plan.Tasks)
	}
	for _, pg := range pages {
		if pg.Path == FeaturePage("cart") {
			for _, a := range pg.Front.Sources {
				if s := cur.Get(a.Sym); s == nil || s.Hash != a.Hash {
					t.Fatalf("features/cart went stale on %s", a.Sym)
				}
			}
		}
	}
}

func TestParityConstantDiff(t *testing.T) {
	cfg, dir := withChange(t)
	g0, f0 := scanDir(t, cfg, dir)
	plats := []string{"android", "ios", "harmony"}
	p0 := ComputeParity(g0, f0, plats)
	if p0.Gaps != 0 {
		t.Fatalf("baseline minishop must be at parity: %+v", p0)
	}
	testutil.ApplyChange(t, dir, "01-cart-limit")
	g1, f1 := scanDir(t, cfg, dir)
	p1 := ComputeParity(g1, f1, plats)
	if len(p1.Constants) != 1 || p1.Constants[0].Name != "max_cart_items" ||
		p1.Constants[0].Values["android"].Value != "50" || p1.Constants[0].Values["ios"].Value != "99" || p1.Constants[0].Values["harmony"].Value != "50" {
		t.Fatalf("constant diff: %+v", p1.Constants)
	}
	if !strings.Contains(string(RenderParity(p1)), "max_cart_items") {
		t.Fatal("parity page misses the constant")
	}
	// a route missing on one platform is a gap
	f2 := *f1
	f2.Routes = nil
	for _, r := range f1.Routes {
		if !(r.RouteID == "cart" && r.Platform == "ios") {
			f2.Routes = append(f2.Routes, r)
		}
	}
	p2 := ComputeParity(g1, &f2, plats)
	for _, r := range p2.Features {
		if r.RouteID == "cart" && (len(r.MissingRoute) != 1 || r.MissingRoute[0] != "ios") {
			t.Fatalf("missing route not reported: %+v", r)
		}
	}
}

func TestRankForLLM(t *testing.T) {
	r := func(codes ...string) []Reason {
		var out []Reason
		for _, c := range codes {
			out = append(out, Reason{Code: c})
		}
		return out
	}
	tasks := []Task{
		{Page: "pages/_conflicts.md", Kind: "conflicts", Reasons: r("anchor_body_changed", "anchor_body_changed", "anchor_body_changed")},
		{Page: "pages/concepts/shared-components.md", Kind: "concept", Reasons: r("anchor_body_changed")},
		{Page: "pages/features/a.md", Kind: "feature", Reasons: r("anchor_body_changed")},
		{Page: "pages/features/b.md", Kind: "feature", Reasons: r("anchor_body_changed", "signature_propagation")},
		{Page: "pages/flows/checkout.md", Kind: "flow", Reasons: r("anchor_body_changed")},
		{Page: "pages/overview.md", Kind: "overview", Reasons: r("route_set_changed")},
	}
	var got []string
	for _, i := range RankForLLM(tasks) {
		got = append(got, tasks[i].Page)
	}
	want := "pages/features/b.md pages/features/a.md pages/flows/checkout.md pages/concepts/shared-components.md pages/_conflicts.md pages/overview.md"
	if strings.Join(got, " ") != want {
		t.Fatalf("rank:\n got %v\nwant %v", got, want)
	}
	p := &Plan{Tasks: tasks}
	finalize(p)
	for _, tk := range p.Tasks {
		if tk.Page == "pages/features/b.md" && tk.Priority != 1 {
			t.Fatalf("priority of b = %d", tk.Priority)
		}
	}
}

func TestEvalTemplateGoldenSet(t *testing.T) {
	rep, err := RunEval(EvalOptions{GoldenPath: filepath.Join(testutil.RepoRoot(), "examples", "minishop-eval", "golden.yaml"), LLM: "template"})
	if err != nil {
		t.Fatal(err)
	}
	if rep.ClaimsLabels < 30 || len(rep.Missing) > 0 {
		t.Fatalf("golden set: %d labels, missing %v", rep.ClaimsLabels, rep.Missing)
	}
	// regression floor for the deterministic checker
	if rep.Accuracy < 0.8 || rep.PerClass[ClaimConflict].Precision < 1 || rep.PerClass[ClaimVerified].Recall < 0.9 {
		t.Fatalf("claim metrics regressed:\n%s", FormatEval(rep))
	}
	if rep.ImpactMicro.Recall < 1 || rep.ImpactMicro.Precision < 0.8 {
		t.Fatalf("impact metrics regressed:\n%s", FormatEval(rep))
	}
}

// The held-out set (written blind, see examples/minishop-eval/heldout) is
// evaluated through the `docs:` field: only its document is ingested. The
// floor is the post-fix number; the blind template score was 0.58.
func TestEvalHeldoutSetWithDocs(t *testing.T) {
	rep, err := RunEval(EvalOptions{GoldenPath: filepath.Join(testutil.RepoRoot(), "examples", "minishop-eval", "heldout", "golden-heldout.yaml"), LLM: "template"})
	if err != nil {
		t.Fatal(err)
	}
	if rep.ClaimsLabels != 31 || len(rep.Missing) > 0 {
		t.Fatalf("held-out set: %d labels, missing %v", rep.ClaimsLabels, rep.Missing)
	}
	if rep.Accuracy < 0.8 || rep.PerClass[ClaimConflict].Precision < 1 {
		t.Fatalf("held-out metrics regressed:\n%s", FormatEval(rep))
	}
	// only the held-out document was ingested
	for _, c := range rep.Claims {
		if !strings.HasPrefix(c.ID, "HELDOUT-LEGACY-") {
			t.Fatalf("unexpected claim %s", c.ID)
		}
	}
}

func TestTemplateRecheckKeepsFreshLLMVerdicts(t *testing.T) {
	cfg, dir := withChange(t)
	g, f := scanDir(t, cfg, dir)
	staging := t.TempDir()
	os.MkdirAll(filepath.Join(staging, "facts"), 0o755)
	doc := []byte("- **FR-009**: Users MUST be able to add items via `addItem`.\n")
	os.MkdirAll(filepath.Join(staging, "raw/docs/specs"), 0o755)
	os.WriteFile(filepath.Join(staging, "raw/docs/specs/spec.md"), doc, 0o644)
	os.WriteFile(filepath.Join(staging, "raw/docs/manifest.json"), []byte(`{"version":1,"docs":[{"path":"specs/spec.md","raw":"raw/docs/specs/spec.md","kind":"spec"}]}`), 0o644)
	sym := "android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.addItem"
	req := func(hash string) {
		b, _ := json.Marshal(map[string]any{"version": 1, "requirements": []map[string]any{{"id": "FR-009", "source": "specs/spec.md",
			"text": "Users MUST be able to add items via `addItem`.", "status": "conflict", "anchors": []map[string]string{{"sym": sym, "hash": hash}},
			"route_ids": []string{"cart"}, "evidence": []string{"[llm] semantic judgement"}}}})
		os.WriteFile(filepath.Join(staging, "facts", "requirements.json"), b, 0o644)
	}
	env := &taskEnv{a: &Analysis{Graph: g, Facts: f, Scan: &scan.Result{Dir: dir}}, staging: staging}
	req(g.Get(sym).Hash)
	if c := env.templateClaims(); len(c) != 1 || c[0].Status != ClaimConflict {
		t.Fatalf("fresh LLM verdict must be kept: %+v", c)
	}
	req("stale-hash")
	if c := env.templateClaims(); c[0].Status != ClaimVerified {
		t.Fatalf("stale LLM verdict must be re-checked: %+v", c)
	}
}

// Two wikis in the same parent dir share .kb-work; their compound runs must
// not block each other (seen running several real repos side by side), but
// two runs on the same wiki must.
func TestCompoundLockIsPerWiki(t *testing.T) {
	dir := t.TempDir()
	u1, err := lock(dir, "lock-a-wiki")
	if err != nil {
		t.Fatal(err)
	}
	defer u1()
	u2, err := lock(dir, "lock-b-wiki")
	if err != nil {
		t.Fatalf("second wiki blocked: %v", err)
	}
	defer u2()
	if _, err := lock(dir, "lock-a-wiki"); err == nil {
		t.Fatal("same wiki must stay locked")
	}
}

// Page token budget: NextE's 3,351 claims rendered a 2.2 MB _conflicts.md
// (5,684 frontmatter anchor lines). Large verified / unverifiable sections are
// summarized per document; conflicts stay listed; requirements keep all.
func TestConflictsPageBudget(t *testing.T) {
	g := &model.Graph{Symbols: []*model.Symbol{{ID: "android://a.kt#A", Name: "A", Hash: "h1"}, {ID: "android://b.kt#B", Name: "B", Hash: "h2"}}}
	var claims []Claim
	for i := 0; i < ConflictsPageMaxRows+50; i++ {
		claims = append(claims, Claim{ID: fmt.Sprintf("v%d", i), Source: "docs/a.md", Raw: "raw/docs/a.md", Line: i + 1, Text: "x", Status: ClaimVerified, Anchors: []string{"android://a.kt#A"}})
	}
	claims = append(claims, Claim{ID: "c1", Source: "docs/b.md", Raw: "raw/docs/b.md", Line: 3, Text: "`B` is 5", Status: ClaimConflict, Anchors: []string{"android://b.kt#B"}, Evidence: []string{"B = 6"}})
	pg, reqs := RenderConflicts(claims, g, "abc")
	if len(reqs) != len(claims) {
		t.Fatalf("requirements must keep every claim: %d", len(reqs))
	}
	if strings.Contains(pg.Body, "**v1**") || !strings.Contains(pg.Body, "| docs/a.md | 350 |") || !strings.Contains(pg.Body, "**c1**") {
		t.Fatalf("budgeted page:\n%s", pg.Body)
	}
	if len(pg.Front.Sources) != 1 || pg.Front.Sources[0].Sym != "android://b.kt#B" {
		t.Fatalf("summarized verified claims must not anchor the page: %+v", pg.Front.Sources)
	}
	small, _ := RenderConflicts(claims[ConflictsPageMaxRows:], g, "abc")
	if !strings.Contains(small.Body, "**v300**") || len(small.Front.Sources) != 2 {
		t.Fatalf("small doc sets stay fully listed:\n%s", small.Body)
	}
}

// KMP (JetBrains/kotlinconf-app): a Compose Multiplatform screen in
// commonMain is scanned under the android root but runs on iOS too.
func TestParityKMPCommonMainIsShared(t *testing.T) {
	f := &model.Facts{Routes: []model.Route{
		{Platform: "android", RouteID: "schedule", File: "shared/src/commonMain/kotlin/Nav.kt"},
		{Platform: "android", RouteID: "widget", File: "androidApp/src/main/kotlin/Widget.kt"},
	}}
	p := ComputeParity(&model.Graph{}, f, []string{"android", "ios"})
	for _, r := range p.Features {
		switch r.RouteID {
		case "schedule":
			if len(r.MissingRoute) != 0 {
				t.Errorf("commonMain route reported missing: %+v", r)
			}
		case "widget":
			if len(r.MissingRoute) != 1 || r.MissingRoute[0] != "ios" {
				t.Errorf("android-only route must stay a gap: %+v", r)
			}
		}
	}
}

// False conflicts found on real repos (docs/validation.md round 2).
func TestFalseConflictFilters(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, ".gitignore"), []byte("# Secrets\nFrameworks/native-secrets\nKsApi/Sources/KsApi/Secrets.swift\n"), 0o644)
	os.MkdirAll(filepath.Join(dir, "Test Plans"), 0o755)
	os.WriteFile(filepath.Join(dir, "setup.sh"), []byte("#!/bin/sh\n"), 0o755)
	os.WriteFile(filepath.Join(dir, "Test Plans", "UITests.xctestplan"), []byte("{}"), 0o644)
	g := &model.Graph{Symbols: []*model.Symbol{{ID: "android://a.kt#DefaultSessionRepository", Name: "DefaultSessionRepository", Qual: "DefaultSessionRepository", Kind: "class", File: "a.kt"}}}
	k := &Checker{G: g, F: &model.Facts{}, Dir: dir}
	cases := []struct{ src, text string }{
		{"README.md", "copy `Frameworks/native-secrets/ios/Secrets.swift` into the package"},                       // gitignored (kickstarter)
		{"README.md", "runs each checked-in `UITests.xctestplan` configuration"},                                   // file, not a type (wikipedia-ios)
		{"CLAUDE.md", "Interface implementations: Prefix with `Default` (e.g., `DefaultRepository`)"},              // example name (DroidconKotlin)
		{"docs/plans/archive/x.md", "Add `entry/src/main/ets/pages/NewPage.ets` for the new flow"},                 // plan doc (NextE)
		{"README.md", "Execute the script with `./setup.sh` and complete the answers."},                            // ./ prefix (NetNewsWire)
		{"CLAUDE.md", "Manual setup: Create `SharedXcodeSettings/DeveloperSettings.xcconfig` in parent directory"}, // file to create
		{"docs/research/compare.md", "EhViewer has pattern unlock in `SecurityScene.kt`"},                          // research note about another app (NextE)
	}
	for _, c := range cases {
		cl := &Claim{ID: "x", Source: c.src, Text: c.text}
		k.Check(cl)
		if cl.Status == ClaimConflict {
			t.Errorf("%s: false conflict: %v", c.text, cl.Evidence)
		}
	}
	real := &Claim{ID: "y", Source: "README.md", Text: "In the `AccountManager.swift` file, replace the domain"}
	k.Check(real)
	if real.Status != ClaimConflict {
		t.Errorf("a missing, non-ignored file in a current doc is a real conflict: %+v", real)
	}
}

// The compound baseline is stored gzipped; a wiki written by an older kb
// (plain graph.json) still loads, and is replaced on the next write.
func TestGraphBaselineGzipAndLegacy(t *testing.T) {
	kb := t.TempDir()
	g := &model.Graph{Version: model.GraphVersion, Symbols: []*model.Symbol{{ID: "android://a.kt#A", Name: "A"}}}
	legacy, _ := json.Marshal(g)
	os.WriteFile(filepath.Join(kb, "graph.json"), legacy, 0o644)
	if lg, err := LoadGraph(filepath.Join(kb, "graph.json")); err != nil || lg.Get("android://a.kt#A") == nil {
		t.Fatalf("legacy graph.json: %v", err)
	}
	if err := writeGraph(kb, g); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(kb, "graph.json")); !os.IsNotExist(err) {
		t.Fatal("legacy graph.json must be removed")
	}
	if lg, err := LoadGraph(filepath.Join(kb, "graph.json")); err != nil || lg.Get("android://a.kt#A") == nil {
		t.Fatalf("graph.json.gz: %v", err)
	}
}
