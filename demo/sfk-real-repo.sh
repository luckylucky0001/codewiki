#!/usr/bin/env bash
# SFK docs run on a real repository without touching it: works in a `git clone --shared` copy.
#   demo/sfk-real-repo.sh <repo-checkout> <outdir> [dim=docs/existing.md ...]
# dim=path points a docs dimension at an existing human doc (codewiki.yaml docs_schema) to exercise `adopted`.
# Outputs: per-step logs/JSON, git-status.txt and 12-check.json (independent human-content check).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; ROOT="$(cd "$HERE/.." && pwd)"
SRC="$(cd "${1:?repo}" && pwd)"; W="${2:?outdir}"; shift 2; R="$W/repo"; KB="node $ROOT/dist/cli.js"
rm -rf "$W"; mkdir -p "$W/before"
git clone -q --shared "$SRC" "$R" || exit 2
cd "$R"
find . -name '*.md' -not -path './.git/*' | sed 's|^\./||' | while read -r f; do mkdir -p "$W/before/$(dirname "$f")"; cp "$f" "$W/before/$f"; done
$KB init --quiet >"$W/00-init.txt" 2>&1
if [ $# -gt 0 ]; then { echo "docs_schema:"; echo "    dimensions:"; for m in "$@"; do echo "        - id: ${m%%=*}"; echo "          output_path: ${m#*=}"; done; } >>codewiki.yaml; fi
$KB compound --llm template --quiet >"$W/01-compound.txt" 2>&1
$KB tree show >"$W/02-tree.txt" 2>&1
$KB docs scope >"$W/03-scope.txt" 2>&1
$KB docs status --json >"$W/04-status-before.json" 2>&1
$KB docs compound --llm template --json >"$W/05-docs.json" 2>"$W/05.err"
$KB docs compound --llm template --json >"$W/06-docs-noop.json" 2>"$W/06.err"
$KB docs stale-specs --json >"$W/07-stale.json" 2>&1
$KB docs adr --json >"$W/08-adr.json" 2>&1
$KB docs debt --json >"$W/09-debt.json" 2>&1
$KB links --json >"$W/10-links.json" 2>&1
$KB verify --docs --json >"$W/11-verify-docs.json" 2>&1
git status --porcelain --untracked-files=all >"$W/git-status.txt"
node "$ROOT/demo/human-content-check.mjs" "$W/before" "$R" "$ROOT/dist" >"$W/12-check.json"
echo "outputs: $W"
