#!/usr/bin/env bash
# Build docs/codewiki-manual.pdf from docs/manual/manual.html with headless Chromium.
#   CHROME=/path/to/chrome docs/build-pdf.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHROME="${CHROME:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}"
IN="$HERE/manual/manual.html"
OUT="$HERE/codewiki-manual.pdf"
"$CHROME" --headless --no-sandbox --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$OUT" "file://$IN" 2>/dev/null
if command -v pdfinfo >/dev/null; then pdfinfo "$OUT" | grep -E '^(Pages|Page size)'; fi
echo "wrote $OUT"
