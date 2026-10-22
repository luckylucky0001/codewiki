package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"

	"github.com/luckylucky0001/codewiki/internal/testutil"
)

// mockResponses is a scripted stand-in for the OpenAI Responses API, so the
// REAL codex binary can run `kb compound --agent codex` without network
// access. Turn 1: the "model" asks codex's shell tool to write every page of
// the task's write set plus one file outside it; turn 2: it answers "done".
type mockResponses struct {
	mu       sync.Mutex
	requests int
	tools    []string
	prompts  []string
}

var (
	writeSetRe = regexp.MustCompile("(?m)^- `(pages/[^`]+\\.md)`$")
	claimIDRe  = regexp.MustCompile(`"id":\s*"([^"]+)"`)
)

func (m *mockResponses) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("content-type", "application/json")
		io.WriteString(w, `{"data":[],"models":[]}`)
		return
	}
	var req struct {
		Input []map[string]any `json:"input"`
		Tools []map[string]any `json:"tools"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	var text strings.Builder
	hasOutput := false
	for _, it := range req.Input {
		if t, _ := it["type"].(string); strings.HasSuffix(t, "_output") {
			hasOutput = true
		}
		if cs, ok := it["content"].([]any); ok {
			for _, c := range cs {
				if cm, ok := c.(map[string]any); ok {
					if s, ok := cm["text"].(string); ok {
						text.WriteString(s + "\n")
					}
				}
			}
		}
	}
	m.mu.Lock()
	m.requests++
	n := m.requests
	m.tools = nil
	for _, t := range req.Tools {
		name, _ := t["name"].(string)
		m.tools = append(m.tools, name)
	}
	m.prompts = append(m.prompts, text.String())
	tools := strings.Join(m.tools, ",")
	m.mu.Unlock()

	var item map[string]any
	if !hasOutput {
		var sb strings.Builder
		ws := text.String()
		if i := strings.Index(ws, "## 可写集合"); i >= 0 {
			ws = ws[i:]
			if j := strings.Index(ws, "## 规则"); j >= 0 {
				ws = ws[:j]
			}
		}
		for _, mm := range writeSetRe.FindAllStringSubmatch(ws, -1) {
			p := mm[1]
			id := strings.TrimSuffix(strings.TrimPrefix(p, "pages/"), ".md")
			fmt.Fprintf(&sb, "printf -- '---\\nid: %s\\ntitle: codex page\\nsources: []\\n---\\n# codex real page\\n\\n[总览](../overview.md)\\n' > '%s'; ", id, p)
		}
		if strings.Contains(ws, "`.kb/ingest/verdicts.json`") {
			// claim-check task: one verdict per claim id found in the prompt
			var cl []string
			for _, mm := range claimIDRe.FindAllStringSubmatch(text.String(), -1) {
				cl = append(cl, fmt.Sprintf(`{"id":%q,"status":"unverifiable","evidence":["codex mock"]}`, mm[1]))
			}
			fmt.Fprintf(&sb, "mkdir -p .kb/ingest && printf '%%s' '{\"version\":1,\"claims\":[%s]}' > .kb/ingest/verdicts.json; ", strings.Join(cl, ","))
		}
		sb.WriteString("echo outside > pages/evil-codex.md")
		args, _ := json.Marshal(map[string]any{"cmd": sb.String()})
		name := "exec_command"
		if !strings.Contains(tools, "exec_command") {
			name = "shell"
			args, _ = json.Marshal(map[string]any{"command": []string{"bash", "-lc", sb.String()}})
		}
		item = map[string]any{"type": "function_call", "id": "fc_1", "call_id": "call_1", "name": name, "arguments": string(args)}
	} else {
		item = map[string]any{"type": "message", "role": "assistant", "id": "msg_1", "content": []any{map[string]any{"type": "output_text", "text": "done"}}}
	}
	w.Header().Set("content-type", "text/event-stream")
	rid := fmt.Sprintf("resp_%d", n)
	for _, ev := range []map[string]any{
		{"type": "response.created", "response": map[string]any{"id": rid}},
		{"type": "response.output_item.done", "item": item},
		{"type": "response.completed", "response": map[string]any{"id": rid, "usage": map[string]any{
			"input_tokens": 1000, "input_tokens_details": map[string]any{"cached_tokens": 100},
			"output_tokens": 20, "output_tokens_details": map[string]any{"reasoning_tokens": 5}, "total_tokens": 1020}}},
	} {
		b, _ := json.Marshal(ev)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev["type"], b)
	}
}

// TestRealCodexBinaryWithMockModel runs the real Codex CLI (KB_CODEX_BIN or
// `codex` on PATH; skipped when absent) through `kb compound --agent codex`
// against a local mock of the Responses API: proves the adapter's command
// line is accepted by codex exec, that codex's workspace-write sandbox lets it
// write the staging wiki, that kb's write-set guard reverts the out-of-set
// write, and that usage is parsed from the real --json event stream.
func TestRealCodexBinaryWithMockModel(t *testing.T) {
	bin := os.Getenv("KB_CODEX_BIN")
	if bin == "" {
		bin, _ = exec.LookPath("codex")
	}
	if bin == "" {
		t.Skip("codex CLI not installed (set KB_CODEX_BIN)")
	}
	mock := &mockResponses{}
	srv := httptest.NewServer(mock)
	defer srv.Close()

	home := t.TempDir()
	cfg := fmt.Sprintf(`model = "mock-model"
model_provider = "mock"
[model_providers.mock]
name = "mock"
base_url = "%s/v1"
wire_api = "responses"
supports_websockets = false
request_max_retries = 0
stream_max_retries = 0
`, srv.URL)
	os.WriteFile(filepath.Join(home, "config.toml"), []byte(cfg), 0o644)
	shim := t.TempDir()
	os.WriteFile(filepath.Join(shim, "codex"), []byte("#!/bin/sh\nexec "+bin+" \"$@\"\n"), 0o755)
	t.Setenv("PATH", shim+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("CODEX_HOME", home)
	t.Setenv("NO_PROXY", "127.0.0.1,localhost")
	t.Setenv("no_proxy", "127.0.0.1,localhost")

	dir := repo(t)
	run(t, dir, "init")
	if code, _, e := run(t, dir, "compound"); code != 0 {
		t.Fatalf("bootstrap: %s", e)
	}
	testutil.Git(t, dir, "add", "-A")
	testutil.Git(t, dir, "commit", "-qm", "wiki")
	commitChange(t, dir, "01-cart-limit")
	code, v := runJSON(t, dir, "compound", "--agent", "codex", "--keep-work")
	if code != 0 {
		t.Fatalf("compound --agent codex: %d %v", code, v)
	}
	res := v["result"].(map[string]any)
	tasks := res["tasks"].([]any)
	if len(tasks) == 0 || mock.requests < 2*len(tasks) {
		t.Fatalf("tasks %d, model requests %d", len(tasks), mock.requests)
	}
	for _, tk := range tasks {
		m := tk.(map[string]any)
		rv, _ := m["reverted"].([]any)
		if m["status"] != "violation" || len(rv) != 1 || rv[0] != "pages/evil-codex.md" {
			t.Fatalf("task %v", m)
		}
		u, _ := m["usage"].(map[string]any)
		if u == nil || u["input_tokens"] == nil || u["turns"] != float64(1) {
			t.Fatalf("usage from real codex events: %v", m["usage"])
		}
	}
	pg, _ := os.ReadFile(filepath.Join(dir, "wiki/pages/features/cart.md"))
	if !strings.Contains(string(pg), "codex real page") {
		t.Fatalf("page written by codex not published:\n%s", pg)
	}
	if _, err := os.Stat(filepath.Join(dir, "wiki/pages/evil-codex.md")); err == nil {
		t.Fatal("out-of-set write survived")
	}
	if p := mock.prompts[0]; !strings.Contains(p, "codewiki 任务") || !strings.Contains(p, "## 安全规则") || !strings.Contains(p, "<untrusted-data kind=") {
		t.Fatalf("kb prompt (with untrusted-data wrapping) did not reach the model")
	}
	if code, _ := runJSON(t, dir, "verify"); code != 0 {
		t.Fatal("verify")
	}
	// claim checking (kb ingest) through the same adapter
	code, v = runJSON(t, dir, "ingest", filepath.Join(dir, "docs/legacy/cart.md"), "--agent", "codex")
	if code != 0 {
		t.Fatalf("ingest --agent codex: %d %v", code, v)
	}
	itasks := v["result"].(map[string]any)["tasks"].([]any)
	if len(itasks) == 0 {
		t.Fatal("ingest: no tasks")
	}
	for _, tk := range itasks {
		m := tk.(map[string]any)
		rv, _ := m["reverted"].([]any)
		if m["agent"] != "codex" || m["status"] != "violation" || len(rv) != 1 || rv[0] != "pages/evil-codex.md" {
			t.Fatalf("ingest task %v", m)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "wiki/pages/_conflicts.md")); err != nil {
		t.Fatal("ingest via codex did not publish _conflicts.md")
	}
	t.Logf("real codex: %d tasks, %d model requests, tools offered: %v", len(tasks), mock.requests, mock.tools)
}

// TestRealCodexConsumesInstall: after `kb install --agent codex --mcp`, the
// real Codex CLI puts the AGENTS.md block and the kb skills (.agents/skills)
// into the model input (`codex debug prompt-input`, no model call), and lists
// the codewiki MCP server from .codex/config.toml once the project is trusted.
func TestRealCodexConsumesInstall(t *testing.T) {
	bin := os.Getenv("KB_CODEX_BIN")
	if bin == "" {
		bin, _ = exec.LookPath("codex")
	}
	if bin == "" {
		t.Skip("codex CLI not installed (set KB_CODEX_BIN)")
	}
	dir := repo(t)
	run(t, dir, "init")
	run(t, dir, "compound")
	if code, v := runJSON(t, dir, "install", "--agent", "codex", "--mcp", "--target", dir); code != 0 {
		t.Fatal(v)
	}
	os.MkdirAll(filepath.Join(dir, "android", "app"), 0o755)
	home := t.TempDir()
	codex := func(cwd string, args ...string) string {
		cmd := exec.Command(bin, args...)
		cmd.Dir = cwd
		cmd.Env = append(os.Environ(), "CODEX_HOME="+home)
		out, err := cmd.Output()
		if err != nil {
			t.Fatalf("codex %v: %v", args, err)
		}
		return string(out)
	}
	// from a subdirectory: AGENTS.md and .agents/skills are found at the git root
	in := codex(filepath.Join(dir, "android", "app"), "debug", "prompt-input", "hi")
	if strings.Count(in, "Code-anchored wiki (codewiki)") != 1 || !strings.Contains(in, "Run: `kb routes`") {
		t.Fatal("AGENTS.md codewiki block not in codex model input")
	}
	for _, s := range []string{"kb-query:", "kb-lint:", "kb-compound:", "kb-ingest:"} {
		if !strings.Contains(in, s) {
			t.Fatalf("skill %s not listed for codex", s)
		}
	}
	if l := codex(dir, "mcp", "list"); strings.Contains(l, "codewiki") {
		t.Fatal("untrusted project config must not be loaded (codex behaviour changed?)")
	}
	os.WriteFile(filepath.Join(home, "config.toml"), []byte(fmt.Sprintf("[projects.%q]\ntrust_level = \"trusted\"\n", dir)), 0o644)
	if l := codex(dir, "mcp", "list"); !strings.Contains(l, "codewiki") || !strings.Contains(l, "--root "+dir) {
		t.Fatalf("codex mcp list (trusted):\n%s", l)
	}
}
