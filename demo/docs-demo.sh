#!/usr/bin/env bash
# codewiki docs-ownership demo (SFK): repository + project docs, human content preserved.
#
#   demo/docs-demo.sh [outdir]      # default demo/output/docs-<timestamp>
#
# Uses examples/monorepo (two app projects, specs/ with Draft/Implemented/Verified, root docs
# with an adopted file, a skeleton file and a frozen custom doc) and the change set
# examples/monorepo-changes/01-cart-limit-20. Template mode: deterministic, no LLM
# (kb compound gets --no-llm-facts; DEMO_LLM_FACTS=1 keeps the default-on LLM facts fallback).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
OUT="${1:-$ROOT/demo/output/docs-$(date -u +%Y%m%dT%H%M%SZ)}"
REPO="$OUT/repo"
FACTS=(--no-llm-facts); [ "${DEMO_LLM_FACTS:-0}" = 1 ] && FACTS=()
for t in node npm git; do command -v "$t" >/dev/null || { echo "missing tool: $t" >&2; exit 2; }; done
rm -rf "$OUT"; mkdir -p "$OUT/bin" "$OUT/before"
( cd "$ROOT" && { [ -d node_modules ] || npm ci --ignore-scripts >/dev/null; } && npm run --silent build )
KB="$OUT/bin/kb"
printf '#!/bin/sh\nexec node "%s/dist/cli.js" "$@"\n' "$ROOT" >"$KB" && chmod +x "$KB"
log() { printf '\n== %s\n' "$*" >&2; }
gitc() { git -C "$REPO" -c user.name="docs demo" -c user.email="demo@codewiki.local" -c commit.gpgsign=false "$@"; }
save() { local name="$1"; shift; set +e; ( cd "$REPO" && "$KB" "$@" ) >"$OUT/$name" 2>"$OUT/$name.stderr"; local rc=$?; set -e; echo "$rc" >"$OUT/$name.exit"; if [ "$rc" -gt 1 ]; then cat "$OUT/$name.stderr" >&2; exit "$rc"; fi; }

log "1. repo: examples/monorepo (git)"
cp -R "$ROOT/examples/monorepo/." "$REPO/"
git -C "$REPO" init -q -b master
gitc add -A && gitc commit -qm "chore: import monorepo example"
HUMAN="docs/architecture.md docs/testing.md docs/onboarding.md docs/adr/0001-native-ui-per-platform.md apps/shop-android/docs/notes.md apps/shop-ios/docs/navigation.md"
for f in $HUMAN; do mkdir -p "$OUT/before/$(dirname "$f")"; cp "$REPO/$f" "$OUT/before/$f"; done

log "2. wiki with the module tree (kb compound --llm template)"
save 01-compound.txt compound --llm template ${FACTS[@]+"${FACTS[@]}"}
save 02-tree.txt tree show
gitc add -A && gitc commit -qm "docs(wiki): initial compound"

log "3. scope + status before the first docs run"
save 03-scope.txt docs scope
save 04-status-before.txt docs status

log "4. first docs compound (adopted / skeleton / new files)"
save 05-docs-compound-1.txt docs compound
save 05-docs-compound-1.json docs compound --json --dry-run

log "5. human content preserved (byte proof)"
{
  echo "# human-content proof (before → after first run)"
  for f in $HUMAN; do
    echo
    echo "## $f"
    if cmp -s "$OUT/before/$f" "$REPO/$f"; then echo "byte-identical (untouched)"; continue; fi
    d="$(diff "$OUT/before/$f" "$REPO/$f" || true)"
    if printf '%s\n' "$d" | grep -q '^<'; then
      echo "lines only in the original (expected only for skeleton placeholders):"
      printf '%s\n' "$d" | grep '^<' | sed 's/^/    /'
    else
      echo "only additions: every original line is still present, in order"
    fi
    node --input-type=module -e "
      import fs from 'node:fs';
      import { checkHumanContentPreserved, classifyFile } from '$ROOT/dist/docs/index.js';
      const b = fs.readFileSync('$OUT/before/$f', 'utf8'), a = fs.readFileSync('$REPO/$f', 'utf8');
      const st = classifyFile(b, true);
      // section headings the merge itself created are kb's, not human chunks
      const added = a.split('\\n').filter((l) => /^#{2,6} /.test(l) && !b.split('\\n').includes(l));
      const v = checkHumanContentPreserved(b, a, { allowPlaceholderRemoval: st === 'skeleton', addedChunks: added });
      console.log('state before: ' + st + '; kb guard (checkHumanContentPreserved): ' + (v ? 'VIOLATION ' + v.message : 'human chunks byte-identical'));"
  done
} >"$OUT/06-human-content-proof.md"
gitc add -A && gitc commit -qm "docs: first kb docs compound"

log "6. second run, no change → noop"
save 07-docs-compound-noop.txt docs compound

log "7. code change (examples/monorepo-changes/01-cart-limit-20) → kb compound + incremental docs run"
cp -R "$ROOT/examples/monorepo-changes/01-cart-limit-20/files/." "$REPO/"
gitc add -A && gitc commit -qm "$(cat "$ROOT/examples/monorepo-changes/01-cart-limit-20/message.txt")"
save 08-compound.txt compound --llm template ${FACTS[@]+"${FACTS[@]}"}
save 09-docs-compound-2.txt docs compound
gitc add -A && gitc commit -qm "docs: incremental kb docs compound"

log "8. ADR / tech-debt proposals, stale specs, links, verify"
save 10-adr-dryrun.txt docs adr
save 11-adr-write.txt docs adr --write
save 12-debt-write.txt docs debt --write
save 13-stale-specs.txt docs stale-specs
save 14-links.txt links
save 15-verify-docs.txt verify --docs
save 16-status-after.txt docs status
save 17-tree-explain.txt tree explain apps/shop-android/app/src/main/java/com/minishop/ui/cart/CartViewModel.kt
gitc log --oneline >"$OUT/99-git-log.txt"

{
  echo "# codewiki docs demo summary"
  echo
  echo "## Module tree"; echo; echo '```'; tail -1 "$OUT/02-tree.txt"; head -20 "$OUT/02-tree.txt"; echo '```'
  echo; echo "## Scopes"; echo; echo '```'; cat "$OUT/03-scope.txt"; echo '```'
  echo; echo "## First docs compound"; echo; echo '```'; cat "$OUT/05-docs-compound-1.txt"; echo '```'
  echo; echo "## Human content"; echo; sed '1d' "$OUT/06-human-content-proof.md"
  echo; echo "## No-change rerun"; echo; echo '```'; grep -v '^  noop' "$OUT/07-docs-compound-noop.txt" || true; echo "($(grep -c '^  noop' "$OUT/07-docs-compound-noop.txt") file(s) noop)"; echo '```'
  echo; echo "## After the code change"; echo; echo '```'; grep -v '^  noop' "$OUT/09-docs-compound-2.txt" || true; echo '```'
  echo; echo "## ADR / debt / stale specs / links / verify"; echo; echo '```'
  cat "$OUT/10-adr-dryrun.txt" "$OUT/11-adr-write.txt" "$OUT/12-debt-write.txt" "$OUT/13-stale-specs.txt" "$OUT/14-links.txt"; tail -1 "$OUT/15-verify-docs.txt"
  echo '```'
} >"$OUT/SUMMARY.md"
cat "$OUT/SUMMARY.md"
echo "outputs: $OUT"
grep -q "VIOLATION" "$OUT/06-human-content-proof.md" && { echo "human content violated" >&2; exit 1; }
grep -q "PASS" "$OUT/15-verify-docs.txt"
