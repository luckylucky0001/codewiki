#!/usr/bin/env bash
# Real Gemini CLI + mock model: end-to-end `kb compound --agent gemini`.
#
#   GEMINI_BIN=/path/to/gemini demo/gemini-mock-demo.sh     # default: gemini on PATH
#
# REAL: gemini binary (-p headless mode, auth/config, auto_edit approval, write_file tool, -o json),
#       kb (prompt, untrusted-data wrapping, write-set guard, post-processing, verify, publish, usage
#       parsing). MOCKED: only the model (demo/mock-model/mock_gemini.py).
# Needs: node, git, python3, gemini. No network, no API key.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
GEMINI="${GEMINI_BIN:-$(command -v gemini || true)}"
[ -n "$GEMINI" ] || { echo "gemini CLI not found (set GEMINI_BIN)" >&2; exit 2; }
OUT="${DEMO_OUT:-$ROOT/demo/output/$(date -u +%Y%m%dT%H%M%SZ)-gemini-mock}"
PORT="${MOCK_PORT:-18798}"
WORK="$(mktemp -d)"
cleanup() { [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null || true; rm -rf "$WORK"; }
trap cleanup EXIT
mkdir -p "$OUT" "$WORK/bin" "$WORK/gemini-home/.gemini"
( cd "$ROOT" && { [ -d node_modules ] || npm ci --ignore-scripts >/dev/null; } && npm run --silent build )
printf '#!/bin/sh\nexec node "%s/dist/cli.js" "$@"\n' "$ROOT" >"$WORK/bin/kb" && chmod +x "$WORK/bin/kb"
ln -s "$GEMINI" "$WORK/bin/gemini"
echo '{"security":{"auth":{"selectedType":"gemini-api-key"}}}' >"$WORK/gemini-home/.gemini/settings.json"
export PATH="$WORK/bin:$PATH" GEMINI_CLI_HOME="$WORK/gemini-home" GEMINI_API_KEY=dummy GOOGLE_GEMINI_BASE_URL="http://127.0.0.1:$PORT" \
  NO_PROXY="127.0.0.1,localhost" no_proxy="127.0.0.1,localhost"
python3 -I "$HERE/mock-model/mock_gemini.py" "$PORT" "$OUT/mock-requests.jsonl" & MOCK_PID=$!
sleep 1

REPO="$WORK/minishop"; cp -r "$ROOT/examples/minishop" "$REPO"; cd "$REPO"
g() { git -c user.name=demo -c user.email=demo@codewiki.local "$@"; }
g init -q -b master && g add -A && g commit -qm init
kb init >/dev/null 2>&1 && kb compound >/dev/null 2>&1 && g add -A && g commit -qm "wiki (template)"
cp -r "$ROOT/examples/minishop-changes/01-cart-limit/files/." . && g add -A && g commit -qm "change: cart limit"

{ echo "gemini: $("$GEMINI" --version)"; echo "backend command: $(kb agents gemini)"; } >"$OUT/00-versions.txt"
set +e
kb compound --agent gemini --keep-work >"$OUT/01-compound-agent-gemini.txt" 2>"$OUT/01-compound-agent-gemini.stderr"; echo "exit $?" >>"$OUT/01-compound-agent-gemini.txt"
kb verify >"$OUT/03-verify.txt" 2>&1
set -e
test ! -e wiki/pages/evil-gemini.md && echo "pages/evil-gemini.md: reverted by kb (not in the published wiki)" >"$OUT/05-guard.txt"
grep -q run_shell_command "$OUT/mock-requests.jsonl" && echo "shell tool offered (unexpected)" >>"$OUT/05-guard.txt" || echo "run_shell_command not offered to the model (auto_edit, headless)" >>"$OUT/05-guard.txt"
head -12 wiki/pages/features/cart.md >"$OUT/06-cart-page-head.md"
sed -i "s#$WORK#<tmp>#g; s#$REPO#<repo>#g" "$OUT"/* 2>/dev/null || true
echo "outputs: $OUT"
