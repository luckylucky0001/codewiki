// kb hook: git hooks that run kb compound on push (server) or merge (client).
export function postReceiveScript(kb: string, llm: string, branches: string): string {
  return `#!/bin/sh
# codewiki post-receive hook — installed by: kb hook install --mode post-receive
# Runs kb compound (+ verify) for every push to: ${branches}
# Pushes are serialized with a lock; the branch HEAD is compounded each time, so
# pushes that queue up behind a running compound are caught up from last_sha.
KB="\${KB:-${kb}}"
LLM="\${KB_HOOK_LLM:-${llm}}"
BRANCHES="${branches}"
GIT_DIR=$(cd "\${GIT_DIR:-.}" && pwd)
export GIT_DIR
STATE="$GIT_DIR/codewiki"
mkdir -p "$STATE"
LOG="$STATE/hook.log"
ZERO=0000000000000000000000000000000000000000
branch=""
while read -r old new ref; do
  for b in $BRANCHES; do
    if [ "$ref" = "refs/heads/$b" ] && [ "$new" != "$ZERO" ]; then branch=$b; fi
  done
done
[ -n "$branch" ] || exit 0

(
  # one compound at a time (mkdir is atomic); wait up to 10 minutes
  n=0
  until mkdir "$STATE/lock" 2>/dev/null; do
    n=$((n + 1))
    if [ $n -gt 600 ]; then echo "[codewiki] lock timeout"; exit 1; fi
    sleep 1
  done
  trap 'rmdir "$STATE/lock"' EXIT
  head=$(git rev-parse "refs/heads/$branch")
  last=$(sed -n 's/.*"last_sha": *"\\([0-9a-f]*\\)".*/\\1/p' "$STATE/wiki/.kb/state.json" 2>/dev/null)
  ts=$(date -u +%H:%M:%S)
  if [ "$head" = "$last" ]; then
    echo "[codewiki $ts] $branch@$(echo "$head" | cut -c1-7) already compounded (caught up by an earlier run)"
    exit 0
  fi
  src="$STATE/src"
  if [ -d "$src" ]; then
    (unset GIT_DIR; git -C "$src" checkout -q --detach -f "$head" && git -C "$src" clean -qfdx)
  else
    git worktree add -q --detach "$src" "$head"
  fi
  behind=$( [ -n "$last" ] && git rev-list --count "$last..$head" 2>/dev/null || echo all)
  echo "[codewiki $ts] compound $branch $(echo "\${last:-none}" | cut -c1-7)..$(echo "$head" | cut -c1-7) ($behind new commit(s))"
  unset GIT_DIR
  [ -d "$STATE/wiki" ] || "$KB" init --root "$src" --wiki-dir "$STATE/wiki" --quiet >/dev/null
  "$KB" compound --root "$src" --wiki-dir "$STATE/wiki" --llm "$LLM" --fallback --quiet >"$STATE/last-compound.txt"
  rc=$?
  grep -E '^mode |^  task |^(published|noop|verify failed)' "$STATE/last-compound.txt"
  "$KB" verify --root "$src" --wiki-dir "$STATE/wiki" | head -1
  exit $rc
) 2>&1 | tee -a "$LOG"
exit 0
`;
}

export function postMergeScript(kb: string, llm: string, branches: string): string {
  return `#!/bin/sh
# codewiki post-merge hook — installed by: kb hook install --mode post-merge
# After git merge / git pull on: ${branches} — run kb compound in this clone.
KB="\${KB:-${kb}}"
LLM="\${KB_HOOK_LLM:-${llm}}"
branch=$(git rev-parse --abbrev-ref HEAD)
for b in ${branches}; do
  if [ "$branch" = "$b" ]; then
    "$KB" compound --llm "$LLM" --fallback --quiet || echo "[codewiki] kb compound failed (merge kept); run kb status"
    exit 0
  fi
done
exit 0
`;
}
