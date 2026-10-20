#!/usr/bin/env bash
# Agent A/B benchmark: does a code-anchored wiki (+ kb skills) help an agent
# answer questions about a mobile monorepo?
#
#   bench/agent-qa/run.sh <demo-repo> [outdir]
#
# <demo-repo> is the compounded minishop repo from demo/run.sh
# (demo/output/<run>/repo). For every question in questions.json the script runs
# `claude -p` twice with the same model and prompt:
#   A  repo + wiki/ + kb skills installed (tools: Skill, Read, Glob, Grep, Bash(kb:*))
#   B  the same source tree without wiki/, skills or codewiki.yaml (tools: Read, Glob, Grep)
# and scores each final answer with the regex checks in questions.json.
# Outputs: results.md, results.json and the raw stream-json transcripts.
#   AGENT_MODEL=haiku   model alias (default haiku)
#   AGENT_PAR=4         parallel claude runs (default 4)
#   AGENT_REPS=1        repetitions per question and variant (default 1)
#   AGENT_ONLY="q01 q05" run a subset (prefix match on question id)
#   AGENT_VARIANTS="A"  run only some variants (default "A B")
#   AGENT_RESCORE=1     only re-score existing transcripts in [outdir] (no claude runs)
set -euo pipefail
SRC="$(cd "${1:?usage: run.sh <demo-repo> [outdir]}" && pwd)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${2:-$HERE/../../demo/output/agent-bench-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
MODEL="${AGENT_MODEL:-haiku}"
PAR="${AGENT_PAR:-4}"
REPS="${AGENT_REPS:-1}"
Q="$HERE/questions.json"
command -v claude >/dev/null || { echo "claude CLI not found" >&2; exit 2; }
command -v jq >/dev/null || { echo "jq not found" >&2; exit 2; }

ids=$(jq -r '.questions[].id' "$Q")
if [ -n "${AGENT_ONLY:-}" ]; then
  ids=$(for i in $ids; do for p in $AGENT_ONLY; do case "$i" in "$p"*) echo "$i" ;; esac; done; done)
fi

if [ -z "${AGENT_RESCORE:-}" ]; then
mkdir -p "$OUT/bin" "$OUT/transcripts"
( cd "$HERE/../.." && CGO_CFLAGS="${CGO_CFLAGS:--O2 -w}" go build -o "$OUT/bin/kb" ./cmd/kb )
export PATH="$OUT/bin:$PATH"
G=(-c user.name=bench -c user.email=bench@codewiki.local)

# --- A: clone with wiki, install skills
rm -rf "$OUT/A" "$OUT/B"
git clone -q "$SRC" "$OUT/A"
( cd "$OUT/A" && kb install-skills . >/dev/null && git "${G[@]}" add -A && git "${G[@]}" commit -qm "chore: install kb skills" || true )
# --- B: same source tree, no wiki / skills / kb config, fresh history
mkdir -p "$OUT/B"
( cd "$OUT/A" && git archive HEAD ) | tar -x -C "$OUT/B"
rm -rf "$OUT/B/wiki" "$OUT/B/.claude" "$OUT/B/codewiki.yaml" "$OUT/B/AGENTS.md" "$OUT/B/CLAUDE.md"
( cd "$OUT/B" && git init -q && git "${G[@]}" add -A && git "${G[@]}" commit -qm "source only" )
grep -rIl -e 'codewiki' -e 'kb compound' "$OUT/B" --exclude-dir=.git >"$OUT/B-leaks.txt" || true

suffix="$(jq -r .suffix "$Q")"
run_one() { # variant qid rep
  local v="$1" id="$2" r="$3" dir tools prompt
  prompt="$(jq -r --arg id "$id" '.questions[] | select(.id==$id) | .prompt' "$Q") $suffix"
  if [ "$v" = A ]; then dir="$OUT/A"; tools="Skill,Read,Glob,Grep,Bash(kb:*)"; else dir="$OUT/B"; tools="Read,Glob,Grep"; fi
  ( cd "$dir" && claude -p "$prompt" --model "$MODEL" --output-format stream-json --verbose \
      --allowedTools "$tools" </dev/null >"$OUT/transcripts/$v-$id-r$r.jsonl" 2>"$OUT/transcripts/$v-$id-r$r.stderr" ) || true
}
export -f run_one
export OUT MODEL Q suffix

for r in $(seq 1 "$REPS"); do for i in $ids; do for v in ${AGENT_VARIANTS:-A B}; do echo "$v $i $r"; done; done; done | xargs -P "$PAR" -n 3 bash -c 'run_one "$0" "$1" "$2"'
fi

# --- score
score_one() { # variant qid rep -> json line
  local v="$1" id="$2" r="$3" f="$OUT/transcripts/$1-$2-r$3.jsonl" ans hits=0 total min bad=0 miss=()
  ans="$(jq -r 'select(.type=="result") | .result // ""' "$f" 2>/dev/null | tr '\n' ' ')"
  total=$(jq --arg id "$id" '.questions[] | select(.id==$id) | .must | length' "$Q")
  min=$(jq --arg id "$id" '.questions[] | select(.id==$id) | .min // (.must|length)' "$Q")
  while IFS= read -r re; do
    if printf '%s' "$ans" | grep -Eiq -- "$re"; then hits=$((hits+1)); else miss+=("$re"); fi
  done < <(jq -r --arg id "$id" '.questions[] | select(.id==$id) | .must[]' "$Q")
  while IFS= read -r re; do
    [ -n "$re" ] && printf '%s' "$ans" | grep -Eiq -- "$re" && bad=$((bad+1))
  done < <(jq -r --arg id "$id" '.questions[] | select(.id==$id) | (.must_not // [])[]' "$Q")
  local pass=false
  [ "$hits" -ge "$min" ] && [ "$bad" -eq 0 ] && pass=true
  jq -c --arg v "$v" --arg id "$id" --argjson rep "$r" --argjson hits "$hits" --argjson total "$total" --argjson bad "$bad" \
     --argjson pass "$pass" --arg miss "$(IFS='|'; echo "${miss[*]:-}")" \
     'select(.type=="result") | {variant:$v, id:$id, rep:$rep, pass:$pass, hits:$hits, total:$total, must_not_hits:$bad, missed:$miss,
       turns:.num_turns, cost:(.total_cost_usd // 0), ms:.duration_ms,
       in:((.usage.input_tokens // 0) + (.usage.cache_read_input_tokens // 0) + (.usage.cache_creation_input_tokens // 0)),
       out:(.usage.output_tokens // 0), error:(.is_error // false)}' "$f"
}
: >"$OUT/results.jsonl"
for r in $(seq 1 "$REPS"); do for i in $ids; do for v in ${AGENT_VARIANTS:-A B}; do score_one "$v" "$i" "$r" >>"$OUT/results.jsonl" || true; done; done; done
jq -s '{model: "'"$MODEL"'", results: .}' "$OUT/results.jsonl" >"$OUT/results.json"

{
  echo "# Agent A/B benchmark (model: $MODEL)"
  echo
  echo "A = repo + wiki + kb skills (Skill, Read, Glob, Grep, Bash(kb:*)); B = same source tree, no wiki/skills (Read, Glob, Grep)."
  echo
  echo "Repetitions per question and variant: $REPS. Pass = all checks hit (or at least \`min\`) and no \`must_not\` hit."
  echo
  echo "| question | A pass | A checks | A turns | A cost | A s | B pass | B checks | B turns | B cost | B s |"
  echo "|---|---|---|---|---|---|---|---|---|---|---|"
  jq -r -s 'group_by(.id)[] | . as $g |
    def cell(v): ($g|map(select(.variant==v))) as $r | ($r|length) as $n |
      if $n == 0 then "—|—|—|—|—" else
      "\($r|map(select(.pass))|length)/\($n)|\($r|map(.hits)|add)/\($r|map(.total)|add)|\(($r|map(.turns)|add)/$n*10|round/10)|$\(($r|map(.cost)|add)*1000|round/1000)|\(($r|map(.ms)|add)/$n/1000|round)" end;
    "| \(.[0].id) | \(cell("A")) | \(cell("B")) |"' "$OUT/results.jsonl"
  jq -r -s '
    def agg(v): map(select(.variant==v)) as $r | ($r|length) as $n |
      "| \(v) | \($r|map(select(.pass))|length)/\($n) | \(($r|map(.hits)|add) // 0)/\(($r|map(.total)|add) // 0) | \(if $n>0 then ($r|map(.turns)|add)/$n*10|round/10 else 0 end) | \(if $n>0 then ($r|map(.in)|add)/$n/1000|round else 0 end)k / \(if $n>0 then ($r|map(.out)|add)/$n|round else 0 end) | $\(($r|map(.cost)|add // 0)*1000|round/1000) | \(if $n>0 then ($r|map(.ms)|add)/$n/1000|round else 0 end) |";
    "", "| variant | passed | checks hit | avg turns | avg tokens in / out | total cost | avg s |", "|---|---|---|---|---|---|---|", agg("A"), agg("B")' "$OUT/results.jsonl"
  echo
  echo "Raw transcripts: \`transcripts/<A|B>-<question>.jsonl\`. Checks: \`bench/agent-qa/questions.json\`."
  if [ -s "$OUT/B-leaks.txt" ]; then echo; echo "Files in B that mention codewiki (source tree, not wiki): $(wc -l <"$OUT/B-leaks.txt")"; fi
} >"$OUT/results.md"
cat "$OUT/results.md"
echo "outputs: $OUT"
