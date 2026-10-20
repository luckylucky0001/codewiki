#!/usr/bin/env bash
# Show the kb skills working with a real agent (Claude Code, non-interactive).
#
#   demo/skills-demo.sh <demo-repo> [outdir]
#
# <demo-repo> is a repo with a compounded wiki, e.g. demo/output/<run>/repo from
# demo/run.sh. The script installs the skills (kb install-skills), commits them,
# then asks two questions with `claude -p` (cheap model by default) and records
# the full stream-json transcripts plus a readable summary.
#   SKILLS_MODEL=haiku   model alias (default haiku)
set -euo pipefail
REPO="$(cd "${1:?usage: skills-demo.sh <demo-repo> [outdir]}" && pwd)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${2:-$HERE/output/skills-$(date -u +%Y%m%dT%H%M%SZ)}"
MODEL="${SKILLS_MODEL:-haiku}"
mkdir -p "$OUT/bin"
( cd "$HERE/.." && CGO_CFLAGS="${CGO_CFLAGS:--O2 -w}" go build -o "$OUT/bin/kb" ./cmd/kb )
export PATH="$OUT/bin:$PATH"
cd "$REPO"
kb install-skills . >"$OUT/00-install-skills.txt"
git -c user.name=demo -c user.email=demo@codewiki.local add -A
git -c user.name=demo -c user.email=demo@codewiki.local commit -qm "chore: install kb skills" || true
kb status >"$OUT/00-status.txt" || true

ask() { # name, prompt
  local name="$1" q="$2"
  claude -p "$q" --model "$MODEL" --output-format stream-json --verbose \
    --allowedTools "Skill,Read,Glob,Grep,Bash(kb:*)" >"$OUT/$name.jsonl" 2>"$OUT/$name.stderr" || true
  {
    echo "# $name"
    echo
    echo "**Prompt:** $q"
    echo
    echo "**Model:** \`$MODEL\` · cwd: demo repo with \`.claude/skills\` installed by \`kb install-skills\`"
    echo
    echo "## Tool calls"
    echo
    jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | "- `\(.name)` " + (.input | if has("skill") then .skill elif has("command") then (.command|gsub("\n";" ")|.[0:160]) else (tostring|.[0:160]) end)' "$OUT/$name.jsonl"
    echo
    echo "## Answer"
    echo
    jq -r 'select(.type=="result") | .result' "$OUT/$name.jsonl"
    echo
    jq -r 'select(.type=="result") | "_turns: \(.num_turns), cost: $\(.total_cost_usd // 0 | tostring | .[0:6]), duration: \(.duration_ms/1000|floor)s_"' "$OUT/$name.jsonl"
  } >"$OUT/$name.md"
}

ask q1-kb-query '购物车上限三端分别是多少？请引用出处（符号 ID 与 wiki 页面）。只读，不要修改任何文件。'
ask q2-kb-lint '检查这个仓库的 wiki 是否与当前代码一致，并检查三端 testID 和功能是否对齐，给出问题清单与建议。只读，不要修改任何文件。'
git status --short >"$OUT/99-git-status-after.txt"
echo "outputs: $OUT"
