#!/usr/bin/env bash
# codewiki end-to-end demo.
#
#   DEMO_LLM=template demo/run.sh   # default: offline, deterministic, reproducible
#   DEMO_LLM=claude   demo/run.sh   # real LLM (claude -p) for ingest + incremental compounds
#
# Optional:
#   DEMO_BOOTSTRAP_LLM=template|claude  writer for the initial full compound (default: template,
#                                       keeps claude mode cheap: only incremental pages use the LLM)
#   DEMO_CLAUDE_CMD='claude -p ...'     LLM command line for claude mode
#   DEMO_MAX_LLM_TASKS=N                cap LLM tasks per compound (rest: template), default 3
#   DEMO_OUT=dir                        output dir (default demo/output/<timestamp>)
#
# Requires: go (cgo + gcc), git, jq. All outputs are saved under demo/output/<timestamp>/.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
MODE="${DEMO_LLM:-template}"
BOOT="${DEMO_BOOTSTRAP_LLM:-template}"
MAXT="${DEMO_MAX_LLM_TASKS:-3}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${DEMO_OUT:-$ROOT/demo/output/$TS-$MODE}"
REPO="$OUT/repo"
CLAUDE_CMD="${DEMO_CLAUDE_CMD:-claude -p --model sonnet --permission-mode acceptEdits --allowedTools \"Read,Write,Edit,Glob,Grep,Bash(kb anchor:*),Bash(kb get:*)\" --output-format text}"

case "$MODE" in template|claude) ;; *) echo "DEMO_LLM must be template or claude" >&2; exit 2 ;; esac
for t in go git jq; do command -v "$t" >/dev/null || { echo "missing tool: $t" >&2; exit 2; }; done
if [ "$MODE" = claude ]; then command -v claude >/dev/null || { echo "claude CLI not found" >&2; exit 2; }; fi

mkdir -p "$OUT/bin"
log() { printf '\n\033[1;34m== %s\033[0m\n' "$*" >&2; }
# run a kb command, save stdout to $OUT/<name>.txt (human) and keep going on exit 1
KB="$OUT/bin/kb"
kbsave() { # name, args...
  local name="$1"; shift
  set +e
  ( cd "$REPO" && "$KB" "$@" ) >"$OUT/$name" 2>"$OUT/$name.stderr"
  local rc=$?
  set -e
  echo "$rc" >"$OUT/$name.exit"
  if [ "$rc" -gt 1 ]; then echo "kb $* failed with $rc" >&2; cat "$OUT/$name.stderr" >&2; exit "$rc"; fi
  return 0
}
gitc() { git -C "$REPO" -c user.name="codewiki demo" -c user.email="demo@codewiki.local" "$@"; }
llm_flags() { # writer for incremental steps
  if [ "$MODE" = claude ]; then printf '%s\0' --llm claude --llm-cmd "$CLAUDE_CMD" --fallback --max-llm-tasks "$MAXT"; else printf '%s\0' --llm template; fi
}

log "build kb"
( cd "$ROOT" && CGO_CFLAGS="${CGO_CFLAGS:--O2 -w}" go build -o "$KB" ./cmd/kb )
"$KB" version | tee "$OUT/00-version.txt"

log "create temp git repo from examples/minishop (branch master)"
rm -rf "$REPO"; mkdir -p "$REPO"
cp -R "$ROOT/examples/minishop/." "$REPO/"
git -C "$REPO" init -q -b master
gitc add -A && gitc commit -qm "chore: import minishop"

log "kb init"
kbsave 01-init.txt init
gitc add -A && gitc commit -qm "chore(wiki): kb init"

log "kb discover-docs + kb ingest (claims verified against code)"
kbsave 02-discover-docs.json discover-docs --json
mapfile -d '' ING < <(if [ "$MODE" = claude ]; then printf '%s\0' --llm claude --llm-cmd "$CLAUDE_CMD" --fallback; else printf '%s\0' --llm template; fi)
kbsave 03-ingest.txt ingest --manifest "$OUT/02-discover-docs.json" --kinds spec,design,adr,agent-guide,doc "${ING[@]}"
gitc add -A && gitc commit -qm "docs(wiki): ingest legacy docs and specs"

log "initial kb compound (full rebuild, writer=$BOOT)"
mapfile -d '' BF < <(if [ "$BOOT" = claude ]; then printf '%s\0' --llm claude --llm-cmd "$CLAUDE_CMD" --fallback; else printf '%s\0' --llm template; fi)
kbsave 04-compound-initial.txt compound "${BF[@]}"
kbsave 04-compound-initial.verify.txt verify
gitc add -A && gitc commit -qm "docs(wiki): initial compound"

mapfile -d '' LF < <(llm_flags)
i=5
for cs in "$ROOT"/examples/minishop-changes/*/; do
  name="$(basename "$cs")"
  msg="$(cat "$cs/message.txt")"
  log "merge $name → master"
  gitc checkout -q -b "feature/$name"
  cp -R "$cs/files/." "$REPO/"
  gitc add -A && gitc commit -qm "$msg"
  gitc checkout -q master
  gitc merge -q --no-ff "feature/$name" -m "Merge branch 'feature/$name'"
  p=$(printf '%02d' "$i")
  kbsave "$p-$name.1-status.txt" status
  kbsave "$p-$name.2-diff.txt" diff
  kbsave "$p-$name.3-plan.json" plan --json --dry-run
  kbsave "$p-$name.4-compound.txt" compound "${LF[@]}"
  kbsave "$p-$name.5-verify.txt" verify
  kbsave "$p-$name.6-parity.txt" parity
  gitc add -A && gitc commit -qm "docs(wiki): compound after $name"
  i=$((i+1))
done

log "queries"
kbsave 90-search.txt search "购物车 上限"
kbsave 91-context.txt context android/app/src/main/java/com/minishop/ui/cart/CartViewModel.kt
kbsave 92-get-cart.md get features/cart
kbsave 93-get-conflicts.md get _conflicts
kbsave 94-lint-tid.txt lint-tid
kbsave 94-parity.json parity --json
kbsave 95-status.txt status
kbsave 96-verify.json verify --json
cp "$REPO/wiki/log.md" "$OUT/97-log.md"
cp "$REPO/wiki/facts/requirements.json" "$OUT/98-requirements.json"
cp "$REPO/wiki/.kb/update_record.json" "$OUT/99-update_record.json"
gitc log --oneline --graph >"$OUT/99-git-log.txt"

log "SUMMARY.md"
{
  echo "# codewiki demo summary"
  echo
  echo "- mode: \`$MODE\` (bootstrap writer: \`$BOOT\`)"
  echo "- date (UTC): $TS"
  echo "- repo: \`$REPO\` (temp git repo, branch master)"
  echo "- kb: \`$("$KB" version)\`"
  echo
  echo "## Ingest"
  echo
  echo "Discovered docs: $(jq '.docs | length' "$OUT/02-discover-docs.json") ($(jq -r '[.docs[].kind] | group_by(.) | map("\(.[0])=\(length)") | join(", ")' "$OUT/02-discover-docs.json"))"
  echo
  echo "Claims: $(jq -r '[.requirements[].status] | group_by(.) | map("\(.[0])=\(length)") | join(", ")' "$OUT/98-requirements.json")"
  echo
  echo "Conflicts (code wins):"
  echo
  jq -r '.requirements[] | select(.status=="conflict") | "- **\(.id)** (\(.source)): \(.text)\n  - \(.evidence | join("; "))"' "$OUT/98-requirements.json"
  echo
  echo "## Compounds"
  echo
  echo "| step | mode | tasks | stale before | verify |"
  echo "|---|---|---|---|---|"
  echo "| initial | $(grep -m1 '^mode ' "$OUT/04-compound-initial.txt" | awk '{print $2}') | $(grep -c '^  task ' "$OUT/04-compound-initial.txt" || true) | - | $(head -1 "$OUT/04-compound-initial.verify.txt" | awk '{print $2}' | tr -d :) |"
  for f in "$OUT"/[0-9][0-9]-*.4-compound.txt; do
    base="${f%.4-compound.txt}"; n="$(basename "$base" | cut -d- -f2-)"
    stale="$(grep -c '^stale ' "$base.1-status.txt" || true)"
    echo "| $n | $(grep -m1 '^mode ' "$f" | awk '{print $2}') | $(grep -c '^  task ' "$f" || true) | $stale | $(head -1 "$base.5-verify.txt" | awk '{print $2}' | tr -d :) |"
  done
  echo
  for f in "$OUT"/[0-9][0-9]-*.4-compound.txt; do
    base="${f%.4-compound.txt}"; n="$(basename "$base")"
    echo "### $n"
    echo
    echo '```'
    sed -n '1,6p' "$base.2-diff.txt" | sed 's/^/diff: /'
    grep -E '^(stale|all pages)' "$base.1-status.txt" | sed 's/^/status(before): /' || true
    grep -E '^  t[0-9]+-|^  task ' "$f" || true
    head -1 "$base.5-verify.txt"
    echo '```'
    echo
  done
  echo "## Parity（三端一致性）"
  echo
  echo "Gaps after the last merge: $(jq '.gaps' "$OUT/94-parity.json"); constants that differ across platforms:"
  echo
  jq -r '.constant_diffs[] | "- `\(.name)`: " + ([.values | to_entries[] | "\(.key)=\(.value.value)"] | join(", "))' "$OUT/94-parity.json"
  echo
  echo "## Queries"
  echo
  echo '```'
  head -8 "$OUT/90-search.txt"
  echo '```'
  echo
  echo '```'
  head -12 "$OUT/91-context.txt"
  echo '```'
  echo
  echo "Final verify: $(jq -r 'if .ok then "PASS" else "FAIL" end' "$OUT/96-verify.json") — $(jq '.pages' "$OUT/96-verify.json") pages, $(jq '.anchors' "$OUT/96-verify.json") anchors."
  echo
  echo "Files: see \`$(basename "$OUT")/\` (numbered by step); the final wiki is in \`repo/wiki/\`."
} >"$OUT/SUMMARY.md"

cat "$OUT/SUMMARY.md"
echo
echo "outputs: $OUT"
jq -e '.ok' "$OUT/96-verify.json" >/dev/null
