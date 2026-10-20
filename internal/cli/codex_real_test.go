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

var writeSetRe = regexp.MustCompile("(?m)^- `(pages/[^`]+\\.md)`$")

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
	t.Logf("real codex: %d tasks, %d model requests, tools offered: %v", len(tasks), mock.requests, mock.tools)
}
