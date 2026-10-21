#!/usr/bin/env bash
# Real-LLM path on examples/monorepo: tree pages (kb compound --agent claude) and docs entries
# (kb docs compound --agent claude), each followed by verify and a human-content check.
#   demo/llm-demo.sh [outdir]        (needs the claude CLI; ~$0.15 with haiku)
#   DEMO_MODEL=haiku DEMO_MAX_TASKS=6
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
OUT="${1:-$ROOT/demo/output/llm-$(date -u +%Y%m%dT%H%M%SZ)}"
MODEL="${DEMO_MODEL:-haiku}"; MAX="${DEMO_MAX_TASKS:-6}"
command -v claude >/dev/null || { echo "claude CLI not found" >&2; exit 2; }
R="$OUT/repo"; rm -rf "$OUT"; mkdir -p "$OUT/before"
( cd "$ROOT" && { [ -d node_modules ] || npm ci --ignore-scripts >/dev/null; } && npm run --silent build )
KB="node $ROOT/dist/cli.js"
gitc() { git -C "$R" -c user.name=demo -c user.email=demo@codewiki.local -c commit.gpgsign=false "$@"; }
cp -R "$ROOT/examples/monorepo/." "$R/"; git -C "$R" init -q -b master; gitc add -A; gitc commit -qm init
cd "$R"
$KB compound --llm template >"$OUT/01-compound-template.txt" 2>&1
gitc add -A; gitc commit -qm "wiki: template"
# 1. code change -> LLM rewrites the affected feature pages and the L3 cluster page
cp -R "$ROOT/examples/monorepo-changes/01-cart-limit-20/files/." "$R/"
gitc add -A; gitc commit -qm "$(cat "$ROOT/examples/monorepo-changes/01-cart-limit-20/message.txt")"
$KB compound --agent claude --model "$MODEL" --max-llm-tasks "$MAX" >"$OUT/02-compound-claude.txt" 2>&1
$KB verify >"$OUT/03-verify.txt" 2>&1
gitc add -A; gitc commit -qm "wiki: claude"
# 2. docs entries written by the agent (read-only tools; kb verifies sources and merges)
HUMAN="docs/architecture.md docs/testing.md docs/onboarding.md docs/adr/0001-native-ui-per-platform.md apps/shop-android/docs/notes.md apps/shop-ios/docs/navigation.md"
for f in $HUMAN; do mkdir -p "$OUT/before/$(dirname "$f")"; cp "$f" "$OUT/before/$f"; done
$KB docs compound --agent claude --model "$MODEL" >"$OUT/04-docs-claude.txt" 2>&1
$KB verify --docs >"$OUT/05-verify-docs.txt" 2>&1
node "$ROOT/demo/human-content-check.mjs" "$OUT/before" "$R" "$ROOT/dist" >"$OUT/human-content-check.json"
gitc add -A; gitc commit -qm "docs: claude"
# 3. L1 / L2 pages written by the agent from their children's summaries (pages removed to force a write)
rm wiki/pages/shop-ios/mini-shop/overview.md wiki/pages/shop-ios/overview.md
$KB compound --agent claude --model "$MODEL" --max-llm-tasks "$MAX" >"$OUT/07-compound-claude-tree.txt" 2>&1
$KB verify >"$OUT/08-verify.txt" 2>&1
echo "outputs: $OUT"
