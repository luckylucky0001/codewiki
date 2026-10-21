package agents

import (
	"os"
	"strings"
	"testing"
)

func TestBackendCommands(t *testing.T) {
	cases := []struct {
		agent, model string
		want         []string // substrings, in order
	}{
		{"claude", "", []string{"claude -p", "--permission-mode acceptEdits", "--allowedTools 'Read,Write,Edit,Glob,Grep,Bash(kb anchor:*),Bash(kb get:*),Bash(kb search:*)'", "--output-format json"}},
		{"claude", "haiku", []string{"claude -p", "--output-format json", "--model haiku"}},
		{"codex", "", []string{"codex exec", "--sandbox workspace-write", `-c 'approval_policy="never"'`, "--skip-git-repo-check", "--json", " -"}},
		{"codex", "gpt-5-codex", []string{"codex exec", "--model gpt-5-codex", " -"}},
		{"gemini", "flash", []string{"gemini --skip-trust", "--approval-mode auto_edit", "--output-format json", "--model flash", "-p 'Complete the codewiki task"}},
	}
	for _, c := range cases {
		a, err := Get(c.agent)
		if err != nil {
			t.Fatal(err)
		}
		cmd, err := a.Command(BackendOpts{Model: c.model})
		if err != nil {
			t.Fatal(err)
		}
		pos := 0
		for _, w := range c.want {
			i := strings.Index(cmd[pos:], w)
			if i < 0 {
				t.Fatalf("%s: %q missing (in order) from %q", c.agent, w, cmd)
			}
			pos += i
		}
		if c.agent == "codex" && !strings.HasSuffix(cmd, " -") {
			t.Fatalf("codex must read the prompt from stdin (trailing -): %q", cmd)
		}
		if c.model == "" && strings.Contains(cmd, "--model") {
			t.Fatalf("%s: unexpected --model: %q", c.agent, cmd)
		}
	}
	for _, n := range []string{"cursor", "copilot", "generic", "trae-cn"} {
		a, _ := Get(n)
		if a.Backend() {
			t.Fatalf("%s should have no built-in backend", n)
		}
		if _, err := a.Command(BackendOpts{}); err == nil || !strings.Contains(err.Error(), "--llm-cmd") {
			t.Fatalf("%s: want a hint to --llm-cmd, got %v", n, err)
		}
	}
}

func TestParseList(t *testing.T) {
	all, err := ParseList("all")
	if err != nil || len(all) != 7 || all[0].Name != "claude" {
		t.Fatalf("all: %v %v", all, err)
	}
	two, _ := ParseList("codex, Claude,codex")
	if len(two) != 2 || two[0].Name != "codex" || two[1].Name != "claude" {
		t.Fatalf("dedupe/order: %v", two)
	}
	if _, err := ParseList("vim"); err == nil {
		t.Fatal("unknown agent accepted")
	}
	if _, err := ParseList(""); err == nil {
		t.Fatal("empty list accepted")
	}
}

func TestConsumerFiles(t *testing.T) {
	want := map[string][2]string{
		"claude":  {"CLAUDE.md", ".claude/skills"},
		"codex":   {"AGENTS.md", ".agents/skills"},
		"gemini":  {"GEMINI.md", ".agents/skills"},
		"cursor":  {".cursor/rules/codewiki.mdc", ""},
		"copilot": {".github/copilot-instructions.md", ""},
		"generic": {"AGENTS.md", ".agents/skills"},
	}
	for n, w := range want {
		a, _ := Get(n)
		if a.Instructions != w[0] || a.SkillsDir != w[1] {
			t.Fatalf("%s: %s %s", n, a.Instructions, a.SkillsDir)
		}
	}
}

func TestParseUsage(t *testing.T) {
	claude := []byte(`{"type":"result","subtype":"success","is_error":false,"num_turns":3,"result":"done","total_cost_usd":0.0123,"usage":{"input_tokens":10,"cache_creation_input_tokens":100,"cache_read_input_tokens":200,"output_tokens":50}}`)
	u := parseClaude(claude)
	if u.CostUSD != 0.0123 || u.InputTokens != 10 || u.OutputTokens != 50 || u.CachedTokens != 300 || u.Turns != 3 {
		t.Fatalf("claude: %+v", u)
	}
	codex := []byte(strings.Join([]string{
		`{"type":"thread.started","thread_id":"x"}`,
		`{"type":"item.completed","item":{"id":"i0","type":"agent_message","text":"ok"}}`,
		`warning: something on stderr`,
		`{"type":"turn.completed","usage":{"input_tokens":1200,"cached_input_tokens":800,"output_tokens":90}}`,
	}, "\n"))
	u = parseCodex(codex)
	if u.InputTokens != 1200 || u.CachedTokens != 800 || u.OutputTokens != 90 || u.CostUSD != 0 || u.Turns != 1 {
		t.Fatalf("codex: %+v", u)
	}
	gemini := []byte("{\n  \"response\": \"ok\",\n  \"stats\": {\"models\": {\"gemini-2.5-pro\": {\"tokens\": {\"prompt\": 500, \"candidates\": 40, \"cached\": 7}}}}\n}\n")
	u = parseGemini(gemini)
	if u.InputTokens != 500 || u.OutputTokens != 40 || u.CachedTokens != 7 {
		t.Fatalf("gemini: %+v", u)
	}
	if !parseCodex([]byte("plain text")).Empty() || !parseGemini([]byte("not json")).Empty() {
		t.Fatal("garbage must parse to empty usage")
	}
	var sum Usage
	sum.Add(&Usage{InputTokens: 1, CostUSD: 0.5})
	sum.Add(&Usage{InputTokens: 2, CostUSD: 0.25})
	if sum.InputTokens != 3 || sum.CostUSD != 0.75 || !strings.Contains(sum.String(), "$0.7500") {
		t.Fatalf("add: %+v %s", sum, sum.String())
	}
}

func TestShellQuote(t *testing.T) {
	for in, want := range map[string]string{"abc": "abc", "": "''", "a b": "'a b'", "it's": `'it'\''s'`, "Bash(kb get:*)": "'Bash(kb get:*)'"} {
		if got := ShellQuote(in); got != want {
			t.Fatalf("%q: %q want %q", in, got, want)
		}
	}
}

// A real `codex exec --json` stream (codex-cli 0.163.0, API unreachable):
// no turn.completed, so no usage, but the fatal error is surfaced.
func TestParseCodexRealStream(t *testing.T) {
	b, err := os.ReadFile("testdata/codex-0.163.0-exec-json-network-error.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	u := parseCodex(b)
	if !u.Empty() || !strings.Contains(u.Error, "Reconnecting") {
		t.Fatalf("%+v", u)
	}
	ok := append(b, []byte(`{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":2,"output_tokens":3,"reasoning_output_tokens":4}}`+"\n")...)
	u = parseCodex(ok)
	if u.InputTokens != 10 || u.ReasoningTokens != 4 || u.Turns != 1 || !strings.Contains(u.String(), "reasoning 4") {
		t.Fatalf("%+v", u)
	}
	f := parseCodex([]byte(`{"type":"turn.failed","error":{"message":"quota exceeded"}}`))
	if f.Error != "quota exceeded" {
		t.Fatalf("%+v", f)
	}
	c := parseClaude([]byte(`{"type":"result","subtype":"error_max_turns","is_error":true,"total_cost_usd":0.01}`))
	if c.Error != "error_max_turns" || c.CostUSD != 0.01 {
		t.Fatalf("%+v", c)
	}
}
