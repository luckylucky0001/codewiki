# Held-out v3 (final generalization, 4 repos): A (Go) vs C (TS 57f023f)

Run 2026-10-21 20:04 UTC. No tuning was done and no one was messaged.

**Set**: `scratchpad/heldout3/`:
- Ashinch/ReadYou (Android, Navigation 3)
- Dimillian/MovieSwiftUI (iOS SwiftUI)
- razaghimahdi/Shopping-By-KMP (Compose Multiplatform)
- seasonZhu/HarmonyStudy (HarmonyOS)

These do not overlap with training, heldout2, or the exclusion list. C is fully blind on this set: heldout2 informed C, but this set did not.

**Versions**:
- **A** is `scratchpad/kb-go` (kb 0.1.0, /home/user/codewiki `36417a4`, assumed).
- **C** is `ts-snap-c` @ `57f023f7b39f198b7376f0e84dea789bf4b05ebf`. It is the same snapshot used for the heldout2 version C.

**Protocol**: `runx.sh heldout3 <A|C> <label>`. The config comes from `bench/accuracy/bin/mkcfg.mjs` (wiki outside the clone; platform roots from labels). Each run is `kb compound --llm template --full` followed by `kb verify`.
- All 8 compound runs exited 0.
- **`kb verify` PASS 8/8** (0 errors, at most 1 warning).
- After the runs, the clones are clean (`git status --porcelain --ignored` is empty).

**Scorers**: The headline scorer is `heldout3/score-harmonized.mjs`, which is identical to heldout2-runs/score-harmonized.mjs. The official `score.mjs` is shown in brackets where it differs.

## Summary (micro recall)

| metric | A | C | C − A | C on heldout2 (not blind) | B on heldout2 (blind) | TS train |
|---|---|---|---|---|---|---|
| routes | 42.2% (27/64) [off. 35.9% 23/64] | **48.4%** (31/64) | +6.2 pp | 90.9% | 85.3% | 98.6% |
| not_screen FP | 0.0% (0/15) | **13.3%** (2/15) | +13.3 pp | 8.2% | 12.2% | 7.0% |
| deeplinks | n/a (0 required; optional 0/2) | n/a (0 required; optional 2/2) | | 100% | 100% | 92.4% |
| testids | 100% (1/1) | 100% (1/1) | 0 | 94.6% | 59.5% | 95.8% |
| apis | 16.7% (11/66) | **19.7%** (13/66) | +3.0 pp | 35.7% | 33.3% | 96.2% |
| must-not hits (ReadYou Retrofit `@Url`) | 0 | 0 | | | | |
| extractions in 0-label categories | 0 | 0 scored; 5 deep links in ReadYou (\* below) | | | | |

\* ReadYou's only links are optional MIME `http/https host=*`. C matches both optional labels and emits 5 entries in total. The official scorer counts 3.

**Deep links and testIDs cannot be measured on this set.** It has 0 required deep links (2 optional) and 1 testID (HarmonyStudy `.id()`). Only routes, APIs and false positives are informative here.

## Per-repo (harmonized; A / C; hit/required, or -(extracted) when 0 are required)

| repo | routes A / C | fp A / C | deeplinks A / C | testids A / C | apis A / C |
|---|---|---|---|---|---|
| Ashinch/ReadYou | 0/16 / 0/16 | 0/3 / 0/3 | -(0) / -(5) | -(0) / -(0) | 0/12 / 2/12 |
| Dimillian/MovieSwiftUI | 7/14 / 11/14 | 0/4 / 2/4 | -(0) / -(0) | -(0) / -(0) | 11/20 / 11/20 |
| razaghimahdi/Shopping-By-KMP | 18/18 / 18/18 | 0/4 / 0/4 | -(0) / -(0) | -(0) / -(0) | 0/20 / 0/20 |
| seasonZhu/HarmonyStudy | 2/16 / 2/16 | 0/4 / 0/4 | -(0) / -(0) | 1/1 / 1/1 | 0/14 / 0/14 |

## Miss causes for C (categories and counts)
- **Routes, 33 missed**:
  - Navigation 3 `sealed interface Route : NavKey` with `NavEntry` in `AppEntry.kt` was not recognised (ReadYou): 16. Only 2 optional items were found there.
  - HarmonyOS `main_pages.json` entries were not emitted (HarmonyStudy): 14. Only 3 pages were extracted, all of them named-route or `@Entry(routeName)` pages: index, observed_v2_test_page and splash. The config root `entry` is correct. The same idiom worked for FinVideo/OpenEye on heldout2, so this looks like the main_pages path being suppressed or overridden when named routes exist.
  - SwiftUI tab roots and sheet forms not reached from TabbarView or `.sheet` (MovieSwiftUI): 3 (DiscoverView, FanClubHome, MyLists).
- **False positives, 2**: SwiftUI row or menu components taken as screens (MovieSwiftUI MovieCrosslineRow, BottomMenu).
- **APIs, 53 missed**:
  - Ktor client calls in the KMP repo (Shopping-By-KMP): 20. Nothing was extracted.
  - HarmonyStudy HTTP wrapper: 14. Nothing was extracted.
  - OkHttp `"$serverUrl$query?..."` string templates (ReadYou GoogleReader): 10.
  - `enum Endpoint.path()` paths built with string interpolation, then `appendingPathComponent` (MovieSwiftUI): 9. The 11 literal paths were found.

## Reading
- On fresh repos, C is close to A in routes and APIs: +6 pp and +3 pp.
- C is far below its heldout2 numbers: routes −42 pp and APIs −16 pp versus heldout2 C. This confirms that heldout2 C overstates generalization.
- Most of the remaining loss comes from whole idioms the extractor does not handle, each costing one repo's entire category: Navigation 3, Ktor, the ArkTS HTTP wrapper, and main_pages being suppressed next to named routes.
- With only 4 repos, a single idiom swings the result. Treat these numbers as a coarse estimate.

## Files (in this dir)
`runx.sh`, `tablen.mjs`, `heldout3-runs-{A,C}/<repo>/{codewiki.yaml,run.log,verify.log,wiki/facts}`, `h3-score{,H}-{A,C}.{json,txt}`.

---

# Version D: final kb (round 2), heldout3. BLIND

- **D** is `ts-snap-d` @ **`12d1ef68263ab6896157cbaeda70dfd7c06d05cf`**. It is a fresh `git clone -b ts-rewrite /home/user/codewiki-ts`, built with `npm ci --ignore-scripts && npm run build`. It is 2 commits past C: `05aa1b3`, the round-2 API generalisation, and `12d1ef6`, docs.
- **BLIND.** The round-2 rules came only from heldout2 categories. This set was not used for any rule.
- Protocol: `runx.sh heldout3 D <label>`, run 20:10 UTC. It is the same as for A and C.
- All 4 compound runs exited 0 (2–14 s).
- **`kb verify` PASS 4/4** with 0 errors. MovieSwiftUI and HarmonyStudy have 1 warning each.
- All 4 clones are clean (`dirty: 0`, `--ignored`).
- Scorers: the headline is `score-harmonized.mjs`. The official `score.mjs` gives the same micro numbers for D.

## Summary (micro recall, harmonized)

| metric | A | C | D (blind) | D − C | D − A | D on heldout2 (not blind) |
|---|---|---|---|---|---|---|
| routes | 42.2% (27/64) [off. 35.9%] | 48.4% (31/64) | **48.4%** (31/64) | 0 | +6.2 pp | 90.9% |
| not_screen FP | 0.0% (0/15) | 13.3% (2/15) | **13.3%** (2/15) | 0 | +13.3 pp | 8.2% |
| deeplinks | n/a (0 req; opt 0/2) | n/a (opt 2/2) | n/a (opt 2/2) | | | 100% |
| testids | 100% (1/1) | 100% (1/1) | 100% (1/1) | 0 | 0 | 94.6% |
| apis | 16.7% (11/66) | 19.7% (13/66) | **19.7%** (13/66) | **0** | +3.0 pp | 38.1% |
| must-not hits | 0 | 0 | 0 | | | |

## Per-repo (harmonized; A / C / D)

| repo | routes A / C / D | fp A / C / D | deeplinks A / C / D | testids A / C / D | apis A / C / D |
|---|---|---|---|---|---|
| Ashinch/ReadYou | 0/16 / 0/16 / 0/16 | 0/3 / 0/3 / 0/3 | -(0) / -(5) / -(5) | -(0) / -(0) / -(0) | 0/12 / 2/12 / 2/12 |
| Dimillian/MovieSwiftUI | 7/14 / 11/14 / 11/14 | 0/4 / 2/4 / 2/4 | -(0) / -(0) / -(0) | -(0) / -(0) / -(0) | 11/20 / 11/20 / 11/20 |
| razaghimahdi/Shopping-By-KMP | 18/18 / 18/18 / 18/18 | 0/4 / 0/4 / 0/4 | -(0) / -(0) / -(0) | -(0) / -(0) / -(0) | 0/20 / 0/20 / 0/20 |
| seasonZhu/HarmonyStudy | 2/16 / 2/16 / 2/16 | 0/4 / 0/4 / 0/4 | -(0) / -(0) / -(0) | 1/1 / 1/1 / 1/1 | 0/14 / 0/14 / 0/14 |

## Reading
- **D is identical to C on this blind set.** In all 4 repos, routes.json, apis.json and testids.json are byte-identical to C's, and the verbose score output matches line for line.
- The round-2 API rules, including the ArkTS wrapper and createHttp rules, extract nothing new here:
  - HarmonyStudy's HTTP wrapper: still 0/14.
  - Ktor in Shopping-By-KMP: still 0/20.
  - OkHttp string templates in ReadYou: still 2/12.
  - `Endpoint.path()` interpolation in MovieSwiftUI: still 11/20.
- C's miss causes in this file still apply unchanged to D.
- On heldout2, which informed the rules, round 2 bought +2.4 pp of APIs: one simplenote `String(format:)` endpoint. On the blind set it bought 0. The blind estimate for the final kb is unchanged from C: routes 48.4%, APIs 19.7%, FP 13.3%.
- Files: `heldout3-runs-D/<repo>/{run.log,verify.log,wiki/facts}`, `h3-score{,H}-D.{json,txt}`.
