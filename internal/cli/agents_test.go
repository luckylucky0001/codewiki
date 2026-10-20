package cli

import (
	"bufio"
	"encoding/json"
	"flag"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/luckylucky0001/codewiki/internal/config"
	"github.com/luckylucky0001/codewiki/internal/testutil"
)

// TestMain lets the test binary act as the kb binary (KB_TEST_AS_KB=1), so
// subprocess tests (MCP client handshake) exercise the real stdio path.
func TestMain(m *testing.M) {
	if os.Getenv("KB_TEST_AS_KB") == "1" {
		os.Exit(Run(os.Args[1:], os.Stdout, os.Stderr))
	}
	os.Exit(m.Run())
}

func TestResolveBackend(t *testing.T) {
	custom := config.Default()
	custom.LLM.Cmd = "my-llm --flag"
	withAgent := config.Default()
	withAgent.LLM.Agent, withAgent.LLM.Model = "codex", "o4-mini"
	cases := []struct {
		args      []string
		cfg       *config.Config
		mode      string
		cmdPrefix string
		agent     string
		usageErr  bool
	}{
		{nil, nil, "template", "", "", false},
		{[]string{"--llm", "template"}, withAgent, "template", "", "", false},
		{[]string{"--agent", "codex"}, nil, "cmd", "codex exec --sandbox workspace-write", "codex", false},
		{[]string{"--llm", "gemini"}, nil, "cmd", "gemini --skip-trust --approval-mode auto_edit", "gemini", false},
		{[]string{"--llm", "claude"}, nil, "cmd", "claude -p --permission-mode acceptEdits", "claude", false},
		{[]string{"--llm", "claude"}, custom, "cmd", "my-llm --flag", "", false}, // legacy: customised llm.cmd wins
		{[]string{"--llm", "cmd"}, custom, "cmd", "my-llm --flag", "", false},
		{[]string{"--llm", "cmd"}, withAgent, "cmd", "codex exec", "codex", false},
		{[]string{"--agent", "claude", "--model", "haiku"}, withAgent, "cmd", "claude -p", "claude", false},
		{[]string{"--agent", "codex", "--llm-cmd", "fake-codex"}, nil, "cmd", "fake-codex", "codex", false},
		{[]string{"--agent", "generic"}, custom, "cmd", "my-llm --flag", "generic", false},
		{[]string{"--agent", "cursor"}, nil, "", "", "", true},
		{[]string{"--agent", "nope"}, nil, "", "", "", true},
		{[]string{"--agent", "codex", "--llm", "template"}, nil, "", "", "", true},
		{[]string{"--llm", "bogus"}, nil, "", "", "", true},
	}
	for _, c := range cases {
		fs := flag.NewFlagSet("t", flag.ContinueOnError)
		backendFlags(fs, "x")
		if err := fs.Parse(c.args); err != nil {
			t.Fatal(err)
		}
		b, err := resolveBackend(fs, c.cfg)
		if c.usageErr {
			if err == nil {
				t.Fatalf("%v: want error, got %+v", c.args, b)
			}
			continue
		}
		if err != nil {
			t.Fatalf("%v: %v", c.args, err)
		}
		if b.mode != c.mode || !strings.HasPrefix(b.cmd, c.cmdPrefix) || b.agent != c.agent {
			t.Fatalf("%v: got %+v", c.args, b)
		}
	}
	// model: flag beats llm.model
	fs := flag.NewFlagSet("t", flag.ContinueOnError)
	backendFlags(fs, "x")
	_ = fs.Parse([]string{"--llm", "cmd"})
	if b, _ := resolveBackend(fs, withAgent); !strings.Contains(b.cmd, "--model o4-mini") {
		t.Fatalf("llm.model not applied: %s", b.cmd)
	}
	fs = flag.NewFlagSet("t", flag.ContinueOnError)
	backendFlags(fs, "x")
	_ = fs.Parse([]string{"--llm", "cmd", "--model", "gpt-5"})
	if b, _ := resolveBackend(fs, withAgent); !strings.Contains(b.cmd, "--model gpt-5") || strings.Contains(b.cmd, "o4-mini") {
		t.Fatalf("--model must override llm.model: %s", b.cmd)
	}
}

// fakeAgent writes an executable that mimics a headless agent CLI: it reads
// the prompt on stdin, writes every page of the task's write set, and ALSO
// writes one file outside it (which kb must revert). It records its argv and
// prints usage the way the real CLI does.
func fakeAgent(t *testing.T, bin, name, usageOut string) {
	t.Helper()
	script := `#!/bin/sh
printf '%s\n' "$@" > "$FAKE_ARGS_DIR/` + name + `.args"
prompt=$(cat)
ws=$(printf '%s\n' "$prompt" | sed -n '/^## 可写集合/,/^## 规则/p' | sed -n 's/^- ` + "`" + `\(.*\)` + "`" + `$/\1/p')
for p in $ws; do
  case "$p" in
    pages/*.md) id=${p#pages/}; id=${id%.md}
      printf -- '---\nid: %s\ntitle: fake\nsources: []\n---\n# ` + name + ` fake page\n\n[总览](../overview.md)\n' "$id" > "$p" ;;
  esac
done
echo outside > pages/evil-` + name + `.md
cat <<'EOF'
` + usageOut + `
EOF
`
	if err := os.WriteFile(filepath.Join(bin, name), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
}

func TestFakeAgentBackends(t *testing.T) {
	for _, tc := range []struct {
		name, usage string
		viaConfig   bool
		wantArgs    []string
		wantIn      float64
	}{
		{"codex", `{"type":"thread.started","thread_id":"t1"}
{"type":"turn.completed","usage":{"input_tokens":1234,"cached_input_tokens":1000,"output_tokens":56}}`, false,
			[]string{"exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "--json", "-"}, 1234},
		{"gemini", `{"response":"done","stats":{"models":{"gemini-2.5-flash":{"tokens":{"prompt":777,"candidates":11}}}}}`, true,
			[]string{"--skip-trust", "--approval-mode", "auto_edit", "--output-format", "json", "-p"}, 777},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := repo(t)
			run(t, dir, "init")
			if code, _, e := run(t, dir, "compound"); code != 0 {
				t.Fatalf("bootstrap: %s", e)
			}
			testutil.Git(t, dir, "add", "-A")
			testutil.Git(t, dir, "commit", "-qm", "wiki")
			commitChange(t, dir, "01-cart-limit")
			bin := t.TempDir()
			fakeAgent(t, bin, tc.name, tc.usage)
			t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
			t.Setenv("FAKE_ARGS_DIR", bin)
			args := []string{"compound", "--agent", tc.name}
			if tc.viaConfig {
				cfg, err := config.Load(dir)
				if err != nil {
					t.Fatal(err)
				}
				cfg.LLM.Agent = tc.name
				b, _ := cfg.Render()
				os.WriteFile(filepath.Join(dir, "codewiki.yaml"), b, 0o644)
				args = []string{"compound", "--llm", "cmd"}
			}
			code, v := runJSON(t, dir, args...)
			if code != 0 {
				t.Fatalf("compound via fake %s: %d %v", tc.name, code, v)
			}
			res := v["result"].(map[string]any)
			if res["agent"] != tc.name {
				t.Fatalf("result agent = %v", res["agent"])
			}
			tasks := res["tasks"].([]any)
			if len(tasks) == 0 {
				t.Fatal("no tasks")
			}
			for _, tk := range tasks {
				m := tk.(map[string]any)
				rv, _ := m["reverted"].([]any)
				if m["status"] != "violation" || len(rv) != 1 || rv[0] != "pages/evil-"+tc.name+".md" || m["agent"] != tc.name {
					t.Fatalf("want exactly the outside write reverted, got %v", m)
				}
				if u, _ := m["usage"].(map[string]any); u == nil || u["input_tokens"] != tc.wantIn {
					t.Fatalf("usage not parsed: %v", m["usage"])
				}
			}
			if _, err := os.Stat(filepath.Join(dir, "wiki/pages/evil-"+tc.name+".md")); err == nil {
				t.Fatal("write outside the write set survived")
			}
			pg, _ := os.ReadFile(filepath.Join(dir, "wiki/pages/features/cart.md"))
			if !strings.Contains(string(pg), tc.name+" fake page") || !strings.Contains(string(pg), "sym: ") {
				t.Fatalf("page from the in-set write not published/post-processed:\n%s", pg)
			}
			argv, _ := os.ReadFile(filepath.Join(bin, tc.name+".args"))
			lines := strings.Split(strings.TrimSpace(string(argv)), "\n")
			for _, w := range tc.wantArgs {
				found := false
				for _, l := range lines {
					found = found || l == w
				}
				if !found {
					t.Fatalf("%s argv lacks %q: %q", tc.name, w, lines)
				}
			}
			if code, _ := runJSON(t, dir, "verify"); code != 0 {
				t.Fatal("verify after fake agent")
			}
			// the prompt is agent-neutral: no Claude tool names
			prompts, _ := filepath.Glob(filepath.Join(dir, ".kb-work", "*", "tasks", "*.prompt.md"))
			for _, p := range prompts {
				b, _ := os.ReadFile(p)
				if strings.Contains(string(b), "Write 工具") || strings.Contains(string(b), "skill: kb-compound") {
					t.Fatalf("prompt names Claude tools: %s", p)
				}
			}
		})
	}
}

func readTree(t *testing.T, root string) map[string]string {
	t.Helper()
	out := map[string]string{}
	filepath.Walk(root, func(p string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			b, _ := os.ReadFile(p)
			r, _ := filepath.Rel(root, p)
			out[filepath.ToSlash(r)] = string(b)
		}
		return nil
	})
	return out
}

func TestInstallAllAgentsIdempotent(t *testing.T) {
	dir := t.TempDir()
	user := map[string]string{
		"CLAUDE.md":                       "# Claude rules\n\nBe terse.\n",
		"AGENTS.md":                       "# Team rules\n\nUse tabs.\n",
		"GEMINI.md":                       "# Gemini notes\n",
		".github/copilot-instructions.md": "Prefer small PRs.\n",
		".mcp.json":                       `{"mcpServers":{"other":{"command":"x","args":["1"]}},"extra":12345678901234567890}`,
		".gemini/settings.json":           `{"theme":"Dracula","mcpServers":{}}`,
		".codex/config.toml":              "model = \"o3\"\n\n[mcp_servers.other]\ncommand = \"x\"\n",
	}
	for p, c := range user {
		os.MkdirAll(filepath.Dir(filepath.Join(dir, p)), 0o755)
		os.WriteFile(filepath.Join(dir, p), []byte(c), 0o644)
	}
	code, v := runJSON(t, dir, "install", "--agent", "all", "--mcp", "--target", dir)
	if code != 0 {
		t.Fatal(v)
	}
	first := readTree(t, dir)
	// user content outside markers preserved
	for p, c := range user {
		if strings.HasSuffix(p, ".md") && !strings.HasPrefix(first[p], c) {
			t.Fatalf("%s: user content not preserved:\n%s", p, first[p])
		}
	}
	for _, p := range []string{"CLAUDE.md", "AGENTS.md", "GEMINI.md", ".github/copilot-instructions.md", ".cursor/rules/codewiki.mdc"} {
		s := first[p]
		if strings.Count(s, "<!-- codewiki:begin") != 1 || strings.Count(s, "<!-- codewiki:end -->") != 1 || !strings.Contains(s, "kb routes --dangling") || !strings.Contains(s, "kb context <file>") {
			t.Fatalf("%s: block missing or duplicated:\n%s", p, s)
		}
	}
	if !strings.Contains(first["CLAUDE.md"], "Bash: `kb routes`") || strings.Contains(first["AGENTS.md"], "Bash tool") || !strings.Contains(first["AGENTS.md"], "Run: `kb routes`") {
		t.Fatal("tool wording not adapted per agent")
	}
	if !strings.HasPrefix(first[".cursor/rules/codewiki.mdc"], "---\ndescription:") || !strings.Contains(first[".cursor/rules/codewiki.mdc"], "alwaysApply: true") {
		t.Fatalf("cursor rule frontmatter:\n%s", first[".cursor/rules/codewiki.mdc"])
	}
	for _, s := range []string{".claude/skills/kb-query/SKILL.md", ".agents/skills/kb-query/SKILL.md", ".agents/skills/kb-compound/SKILL.md"} {
		if !strings.Contains(first[s], "name: ") {
			t.Fatalf("skill %s not installed", s)
		}
	}
	// JSON merge: our key added, user keys kept (big number not mangled)
	var mcp map[string]any
	if err := json.Unmarshal([]byte(first[".mcp.json"]), &mcp); err != nil {
		t.Fatal(err)
	}
	servers := mcp["mcpServers"].(map[string]any)
	if servers["other"] == nil || servers["codewiki"].(map[string]any)["command"] != "kb" || !strings.Contains(first[".mcp.json"], "12345678901234567890") {
		t.Fatalf(".mcp.json merge:\n%s", first[".mcp.json"])
	}
	args := servers["codewiki"].(map[string]any)["args"].([]any)
	if len(args) != 3 || args[0] != "mcp" || args[1] != "--root" || args[2] != dir {
		t.Fatalf("mcp args %v", args)
	}
	if !strings.Contains(first[".gemini/settings.json"], `"trust": true`) || strings.Contains(first[".mcp.json"], `"trust"`) {
		t.Fatal("gemini server entry must be trusted (read-only tools), others unchanged")
	}
	if !strings.Contains(first[".gemini/settings.json"], `"theme": "Dracula"`) || !strings.Contains(first[".gemini/settings.json"], `"codewiki"`) || !strings.Contains(first[".cursor/mcp.json"], `"codewiki"`) {
		t.Fatal("gemini/cursor mcp json")
	}
	// TOML: user content intact, one marked table appended
	toml := first[".codex/config.toml"]
	if !strings.HasPrefix(toml, user[".codex/config.toml"]) || strings.Count(toml, "[mcp_servers.codewiki]") != 1 || !strings.Contains(toml, `args = ["mcp", "--root", "`+dir+`"]`) {
		t.Fatalf("codex toml:\n%s", toml)
	}
	// rerun: byte-identical, every action unchanged
	_, v2 := runJSON(t, dir, "install", "--agent", "all", "--mcp", "--target", dir)
	for _, a := range v2["actions"].([]any) {
		if m := a.(map[string]any); m["action"] != "unchanged" {
			t.Fatalf("rerun changed %v", m)
		}
	}
	second := readTree(t, dir)
	if len(second) != len(first) {
		t.Fatalf("rerun created files: %d vs %d", len(second), len(first))
	}
	for p, c := range first {
		if second[p] != c {
			t.Fatalf("%s changed on rerun", p)
		}
	}
	// user edits around the blocks survive a block refresh
	os.WriteFile(filepath.Join(dir, "GEMINI.md"), []byte(strings.Replace(first["GEMINI.md"], "kb parity", "kb parity-old", 1)+"\n## Later\n"), 0o644)
	runJSON(t, dir, "install", "--agent", "gemini", "--target", dir)
	g, _ := os.ReadFile(filepath.Join(dir, "GEMINI.md"))
	if strings.Contains(string(g), "parity-old") || !strings.Contains(string(g), "## Later") || !strings.HasPrefix(string(g), user["GEMINI.md"]) {
		t.Fatalf("GEMINI.md refresh:\n%s", g)
	}
	// copilot has no project MCP file: a note instead
	notes, _ := v["notes"].([]any)
	joined, _ := json.Marshal(notes)
	if !strings.Contains(string(joined), "copilot") || !strings.Contains(string(joined), "trusted") {
		t.Fatalf("notes: %s", joined)
	}
}

func TestInstallDryRunAndUnsafeConfigs(t *testing.T) {
	dir := t.TempDir()
	code, v := runJSON(t, dir, "install", "--agent", "claude,codex", "--mcp", "--dry-run", "--target", dir)
	if code != 0 || len(v["actions"].([]any)) == 0 {
		t.Fatal(v)
	}
	if len(readTree(t, dir)) != 0 {
		t.Fatal("--dry-run wrote files")
	}
	// JSON with comments (JSONC) is never rewritten; hand-written TOML table wins
	jsonc := "{\n  // my servers\n  \"mcpServers\": {}\n}\n"
	os.MkdirAll(filepath.Join(dir, ".gemini"), 0o755)
	os.WriteFile(filepath.Join(dir, ".gemini/settings.json"), []byte(jsonc), 0o644)
	hand := "[mcp_servers.codewiki]\ncommand = \"/opt/kb\"\nargs = [\"mcp\"]\n"
	os.MkdirAll(filepath.Join(dir, ".codex"), 0o755)
	os.WriteFile(filepath.Join(dir, ".codex/config.toml"), []byte(hand), 0o644)
	code, v = runJSON(t, dir, "install", "--agent", "gemini,codex", "--mcp", "--no-skills", "--target", dir)
	if code != 0 {
		t.Fatal(v)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, ".gemini/settings.json")); string(b) != jsonc {
		t.Fatal("JSONC settings were rewritten")
	}
	if b, _ := os.ReadFile(filepath.Join(dir, ".codex/config.toml")); string(b) != hand {
		t.Fatal("hand-written codex table was changed")
	}
	skipped := 0
	for _, a := range v["actions"].([]any) {
		m := a.(map[string]any)
		if m["kind"] == "mcp" && m["action"] == "skipped" {
			skipped++
		}
		if m["kind"] == "skill" {
			t.Fatal("--no-skills installed skills")
		}
	}
	if skipped != 2 {
		t.Fatalf("want 2 skipped MCP configs: %v", v["actions"])
	}
	// usage errors
	if code, _ := runJSON(t, dir, "install", "--agent", "emacs", "--target", dir); code != ExitUsage {
		t.Fatal("unknown agent must be a usage error")
	}
	if code, _ := runJSON(t, dir, "install", "--target", dir); code != ExitUsage {
		t.Fatal("missing --agent must be a usage error")
	}
}

// TestMCPStdioClient drives `kb mcp` as a separate process the way Codex,
// Gemini CLI and Cursor do: newline-delimited JSON-RPC over stdio, one
// request at a time, waiting for each response.
func TestMCPStdioClient(t *testing.T) {
	dir := repo(t)
	run(t, dir, "init")
	run(t, dir, "compound")
	cmd := exec.Command(os.Args[0], "mcp", "--root", dir)
	cmd.Env = append(os.Environ(), "KB_TEST_AS_KB=1")
	stdin, _ := cmd.StdinPipe()
	stdout, _ := cmd.StdoutPipe()
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { stdin.Close(); cmd.Wait() }()
	rd := bufio.NewReader(stdout)
	call := func(req string) map[string]any {
		t.Helper()
		if _, err := io.WriteString(stdin, req+"\n"); err != nil {
			t.Fatal(err)
		}
		done := make(chan string, 1)
		go func() { l, _ := rd.ReadString('\n'); done <- l }()
		select {
		case l := <-done:
			var m map[string]any
			if err := json.Unmarshal([]byte(l), &m); err != nil {
				t.Fatalf("bad response %q: %v", l, err)
			}
			return m
		case <-time.After(60 * time.Second):
			t.Fatal("timeout waiting for MCP response")
		}
		return nil
	}
	init := call(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"codex-like","version":"0"}}}`)
	r := init["result"].(map[string]any)
	if r["protocolVersion"] != "2025-06-18" || r["serverInfo"].(map[string]any)["name"] != "codewiki" || r["capabilities"].(map[string]any)["tools"] == nil {
		t.Fatalf("initialize: %v", init)
	}
	io.WriteString(stdin, `{"jsonrpc":"2.0","method":"notifications/initialized"}`+"\n") // no response expected
	list := call(`{"jsonrpc":"2.0","id":2,"method":"tools/list"}`)
	names := map[string]bool{}
	for _, tl := range list["result"].(map[string]any)["tools"].([]any) {
		m := tl.(map[string]any)
		if m["inputSchema"].(map[string]any)["type"] != "object" {
			t.Fatalf("tool %v: inputSchema must be an object schema", m["name"])
		}
		names[m["name"].(string)] = true
	}
	for _, n := range []string{"kb_search", "kb_get", "kb_context", "kb_conflicts"} {
		if !names[n] {
			t.Fatalf("tools/list lacks %s: %v", n, names)
		}
	}
	res := call(`{"jsonrpc":"2.0","id":"s-3","method":"tools/call","params":{"name":"kb_search","arguments":{"query":"cart","limit":3}}}`)
	if res["id"] != "s-3" {
		t.Fatalf("string ids must round-trip: %v", res["id"])
	}
	content := res["result"].(map[string]any)["content"].([]any)[0].(map[string]any)
	if content["type"] != "text" || !strings.Contains(content["text"].(string), "features/cart") {
		t.Fatalf("kb_search: %v", content)
	}
}

// Codex reads AGENTS.override.md instead of AGENTS.md and drops project docs
// beyond 32 KiB (both verified with codex-cli 0.163.0 debug prompt-input):
// kb install must say so instead of silently installing an invisible block.
func TestInstallCodexAgentsMDWarnings(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "AGENTS.override.md"), []byte("# local override\n"), 0o644)
	os.WriteFile(filepath.Join(dir, "AGENTS.md"), []byte("# big\n\n"+strings.Repeat("lorem ipsum\n", 3000)), 0o644)
	_, v := runJSON(t, dir, "install", "--agent", "codex", "--target", dir)
	notes, _ := json.Marshal(v["notes"])
	if !strings.Contains(string(notes), "AGENTS.override.md exists") || !strings.Contains(string(notes), "project_doc_max_bytes") {
		t.Fatalf("missing codex warnings: %s", notes)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "AGENTS.override.md")); string(b) != "# local override\n" {
		t.Fatal("override file must not be modified")
	}
	d2 := t.TempDir()
	_, v = runJSON(t, d2, "install", "--agent", "codex", "--target", d2)
	if n, _ := v["notes"].([]any); len(n) != 0 {
		t.Fatalf("unexpected notes on a clean repo: %v", n)
	}
}
