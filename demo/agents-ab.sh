#!/usr/bin/env bash
# A/B: does installing every agent's files (`kb install --agent all`) confuse Claude Code compared
# with installing only Claude's (`kb install --agent claude`)? Same repo, same questions, same model.
#
#   demo/agents-ab.sh            # AB_MODEL=haiku, AB_REPEAT=1
# Outputs: $OUT/<variant>-<q>.jsonl + summary.md (tool calls, first action, agent-file reads, turns, cost).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
OUT="${DEMO_OUT:-$ROOT/demo/output/$(date -u +%Y%m%dT%H%M%SZ)-agents-ab}"
MODEL="${AB_MODEL:-haiku}"
REPEAT="${AB_REPEAT:-1}"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT" "$WORK/bin"
( cd "$ROOT" && CGO_CFLAGS="${CGO_CFLAGS:--O2 -w}" go build -o "$WORK/bin/kb" ./cmd/kb )
export PATH="$WORK/bin:$PATH"
g() { git -c user.name=demo -c user.email=demo@codewiki.local "$@"; }
QS=(
  "q1|购物车上限三端分别是多少？请引用出处（符号 ID 与 wiki 页面）。只读，不要修改任何文件。"
  "q2|这个 app 一共有多少个路由？哪些路由页面没有设置 testID？只读，不要修改任何文件。"
  "q3|我要修改 android 的 CartViewModel.kt，改之前需要知道哪些相关页面、路由、testID 和接口？只读，不要修改任何文件。"
)
for variant in claude all; do
  R="$WORK/$variant"; cp -r "$ROOT/examples/minishop" "$R"; cd "$R"
  g init -q -b master && g add -A && g commit -qm init
  kb init >/dev/null 2>&1 && kb compound >/dev/null 2>&1
  kb install --agent "$variant" --mcp >"$OUT/$variant-install.txt"
  g add -A && g commit -qm "wiki + agent files ($variant)"
  for q in "${QS[@]}"; do
    id="${q%%|*}"; text="${q#*|}"
    for n in $(seq 1 "$REPEAT"); do
      claude -p "$text" --model "$MODEL" --output-format stream-json --verbose \
        --allowedTools "Skill,Read,Glob,Grep,Bash(kb:*)" >"$OUT/$variant-$id-$n.jsonl" 2>/dev/null || true
    done
  done
done
{
  echo "# kb install --agent claude vs --agent all (model: $MODEL, repeat: $REPEAT)"
  echo
  echo "| variant | q | first action | kb calls | other tool calls | reads of agent files (AGENTS/GEMINI/.cursor/.github/.agents/.codex/.gemini) | turns | cost |"
  echo "|---|---|---|---|---|---|---|---|"
  for f in "$OUT"/*-q*-*.jsonl; do
    b="$(basename "$f" .jsonl)"; variant="${b%%-*}"; rest="${b#*-}"; q="${rest%%-*}"
    first="$(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .name + ": " + ((.input.command // .input.skill // .input.file_path // .input.pattern // "") | tostring | gsub("\n";" ") | .[0:50])' "$f" | head -1)"
    kbc="$(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | select(.name=="Bash") | .input.command' "$f" | grep -c '^kb ' || true)"
    other="$(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | select(.name!="Bash") | .name' "$f" | wc -l)"
    agentf="$(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | (.input.file_path // .input.path // .input.pattern // "") ' "$f" | grep -cE 'AGENTS\.md|GEMINI\.md|\.cursor|copilot-instructions|\.agents/|\.codex/|\.gemini/' || true)"
    jq -r --arg v "$variant" --arg q "$q" --arg first "$first" --arg kbc "$kbc" --arg other "$other" --arg af "$agentf" \
      'select(.type=="result") | "| \($v) | \($q) | `\($first)` | \($kbc) | \($other) | \($af) | \(.num_turns) | $\(.total_cost_usd // 0 | tostring | .[0:6]) |"' "$f"
  done
} >"$OUT/summary.md"
cat "$OUT/summary.md"
