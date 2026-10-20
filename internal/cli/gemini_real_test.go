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
	"strings"
	"sync"
	"testing"

	"github.com/luckylucky0001/codewiki/internal/testutil"
)

// mockGemini stands in for the Gemini API (generateContent for the CLI's
// model router, streamGenerateContent?alt=sse for the main turn). Turn 1: one
// write_file call per write-set page plus one outside the write set; turn 2
// (after the functionResponses): "done".
type mockGemini struct {
	mu      sync.Mutex
	paths   []string
	tools   []string
	prompts []string
}

func (m *mockGemini) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	var req struct {
		Contents []struct {
			Parts []map[string]any `json:"parts"`
		} `json:"contents"`
		Tools []struct {
			FunctionDeclarations []struct {
				Name string `json:"name"`
			} `json:"functionDeclarations"`
		} `json:"tools"`
	}
	_ = json.Unmarshal(body, &req)
	var text strings.Builder
	answered := false
	for _, c := range req.Contents {
		for _, p := range c.Parts {
			if s, ok := p["text"].(string); ok {
				text.WriteString(s + "\n")
			}
			if _, ok := p["functionResponse"]; ok {
				answered = true
			}
		}
	}
	m.mu.Lock()
	m.paths = append(m.paths, r.URL.Path)
	if len(req.Tools) > 0 {
		m.tools = nil
		for _, t := range req.Tools {
			for _, f := range t.FunctionDeclarations {
				m.tools = append(m.tools, f.Name)
			}
		}
	}
	m.prompts = append(m.prompts, text.String())
	m.mu.Unlock()
	usage := map[string]any{"promptTokenCount": 900, "candidatesTokenCount": 30, "totalTokenCount": 930, "thoughtsTokenCount": 4}
	if !strings.Contains(r.URL.Path, "streamGenerateContent") { // router / utility call
		w.Header().Set("content-type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"candidates": []any{map[string]any{"content": map[string]any{"role": "model", "parts": []any{map[string]any{"text": `{"reasoning":"simple","model_choice":"flash"}`}}}, "finishReason": "STOP"}}, "usageMetadata": usage})
		return
	}
	var parts []any
	if answered {
		parts = []any{map[string]any{"text": "done"}}
	} else {
		ws := text.String()
		if i := strings.Index(ws, "## 可写集合"); i >= 0 {
			ws = ws[i:]
			if j := strings.Index(ws, "## 规则"); j >= 0 {
				ws = ws[:j]
			}
		}
		for _, mm := range writeSetRe.FindAllStringSubmatch(ws, -1) {
			id := strings.TrimSuffix(strings.TrimPrefix(mm[1], "pages/"), ".md")
			content := fmt.Sprintf("---\nid: %s\ntitle: gemini page\nsources: []\n---\n# gemini real page\n\n[总览](../overview.md)\n", id)
			parts = append(parts, map[string]any{"functionCall": map[string]any{"name": "write_file", "args": map[string]any{"file_path": mm[1], "content": content}}})
		}
		parts = append(parts, map[string]any{"functionCall": map[string]any{"name": "write_file", "args": map[string]any{"file_path": "pages/evil-gemini.md", "content": "outside\n"}}})
	}
	ev, _ := json.Marshal(map[string]any{"candidates": []any{map[string]any{"content": map[string]any{"role": "model", "parts": parts}, "finishReason": "STOP"}}, "usageMetadata": usage})
	w.Header().Set("content-type", "text/event-stream")
	fmt.Fprintf(w, "data: %s\n\n", ev)
}

// TestRealGeminiBinaryWithMockModel: like the Codex test, with the real Gemini
// CLI (KB_GEMINI_BIN or `gemini` on PATH; skipped when absent) pointed at a
// local mock via GOOGLE_GEMINI_BASE_URL.
func TestRealGeminiBinaryWithMockModel(t *testing.T) {
	bin := os.Getenv("KB_GEMINI_BIN")
	if bin == "" {
		bin, _ = exec.LookPath("gemini")
	}
	if bin == "" {
		t.Skip("gemini CLI not installed (set KB_GEMINI_BIN)")
	}
	mock := &mockGemini{}
	srv := httptest.NewServer(mock)
	defer srv.Close()
	ghome := t.TempDir()
	os.MkdirAll(filepath.Join(ghome, ".gemini"), 0o755)
	os.WriteFile(filepath.Join(ghome, ".gemini", "settings.json"), []byte(`{"security":{"auth":{"selectedType":"gemini-api-key"}}}`), 0o644)
	shim := t.TempDir()
	os.WriteFile(filepath.Join(shim, "gemini"), []byte("#!/bin/sh\nexec "+bin+" \"$@\"\n"), 0o755)
	t.Setenv("PATH", shim+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("GEMINI_CLI_HOME", ghome)
	t.Setenv("GEMINI_API_KEY", "dummy")
	t.Setenv("GOOGLE_GEMINI_BASE_URL", srv.URL)
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
	code, v := runJSON(t, dir, "compound", "--agent", "gemini", "--keep-work")
	if code != 0 {
		t.Fatalf("compound --agent gemini: %d %v\nmock paths: %v", code, v, mock.paths)
	}
	tasks := v["result"].(map[string]any)["tasks"].([]any)
	if len(tasks) == 0 {
		t.Fatal("no tasks")
	}
	for _, tk := range tasks {
		m := tk.(map[string]any)
		rv, _ := m["reverted"].([]any)
		if m["status"] != "violation" || len(rv) != 1 || rv[0] != "pages/evil-gemini.md" {
			t.Fatalf("task %v", m)
		}
		if u, _ := m["usage"].(map[string]any); u == nil || u["input_tokens"] == nil || u["output_tokens"] == nil {
			t.Fatalf("usage from real gemini json: %v", m["usage"])
		}
	}
	pg, _ := os.ReadFile(filepath.Join(dir, "wiki/pages/features/cart.md"))
	if !strings.Contains(string(pg), "gemini real page") {
		t.Fatalf("page written by gemini not published:\n%s", pg)
	}
	if _, err := os.Stat(filepath.Join(dir, "wiki/pages/evil-gemini.md")); err == nil {
		t.Fatal("out-of-set write survived")
	}
	for _, tl := range mock.tools {
		if tl == "run_shell_command" {
			t.Fatal("auto_edit must not offer the shell tool headless")
		}
	}
	if code, _ := runJSON(t, dir, "verify"); code != 0 {
		t.Fatal("verify")
	}
	t.Logf("real gemini: %d tasks, requests %v, tools offered: %v", len(tasks), mock.paths, mock.tools)
}

// kbShim puts a `kb` on PATH that runs this test binary as kb.
func kbShim(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "kb"), []byte("#!/bin/sh\nKB_TEST_AS_KB=1 exec "+os.Args[0]+" \"$@\"\n"), 0o755)
	return dir
}

// TestRealGeminiConsumesInstall: after `kb install --agent gemini --mcp`, the
// real Gemini CLI sends the GEMINI.md block and the kb skills to the model and
// offers the codewiki MCP tools (served by kb mcp) even in headless -p mode.
func TestRealGeminiConsumesInstall(t *testing.T) {
	bin := os.Getenv("KB_GEMINI_BIN")
	if bin == "" {
		bin, _ = exec.LookPath("gemini")
	}
	if bin == "" {
		t.Skip("gemini CLI not installed (set KB_GEMINI_BIN)")
	}
	mock := &mockGemini{}
	srv := httptest.NewServer(mock)
	defer srv.Close()
	dir := repo(t)
	run(t, dir, "init")
	run(t, dir, "compound")
	if code, v := runJSON(t, dir, "install", "--agent", "gemini", "--mcp", "--target", dir); code != 0 {
		t.Fatal(v)
	}
	ghome := t.TempDir()
	os.MkdirAll(filepath.Join(ghome, ".gemini"), 0o755)
	os.WriteFile(filepath.Join(ghome, ".gemini", "settings.json"), []byte(`{"security":{"auth":{"selectedType":"gemini-api-key"}}}`), 0o644)
	tf, _ := json.Marshal(map[string]string{dir: "TRUST_FOLDER"})
	os.WriteFile(filepath.Join(ghome, ".gemini", "trustedFolders.json"), tf, 0o644)
	cmd := exec.Command(bin, "-p", "Which routes does the app have?", "-o", "json")
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "PATH="+kbShim(t)+string(os.PathListSeparator)+os.Getenv("PATH"), "GEMINI_CLI_HOME="+ghome,
		"GEMINI_API_KEY=dummy", "GOOGLE_GEMINI_BASE_URL="+srv.URL, "NO_PROXY=127.0.0.1,localhost", "no_proxy=127.0.0.1,localhost")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("gemini -p: %v\n%s", err, out)
	}
	all := strings.Join(mock.prompts, "\n")
	if !strings.Contains(all, "Code-anchored wiki (codewiki)") || !strings.Contains(all, "Run: `kb routes`") {
		t.Fatal("GEMINI.md codewiki block not sent to the model")
	}
	for _, s := range []string{"kb-query", "kb-lint"} {
		if !strings.Contains(all, s) {
			t.Fatalf("skill %s not visible to the model", s)
		}
	}
	tools := strings.Join(mock.tools, ",")
	for _, tl := range []string{"mcp_codewiki_kb_search", "mcp_codewiki_kb_context", "mcp_codewiki_kb_conflicts"} {
		if !strings.Contains(tools, tl) {
			t.Fatalf("MCP tool %s not offered: %s", tl, tools)
		}
	}
}
