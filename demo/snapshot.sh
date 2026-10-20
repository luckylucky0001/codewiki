#!/usr/bin/env bash
# Copy a demo/output/<run> directory into demo/sample-output/<name> (without the
# temp repo's sources/.git and the large graph snapshot) for committing.
#   demo/snapshot.sh demo/output/<ts>-template template
set -euo pipefail
SRC="${1:?usage: snapshot.sh <demo/output/run> <name>}"
NAME="${2:?name}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DST="$HERE/sample-output/$NAME"
rm -rf "$DST"; mkdir -p "$DST"
for f in "$SRC"/*; do [ -f "$f" ] && cp "$f" "$DST/"; done
rm -f "$DST"/*.exit
find "$DST" -maxdepth 1 -name '*.stderr' -empty -delete
cp -R "$SRC/repo/wiki" "$DST/wiki"
rm -f "$DST/wiki/.kb/graph.json" "$DST/wiki/.kb/graph.json.gz"
cp "$SRC/repo/codewiki.yaml" "$DST/"
ABS="$(cd "$SRC" && pwd)"
grep -rl "$ABS" "$DST" | while read -r f; do sed -i "s#$ABS#demo/output/<run>#g" "$f"; done
echo "snapshot: $DST ($(du -sh "$DST" | cut -f1))"
