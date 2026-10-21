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
| 4 | API path composition (per leaf function body): Swift `appendingPathComponent` chains over a URL-ish base (not a directory), `additionalPathComponents: [...]`, `(.METHOD, "path")` tuples in route enums, `String.format("%s/api/…")` next to URL/URI/Request construction, template literals `${base…}/path`, Ktor `client.get { helper("path") }`, relative client paths (`client.get("shows/anticipated")`), absolute-URL constants referenced where a request is issued. Method from the same body (`.post(`, `method: .PUT`, `HTTPMethod.x`, `post…(` helpers) or, for an endpoint helper, from the functions in the file that call it; GET otherwise. Precision guards: file-system bases, `.db/.sqlite/.plist/.html/.md/.xml` paths and XML-namespace URLs are skipped. | 274 | 6 | 90 | 40 | 19→85 | Must-not hits stay 0. Unlabelled extractions grew (e.g. NextE 0→58, mastodon 0→96); spot checks show mostly real endpoints plus some downloads (model files, torrents) and a test fixture store. Over-fit risk: the URL-ish base keyword list. |
| 5 | testIDs: constants initialised through a one-string wrapper (`val x = TestTag("…")`) resolved at `testTag(TestTags.x)`; assignments `view.accessibilityIdentifier = Const.x` (Swift) and `testTag = …` (Compose semantics); dynamic ids with an empty literal prefix keep their template (`{tagPrefix}_carousel`); Android `android:id` declarations in `res/layout*` that a test source references as `R.id.x` (Espresso). | 274 | 6 | 90 | 40→69 | 85 | No new extractions in the 8 repos without testIDs (still 1, compose-samples). The `R.id` rule only fires for ids that tests use, so apps without instrumentation tests get no resource ids. |
| 6 | Deep links handled in code: Compose `uriPattern = "…"` (constants resolved) and Swift host dispatch (`switch url.host { case "post": … }`, `"theme" == comps.host`) in files that receive system URLs (scene/app delegate, `onOpenURL`, deep-link handlers); scheme from a nearby `scheme == "x"` test or the platform's only custom scheme. Android `pathPattern` backslash unescaping. | 274 | 6 | 90→97 | 69 | 85 | Remaining 8 misses are Wikipedia's Objective-C `NSUserActivity+WMFExtensions.m` (kb parses no Objective-C). |
| 7 | More screen evidence: SwiftUI `NavigationStack`/`NavigationView`/`Tab` roots and `X().tabItem`, `rootView:` locals (`let v = AddAccountView(…)` pushed in a `UIHostingController`), destination-builder functions (`-> some View` switching over ≥2 enum cases that map to app views), `Preview` only excluded as a name suffix / preview directory (not any path containing "Preview"); the `…Screen` composable an Activity passes to `setContent`. | 274→281 | 6 | 97 | 69 | 85 | |
| 8 | swift-url-routing parser DSL (files importing `URLRouting`): `Route(.case(…)) { Method.x; Path { "a"; "b" } }` nested through `OneOf` and router variables / properties mounted inside a parent Route; leaf routes emit the concatenated path and the nearest declared method. | 281 | 6 | 97 | 69 | 85→97 | The benchmark's "deliberately hard" isowords sample (12/12). Library-specific but not repo-specific. |
| — | Determinism (coordinator report: Cases testids.json rewritten by the first warm run): could not reproduce with the current code (cold/warm scan cache and cold/incremental compound give identical facts). Root cause candidate fixed: the extractor fingerprint, which keys the facts query cache, did not cover `src/facts`, so facts computed by older facts code could be served/replaced after an upgrade. Test `test/facts/determinism.test.ts` asserts identical facts for cold scan, reloaded cache and worker threads. | | | | | | |
| 9 | `URLComponents` `x.path = "/…"` assignments; absolute URL literals (incl. `"https://host/lookup?id=" + id`) in bodies that run a network client call (OkHttp/URLSession/HttpClient/…); paths with whitespace or unresolved interpolation dropped. | 281 | 6 | 97 | 69 | 97→101 | First attempt (any body mentioning "request"/"url") also picked up help pages and store links; tightened to network-client bodies before committing. |

## Final: Go baseline → TS (all fixes), fixed scorer

Final run: `bin/run.sh` full pipeline on all 16 repos (kb snapshot of `c8ac019`; the snapshot also
contained the concurrent agent's uncommitted cli/engine edits, which do not touch facts). All 16 runs
exited 0 and every clone stayed clean.

| metric | Go `go-final` | TS final | Δ |
|---|---|---|---|
| routes recall (micro) | 51.6% (147/285) | **98.6% (281/285)** | +134 |
| routes recall (macro) | 53.5% | 98.4% | |
| not_screen FP rate | 12.8% (11/86) | **7.0% (6/86)** | −5 |
| deeplinks recall | 4.8% (5/105) | **92.4% (97/105)** | +92 |
| testids recall | 55.6% (40/72) | **95.8% (69/72)** | +29 |
| testIDs extracted in the 8 repos without testIDs | 1 | 1 | 0 |
| apis recall | 18.1% (19/105) | **96.2% (101/105)** | +82 |
| API must-not hits | 0 | 0 | 0 |
| claims coverage / acc(all) | 23.7% / 11.3% | 23.7% / 11.3% | (claims engine not in scope) |
| conflict recall | 0/18 | 0/18 | |

### Per repo (hits Go → **TS** / expected)

| repo | routes | not_screen FP | deeplinks | testids | apis |
|---|---|---|---|---|---|
| AntennaPod/AntennaPod | 0→**26**/26 | 0→1/6 | 0→**9**/9 | 0→**9**/10 | 0→**10**/10 |
| FishPiOffical/fishpi-harmony | 10→**10**/11 | 0→0/6 | n/a | n/a | 11→**11**/11 |
| HarmonyOS-Cases/Cases | 9→**29**/29 | 0→0/6 | n/a | 11→**11**/11 | 1→**2**/3 |
| JetBrains/kotlinconf-app | 16→**24**/24 | 0→0/5 | n/a | n/a | 0→**10**/10 |
| Ranchero-Software/NetNewsWire | 13→**23**/23 | 5→2/7 | 2→**8**/8 | n/a | 0→**10**/10 |
| android/compose-samples | 13→**14**/16 | 0→0/5 | 0→**3**/3 | n/a | n/a |
| android/sunflower | 3→**4**/4 | 0→0/6 | n/a | 1→**1**/1 | 1→**1**/1 |
| chrisbanes/tivi | 0→**19**/19 | 0→0/6 | 0→**2**/2 | 7→**9**/9 | 0→**1**/1 |
| element-hq/element-x-android | 0→**19**/19 | 3→0/3 | 1→**9**/9 | 0→**9**/10 | 2→**2**/2 |
| erosTeam/NextE | 22→**22**/22 | 0→0/3 | 0→**4**/4 | 10→**10**/10 | 0→**7**/9 |
| kickstarter/ios-oss | 22→**22**/23 | 1→1/5 | 0→**47**/47 | n/a | 0→**12**/12 |
| mastodon/mastodon-ios | 16→**21**/21 | 1→1/6 | 2→**7**/7 | n/a | 0→**10**/10 |
| android/nowinandroid | 5→**6**/6 | 0→0/6 | 0→**1**/1 | 11→**11**/11 | 4→**4**/4 |
| pointfreeco/isowords | 0→**21**/21 | 0→0/5 | 0→**3**/3 | n/a | 0→**12**/12 |
| touchlab/KaMPKit | 0→**3**/3 | 0→0/7 | n/a | n/a | 0→**1**/1 |
| wikimedia/wikipedia-ios | 18→**18**/18 | 1→1/4 | 0→**4**/12 | 0→**9**/10 | 0→**8**/9 |

### Extraction volume and time (TS before tuning → final)

| repo | compound time | routes | testids | apis | declared deeplinks |
|---|---|---|---|---|---|
| AntennaPod | 9s → 11s | 0→59 | 0→56 | 0→15 | 15 |
| fishpi-harmony | 4s → 5s | 11→11 | 0→0 | 52→52 | 0 |
| HarmonyOS-Cases | 11s → 16s | 34→199 | 1413→1415 | 1→4 | 1 |
| kotlinconf-app | 7s → 7s | 25→27 | 0 | 0→10 | 0 |
| NetNewsWire | 8s → 12s | 29→64 | 0 | 8→37 | 8 |
| compose-samples | 3s → 7s | 30→32 | 1→1 | 0→0 | 5 |
| sunflower | 2s → 4s | 3→4 | 1→1 | 1→1 | 0 |
| tivi | 5s → 11s | 0→21 | 7→9 | 0→1 | 2 |
| element-x-android | 24s → 39s | 176→145 | 0→29 | 2→3 | 9 |
| NextE | 18s → 24s | 58→58 | 630→632 | 0→58 | 4 |
| kickstarter ios-oss | 18s → 22s | 120→136 | 0 | 0→58 | 52 |
| mastodon-ios | 8s → 10s | 31→97 | 0 | 0→96 | 7 |
| nowinandroid | 2s → 3s | 5→6 | 14→14 | 4→4 | 1 |
| isowords | 5s → 8s | 0→32 | 0 | 0→26 | 5 |
| KaMPKit | 3s → 4s | 0→3 | 0 | 0→2 | 0 |
| wikipedia-ios | 12s → 22s | 146→189 | 28→89 | 0→15 | 12 |

Scan time is unchanged. Facts extraction alone went from about 0.2 s to 0.3–0.4 s on Cases (`bin/facts.mjs`).
Most of the compound increase comes from the extra feature pages for the new routes (Cases: 34 → 199
routes). The concurrent v2 hierarchy work landed in the same window, so part of the increase may also
come from that work.

## Remaining misses by cause

| cause | misses |
|---|---|
| Objective-C sources are not parsed (Wikipedia `NSUserActivity+WMFExtensions.m` host dispatch) | 8 deeplinks |
| Compose string-concatenated routes: Jetsnack `"$SNACK_DETAIL_ROUTE/{snackId}?origin={origin}"` and a duplicate `home` | 2 routes |
| `main_pages.json` page that hosts a `Navigation` container: fishpi `pages/Index`. Kept deliberately (Go also skips shell pages; see minishop). | 1 route |
| kickstarter `RootTabBarViewController` (a UITabBarController subclass, excluded as a container) | 1 route |
| NextE `favorites.php`/`archiver.php`: URL built by string concatenation or a query builder, not a template literal | 2 APIs |
| Cases: a `.png` fetched over HTTP (filtered as a static asset); MediaWiki `/w/api.php` (a path constant joined elsewhere) | 2 APIs |
| testIDs: element `login-email_username`, wikipedia `profile-button`, one AntennaPod resource id | 3 testids |
| not_screen FPs: AntennaPod `NavDrawerFragment` (single-fragment container); NNW `WebViewController` (page VC child) and `DetailWebViewController`; kickstarter `BackerDashboardProjectsViewController` (pager page); mastodon `AutoCompleteViewController` (view added as a subview); wikipedia `ArticlePeekPreviewViewController` (has a resolvable present edge) | 6 FPs |
| Claims / conflicts: unchanged. Claim extraction and verification live in `src/engine/claims.ts`, which is outside this task's scope. | 122/160 claims unmatched, 0/18 conflicts |

## Over-fitting caveats

* Every rule was written while looking at these 16 repos and their misses, so the final numbers are
  **training-set** numbers. A fresh blind sample is needed before the ~95% figures can be claimed in general.
* Name heuristics, used as the last resort and documented in code:
  * `…PreviewViewController` child-name suffix
  * Appyx NavTargets dropped when `@ContributesNode` leaves exist
  * the TCA `<Feature>View` / `<Feature minus Reducer|Feature|Core>View` naming convention
  * `…Screen` for activity `setContent` roots
  * the URL-ish base keyword list (`url|endpoint|base|api|host|server`) for path-component chains
* Library-specific recognisers:
  * swift-url-routing DSL
  * Circuit (`Screen` plus a circuit import)
  * Appyx `@ContributesNode`
  * ArkTS route decorators matched by `@…Rout…({name})`

  Each is generic for its library, but the benchmark has only one repo per library.
* Fragment routes need an instantiation outside the fragment (not in an adapter and not under a child
  fragment manager). An app that navigates purely by reflection or by the navigation component without
  a nav graph would lose them.
* API precision is only measured through must-not labels (0 hits). Unlabelled API extractions grew
  substantially:
  * mastodon 0→96
  * NextE 0→58
  * kickstarter 0→58

  Spot checks show mostly real endpoints, plus some downloads (model files, torrents) and one test
  fixture store.
* Deep-link recall benefits from scorer leniency for `route-pattern` labels: a path-only fact matches
  any scheme/host. kickstarter's 47 hits come from the URL route table.
* `route_id` for typed/Nav3 routes changed to the route type name (`GoldenKodeeScreen`). The old
  snake_case id survives as `pattern`. Consumers that keyed on the old ids must adapt.

## Interface changes (schema-compatible additions)

* Every `routes.json` entry gains `name` (the bare type or page name). Routes may also carry
  `deeplinks: [..]`, which holds the declared links of that screen.
* New `facts/deeplinks.json`, written only when non-empty: `{version: 1, deeplinks: [{platform, scheme,
  host, path, file, source, route_id?}]}`. `source` is one of:
  * `intent-filter`
  * `CFBundleURLSchemes`
  * `applinks`
  * `skills.uris`
  * `nav-graph`
  * `route-table`
  * `uriPattern`
  * `url-host-dispatch`
* `deeplink` on a route is either a declared link, or `<scheme>://<pattern>` when the platform declares
  exactly one app scheme. Class-named screens never get a derived link.
* The extractor fingerprint now covers `src/facts`, so facts query caches and scan caches are
  invalidated whenever the facts code changes.

## Claims round (src/engine/claims.ts, src/engine/valuecheck.ts)

**Method.** Each label's `text` is matched to the `requirements.json` claims (similarity ≥ 0.35).
Numbers come from the template checker, with no LLM involved.

**How the final numbers were produced.** `bin/claims.mjs` re-extracts and re-checks claims on the
`run.sh` outputs, using a clean build of HEAD `209ef45`. A full `run.sh` pipeline at `23cd73d` gave
the same coverage and 56.9% / 8 conflicts, which shows the fast runner matches `kb ingest`.

| metric | Go / TS before | TS claims round | Δ |
|---|---|---|---|
| claim coverage (labels matched) | 23.7% (38/160) | **73.8% (118/160)** | +80 |
| accuracy on matched | 47.4% | **81.4%** | |
| accuracy overall (unmatched counted wrong) | 11.3% | **60.0%** | |
| conflict recall | 0/18 | **9/18** | +9 |
| verified → conflict (false conflicts on labelled claims) | 0 | 1 | NNW: a broken `rss-in-json/README.md` link in a sentence labelled verified |

Confusion on matched claims:
* verified→verified: 85
* verified→unverifiable: 12
* conflict→conflict: 9
* conflict→verified: 7
* unverifiable→unverifiable: 2
* unverifiable→verified: 2
* verified→conflict: 1

**Guards:**
* `kb eval` on `examples/minishop-eval/golden.yaml`: 0.97 → 0.97.
* `kb eval` on the held-out set `examples/minishop-eval/heldout/golden-heldout.yaml`: 0.81 → 0.81.
* No status changes on either set.
* Minishop goldens (`requirements.json`, `_conflicts.md`) are unchanged.
* axios (`/home/user/axios`, read-only, 160 markdown docs):
  * claims 600 → 2,719
  * conflicts 0 → **0**
  * verified 326 → 1,629

**Per repo.** Columns: matched / labelled, accuracy overall, conflict recall, extracted claims.

| repo | matched | acc(all) | conflicts | claims extracted |
|---|---|---|---|---|
| AntennaPod | 10/10 | 90% | n/a | 135 |
| fishpi-harmony | 2/10 | 20% | 1/1 | 3 |
| HarmonyOS-Cases | 9/10 | 60% | 0/3 | 4769 |
| kotlinconf-app | 6/10 | 50% | n/a | 62 |
| NetNewsWire | 9/10 | 80% | n/a | 92 |
| compose-samples | 10/10 | 80% | 1/3 | 129 |
| sunflower | 3/10 | 30% | n/a | 23 |
| tivi | 8/10 | 50% | n/a | 23 |
| element-x-android | 9/10 | 60% | 1/1 | 574 |
| NextE | 9/10 | 70% | 0/1 | 3712 |
| kickstarter ios-oss | 7/10 | 50% | 2/4 | 34 |
| mastodon-ios | 2/10 | 20% | 0/1 | 44 |
| nowinandroid | 8/10 | 60% | 1/1 | 142 |
| isowords | 7/10 | 50% | 1/1 | 44 |
| KaMPKit | 10/10 | 100% | n/a | 200 |
| wikipedia-ios | 9/10 | 90% | 2/2 | 438 |

### What changed

**Extraction.** Ordinary prose in READMEs, agent guides (AGENTS/CLAUDE/…) and `docs/` becomes
`style: prose` claims. Specs, ADRs, plans, archives and changelogs are excluded. The rules:
* Wrapped paragraphs are joined, then split into sentences.
* A sentence is kept only when it names something checkable:
  * a link, backticks or a path
  * a CamelCase identifier
  * a count of modules, targets, screenshots, screens or stores
  * "uses / heavy use of / built on X"
  * a command (`./gradlew`, `make`, `bash x.sh`)
  * a "Name – purpose" list item
* List items take their list's lead-in. Bare lead-ins are dropped.
* The existing styles (spec-kit, Kiro, EARS, MUST, statement) and their ids are unchanged.

**Checks (`proseRules` in valuecheck.ts).** Conflicts require hard evidence:
* **Stale paths.** These must exist; a missing one is a conflict:
  * relative markdown links (resolved from the doc; a path that exists elsewhere in the repo still counts)
  * own-repo GitHub `blob|tree/<branch>/path` links
  * plain multi-segment paths whose first directory exists at the root
  * backticked Xcode breadcrumbs (`Sources > WMFData > Services`)
* **Never stale:**
  * pinned commit or tag links (they may still verify)
  * absolute or `~` paths, build outputs, gitignored files
  * placeholders (`foo`, `your-…`, `vX.Y.Z`, `path.test.js`)
  * files the reader is told to create, copy or add
* **Counts.** "N modules/targets" is compared with SwiftPM targets (all and non-test), Gradle includes and HarmonyOS `build-profile` modules. "N screenshots" is compared with snapshot PNGs. A count must match exactly, or within ±20% when qualified ("nearly", "about"). "N stores:" followed by a list is checked against the sibling `*Store` properties of the type that declares the listed names; it is a conflict only if every candidate type disagrees.
* **Dependencies.**
  * A library-repo link or "heavy use of / depends on / relies on X" is a conflict when X is absent from build/lock files, imports and file names.
  * "uses X", "X – purpose" and "X is a … library" only ever verify.
  * A stop list covers languages, platforms and architecture words (MVVM, Node.js, …).
* **"Never use `a.b.C`".** Conflict when a file still imports it, verified otherwise.
* **Verify-only evidence:**
  * Makefile targets
  * `./gradlew :module` directories
  * Gradle module paths (`:ui:i18n`)
  * identifiers found in code: CamelCase, UPPER_SNAKE, dotted members, annotations
* **Prose never conflicts on:**
  * the old missing-name rules (`X does not exist`)
  * the quantity, constant and behaviour rules
  * a bare file name without a directory

  Descriptive prose names things too loosely for these rules.

### Remaining claim misses

* **Docs not discovered (engine `discover-docs`, not in this round's scope):**
  * mastodon `Documentation/How-it-works.md` and `Setup.md`: 8 labels
  * fishpi's Chinese feature bullets
* **Semantic conflicts no deterministic rule can see:**
  * Cases: `harInit` replaced by `@AppRouter`; a decorator in a different file
  * compose-samples: `MainActivity` without WindowSizeClass; Jetsurvey (link to a PR)
  * NextE: feature dependency rule
  * mastodon: AutoLayout → SwiftUI
* **Sentence split.** The kickstarter `Library/ViewModels` stale link is detected, but it lands in the sentence after the one the label matches.
* **Unverifiable stays unverifiable.** About 12 verified labels hold product or external facts (Play Store link, Trakt.tv, EditorConfig wrap width) with no code anchor.

### Over-fitting and noise

* As in the extraction round, the rules were written while looking at these labels.
  * The held-out minishop set and axios moved by 0 statuses and 0 conflicts. That is the only out-of-sample evidence.
  * The coordinator's new blind repos are the real test.
* **Volume.** Prose claims multiply `requirements.json`: Cases 180 → 4,769, NextE 3,351 → 3,712, axios 600 → 2,719. `_conflicts.md` stays capped by its row limits.
  * Conflicts emitted over all 16 repos: about 70. Spot checks: most are genuinely broken doc links or paths, e.g. Cases `../feature/imageviewer/...ImageContentView.ets`, `app/src/main/baseline-prof.txt`, `Localizable.xcstrings`. A few are debatable (a link that is broken while the sentence itself is true).
* **Heuristic word lists:**
  * placeholder names
  * dependency stop words
  * the "create / copy / add" context that suppresses stale-path conflicts
