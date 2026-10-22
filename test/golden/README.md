# Parity goldens (Go → TypeScript)

Generated with the legacy Go binary (`legacy-go/`, tag `go-final`) on `examples/minishop`
and the change sets in `examples/minishop-changes/`; checked by `test/parity.test.ts` and
`test/agent.test.ts`.

| file | Go command |
|---|---|
| `minishop/symbols.json` | `kb scan --json --symbols` → `symbol_list` (ids, kinds, quals, lines, signatures, hash / sig_hash / norm_hash / simhash, values, resolved refs) |
| `minishop/{routes,testids,apis}.json` | `wiki/facts/*.json` after `kb compound --llm template` (e2epilot interchange schema v1) |
| `minishop/plan-<change>.json` | `kb plan --json --dry-run` after applying each change set on top of the previous compound |
| `minishop/discover-docs.json` | `kb discover-docs --json` |
| `minishop/requirements.json`, `_conflicts.md` | `kb ingest --manifest … --kinds spec,design,adr,agent-guide,doc --llm template` + `kb compound` |

## Status (all byte-identical unless noted)

- scan: symbol ids, all four hashes (same normalization: comment-free leaf tokens, member
  bodies replaced by their signature tokens, `§` self-name normalisation, FNV-1a simhash) and refs —
  identical on minishop (214 symbols) **and on HarmonyOS-Cases (20,141 symbols, 2,267 files)**.
- facts JSON + per-platform facts pages, parity page, feature / overview / concept pages, index.md,
  llms.txt, plan.json, requirements.json, `_conflicts.md`, verdicts: identical (only
  `source_commit` / `head` differ between runs because commit SHAs differ).
- CLI `--json` outputs of `routes`, `routes --dangling`, `lint-tid` (`--pages`, `--top`), `parity`,
  `verify`, `conflicts [--all]`, `search`, `get`, `context`, `anchor`, `diff`, `plan`, `eval`,
  `hook install`: identical.

## Intentional differences

- **Extraction tuning (bench/accuracy, 2026-10):** `routes.json` is no longer byte-identical to Go.
  Every route gains a `name` field (bare type / page name), routes may carry `deeplinks` (declared
  links), and minishop gains two class-based screens: `MainActivity` (manifest activity, carries its
  intent-filter link `minishop://`) and `RootView` (SwiftUI `WindowGroup` root). Regenerated
  `routes.json` and `plan-*.json` (the new routes add feature tasks / context) with the TS kb;
  `testids.json` / `apis.json` are unchanged. New `facts/deeplinks.json` lists declared deep links.
  `test/cli.test.ts` zero-config `routes` total 18 → 20 for the same reason.

- **Upstream PR #1 (Go commit 0756e4f, agent-led business knowledge):** a concept page no longer
  gets `anchor_added` reasons for every wanted-but-missing symbol, only for symbols that were
  actually added/renamed. `plan-03-profile-route.json` loses the `concepts/shared-components`
  task (ids/priorities renumbered); regenerated with the TS kb, matching legacy-go `plan.go`.

- Grammars are WASM builds of the exact grammar sources Go linked (`grammars/VENDORED.md`);
  tree-sitter-swift's scanner lost one `fprintf(stderr, …)` OOM message (no `stderr` in
  web-tree-sitter). Parse trees are unchanged.
- Scan cache: `wiki/.kb/cache/scan.json.gz` (JSON) instead of `scan.gob.gz`; query caches keyed on
  the tree stamp + extractor fingerprint + kb version instead of the Go binary's mtime.
- `scan_stats.workers` / `duration_ms` differ (worker_threads are only used for ≥150 cache misses).
- `kb agents` rows drop the Go-only `backend_verification` / `consumer_verification` /
  `mcp_hint` / `notes` fields.
- Help output is grouped by area; `kb agents install|skills|mcp|list|hook` are aliases.
- The four skills are merged into one `codewiki` skill; `kb install` installs it.
- Error-recovery location: the tree-sitter runtime differs (go-tree-sitter 0.25 core vs
  web-tree-sitter 0.27), so for a file with a syntax error the reported `parse_failures[].line`
  can differ by a few lines (seen once on IceCubesApp, 1 of 1,1xx Swift files); symbols are identical.

## Wider sweep (zero-config, no cache)

| repo | symbols | symbol diff | routes / lint-tid / parity JSON |
|---|---|---|---|
| HarmonyOS-Cases | 20,141 | 0 | — (scan only) |
| nowinandroid | 1,748 | 0 | identical |
| IceCubesApp | 6,058 | 0 (1 parse-failure line differs) | identical |
| arkTS_universal_starter | 863 | 0 | identical |
