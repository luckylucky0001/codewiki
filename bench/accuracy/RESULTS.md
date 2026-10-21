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
| 1 | Route recognisers: manifest activities (with their intent-filter links), Fragments instantiated outside themselves (not pager-adapter pages), Circuit `Screen` classes (supertype chain + circuit import), Appyx `@ContributesNode` leaf nodes, AppKit `NSWindowController`s, ArkTS `@…Rout…({name})` decorators, SwiftUI destinations (`sheet`/`fullScreenCover`/`popover`/`navigationDestination` closures, any `destination:` / `rootView:` argument, `WindowGroup`, TCA `enum Destination/Path` cases → `<Feature>View`); typed/Nav3 `composable<T>`/`entry<T>` routes use `route_id = T` (symbol falls back to the route class); every route gets `name`. Declared deep links: ACTION_VIEW intent-filters (scheme×host×path, http/https included), every `*Info*.plist` `CFBundleURLSchemes`, `applinks:` entitlements, `module.json5` `skills.uris` (https included), nav-graph `<deepLink>`, URL route tables (`"/path/:id": handler`) → `facts/deeplinks.json` + per-route `deeplinks`. `<scheme>://<pattern>` is now derived only when the platform declares exactly one app scheme and never for class-named screens. | 147→274 | 11→14 | 5→90 | 40 | 19 | Biggest single jump; the per-recogniser rules are generic, but each was written while looking at the benchmark repos (over-fit risk: the Fragment "instantiated elsewhere" rule and the TCA `<Feature>View` naming convention). |
| 2 | UIKit precision: a VC held in a stored property of a window / split-view controller is a pane; `…PreviewViewController` joins the child-name heuristic (only applied when nothing navigates to the VC). Tried and rejected: "require an inbound push/present edge" (FP 14→7 but routes −44: coordinators/factories hide most edges). | 274 | 14→11 | 90 | 40 | 19 | Name heuristic = last resort, documented. |
| 3 | Appyx: once leaf nodes are recognised, flow-level `NavTarget`s (placeholders/loading/sub-flows) are no longer routes; Fragments created where the child fragment manager is used (directly or in the same-class helper they are passed to) are embedded children. | 274 | 11→6 | 90 | 40 | 19 | element-x routes 320→~150 (NavTarget routes dropped). |
