package cli

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/luckylucky0001/codewiki/internal/testutil"
)

func run(t *testing.T, dir string, args ...string) (int, string, string) {
	t.Helper()
	var out, errb bytes.Buffer
	code := Run(append(args, "--root", dir), &out, &errb)
	return code, out.String(), errb.String()
}

func runJSON(t *testing.T, dir string, args ...string) (int, map[string]any) {
	t.Helper()
	code, out, errs := run(t, dir, append(args, "--json")...)
	var v map[string]any
	if err := json.Unmarshal([]byte(out), &v); err != nil {
		t.Fatalf("kb %v: stdout is not JSON (%v): %q stderr=%s", args, err, out, errs)
	}
	return code, v
}

func repo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	testutil.CopyDir(t, testutil.Minishop(), dir)
	testutil.Git(t, dir, "init", "-q", "-b", "master")
	testutil.Git(t, dir, "add", "-A")
	testutil.Git(t, dir, "commit", "-qm", "init")
	return dir
}

func commitChange(t *testing.T, dir, name string) {
	t.Helper()
	testutil.ApplyChange(t, dir, name)
	testutil.Git(t, dir, "add", "-A")
	testutil.Git(t, dir, "commit", "-qm", name)
}

func TestUsageAndHelp(t *testing.T) {
	var out, errb bytes.Buffer
	if code := Run(nil, &out, &errb); code != ExitUsage {
		t.Fatalf("no args: %d", code)
	}
	if code := Run([]string{"nope"}, &out, &errb); code != ExitUsage {
		t.Fatalf("unknown command: %d", code)
	}
	out.Reset()
	if code := Run([]string{"compound", "--help"}, &out, &errb); code != ExitOK || !strings.Contains(out.String(), "--llm") {
		t.Fatalf("help: %d %s", code, out.String())
	}
	if code := Run([]string{"verify", "--bogus"}, &out, &errb); code != ExitUsage {
		t.Fatalf("bad flag: %d", code)
	}
	dir := t.TempDir()
	if code, v := runJSON(t, dir, "verify"); code != ExitUsage || v["ok"] != false {
		t.Fatalf("verify without config: %d %v", code, v)
	}
	if code, _ := runJSON(t, dir, "compound", "--llm", "gpt"); code != ExitUsage {
		t.Fatalf("bad --llm: %d", code)
	}
}

// TestTemplateFlow is the integration test of the demo flow (template writer).
func TestTemplateFlow(t *testing.T) {
	dir := repo(t)
	code, v := runJSON(t, dir, "init")
	if code != 0 || v["ok"] != true {
		t.Fatalf("init: %d %v", code, v)
	}
	// init is idempotent
	if _, v := runJSON(t, dir, "init"); len(v["created"].([]any)) != 0 {
		t.Fatalf("second init created %v", v["created"])
	}
	code, man := runJSON(t, dir, "discover-docs")
	if code != 0 || len(man["docs"].([]any)) < 6 {
		t.Fatalf("discover-docs: %d %v", code, man)
	}
	mp := filepath.Join(t.TempDir(), "docs.json")
	b, _ := json.Marshal(man)
	os.WriteFile(mp, b, 0o644)
	if code, v := runJSON(t, dir, "ingest", "--manifest", mp, "--kinds", "spec,adr,doc,agent-guide"); code != 0 {
		t.Fatalf("ingest: %d %v", code, v)
	}
	testutil.Git(t, dir, "add", "-A")
	testutil.Git(t, dir, "commit", "-qm", "wiki")

	code, v = runJSON(t, dir, "compound")
	res := v["result"].(map[string]any)
	if code != 0 || res["published"] != true || res["mode"] != "full" {
		t.Fatalf("initial compound: %d mode=%v published=%v", code, res["mode"], res["published"])
	}
	if code, _ := runJSON(t, dir, "verify"); code != 0 {
		t.Fatalf("verify after initial compound: %d", code)
	}
	// idempotent: second compound is a noop
	_, v = runJSON(t, dir, "compound")
	if r := v["result"].(map[string]any); r["mode"] != "noop" || len(r["changed"].([]any)) != 0 {
		t.Fatalf("second compound not a noop: %v %v", r["mode"], r["changed"])
	}
	testutil.Git(t, dir, "add", "-A")
	testutil.Git(t, dir, "commit", "-qm", "wiki")

	// merge 01: stale until compounded
	commitChange(t, dir, "01-cart-limit")
	if code, _ := runJSON(t, dir, "status"); code != ExitStale {
		t.Fatalf("status after change: %d (want 1)", code)
	}
	if code, _ := runJSON(t, dir, "verify"); code != ExitStale {
		t.Fatalf("verify after change: %d (want 1)", code)
	}
	_, d := runJSON(t, dir, "diff")
	if d["counts"].(map[string]any)["body"].(float64) != 3 {
		t.Fatalf("diff counts %v", d["counts"])
	}
	code, v = runJSON(t, dir, "compound")
	if code != 0 {
		t.Fatalf("compound 01: %d %v", code, v)
	}
	if code, _ := runJSON(t, dir, "status"); code != 0 {
		t.Fatalf("status after compound: %d", code)
	}
	reqs, _ := os.ReadFile(filepath.Join(dir, "wiki/facts/requirements.json"))
	if !strings.Contains(string(reqs), `"FR-002"`) {
		t.Fatal("requirements.json missing FR-002")
	}
	var rq struct {
		Requirements []struct{ ID, Status string } `json:"requirements"`
	}
	json.Unmarshal(reqs, &rq)
	for _, r := range rq.Requirements {
		if r.ID == "FR-002" && r.Status != "conflict" {
			t.Fatalf("FR-002 should become a conflict after the limit changed to 50, got %s", r.Status)
		}
	}
	testutil.Git(t, dir, "add", "-A")
	testutil.Git(t, dir, "commit", "-qm", "wiki")

	// merge 02 + 03
	for _, cs := range []string{"02-arkts-api-rename", "03-profile-route"} {
		commitChange(t, dir, cs)
		if code, v := runJSON(t, dir, "compound"); code != 0 {
			t.Fatalf("compound %s: %d %v", cs, code, v)
		}
		testutil.Git(t, dir, "add", "-A")
		testutil.Git(t, dir, "commit", "-qm", "wiki")
	}
	if _, err := os.Stat(filepath.Join(dir, "wiki/pages/features/profile.md")); err != nil {
		t.Fatal("profile page not created")
	}
	logb, _ := os.ReadFile(filepath.Join(dir, "wiki/log.md"))
	if strings.Count(string(logb), "] compound | ") != 4 {
		t.Fatalf("log.md entries:\n%s", logb)
	}
	// queries
	_, s := runJSON(t, dir, "search", "购物车")
	if len(s["results"].([]any)) == 0 {
		t.Fatal("search returned nothing")
	}
	_, c := runJSON(t, dir, "context", "android/app/src/main/java/com/minishop/ui/cart/CartViewModel.kt")
	if len(c["pages"].([]any)) == 0 {
		t.Fatal("context returned no pages")
	}
	if code, g := runJSON(t, dir, "get", "features/profile"); code != 0 || g["front"].(map[string]any)["id"] != "features/profile" {
		t.Fatalf("get: %d %v", code, g)
	}
	if code, _ := runJSON(t, dir, "get", "features/nope"); code != ExitUsage {
		t.Fatal("get missing page should be a usage error")
	}
	code, an := runJSON(t, dir, "anchor", "harmony://entry/src/main/ets/common/Api.ets#Api.fetchProducts", "harmony://nope#X")
	if code != ExitStale || an["anchors"].([]any)[0].(map[string]any)["hash"] == "" {
		t.Fatalf("anchor: %d %v", code, an)
	}
	if code, l := runJSON(t, dir, "lint-tid", "--strict"); code != 0 || l["gaps"].(float64) != 0 {
		t.Fatalf("lint-tid: %d %v", code, l["gaps"])
	}
	// tampering with a hash is caught by verify (exit 1)
	p := filepath.Join(dir, "wiki/pages/features/cart.md")
	pb, _ := os.ReadFile(p)
	os.WriteFile(p, []byte(strings.Replace(string(pb), "hash: ", "hash: 0", 1)), 0o644)
	if code, v := runJSON(t, dir, "verify"); code != ExitStale || v["ok"] != false {
		t.Fatalf("tampered verify: %d", code)
	}
}

// TestLLMWriteSetEnforcement runs the command writer with a fake LLM that
// also writes outside its write set.
func TestLLMWriteSetEnforcement(t *testing.T) {
	dir := repo(t)
	run(t, dir, "init")
	if code, _, e := run(t, dir, "compound"); code != 0 {
		t.Fatalf("bootstrap: %s", e)
	}
	testutil.Git(t, dir, "add", "-A")
	testutil.Git(t, dir, "commit", "-qm", "wiki")
	commitChange(t, dir, "01-cart-limit")
	fake := `cat >/dev/null; for p in pages/features/cart.md pages/features/product_detail.md; do id=${p#pages/}; id=${id%.md}; printf -- '---\nid: %s\ntitle: fake\nsources: []\n---\n# fake page\n\n[总览](../overview.md)\n' "$id" > "$p"; done; echo hacked > index.md; echo x > pages/evil.md`
	code, v := runJSON(t, dir, "compound", "--llm", "cmd", "--llm-cmd", fake)
	if code != 0 {
		t.Fatalf("compound with fake llm: %d %v", code, v)
	}
	res := v["result"].(map[string]any)
	tasks := res["tasks"].([]any)
	if len(tasks) == 0 {
		t.Fatal("no tasks")
	}
	for _, tk := range tasks {
		m := tk.(map[string]any)
		if m["status"] != "violation" || !strings.Contains(m["error"].(string), "index.md") {
			t.Fatalf("expected violation, got %v", m)
		}
	}
	idx, _ := os.ReadFile(filepath.Join(dir, "wiki/index.md"))
	if strings.Contains(string(idx), "hacked") {
		t.Fatal("write outside write set was not reverted")
	}
	if _, err := os.Stat(filepath.Join(dir, "wiki/pages/evil.md")); err == nil {
		t.Fatal("new file outside write set was not removed")
	}
	pg, _ := os.ReadFile(filepath.Join(dir, "wiki/pages/features/cart.md"))
	if !strings.Contains(string(pg), "fake page") || !strings.Contains(string(pg), "sym: ") {
		t.Fatalf("page not post-processed with anchors:\n%s", pg)
	}
	if code, _ := runJSON(t, dir, "verify"); code != 0 {
		t.Fatal("verify after fake llm")
	}
}

func TestLLMFailureDoesNotPublish(t *testing.T) {
	dir := repo(t)
	run(t, dir, "init")
	run(t, dir, "compound")
	testutil.Git(t, dir, "add", "-A")
	testutil.Git(t, dir, "commit", "-qm", "wiki")
	commitChange(t, dir, "01-cart-limit")
	before, _ := os.ReadFile(filepath.Join(dir, "wiki/pages/features/cart.md"))
	code, v := runJSON(t, dir, "compound", "--llm", "cmd", "--llm-cmd", "cat >/dev/null; exit 7")
	if code != ExitStale || v["result"].(map[string]any)["published"] != false {
		t.Fatalf("failed llm must not publish: %d", code)
	}
	after, _ := os.ReadFile(filepath.Join(dir, "wiki/pages/features/cart.md"))
	if string(before) != string(after) {
		t.Fatal("wiki changed although verification failed")
	}
	// --fallback recovers with the template writer
	os.RemoveAll(filepath.Join(dir, ".kb-work"))
	if code, _ := runJSON(t, dir, "compound", "--llm", "cmd", "--llm-cmd", "cat >/dev/null; exit 7", "--fallback"); code != 0 {
		t.Fatalf("fallback: %d", code)
	}
}

func TestInstallSkills(t *testing.T) {
	dir := t.TempDir()
	code, v := runJSON(t, dir, "install-skills", dir)
	if code != 0 {
		t.Fatal(v)
	}
	for _, s := range []string{"kb-compound", "kb-ingest", "kb-query", "kb-lint"} {
		b, err := os.ReadFile(filepath.Join(dir, ".claude/skills", s, "SKILL.md"))
		if err != nil || !strings.Contains(string(b), "name: "+s) {
			t.Fatalf("skill %s not installed", s)
		}
	}
}

func TestDiffBaseRevision(t *testing.T) {
	dir := repo(t)
	run(t, dir, "init")
	testutil.Git(t, dir, "add", "-A")
	testutil.Git(t, dir, "commit", "-qm", "init wiki")
	commitChange(t, dir, "02-arkts-api-rename")
	// no compound has run: --base rescans the previous revision via git archive
	code, d := runJSON(t, dir, "diff", "--base", "HEAD~1")
	if code != 0 || d["incompatible"] == true {
		t.Fatalf("diff --base: %d %v", code, d)
	}
	c := d["counts"].(map[string]any)
	if c["renamed"].(float64) != 1 || c["signature"].(float64) != 1 {
		t.Fatalf("counts %v", c)
	}
	if code, p := runJSON(t, dir, "plan", "--base", "HEAD~1", "--dry-run"); code != 0 || p["mode"] == "" {
		t.Fatalf("plan --base: %d %v", code, p)
	}
	if _, err := os.Stat(filepath.Join(dir, "wiki/.kb/plan.json")); err == nil {
		t.Fatal("plan --dry-run wrote plan.json")
	}
}
