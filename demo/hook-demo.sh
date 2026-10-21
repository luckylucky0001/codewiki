#!/usr/bin/env bash
# "Every merge to master triggers compound" — without GitHub.
#
# Creates a local bare "remote" with a kb post-receive hook (the self-hosted
# git / GitLab server hook / Gerrit path), then pushes merges to master:
# one by one, and two of them nearly simultaneously. The hook serializes on a
# lock and always compounds the branch head, so queued pushes are caught up.
#   demo/hook-demo.sh [outdir]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
OUT="${1:-$ROOT/demo/output/hook-$(date -u +%Y%m%dT%H%M%SZ)}"
rm -rf "$OUT"; mkdir -p "$OUT/bin"
KB="$OUT/bin/kb"
( cd "$ROOT" && { [ -d node_modules ] || npm ci --ignore-scripts >/dev/null; } && npm run --silent build )
mkdir -p "$(dirname "$KB")" && printf '#!/bin/sh\nexec node "%s/dist/cli.js" "$@"\n' "$(cd "$ROOT" && pwd)" >"$KB" && chmod +x "$KB"
log() { printf '\n== %s\n' "$*" | tee -a "$OUT/transcript.txt" >&2; }
run() { echo "\$ $*" >>"$OUT/transcript.txt"; "$@" >>"$OUT/transcript.txt" 2>&1; }
gitc() { git -c user.name="dev" -c user.email="dev@codewiki.local" -c commit.gpgsign=false "$@"; }
REMOTE="$OUT/remote.git"
DEV="$OUT/dev"

log "1. bare remote + kb post-receive hook"
git init -q --bare -b master "$REMOTE"
# kb wrapper that simulates LLM latency (3 s per compound) so pushes overlap
cat >"$OUT/bin/kb-slow" <<SH
#!/bin/sh
[ "\$1" = compound ] && sleep \${KB_DEMO_DELAY:-3}
exec "$KB" "\$@"
SH
chmod +x "$OUT/bin/kb-slow"
run "$KB" hook install --mode post-receive --repo "$REMOTE" --kb "$OUT/bin/kb-slow"

log "2. seed the project (code + codewiki.yaml; the wiki lives on the server: $REMOTE/codewiki/wiki)"
git clone -q "$REMOTE" "$DEV" 2>/dev/null
cp -R "$ROOT/examples/minishop/." "$DEV/"
( cd "$DEV" && "$KB" init --wiki-dir "$OUT/tmp-wiki" --quiet >/dev/null && rm -rf "$OUT/tmp-wiki" )
( cd "$DEV" && gitc add -A && gitc commit -qm "chore: import minishop" )
log "push seed → full compound"
( cd "$DEV" && git push -q origin master ) 2>&1 | tee -a "$OUT/transcript.txt"

merge() { # name
  local cs="$ROOT/examples/minishop-changes/$1"
  ( cd "$DEV" && gitc checkout -q -b "feature/$1" && cp -R "$cs/files/." . && gitc add -A && gitc commit -qm "$(cat "$cs/message.txt")" \
    && gitc checkout -q master && gitc merge -q --no-ff "feature/$1" -m "Merge branch 'feature/$1'" )
}

log "3. three merges pushed back-to-back (01, then 02 and 03 nearly simultaneously)"
merge 01-cart-limit;       SHA01=$(git -C "$DEV" rev-parse HEAD)
merge 02-arkts-api-rename; SHA02=$(git -C "$DEV" rev-parse HEAD)
merge 03-profile-route;    SHA03=$(git -C "$DEV" rev-parse HEAD)
push() { # sha name — retries if the remote ref is momentarily locked
  ( cd "$DEV" && for i in 1 2 3 4 5 6 7 8 9 10; do
      git push -q origin "$1:refs/heads/master" >"$OUT/push-$2.txt" 2>&1 && break; sleep 0.3; done )
}
push "$SHA01" 01 & P1=$!
sleep 0.8
push "$SHA02" 02 & P2=$!
sleep 0.3
push "$SHA03" 03 & P3=$!
wait $P1 $P2 $P3
for n in 01 02 03; do
  echo "--- push of merge $n:" | tee -a "$OUT/transcript.txt"; tee -a "$OUT/transcript.txt" <"$OUT/push-$n.txt"
done

log "5. result on the server"
W="$REMOTE/codewiki/wiki"
HEAD=$(git --git-dir="$REMOTE" rev-parse refs/heads/master)
LAST=$(sed -n 's/.*"last_sha": *"\([0-9a-f]*\)".*/\1/p' "$W/.kb/state.json")
{
  echo "remote master: $HEAD"
  echo "wiki last_sha: $LAST"
  [ "$HEAD" = "$LAST" ] && echo "wiki is caught up with master: YES" || echo "wiki is caught up with master: NO"
  echo
  echo "--- hook.log"; cat "$REMOTE/codewiki/hook.log"
  echo
  echo "--- wiki/log.md (compound entries)"; grep '^## \[' "$W/log.md"
  echo
  echo "--- kb verify (server wiki vs pushed head)"
  "$KB" verify --root "$REMOTE/codewiki/src" --wiki-dir "$W" | head -1
} | tee -a "$OUT/transcript.txt"
cp "$REMOTE/codewiki/hook.log" "$OUT/hook.log"
cp "$REMOTE/hooks/post-receive" "$OUT/post-receive.sh"
cp "$W/log.md" "$OUT/wiki-log.md"
[ "$HEAD" = "$LAST" ]
echo "outputs: $OUT" >&2
