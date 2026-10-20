#!/usr/bin/env bash
# Multi-agent consumption check (docs/agents.md).
#
#   demo/agents-demo.sh                 # Claude questions run for real (haiku); Codex inspected only
#   CODEX_BIN=/path/to/codex demo/agents-demo.sh
#
# 1. temp copy of examples/minishop → kb init + kb compound (template) + kb install --agent all --mcp
# 2. Claude Code (real, cheap): two questions with the CLAUDE.md block + .claude/skills
#    (Bash restricted to kb), one question with ONLY the codewiki MCP server (no Bash).
# 3. Codex (no model call): `codex debug prompt-input` shows what the model would see
#    (AGENTS.md block + .agents/skills), `codex mcp list` shows the project MCP server
#    (project trusted in a throwaway CODEX_HOME), and the exact `codex exec` line is printed.
# Outputs: $OUT (default demo/output/<ts>-agents).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${DEMO_OUT:-$ROOT/demo/output/$TS-agents}"
MODEL="${AGENTS_MODEL:-haiku}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT" "$WORK/bin"
( cd "$ROOT" && CGO_CFLAGS="${CGO_CFLAGS:--O2 -w}" go build -o "$WORK/bin/kb" ./cmd/kb )
export PATH="$WORK/bin:$PATH"
REPO="$WORK/minishop"
cp -r "$ROOT/examples/minishop" "$REPO"
cd "$REPO"
g() { git -c user.name=demo -c user.email=demo@codewiki.local "$@"; }
g init -q -b master && g add -A && g commit -qm init
kb init >/dev/null 2>&1 && kb compound >/dev/null 2>&1
kb install --agent all --mcp >"$OUT/00-install.txt"
kb install --agent all --mcp --json | jq -r '.actions[] | "\(.action) \(.path)"' | sort | uniq -c | sort -rn >"$OUT/00-install-rerun.txt"
g add -A && g commit -qm "wiki + agent files"
find . -path ./.git -prune -o -type f \( -name 'CLAUDE.md' -o -name 'AGENTS.md' -o -name 'GEMINI.md' -o -name '*.mdc' -o -name 'copilot-instructions.md' -o -name '.mcp.json' -o -name 'settings.json' -o -name 'mcp.json' -o -name 'config.toml' -o -name 'SKILL.md' \) -print | sort >"$OUT/01-installed-files.txt"

ask() { # name, prompt, extra claude args...
  local name="$1" q="$2"; shift 2
  claude -p "$q" --model "$MODEL" --output-format stream-json --verbose "$@" >"$OUT/$name.jsonl" 2>"$OUT/$name.stderr" || true
  {
    echo "# $name"; echo; echo "**Prompt:** $q"; echo
    echo "**Model:** \`$MODEL\` · claude args: \`$*\`"; echo
    echo "## Tool calls"; echo
    jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | "- `\(.name)` " + (.input | if has("skill") then .skill elif has("command") then (.command|gsub("\n";" ")|.[0:160]) else (tostring|.[0:160]) end)' "$OUT/$name.jsonl"
    echo; echo "## Answer"; echo
    jq -r 'select(.type=="result") | .result' "$OUT/$name.jsonl"
    echo
    jq -r 'select(.type=="result") | "_turns: \(.num_turns), cost: $\(.total_cost_usd // 0 | tostring | .[0:6]), duration: \(.duration_ms/1000|floor)s_"' "$OUT/$name.jsonl"
  } >"$OUT/$name.md"
}
ask c1-claude-instructions '购物车上限三端分别是多少？请引用出处（符号 ID 与 wiki 页面）。只读，不要修改任何文件。' \
  --allowedTools "Skill,Read,Glob,Grep,Bash(kb:*)"
ask c2-claude-instructions '这个 app 一共有多少个路由？哪些路由页面没有设置 testID？只读，不要修改任何文件。' \
  --allowedTools "Skill,Read,Glob,Grep,Bash(kb:*)"
ask c3-claude-mcp-only '登录页（login 路由）三端分别设置了哪些 testID，调用了哪个接口？只用 codewiki MCP 工具回答，引用 wiki 页面。' \
  --mcp-config .mcp.json --strict-mcp-config \
  --allowedTools "mcp__codewiki__kb_search,mcp__codewiki__kb_get,mcp__codewiki__kb_context,mcp__codewiki__kb_parity,mcp__codewiki__kb_conflicts,mcp__codewiki__kb_status,mcp__codewiki__kb_anchor" \
  --disallowedTools "Bash,Read,Grep,Glob"

CODEX="${CODEX_BIN:-$(command -v codex || true)}"
{
  echo "# Codex (not executed against a model)"
  echo
  echo "Backend command kb would run for each compound task (prompt on stdin, cwd = staging wiki):"
  echo
  echo '```'
  kb agents codex
  echo '```'
  if [ -n "$CODEX" ]; then
    CH="$WORK/codex-home"; mkdir -p "$CH"
    printf '[projects."%s"]\ntrust_level = "trusted"\n' "$REPO" >"$CH/config.toml"
    echo; echo "codex version: $("$CODEX" --version 2>/dev/null)"; echo
    echo "## codex mcp list (project .codex/config.toml, project trusted)"; echo; echo '```'
    CODEX_HOME="$CH" "$CODEX" mcp list 2>/dev/null | sed "s#$REPO#<repo>#g"
    echo '```'
    CODEX_HOME="$CH" "$CODEX" debug prompt-input "hi" 2>/dev/null >"$OUT/codex-prompt-input.json" || true
    echo; echo "## What the Codex model would see (codex debug prompt-input)"; echo
    echo "- AGENTS.md codewiki block present: $(grep -c 'Code-anchored wiki (codewiki)' "$OUT/codex-prompt-input.json" || true) time(s)"
    echo "- kb skills listed:"; grep -o 'kb-[a-z]*: [^(]\{0,60\}' "$OUT/codex-prompt-input.json" | sort -u | sed 's/^/  - /'
    sed -i "s#$REPO#<repo>#g; s#$CH#<codex-home>#g" "$OUT/codex-prompt-input.json"
  else
    echo; echo "(codex CLI not installed: set CODEX_BIN to inspect discovery)"
  fi
} >"$OUT/x1-codex.md"
sed -i "s#$WORK#<tmp>#g" "$OUT"/*.txt "$OUT"/*.md 2>/dev/null || true
echo "outputs: $OUT"
