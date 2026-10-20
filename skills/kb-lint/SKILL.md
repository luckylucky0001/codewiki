---
name: kb-lint
description: Lint and gate the codewiki LLM Wiki, outdated docs and cross-platform consistency - `kb conflicts` (which docs/specs contradict the code, with file:line, evidence and fix), `kb verify` (anchors match HEAD, no unknown symbols, no dead links or orphan pages, index complete, generated facts fresh), `kb verify --fix-index`, `kb lint-tid` (testID coverage per route and platform across Android, iOS and HarmonyOS) and `kb parity` (missing routes/APIs, constants that differ across platforms). Use in CI, before merging, after manual wiki edits, or when asked whether testIDs/pages are consistent across platforms.
---

# kb-lint

## Commands

```bash
kb verify --json            # CI gate; exit 1 on any error
kb verify --fix-index       # regenerate index.md/llms.txt (only deterministic fix)
kb lint-tid                 # matrix route × tid × platform; --strict exits 1 on gaps
kb status                   # stale pages only
kb parity --json            # feature × platform gaps + constants that differ across platforms
```

`kb verify` exits 1 on failure — run it once and read the JSON `errors` array instead of
re-running it. A passing verify does not mean the docs agree with the code: read
`kb conflicts` / `pages/_conflicts.md` (document claims vs code) and `kb parity` (platform drift) as well.

## Error codes (`kb verify`)

| code | meaning | fix |
|---|---|---|
| E_ANCHOR_STALE | anchored symbol body changed | `kb compound` (re-writes affected pages) |
| E_ANCHOR_MISSING | anchored symbol deleted/renamed | `kb compound` |
| E_SYMBOL_UNKNOWN | page body mentions a non-existent symbol id | rewrite page via `kb compound` |
| E_DEAD_LINK | relative link target missing | fix link in page |
| E_INDEX_COVERAGE / E_ORPHAN | page not in / not reachable from index.md | `kb verify --fix-index` |
| E_FACTS_STALE | facts/ differ from current extraction | `kb compound` |
| E_REQ_ANCHOR_STALE | requirements.json anchors stale | `kb compound` / `kb ingest` |
| E_FRONTMATTER | id/title/status invalid | fix frontmatter |

Never silence errors by editing hashes by hand — that defeats the guarantee that knowledge
matches code. Use `kb compound`, which rewrites pages from current code within a write set.

## testID lint

`kb lint-tid` builds the union of testIDs per route across platforms and flags ✗ where a
platform implements the route but lacks the testID. Shared component IDs (e.g. `nav_back`)
are reported under `(shared)` and count for every route.
