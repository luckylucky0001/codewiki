# Extraction accuracy: Go baseline → TypeScript kb

Benchmark: `bench/accuracy/` (16 blind-labelled repos; see README.md). Runs: `bin/run.sh` (full
pipeline: `compound --full`, `discover-docs`, `ingest`, all `--llm template`), `bin/facts.mjs`
(facts-only re-extraction for iteration), `bin/compare.mjs` (micro deltas).

## Scorer fix (applies to every number below)

`idKeys()` kept the last `.`/`#`/`:` segment only for strings without `/`, so a route `symbol` like
`android://src/.../GoldenKodeeScreen.kt#GoldenKodeeScreen` never matched by name. The fixed scorer also
emits the bare symbol name (and its last `.` segment) for ids of the form `platform://path#Name`.
The scorer also reads an optional `facts/deeplinks.json` (one entry per declared deep link,
`{platform, scheme, host, path, file}`) in addition to the per-route `deeplink` fields.

## Starting point (fixed scorer)

| metric | Go `go-final` | TS (before tuning) |
|---|---|---|
| routes recall | 51.6% (147/285) | 51.6% (147/285) |
| not_screen FP | 12.8% (11/86) | 12.8% (11/86) |
| deeplinks recall | 4.8% (5/105) | 4.8% (5/105) |
| testids recall | 55.6% (40/72) | 55.6% (40/72) |
| apis recall | 18.1% (19/105) | 18.1% (19/105) |
| claims coverage / acc(all) | 23.7% / 11.3% | 24.0% / 10.7% |

Facts are identical between Go and TS on all 16 repos; the small claims difference comes from the
ingest/claims engine (outside the extractor).

## Fix log

| # | fix | routes | FP | deeplinks | testids | apis | notes |
|---|---|---|---|---|---|---|---|
