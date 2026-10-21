# Held-out v2 blind benchmark: kb Go baseline (A) vs TS current (B)

Run date 2026-10-21, UTC 19:17–19:18. No tuning was done. Codewiki repos were only read and cloned, and no agents were messaged.

## Versions
- **A (Go baseline)**: `scratchpad/kb-go` (prebuilt, `kb 0.1.0`), built from /home/user/codewiki HEAD `36417a423d1ba1a0b85a11e0016c6cabc931ae38`. The binary was not rebuilt, so the SHA is assumed.
- **B (TS current)**: `git clone -b ts-rewrite /home/user/codewiki-ts` → `ts-snap` @ **`339c5ce4e31c3cb72c16298fc78c24e17108a239`**, built with `npm ci --ignore-scripts && npm run build`. The source checkout had 5 uncommitted files. They are not in the snapshot.

## Protocol
- Config per repo: `bench/accuracy/bin/mkcfg.mjs` with ACC_REPOS=heldout2/repos and the label files from heldout2/labels. The wiki_dir is outside the clone, and the platform roots come from labels.platform_roots.
- Command per repo and version: `kb compound --root <clone> --config <run>/codewiki.yaml --llm template --full`. The ingest step was skipped. Runner: `run1.sh`.
- All 20 runs exited 0, taking 1–48 s each. After the runs, all 10 clones are clean (`git status --porcelain --ignored` is empty).
- Outputs: `runs-A/<label>/wiki/facts/*.json` and `runs-B/<label>/wiki/facts/*.json`.

## Scorer caveat (matters for comparison)
`heldout2/score.mjs` is a copy of the **original** accuracy scorer. It does not have the two fixes that codewiki-ts `bench/accuracy/score.mjs` uses for the training numbers:
1. It ignores `facts/deeplinks.json`, so deep links declared in Info.plist or the manifest are not counted.
2. It lacks the `idKeys` fix, so symbol ids of the form `platform://path#Name` do not match by name.

`score-harmonized.mjs` is heldout2/score.mjs (both of its held-out patches kept) plus exactly these two fixes, copied verbatim. Its selftest passes on all 10 labels. **The harmonized scorer is the one comparable to the training numbers.** Both are reported below.

## Summary (micro recall; FP = not_screen false-positive rate)

| metric | A train | A held-out (harmonized) | A held-out (official) | B train | B held-out (harmonized) | B held-out (official) | B gap (harmonized − train) |
|---|---|---|---|---|---|---|---|
| routes | 51.6% | 56.9% (112/197) | 50.8% (100/197) | 98.6% | **85.3%** (168/197) | 85.3% | **−13.3 pp** |
| not_screen FP | 12.8% | 10.2% (5/49) | 4.1% (2/49) | 7.0% | **12.2%** (6/49) | 12.2% | **+5.2 pp** |
| deeplinks | 4.8% | 2.7% (1/37) | 2.7% | 92.4% | **100%** (37/37) | 70.3% (26/37) | +7.6 pp |
| testids | 55.6% | 37.8% (14/37) | 37.8% | 95.8% | **59.5%** (22/37) | 59.5% | **−36.3 pp** |
| apis | 18.1% | 23.8% (10/42) | 23.8% | 96.2% | **33.3%** (14/42) | 33.3% | **−62.9 pp** |

**Must-not / none-repo false extractions.**
- Must-not hits: A = 0, B = 0 (APIs: pocket-casts `@Url`; testIDs: Confetti `testTag(conference.id)`).
- Extractions in categories that are labelled empty: A = 0, B = 0 in every 0-label category (Simple-Calendar APIs and testIDs; FinVideo APIs; deep links for the Harmony repos; testIDs for OpenEye, CoolMall and Confetti).
- Not scored, but worth noting: B emits 11 `integration://<x>` deep links in TCA, of which 1 is optional-labelled. The other 10 look synthetic: the Integration app's scheme is joined to route ids of UIKit view controllers in other apps (CaseStudies, TicTacToe). Simple-Calendar has 7 extracted against 2 optional MIME links.

## Per-repo (harmonized scorer; hit/required, or -(extracted) when 0 are required)

| repo | routes A | routes B | FP A | FP B | deeplinks A | deeplinks B | testids A | testids B | apis A | apis B |
|---|---|---|---|---|---|---|---|---|---|---|
| Automattic/pocket-casts-android | 1/23 | 21/23 | 0/5 | 0/5 | 0/22 | 22/22 | 1/1 | 1/1 | 9/9 | 9/9 |
| Automattic/simplenote-ios | 12/18 | 12/18 | 3/5 | 3/5 | 0/7 | 7/7 | 0/7 | 4/7 | 0/2 | 0/2 |
| Joker-x-dev/CoolMallArkTS | 37/37 | 37/37 | 1/5 | 1/5 | -(0) | -(0) | -(0) | -(0) | 0/10 | 0/10 |
| OHPG/FinVideo | 15/15 | 15/15 | 0/5 | 0/5 | -(0) | -(0) | 6/6 | 6/6 | -(0) | -(0) |
| SimpleMobileTools/Simple-Calendar | 0/16 | 16/16 | 0/5 | 0/5 | -(0) | -(7) | -(0) | -(0) | -(0) | -(0) |
| WinWang/HarmoneyOpenEye | 10/10 | 10/10 | 0/5 | 0/5 | -(0) | -(0) | -(0) | -(0) | 0/9 | 0/9 |
| damus-io/damus | 22/22 | 22/22 | 0/5 | 1/5 | 1/5 | 5/5 | 0/10 | 0/10 | 1/9 | 3/9 |
| google/iosched | 14/16 | 16/16 | 1/4 | 1/4 | 0/1 | 1/1 | 0/6 | 4/6 | -(0) | -(0) |
| joreilly/Confetti | 0/20 | 0/20 | 0/5 | 0/5 | 0/2 | 2/2 | -(0) | -(0) | 0/1 | 0/1 |
| pointfreeco/swift-composable-architecture | 1/20 | 19/20 | 0/5 | 0/5 | -(10) | -(11) | 7/7 | 7/7 | 0/2 | 2/2 |

## Miss-cause summary for B (categories and counts only)
- **Routes, 29 missed**:
  - Decompose `sealed class Config` navigation in Confetti (KMP) not recognised: 20.
  - Objective-C `.m` view controllers in simplenote (no ObjC screen extraction): 6.
  - Fragment in an unrecognised registration path (pocket-casts EpisodeFragment): 1.
  - Duplicate class name in a second module collapsed (pocket-casts SettingsFragment): 1.
  - TCA NavigationLink case study (RefreshableView): 1.
- **not_screen FP, 6**:
  - Helper, popover or child UIKit VCs taken as screens (simplenote): 3.
  - Navigation registry or enum type taken as a screen (CoolMall AppNavDestination): 1.
  - Shared SwiftUI component (damus EventView): 1.
  - Placeholder Fragment navigation destination (iosched navigation_placeholder): 1.
- **testIDs, 15 missed**:
  - Identifiers declared through the `enum AppAccessibilityIdentifiers: String` rawValue indirection (damus): 10.
  - ObjC `.m` accessibilityIdentifier (simplenote): 3.
  - Android layout-XML resource ids used by Espresso (iosched): 2.
- **APIs, 28 missed**:
  - ArkTS HTTP wrapper with relative paths on BASE_URL (CoolMall): 10. The only API extracted there is a bogus `/{url}` from LogInterceptor.
  - `baseUrl + "api/v4/..."` string concatenation in ArkTS (OpenEye): 9. Nothing was extracted.
  - Swift `appendingPathComponent` or URLRequest building (damus): 6. In 4 the path or host was not resolved, and in 2 (`/translate`, `/v2/translate`) the path was found but the method came out as GET instead of POST.
  - ObjC/Swift `String(format:"%@/%@/%@/i/%@")` (simplenote share extension): 2.
  - Apollo GraphQL endpoint (Confetti): 1.
- **Deep links**: 0 missed under the harmonized scorer. Under the official scorer, 11 are missed only because declared links sit in deeplinks.json (damus 5, simplenote 6).

## Generalization gap (B, harmonized)
- Routes drop 13 pp, almost entirely from one unseen idiom (Decompose Config) plus ObjC.
- The FP rate is 5 pp worse.
- Deep links hold up at 100%.
- testIDs drop 36 pp and APIs drop 63 pp. Both are concentrated in idioms the training set did not cover: enum-indirected identifiers, ArkTS HTTP wrappers or concatenation, and ObjC.
- B still beats A in every category: routes +28 pp, deep links +97 pp, testIDs +22 pp, APIs +10 pp. Its FP rate is about the same as A's (12.2% vs 10.2%).
- A's held-out numbers are close to its training numbers. That is consistent with A not being tuned on the training set, and suggests most of B's training-set lead came from fitting to those repos.

## Files
`run1.sh`, `table.mjs`, `score-harmonized.mjs`, `ts.diff`, `score-{A,B}.{json,txt}` (official), `scoreH-{A,B}.{json,txt}` (harmonized, verbose misses), `runs-{A,B}/`, `ts-snap/`.

---

# Version C: post-tuning, categories informed by B's held-out miss causes (not fully blind)

- **C (TS final)**: a fresh `git clone -b ts-rewrite /home/user/codewiki-ts` → `ts-snap-c` @ **`57f023f7b39f198b7376f0e84dea789bf4b05ebf`**, built with `npm ci --ignore-scripts && npm run build`.
- C contains 16 commits past B (`339c5ce..57f023f`). They include `fa94acf feat(facts): generic recognisers for held-out misses (Decompose configs, Objective-C, Swift enum testIDs, ArkTS HTTP wrappers, concatenated URLs, scheme scoping, placeholder/NavDestination precision, ViewBinding test ids)`. This set is therefore **no longer blind** for C.
- The protocol was the same as for A and B (`kb compound --llm template --full`, run at 19:55 UTC), with `kb verify` added. Runner: `run1c.sh`.
- All 10 compound runs exited 0. **`kb verify` PASSED on all 10** (0 errors; simplenote had 6 warnings). All 10 clones are still clean (`--ignored`).

## Summary (micro recall; harmonized scorer; official scorer in parentheses where it differs)

| metric | A held-out | B held-out | C held-out | C − B | C train ref (B train) |
|---|---|---|---|---|---|
| routes | 56.9% (112/197) [off. 50.8%] | 85.3% (168/197) | **90.9%** (179/197) | **+5.6 pp** | 98.6% |
| not_screen FP | 10.2% (5/49) [off. 4.1%] | 12.2% (6/49) | **8.2%** (4/49) | **−4.1 pp** | 7.0% |
| deeplinks | 2.7% (1/37) | 100% (37/37) [off. 70.3%] | **100%** (37/37) [off. 70.3%] | 0 | 92.4% |
| testids | 37.8% (14/37) | 59.5% (22/37) | **94.6%** (35/37) | **+35.1 pp** | 95.8% |
| apis | 23.8% (10/42) | 33.3% (14/42) | **35.7%** (15/42) | **+2.4 pp** | 96.2% |
| must-not hits | 0 | 0 | 0 | 0 | |
| false extractions in empty categories | 0 | 0 | 0 | 0 | |

In the TCA repo, C's unlabelled `integration://` deep links dropped from 11 to 3. The scheme-scoping fix appears to have removed the synthetic ones.

## Per-repo (harmonized; A / B / C; hit/required, or -(extracted) when 0 are required)

| repo | routes A / B / C | fp A / B / C | deeplinks A / B / C | testids A / B / C | apis A / B / C |
|---|---|---|---|---|---|
| Automattic/pocket-casts-android | 1/23 / 21/23 / 21/23 | 0/5 / 0/5 / 0/5 | 0/22 / 22/22 / 22/22 | 1/1 / 1/1 / 1/1 | 9/9 / 9/9 / 9/9 |
| Automattic/simplenote-ios | 12/18 / 12/18 / 16/18 | 3/5 / 3/5 / 3/5 | 0/7 / 7/7 / 7/7 | 0/7 / 4/7 / 7/7 | 0/2 / 0/2 / 0/2 |
| Joker-x-dev/CoolMallArkTS | 37/37 / 37/37 / 37/37 | 1/5 / 1/5 / 0/5 | -(0) / -(0) / -(0) | -(0) / -(0) / -(0) | 0/10 / 0/10 / 0/10 |
| OHPG/FinVideo | 15/15 / 15/15 / 15/15 | 0/5 / 0/5 / 0/5 | -(0) / -(0) / -(0) | 6/6 / 6/6 / 6/6 | -(0) / -(0) / -(0) |
| SimpleMobileTools/Simple-Calendar | 0/16 / 16/16 / 16/16 | 0/5 / 0/5 / 0/5 | -(0) / -(7) / -(7) | -(0) / -(0) / -(0) | -(0) / -(0) / -(0) |
| WinWang/HarmoneyOpenEye | 10/10 / 10/10 / 10/10 | 0/5 / 0/5 / 0/5 | -(0) / -(0) / -(0) | -(0) / -(0) / -(0) | 0/9 / 0/9 / 1/9 |
| damus-io/damus | 22/22 / 22/22 / 22/22 | 0/5 / 1/5 / 1/5 | 1/5 / 5/5 / 5/5 | 0/10 / 0/10 / 10/10 | 1/9 / 3/9 / 3/9 |
| google/iosched | 14/16 / 16/16 / 16/16 | 1/4 / 1/4 / 0/4 | 0/1 / 1/1 / 1/1 | 0/6 / 4/6 / 4/6 | -(0) / -(0) / -(0) |
| joreilly/Confetti | 0/20 / 0/20 / 7/20 | 0/5 / 0/5 / 0/5 | 0/2 / 2/2 / 2/2 | -(0) / -(0) / -(0) | 0/1 / 0/1 / 0/1 |
| pointfreeco/swift-composable-architecture | 1/20 / 19/20 / 19/20 | 0/5 / 0/5 / 0/5 | -(10) / -(11) / -(3) | 7/7 / 7/7 / 7/7 | 0/2 / 2/2 / 2/2 |

## Remaining C misses (categories and counts)
- **Routes, 18 missed**:
  - Confetti Decompose Config: 13 (7 of 20 now found).
  - pocket-casts: 2 (EpisodeFragment, duplicate SettingsFragment).
  - Objective-C view controllers in simplenote: 2 (SPPrivacy, SPMarkdownPreview).
  - TCA RefreshableView: 1.
- **False positives, 4**: simplenote helper VCs 3, damus EventView 1. The CoolMall and iosched FPs are fixed.
- **testIDs, 2 missed**: the iosched layout-XML ids `filter_sheet` and `filter_label`. The damus enum ids (10/10) and simplenote ObjC ids (7/7) are fixed.
- **APIs, 27 missed**:
  - CoolMall ArkTS wrapper: 10 (unchanged).
  - OpenEye concatenation: 8 (1 of 9 found).
  - damus: 6 (unchanged).
  - simplenote `String(format:)`: 2.
  - Confetti GraphQL: 1.

## Reading
- C's gains match the recognisers named in commit fa94acf. They are concentrated in testIDs (+35 pp), routes (+5.6 pp) and FP (−4.1 pp).
- Because those recognisers were chosen from this set's miss causes, C's held-out numbers are optimistic and are **not** a generalization estimate. B's numbers remain the blind estimate.
- APIs barely moved (+2.4 pp): the ArkTS wrapper and concatenation idioms are still largely unhandled.
- Files: `score-C.{json,txt}`, `scoreH-C.{json,txt}`, `runs-C/<repo>/{run.log,verify.log}`, `table3.mjs`, `ts-snap-c/`.

---

# Version D: final kb (round 2), heldout2. NOT BLIND

- **D (TS final)**: a fresh `git clone -q -b ts-rewrite /home/user/codewiki-ts` → `ts-snap-d` @ **`12d1ef68263ab6896157cbaeda70dfd7c06d05cf`** (`12d1ef6`, which is the required minimum). The source checkout was clean. Built with `npm ci --ignore-scripts && npm run build`; logs are `npmci-d.log` and `build-d.log`.
- D is 2 commits past C (`57f023f..12d1ef6`):
  - `05aa1b3 feat(facts): round 2 API generalisation (ArkTS enum/object const tables, options-object wrappers, axios.create instances, createHttp request receivers, Swift single-line URL properties, String(format:)/stringWithFormat, URLRequest helpers)`
  - `12d1ef6 docs(bench)`
- **Not blind.** The round-2 rules were chosen from heldout2 miss categories, and C was already informed by this set.
- Protocol: `runx.sh heldout2 D <label>`, run 20:10 UTC. It is the same as for C: `kb compound --llm template --full`, then `kb verify`, then a clean-clone check with `--ignored`. Combined log: `all-d.log`.
- All 10 compound runs exited 0 (2–54 s).
- **`kb verify` PASS 10/10** with 0 errors. simplenote has 6 warnings, the same as C; the other repos have 0.
- All 10 clones are clean (`dirty: 0`).

## Summary (micro recall; harmonized scorer; official scorer in brackets where it differs)

| metric | A | B (blind) | C | D | D − C | TS train (B) |
|---|---|---|---|---|---|---|
| routes | 56.9% (112/197) [off. 50.8%] | 85.3% (168/197) | 90.9% (179/197) | **90.9%** (179/197) | 0 | 98.6% |
| not_screen FP | 10.2% (5/49) [off. 4.1%] | 12.2% (6/49) | 8.2% (4/49) | **8.2%** (4/49) | 0 | 7.0% |
| deeplinks | 2.7% (1/37) | 100% (37/37) [off. 70.3%] | 100% (37/37) [off. 70.3%] | **100%** (37/37) [off. 70.3%] | 0 | 92.4% |
| testids | 37.8% (14/37) | 59.5% (22/37) | 94.6% (35/37) | **94.6%** (35/37) | 0 | 95.8% |
| apis | 23.8% (10/42) | 33.3% (14/42) | 35.7% (15/42) | **38.1%** (16/42) | **+2.4 pp** | 96.2% |
| must-not hits | 0 | 0 | 0 | 0 | | |
| false extractions in empty categories | 0 | 0 | 0 | 0 | | |

## Per-repo (harmonized; A / B / C / D; hit/required, or -(extracted) when 0 are required)

| repo | routes A / B / C / D | fp A / B / C / D | deeplinks A / B / C / D | testids A / B / C / D | apis A / B / C / D |
|---|---|---|---|---|---|
| Automattic/pocket-casts-android | 1/23 / 21/23 / 21/23 / 21/23 | 0/5 / 0/5 / 0/5 / 0/5 | 0/22 / 22/22 / 22/22 / 22/22 | 1/1 / 1/1 / 1/1 / 1/1 | 9/9 / 9/9 / 9/9 / 9/9 |
| Automattic/simplenote-ios | 12/18 / 12/18 / 16/18 / 16/18 | 3/5 / 3/5 / 3/5 / 3/5 | 0/7 / 7/7 / 7/7 / 7/7 | 0/7 / 4/7 / 7/7 / 7/7 | 0/2 / 0/2 / 0/2 / 1/2 |
| Joker-x-dev/CoolMallArkTS | 37/37 / 37/37 / 37/37 / 37/37 | 1/5 / 1/5 / 0/5 / 0/5 | -(0) / -(0) / -(0) / -(0) | -(0) / -(0) / -(0) / -(0) | 0/10 / 0/10 / 0/10 / 0/10 |
| OHPG/FinVideo | 15/15 / 15/15 / 15/15 / 15/15 | 0/5 / 0/5 / 0/5 / 0/5 | -(0) / -(0) / -(0) / -(0) | 6/6 / 6/6 / 6/6 / 6/6 | -(0) / -(0) / -(0) / -(0) |
| SimpleMobileTools/Simple-Calendar | 0/16 / 16/16 / 16/16 / 16/16 | 0/5 / 0/5 / 0/5 / 0/5 | -(0) / -(7) / -(7) / -(7) | -(0) / -(0) / -(0) / -(0) | -(0) / -(0) / -(0) / -(0) |
| WinWang/HarmoneyOpenEye | 10/10 / 10/10 / 10/10 / 10/10 | 0/5 / 0/5 / 0/5 / 0/5 | -(0) / -(0) / -(0) / -(0) | -(0) / -(0) / -(0) / -(0) | 0/9 / 0/9 / 1/9 / 1/9 |
| damus-io/damus | 22/22 / 22/22 / 22/22 / 22/22 | 0/5 / 1/5 / 1/5 / 1/5 | 1/5 / 5/5 / 5/5 / 5/5 | 0/10 / 0/10 / 10/10 / 10/10 | 1/9 / 3/9 / 3/9 / 3/9 |
| google/iosched | 14/16 / 16/16 / 16/16 / 16/16 | 1/4 / 1/4 / 0/4 / 0/4 | 0/1 / 1/1 / 1/1 / 1/1 | 0/6 / 4/6 / 4/6 / 4/6 | -(0) / -(0) / -(0) / -(0) |
| joreilly/Confetti | 0/20 / 0/20 / 7/20 / 7/20 | 0/5 / 0/5 / 0/5 / 0/5 | 0/2 / 2/2 / 2/2 / 2/2 | -(0) / -(0) / -(0) / -(0) | 0/1 / 0/1 / 0/1 / 0/1 |
| pointfreeco/swift-composable-architecture | 1/20 / 19/20 / 19/20 / 19/20 | 0/5 / 0/5 / 0/5 / 0/5 | -(10) / -(11) / -(3) / -(3) | 7/7 / 7/7 / 7/7 / 7/7 | 0/2 / 2/2 / 2/2 / 2/2 |

## What changed C → D
- The facts files are byte-identical to C in every repo except one: simplenote `apis.json`. There, C extracted 0 APIs and D extracts 8.
- Gain: +1 required API. `GET {base}/{appId}/{bucket}/i/{key}` is the `String(format:)` share-extension URL. D also matches 1 more optional API.
- The second share-extension call, `POST …/i/{key}`, is still missed. It is extracted, but its method came out as GET.
- No change in CoolMall (0/10), OpenEye (1/9), damus (3/9) or Confetti (0/1). The round-2 ArkTS rules (const tables, options-object wrappers, createHttp) did not fire on heldout2's ArkTS repos.
- Remaining misses are the same as C, except APIs fall from 27 to 26.

## Reading
- D's heldout2 numbers are not a generalization estimate. B is still the only blind heldout2 number. See HELDOUT3.md for D's blind numbers.
- Files: `score-D.{json,txt}`, `scoreH-D.{json,txt}`, `runs-D/<repo>/{run.log,verify.log,wiki/facts}`, `all-d.log`, `ts-snap-d/`.
