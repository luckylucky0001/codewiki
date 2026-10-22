#!/bin/bash
# Full pipeline on every labelled repo, outputs outside the clones.
#   ACC_REPOS=<dir>[:<dir>...] bench/accuracy/bin/run.sh <out-dir> [label-name ...]
# Per repo: kb compound --llm template --full; kb discover-docs; kb ingest --manifest --llm template.
# Builds the TypeScript kb first (set KB=<binary> to use another kb, e.g. the Go one). JOBS=n parallel repos.
set -u
export KB_LLM_FACTS="${KB_LLM_FACTS:-0}"   # rules-only facts: no default-on LLM facts fallback (KB_LLM_FACTS=1 to enable)
HERE=$(cd "$(dirname "$0")" && pwd); ACC=$(dirname "$HERE"); REPO=$(cd "$ACC/../.." && pwd)
OUT=${1:?out dir}; shift; mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
if [ -z "${KB:-}" ]; then
  # build, then run a frozen snapshot so a rebuild of the checkout during the run cannot mix versions
  (cd "$REPO" && npm run build >/dev/null) || exit 1
  SNAP="$OUT/_kb"; rm -rf "$SNAP"; mkdir -p "$SNAP"
  cp -r "$REPO/dist" "$REPO/grammars" "$REPO/package.json" "$SNAP/" && ln -s "$REPO/node_modules" "$SNAP/node_modules"
  echo "kb snapshot: $(git -C "$REPO" rev-parse --short HEAD) $(git -C "$REPO" status --porcelain -- src | wc -l) uncommitted src files" > "$OUT/kb-version.txt"
  KB="node $SNAP/dist/cli.js"
fi
NAMES=("$@"); [ ${#NAMES[@]} -eq 0 ] && NAMES=($(cd "$ACC/labels" && ls *.json | sed 's/\.json$//'))
one() {
  local N=$1 D="$OUT/$1" R; mkdir -p "$D"
  R=$(node "$HERE/mkcfg.mjs" "$ACC/labels/$N.json" "$D") || return 1
  local A="--root $R --config $D/codewiki.yaml"
  { date -u; echo "repo=$R"; S0=$SECONDS
    timeout 1500 $KB compound $A --llm template --full; echo "compound exit $? at $((SECONDS-S0))s"
    $KB discover-docs $A --json > "$D/docs.json"; echo "discover exit $?"
    timeout 900 $KB ingest --manifest "$D/docs.json" $A --llm template; echo "ingest exit $? at $((SECONDS-S0))s"
    git -C "$R" status --porcelain | head; date -u; } > "$D/run.log" 2>&1
  echo "$N: $(grep -h 'exit' "$D/run.log" | tr '\n' ' ')"
}
export -f one; export OUT HERE ACC KB
printf '%s\n' "${NAMES[@]}" | xargs -P "${JOBS:-2}" -I{} bash -c 'one {}'
