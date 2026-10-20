#!/usr/bin/env bash
# Real Codex CLI + mock model: end-to-end `kb compound --agent codex` / `kb ingest --agent codex`.
#
#   CODEX_BIN=/path/to/codex demo/codex-mock-demo.sh     # default: codex on PATH
#
# REAL: codex binary (exec, config, custom provider, workspace-write sandbox, exec_command tool,
#       --json event stream), kb (prompt, untrusted-data wrapping, write-set guard, post-processing,
#       verify, publish, usage parsing). MOCKED: only the model (demo/mock-model/mock_openai_responses.py
#       scripts its turns: write the task's write set + one file outside it, then say "done").
# Needs: go, git, python3, jq, codex. No network, no API key.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
CODEX="${CODEX_BIN:-$(command -v codex || true)}"
[ -n "$CODEX" ] || { echo "codex CLI not found (set CODEX_BIN)" >&2; exit 2; }
OUT="${DEMO_OUT:-$ROOT/demo/output/$(date -u +%Y%m%dT%H%M%SZ)-codex-mock}"
PORT="${MOCK_PORT:-18799}"
WORK="$(mktemp -d)"
cleanup() { [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null || true; rm -rf "$WORK"; }
trap cleanup EXIT
mkdir -p "$OUT" "$WORK/bin" "$WORK/codex-home"
( cd "$ROOT" && CGO_CFLAGS="${CGO_CFLAGS:--O2 -w}" go build -o "$WORK/bin/kb" ./cmd/kb )
ln -s "$CODEX" "$WORK/bin/codex"
export PATH="$WORK/bin:$PATH" CODEX_HOME="$WORK/codex-home" NO_PROXY="127.0.0.1,localhost" no_proxy="127.0.0.1,localhost"
cat >"$CODEX_HOME/config.toml" <<TOML
model = "mock-model"
model_provider = "mock"
[model_providers.mock]
name = "mock"
base_url = "http://127.0.0.1:$PORT/v1"
wire_api = "responses"
supports_websockets = false
request_max_retries = 0
stream_max_retries = 0
TOML
python3 -I "$HERE/mock-model/mock_openai_responses.py" "$PORT" "$OUT/mock-requests.jsonl" & MOCK_PID=$!
sleep 1

REPO="$WORK/minishop"; cp -r "$ROOT/examples/minishop" "$REPO"; cd "$REPO"
g() { git -c user.name=demo -c user.email=demo@codewiki.local "$@"; }
g init -q -b master && g add -A && g commit -qm init
kb init >/dev/null 2>&1 && kb compound >/dev/null 2>&1 && g add -A && g commit -qm "wiki (template)"
cp -r "$ROOT/examples/minishop-changes/01-cart-limit/files/." . && g add -A && g commit -qm "change: cart limit"

{ echo "codex: $("$CODEX" --version)"; echo "backend command: $(kb agents codex)"; } >"$OUT/00-versions.txt"
set +e
kb compound --agent codex --keep-work >"$OUT/01-compound-agent-codex.txt" 2>"$OUT/01-compound-agent-codex.stderr"; echo "exit $?" >>"$OUT/01-compound-agent-codex.txt"
kb compound --agent codex --keep-work --json 2>/dev/null >/dev/null   # noop rerun (nothing changed)
kb ingest docs/legacy/cart.md --agent codex >"$OUT/02-ingest-agent-codex.txt" 2>"$OUT/02-ingest-agent-codex.stderr"; echo "exit $?" >>"$OUT/02-ingest-agent-codex.txt"
kb verify >"$OUT/03-verify.txt" 2>&1
set -e
# one real codex --json event stream (task log) and what the guard did
LOG="$(ls -1 .kb-work/*/tasks/*.log | head -1)"
cp "$LOG" "$OUT/04-codex-exec-json-events.jsonl"
test ! -e wiki/pages/evil-codex.md && echo "pages/evil-codex.md: reverted by kb (not in the published wiki)" >"$OUT/05-guard.txt"
head -12 wiki/pages/features/cart.md >"$OUT/06-cart-page-head.md"
sed -i "s#$WORK#<tmp>#g; s#$REPO#<repo>#g" "$OUT"/* 2>/dev/null || true
echo "outputs: $OUT"
