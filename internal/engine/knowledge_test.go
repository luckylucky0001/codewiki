package engine

import (
	"fmt"
	"github.com/luckylucky0001/codewiki/internal/model"
	"github.com/luckylucky0001/codewiki/internal/wiki"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestKnowledgeRejectsUnsafeAndUnmappedPlans(t *testing.T) {
	good := func() *KnowledgePlan {
		return &KnowledgePlan{Version: 1, Rationale: "code research", Modules: map[string]string{"net": "pages/modules/net.md"}, Pages: []KnowledgePage{{Page: "pages/modules/net.md", Kind: "concept", Title: "Network", Scope: []string{"net"}, Questions: []string{"entry", "state", "retry"}, Symbols: []string{"a", "b", "c"}}}}
	}
	if err := validateKnowledgePlan(good()); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"../escape.md", "pages/modules/../../AGENTS.md", "pages/modules/a.md/evil", "/tmp/x.md"} {
		p := good()
		p.Pages[0].Page = path
		if validateKnowledgePlan(p) == nil {
			t.Fatalf("accepted %q", path)
		}
	}
	p := good()
	p.Pages[0].Scope = []string{"../outside"}
	if validateKnowledgePlan(p) == nil {
		t.Fatal("unsafe scope accepted")
	}
	p = good()
	p.Modules["db"] = "pages/modules/missing.md"
	if validateKnowledgePlan(p) == nil {
		t.Fatal("missing module target accepted")
	}
}

func TestKnowledgeScopeCatchesUnanchoredChangesAndKeepsNoop(t *testing.T) {
	old := &model.Graph{Version: model.GraphVersion, Symbols: []*model.Symbol{{ID: "seed", File: "net/a.java", Hash: "same"}, {ID: "unanchored", File: "net/b.java", Hash: "old"}}}
	old.Index()
	cur := &model.Graph{Version: model.GraphVersion, Symbols: []*model.Symbol{{ID: "seed", File: "net/a.java", Hash: "same"}, {ID: "unanchored", File: "net/b.java", Hash: "new"}}}
	cur.Index()
	kp := &KnowledgePlan{Pages: []KnowledgePage{{Page: "pages/modules/net.md", Kind: "concept", Title: "Net", Scope: []string{"net"}, Symbols: []string{"seed"}}}}
	a := &Analysis{Graph: cur, Old: old, Diff: DiffGraphs(old, cur), Plan: &Plan{Mode: "incremental"}, Pages: []*wiki.Page{{Path: "pages/modules/net.md", Front: wiki.Front{Sources: []model.Anchor{{Sym: "seed", Hash: "same"}}}}}}
	applyKnowledgePlan(a, kp, false)
	if len(a.Plan.Tasks) != 1 || !a.Plan.Tasks[0].Knowledge {
		t.Fatalf("missed unanchored change: %+v", a.Plan.Tasks)
	}
	a.Diff = DiffGraphs(cur, cur)
	a.Plan = &Plan{Mode: "noop"}
	applyKnowledgePlan(a, kp, false)
	if len(a.Plan.Tasks) != 0 || a.Plan.Mode != "noop" {
		t.Fatalf("unchanged knowledge is not noop: %+v", a.Plan)
	}
	if inKnowledgeScope("network/a.java", []string{"net"}) {
		t.Fatal("directory prefix collision")
	}
}

func TestKnowledgeCannotRestampWithTemplate(t *testing.T) {
	e := &taskEnv{o: &Options{LLM: "template"}}
	r := e.runKnowledgeTasks([]Task{{ID: "test", Page: "pages/modules/net.md", Knowledge: true}})
	if len(r) != 1 || r[0].Status != "failed" {
		t.Fatalf("template silently accepted semantic rewrite: %+v", r)
	}
}

func TestKnowledgeAgentPublishFailureAndNoop(t *testing.T) {
	cfg, dir := withChange(t)
	first, err := Compound(&Options{Cfg: cfg, LLM: "template"})
	if err != nil || !first.Published {
		t.Fatalf("bootstrap %v %+v", err, first)
	}
	a, err := Analyze(&Options{Cfg: cfg})
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, s := range a.Graph.Symbols {
		if s.Platform == "android" {
			ids = append(ids, s.ID)
			if len(ids) == 3 {
				break
			}
		}
	}
	kp := &KnowledgePlan{Version: 1, Rationale: "fixture research", Modules: map[string]string{"android": "pages/modules/business.md"}, Pages: []KnowledgePage{{Page: "pages/modules/business.md", Title: "业务", Kind: "concept", Scope: []string{"android"}, Questions: []string{"entry", "state", "failure"}, Symbols: ids}}}
	writeJSON(filepath.Join(cfg.WikiPath(), KnowledgePlanFile), kp)
	oldOverview, _ := os.ReadFile(filepath.Join(cfg.WikiPath(), OverviewPage))
	failed, err := Compound(&Options{Cfg: cfg, LLM: "cmd", LLMCmd: "exit 7", Workers: 2})
	if err != nil || failed.Published || failed.Verify == nil || failed.Verify.OK {
		t.Fatalf("failed agent published or succeeded: %v %+v", err, failed)
	}
	after, _ := os.ReadFile(filepath.Join(cfg.WikiPath(), OverviewPage))
	if string(after) != string(oldOverview) {
		t.Fatal("failure changed published wiki")
	}
	pg := &wiki.Page{Path: "pages/modules/business.md", HasFM: true, Front: wiki.Front{ID: "modules/business", Title: "业务", Kind: "concept", Status: wiki.StatusCurrent}}
	for _, id := range ids {
		pg.Front.Sources = append(pg.Front.Sources, model.Anchor{Sym: id, Hash: a.Graph.Get(id).Hash})
		pg.Body += "`" + id + "`\n"
	}
	for _, h := range []string{"职责与边界", "执行链路", "状态与数据", "异常与恢复", "修改与测试", "证据与未知"} {
		pg.Body += "\n## " + h + "\n" + strings.Repeat("受控测试正文说明状态边界与证据。", 30)
	}
	fixture := filepath.Join(dir, "writer-fixture.txt")
	if err := os.WriteFile(fixture, pg.Render(), 0644); err != nil {
		t.Fatal(err)
	}
	currentHash := pg.Front.Sources[0].Hash
	pg.Front.Sources[0].Hash = "stale-hash"
	if err := os.WriteFile(fixture, pg.Render(), 0644); err != nil {
		t.Fatal(err)
	}
	stale, err := Compound(&Options{Cfg: cfg, LLM: "cmd", LLMCmd: fmt.Sprintf("mkdir -p pages/modules && cp %q pages/modules/business.md", fixture), Workers: 2})
	if err != nil || stale.Published || stale.Verify == nil || stale.Verify.OK {
		t.Fatalf("stale evidence was silently restamped: %v %+v", err, stale)
	}
	pg.Front.Sources[0].Hash = currentHash
	if err := os.WriteFile(fixture, pg.Render(), 0644); err != nil {
		t.Fatal(err)
	}
	ok, err := Compound(&Options{Cfg: cfg, LLM: "cmd", LLMCmd: fmt.Sprintf("mkdir -p pages/modules && cp %q pages/modules/business.md", fixture), Workers: 2})
	if err != nil || !ok.Published || !ok.Verify.OK {
		t.Fatalf("valid agent page failed %v %+v", err, ok)
	}
	overview, _ := os.ReadFile(filepath.Join(cfg.WikiPath(), OverviewPage))
	if !strings.Contains(string(overview), "modules/business.md") || strings.Contains(string(overview), "cart=<sku") {
		t.Fatal("knowledge navigation missing or unrelated legacy boilerplate retained")
	}
	noop, err := Compound(&Options{Cfg: cfg, LLM: "template"})
	if err != nil || noop.Published || noop.Mode != "noop" {
		t.Fatalf("no changes should not require writer: %v %+v", err, noop)
	}
}

func TestKnowledgeResumeValidatesEvidenceAndStatus(t *testing.T) {
	root := t.TempDir()
	priorDir := filepath.Join(root, "prior")
	stage := filepath.Join(root, "stage")
	os.MkdirAll(filepath.Join(priorDir, "wiki", ".kb"), 0755)
	os.MkdirAll(filepath.Join(stage, ".kb"), 0755)
	g := &model.Graph{Version: model.GraphVersion, Commit: "abc", Symbols: []*model.Symbol{
		{ID: "one", Hash: "h1"}, {ID: "two", Hash: "h2"}, {ID: "three", Hash: "h3"},
	}}
	g.Index()
	writeJSON(filepath.Join(priorDir, "graph.json"), g)
	page := "pages/modules/example.md"
	kp := &KnowledgePlan{Version: 1, Rationale: "research", Modules: map[string]string{"example": page}, Pages: []KnowledgePage{{Page: page, Title: "Example", Kind: "concept", Scope: []string{"example"}, Questions: []string{"entry", "state", "failure"}, Symbols: []string{"one", "two", "three"}}}}
	writeJSON(filepath.Join(priorDir, "wiki", KnowledgePlanFile), kp)
	prior := &Result{RunID: "original", Head: "abc", WorkDir: priorDir, Tasks: []TaskResult{{ID: "task", Page: page, Status: "ok"}}}
	resultPath := filepath.Join(root, "result.json")
	writeJSON(resultPath, map[string]any{"ok": false, "result": prior})
	pg := &wiki.Page{Path: page, HasFM: true, Front: wiki.Front{ID: "modules/example", Kind: "concept", Status: wiki.StatusCurrent}}
	for _, s := range g.Symbols {
		pg.Front.Sources = append(pg.Front.Sources, model.Anchor{Sym: s.ID, Hash: s.Hash})
		pg.Body += "`" + s.ID + "`\n"
	}
	for _, h := range []string{"职责与边界", "执行链路", "状态与数据", "异常与恢复", "修改与测试", "证据与未知"} {
		pg.Body += "\n## " + h + "\n" + strings.Repeat("测试内容解释状态和异常。", 35)
	}
	if err := wiki.WriteFileAtomic(filepath.Join(priorDir, "writers", "task", page), pg.Render()); err != nil {
		t.Fatal(err)
	}
	e := &taskEnv{o: &Options{ResumeResult: resultPath}, a: &Analysis{Graph: g}, staging: stage, head: "abc"}
	if err := e.prepareResume(); err != nil {
		t.Fatal(err)
	}
	task := Task{ID: "new-task", Page: page, Kind: "concept", Knowledge: true}
	tr, reused := e.reuseKnowledge(task)
	if !reused || tr.Status != "ok" || tr.Writer != "reuse:original" {
		t.Fatalf("valid reuse failed: %+v %v", tr, reused)
	}
	e.resume.Tasks[0].Status = "failed"
	if _, reused = e.reuseKnowledge(task); reused {
		t.Fatal("failed task was reused")
	}
	e.resume.Tasks[0].Status = "ok"
	pg.Front.Sources[0].Hash = "stale"
	wiki.WriteFileAtomic(filepath.Join(priorDir, "writers", "task", page), pg.Render())
	tr, reused = e.reuseKnowledge(task)
	if !reused || tr.Status != "failed" {
		t.Fatal("stale retained page accepted")
	}
	g.Symbols[0].Hash = "changed"
	if err := e.prepareResume(); err == nil {
		t.Fatal("different source graph accepted")
	}
}
