// Package agents is the registry of coding agents codewiki works with, in two
// roles:
//
//   - backend: the agent kb runs non-interactively to write wiki pages /
//     check claims during `kb compound`, `kb ingest`, `kb eval`
//     (prompt on stdin, cwd = staging wiki; kb enforces the write set itself,
//     whatever sandbox the agent has);
//   - consumer: the agent a developer uses in the repo, which reads the wiki
//     through an instructions file, skills and the `kb mcp` server.
//
// Verification levels are recorded per adapter (real-run / cli-verified /
// docs-only) so docs and `kb install` can say how much to trust each entry.
package agents

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// Verification levels.
const (
	RealRun     = "real-run"               // executed end-to-end in this repo's validation
	MockModel   = "real-binary/mock-model" // the real CLI ran end-to-end against a local mock of the model API
	CLIVerified = "cli-verified"           // flags / discovery checked against the real CLI (--help, debug output), not run against a model
	DocsOnly    = "docs-only"              // from vendor documentation only
)

// BackendOpts parameterize the backend command line.
type BackendOpts struct {
	Model string // optional model id / alias
}

// Usage is what an agent reported about one run (zero values = not reported).
type Usage struct {
	InputTokens     int     `json:"input_tokens,omitempty"`
	OutputTokens    int     `json:"output_tokens,omitempty"`
	CachedTokens    int     `json:"cached_tokens,omitempty"`
	ReasoningTokens int     `json:"reasoning_tokens,omitempty"`
	CostUSD         float64 `json:"cost_usd,omitempty"`
	Turns           int     `json:"turns,omitempty"`
	// Error is the agent's own last fatal error (codex turn.failed / error
	// events, claude is_error results), surfaced in the task error.
	Error string `json:"error,omitempty"`
}

// Empty reports whether nothing was parsed.
func (u *Usage) Empty() bool {
	return u == nil || (u.InputTokens == 0 && u.OutputTokens == 0 && u.CachedTokens == 0 && u.ReasoningTokens == 0 && u.CostUSD == 0 && u.Turns == 0)
}

// Add accumulates v into u.
func (u *Usage) Add(v *Usage) {
	if v == nil {
		return
	}
	u.InputTokens += v.InputTokens
	u.OutputTokens += v.OutputTokens
	u.CachedTokens += v.CachedTokens
	u.ReasoningTokens += v.ReasoningTokens
	u.CostUSD += v.CostUSD
	u.Turns += v.Turns
}

// String is a short human summary ("in 1200 / out 300 tok, $0.0123").
func (u *Usage) String() string {
	if u.Empty() {
		return ""
	}
	s := fmt.Sprintf("(in %d / out %d tok", u.InputTokens, u.OutputTokens)
	if u.CachedTokens > 0 {
		s += fmt.Sprintf(", cached %d", u.CachedTokens)
	}
	if u.ReasoningTokens > 0 {
		s += fmt.Sprintf(", reasoning %d", u.ReasoningTokens)
	}
	if u.CostUSD > 0 {
		s += fmt.Sprintf(", $%.4f", u.CostUSD)
	}
	return s + ")"
}

// MCPTarget says where the project-level MCP registration goes.
type MCPTarget struct {
	Path   string // relative to the target repo
	Format string // "json-mcpServers" | "toml-mcp_servers"
	Note   string // printed after install (e.g. trust requirement, user-level alternative)
}

// Adapter describes one agent.
type Adapter struct {
	Name    string
	Display string

	// Backend role. Argv is nil when the agent has no supported headless mode.
	Argv         func(o BackendOpts) []string
	ParseUsage   func(out []byte) *Usage
	BackendLevel string

	// Consumer role.
	Instructions string     // instructions file (relative), "" = none
	SkillsDir    string     // skills directory (relative), "" = none
	MCP          *MCPTarget // nil = print instructions only
	MCPHint      string     // how to register the server by hand
	Tools        ToolWords  // how to name tools in the pointer block
	ConsumerLvl  string
	Notes        string
}

// ToolWords adapts the action table to the agent's tool vocabulary.
type ToolWords struct {
	Run, Read, Grep string // table prefixes ("Bash:", "Read", "Grep")
	Intro           string // one line on how to run kb / open files
}

// Backend reports whether the adapter can be used with --agent.
func (a *Adapter) Backend() bool { return a.Argv != nil }

// Command returns the shell command line (prompt on stdin) for the backend.
func (a *Adapter) Command(o BackendOpts) (string, error) {
	if a.Argv == nil {
		return "", fmt.Errorf("agent %q has no supported non-interactive backend mode; use --llm-cmd '<your command>' (prompt on stdin, cwd = staging wiki)", a.Name)
	}
	argv := a.Argv(o)
	q := make([]string, len(argv))
	for i, s := range argv {
		q[i] = ShellQuote(s)
	}
	return strings.Join(q, " "), nil
}

// ShellQuote quotes s for sh when needed.
func ShellQuote(s string) string {
	if s == "" {
		return "''"
	}
	safe := true
	for _, r := range s {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || strings.ContainsRune("-_./=:,@+%", r)) {
			safe = false
			break
		}
	}
	if safe {
		return s
	}
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// ClaudeAllowedTools is the tool allow-list for the Claude backend: file tools
// plus the read-only kb helpers.
const ClaudeAllowedTools = "Read,Write,Edit,Glob,Grep,Bash(kb anchor:*),Bash(kb get:*),Bash(kb search:*)"

var neutralTools = ToolWords{Run: "Run:", Read: "Read", Grep: "Search",
	Intro: "Run `kb ...` commands in a shell (or call the `codewiki` MCP tools `kb_*` when configured); read and search files with your normal file tools."}

var registry = map[string]*Adapter{
	"claude": {
		Name: "claude", Display: "Claude Code",
		Argv: func(o BackendOpts) []string {
			a := []string{"claude", "-p", "--permission-mode", "acceptEdits", "--allowedTools", ClaudeAllowedTools, "--output-format", "json"}
			if o.Model != "" {
				a = append(a, "--model", o.Model)
			}
			return a
		},
		ParseUsage:   parseClaude,
		BackendLevel: RealRun,
		Instructions: "CLAUDE.md", SkillsDir: ".claude/skills",
		MCP:     &MCPTarget{Path: ".mcp.json", Format: "json-mcpServers", Note: "project-scoped; Claude Code asks once before using servers from .mcp.json"},
		MCPHint: "claude mcp add codewiki -- kb mcp --root <repo>",
		Tools: ToolWords{Run: "Bash:", Read: "Read", Grep: "Grep",
			Intro: "Use the Bash tool only for `kb ...` commands; open files with the Read tool, search with the Grep tool."},
		ConsumerLvl: RealRun,
	},
	"codex": {
		Name: "codex", Display: "OpenAI Codex CLI",
		// codex exec: prompt from stdin ("-"); workspace-write sandbox keeps the
		// agent's writes inside cwd (= staging); approvals never block a
		// headless run; --json prints JSONL events (usage in turn.completed).
		Argv: func(o BackendOpts) []string {
			a := []string{"codex", "exec", "--sandbox", "workspace-write", "-c", "approval_policy=\"never\"", "--skip-git-repo-check", "--ephemeral", "--color", "never", "--json"}
			if o.Model != "" {
				a = append(a, "--model", o.Model)
			}
			return append(a, "-")
		},
		ParseUsage:   parseCodex,
		BackendLevel: MockModel,
		Instructions: "AGENTS.md", SkillsDir: ".agents/skills",
		MCP:         &MCPTarget{Path: ".codex/config.toml", Format: "toml-mcp_servers", Note: "Codex loads project .codex/config.toml only for trusted projects; or register globally: codex mcp add codewiki -- kb mcp --root <repo>"},
		MCPHint:     "codex mcp add codewiki -- kb mcp --root <repo>   (writes [mcp_servers.codewiki] to ~/.codex/config.toml)",
		Tools:       neutralTools,
		ConsumerLvl: CLIVerified,
	},
	"gemini": {
		Name: "gemini", Display: "Gemini CLI",
		// gemini: stdin is the prompt, -p text is appended to it and forces
		// headless mode; auto_edit approves file edits only (no shell tool is
		// offered headless); --skip-trust trusts the staging dir for this run
		// only (an untrusted folder would downgrade the approval mode).
		Argv: func(o BackendOpts) []string {
			a := []string{"gemini", "--skip-trust", "--approval-mode", "auto_edit", "--output-format", "json"}
			if o.Model != "" {
				a = append(a, "--model", o.Model)
			}
			return append(a, "-p", "Complete the codewiki task described above. Do not ask questions.")
		},
		ParseUsage:   parseGemini,
		BackendLevel: MockModel,
		Instructions: "GEMINI.md", SkillsDir: ".agents/skills",
		MCP:         &MCPTarget{Path: ".gemini/settings.json", Format: "json-mcpServers"},
		MCPHint:     "gemini mcp add codewiki kb mcp --root <repo>",
		Tools:       neutralTools,
		ConsumerLvl: DocsOnly,
	},
	"cursor": {
		Name: "cursor", Display: "Cursor",
		Instructions: ".cursor/rules/codewiki.mdc",
		MCP:          &MCPTarget{Path: ".cursor/mcp.json", Format: "json-mcpServers"},
		MCPHint:      "add {\"mcpServers\":{\"codewiki\":{\"command\":\"kb\",\"args\":[\"mcp\",\"--root\",\"<repo>\"]}}} to .cursor/mcp.json",
		Tools:        neutralTools,
		ConsumerLvl:  DocsOnly,
		Notes:        "backend: no adapter (use --llm-cmd with your Cursor CLI command line)",
	},
	"copilot": {
		Name: "copilot", Display: "GitHub Copilot",
		Instructions: ".github/copilot-instructions.md",
		MCPHint:      "VS Code: add the server to .vscode/mcp.json (\"servers\": {\"codewiki\": {\"command\": \"kb\", \"args\": [\"mcp\", \"--root\", \"<repo>\"]}}); coding agent: repository settings → Copilot → MCP",
		Tools:        neutralTools,
		ConsumerLvl:  DocsOnly,
		Notes:        "backend: no adapter (use --llm-cmd)",
	},
	"generic": {
		Name: "generic", Display: "any AGENTS.md-aware agent",
		Instructions: "AGENTS.md", SkillsDir: ".agents/skills",
		MCPHint:     "register a stdio MCP server: command `kb`, args `mcp --root <repo>`",
		Tools:       neutralTools,
		ConsumerLvl: DocsOnly,
		Notes:       "backend: --agent generic uses llm.cmd / --llm-cmd (any command reading the prompt on stdin)",
	},
}

// Get returns the adapter for name.
func Get(name string) (*Adapter, error) {
	if a, ok := registry[strings.ToLower(strings.TrimSpace(name))]; ok {
		return a, nil
	}
	return nil, fmt.Errorf("unknown agent %q (known: %s)", name, strings.Join(Names(), ", "))
}

// Names lists all adapters in a stable order.
func Names() []string {
	order := []string{"claude", "codex", "gemini", "cursor", "copilot", "generic"}
	var out []string
	for _, n := range order {
		if _, ok := registry[n]; ok {
			out = append(out, n)
		}
	}
	if len(out) != len(registry) {
		var all []string
		for n := range registry {
			all = append(all, n)
		}
		sort.Strings(all)
		return all
	}
	return out
}

// ParseList expands "claude,codex" / "all" into adapters (deduplicated, in
// registry order for "all").
func ParseList(s string) ([]*Adapter, error) {
	var out []*Adapter
	seen := map[string]bool{}
	for _, n := range strings.Split(s, ",") {
		n = strings.TrimSpace(strings.ToLower(n))
		if n == "" {
			continue
		}
		names := []string{n}
		if n == "all" {
			names = Names()
		}
		for _, m := range names {
			a, err := Get(m)
			if err != nil {
				return nil, err
			}
			if !seen[a.Name] {
				seen[a.Name] = true
				out = append(out, a)
			}
		}
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("no agent given (one or more of %s, or all)", strings.Join(Names(), ","))
	}
	return out, nil
}

// ---------- usage parsing ----------

// lastJSONObject returns the last line of out that parses as a JSON object.
func jsonLines(out []byte) []map[string]any {
	var res []map[string]any
	sc := bufio.NewScanner(bytes.NewReader(out))
	sc.Buffer(make([]byte, 1<<20), 64<<20)
	for sc.Scan() {
		l := bytes.TrimSpace(sc.Bytes())
		if len(l) == 0 || l[0] != '{' {
			continue
		}
		var m map[string]any
		if json.Unmarshal(l, &m) == nil {
			res = append(res, m)
		}
	}
	return res
}

func num(m map[string]any, k string) float64 {
	if m == nil {
		return 0
	}
	f, _ := m[k].(float64)
	return f
}

func sub(m map[string]any, k string) map[string]any {
	if m == nil {
		return nil
	}
	s, _ := m[k].(map[string]any)
	return s
}

// parseClaude reads `claude -p --output-format json` (one result object with
// total_cost_usd, num_turns and usage).
func parseClaude(out []byte) *Usage {
	var u Usage
	for _, m := range jsonLines(out) {
		if m["type"] != "result" && m["total_cost_usd"] == nil {
			continue
		}
		us := sub(m, "usage")
		u = Usage{
			InputTokens:  int(num(us, "input_tokens")),
			OutputTokens: int(num(us, "output_tokens")),
			CachedTokens: int(num(us, "cache_read_input_tokens") + num(us, "cache_creation_input_tokens")),
			CostUSD:      num(m, "total_cost_usd"),
			Turns:        int(num(m, "num_turns")),
		}
		if e, _ := m["is_error"].(bool); e {
			u.Error, _ = m["result"].(string)
			if u.Error == "" {
				u.Error, _ = m["subtype"].(string)
			}
		}
	}
	return &u
}

// parseCodex reads the `codex exec --json` JSONL stream (schema:
// codex-rs/exec/src/exec_events.rs): usage is summed over turn.completed
// events ({"usage":{"input_tokens","cached_input_tokens","output_tokens",
// "reasoning_output_tokens"}}); the last turn.failed / top-level error message
// is kept. Codex does not report cost.
func parseCodex(out []byte) *Usage {
	var u Usage
	for _, m := range jsonLines(out) {
		switch m["type"] {
		case "turn.completed":
			us := sub(m, "usage")
			u.InputTokens += int(num(us, "input_tokens"))
			u.CachedTokens += int(num(us, "cached_input_tokens"))
			u.OutputTokens += int(num(us, "output_tokens"))
			u.ReasoningTokens += int(num(us, "reasoning_output_tokens"))
			u.Turns++
		case "turn.failed":
			if e, _ := sub(m, "error")["message"].(string); e != "" {
				u.Error = e
			}
		case "error":
			if e, _ := m["message"].(string); e != "" {
				u.Error = e
			}
		}
	}
	return &u
}

// parseGemini reads `gemini --output-format json` (gemini-cli 0.65.0:
// {"response":…, "stats":{"models":{"<id>":{"tokens":{"input","prompt","candidates","total","cached","thoughts","tool"}}}},
// "error":{"message"}}); tokens are summed over models (main + router).
func parseGemini(out []byte) *Usage {
	var u Usage
	var doc map[string]any
	if json.Unmarshal(bytes.TrimSpace(out), &doc) != nil {
		ls := jsonLines(out)
		if len(ls) == 0 {
			return &u
		}
		doc = ls[len(ls)-1]
	}
	for _, mv := range sub(sub(doc, "stats"), "models") {
		tk := sub(mv.(map[string]any), "tokens")
		u.InputTokens += int(num(tk, "prompt"))
		u.OutputTokens += int(num(tk, "candidates"))
		u.CachedTokens += int(num(tk, "cached"))
		u.ReasoningTokens += int(num(tk, "thoughts"))
		u.Turns += int(num(sub(mv.(map[string]any), "api"), "totalRequests"))
	}
	if e, _ := sub(doc, "error")["message"].(string); e != "" {
		u.Error = e
	}
	return &u
}
