package engine

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/luckylucky0001/codewiki/internal/wiki"
)

func TestRetirementPreservesOriginalAndRejectsBrokenLinks(t *testing.T) {
	cfg, _ := withChange(t)
	if r, err := Compound(&Options{Cfg: cfg, LLM: "template"}); err != nil || !r.Published {
		t.Fatalf("bootstrap: %v", err)
	}
	page := "pages/concepts/obsolete.md"
	original := []byte("---\nid: concepts/obsolete\ntitle: Obsolete\nkind: concept\nstatus: current\n---\n# Old unsupported claim\n")
	wiki.WriteFileAtomic(filepath.Join(cfg.WikiPath(), page), original)
	ref := filepath.Join(cfg.WikiPath(), "pages/concepts/reference.md")
	wiki.WriteFileAtomic(ref, []byte("---\nid: concepts/reference\ntitle: Reference\nkind: concept\nstatus: current\n---\n[Old](obsolete.md)\n"))
	r, err := Compound(&Options{Cfg: cfg, LLM: "template", RetirePages: page, RetireReason: "Superseded by researched module pages"})
	if err != nil || r.Published || r.Verify.OK {
		t.Fatalf("dangling reference published: %v %+v", err, r)
	}
	if b, _ := os.ReadFile(filepath.Join(cfg.WikiPath(), page)); string(b) != string(original) {
		t.Fatal("failed retirement changed live page")
	}
	failedWorkDir := r.WorkDir
	os.Remove(ref)
	r, err = Compound(&Options{Cfg: cfg, LLM: "template", RetirePages: page, RetireReason: "Superseded by researched module pages"})
	if err != nil || !r.Published || !r.Verify.OK {
		t.Fatalf("valid retirement failed: %v %+v", err, r)
	}
	if r.WorkDir == failedWorkDir {
		t.Fatal("retry reused failed staging directory")
	}
	if _, err := os.Stat(filepath.Join(cfg.WikiPath(), page)); !os.IsNotExist(err) {
		t.Fatal("retired page remains active")
	}
	archives, _ := filepath.Glob(filepath.Join(cfg.WikiPath(), ".kb/retired/*", page))
	if len(archives) != 1 {
		t.Fatalf("missing original: %v", archives)
	}
	if b, _ := os.ReadFile(archives[0]); string(b) != string(original) {
		t.Fatal("archive altered")
	}
	if b, _ := os.ReadFile(archives[0] + ".reason.txt"); !strings.Contains(string(b), "Superseded") {
		t.Fatal("reason missing")
	}
}

func TestRetirementRejectsUnsafeAndReservedPages(t *testing.T) {
	for _, page := range []string{"../outside.md", "pages/../outside.md", "pages/overview.md", "pages/parity.md", "pages/_conflicts.md", "facts/routes.md"} {
		e := &taskEnv{o: &Options{RetirePages: page, RetireReason: "obsolete"}, staging: t.TempDir(), work: "/tmp/run"}
		if e.retirePages() == nil {
			t.Fatalf("accepted %s", page)
		}
	}
}

func TestRetiredEmptyConceptStaysRetiredButNewEvidenceRestoresTask(t *testing.T) {
	dir := t.TempDir()
	wiki.WriteFileAtomic(filepath.Join(dir, retiredPagesFile), []byte(`{"pages/concepts/shared-components.md":"superseded"}`))
	for _, tc := range []struct {
		context   []string
		knowledge bool
		want      int
	}{
		{nil, false, 0}, {[]string{"new-symbol"}, false, 1}, {nil, true, 1},
	} {
		a := &Analysis{Plan: &Plan{Mode: "incremental", Tasks: []Task{{Page: SharedPage, Kind: "concept", Context: tc.context, Knowledge: tc.knowledge}}}}
		if err := suppressRetiredPlaceholders(a, dir); err != nil {
			t.Fatal(err)
		}
		if len(a.Plan.Tasks) != tc.want {
			t.Fatalf("unexpected task count: %+v", a.Plan)
		}
		if tc.want == 0 && a.Plan.Mode != "noop" {
			t.Fatal("retired placeholder prevents noop")
		}
	}
}
