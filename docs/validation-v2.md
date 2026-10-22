# v2 validation: module tree, SFK docs, real LLM path, architecture A/B, performance

Date: 2026-10-21. TypeScript `kb` on branch `ts-rewrite`.

The real repositories are read-only clones. Every run worked on a `git clone --shared` copy, so it never wrote to the clone itself, and the wiki and docs went into that copy. The scripts are `demo/sfk-real-repo.sh` and `demo/human-content-check.mjs`.

## 1. SFK docs on real repositories (`kb docs compound --llm template`)

Each repository went through these steps, in order:

1. Snapshot every `.md` file.
2. `kb init` → `kb compound --llm template`. This builds the wiki and the module tree.
3. `kb docs scope` / `kb docs status`.
4. `kb docs compound`, then a second run to test idempotency.
5. `kb docs stale-specs | adr | debt`, then `kb links`.
6. `kb verify --docs`.
7. `demo/human-content-check.mjs`. This checker is independent of kb. Every `.md` file that existed before must still exist. For a changed file, every non-blank original line must still appear, in the original order; placeholder lines in skeleton files are the only exception. The checker also runs kb's own `checkHumanContentPreserved` on top of that.

| repo | wiki (verify) | tree | human docs before (state) | first run | entries written / deferred¹ | second run | human `.md` checked → changed / deleted / violations | stale specs | ADR proposals | debt items | broken links² |
|---|---|---|---|---|---|---|---|---|---|---|---|
| nowinandroid | PASS 63 pages | depth 3 | 2 frozen | 5 new | 22 / 0 | 5 noop | 44 → 0 / 0 / 0 | 0 | 0 | 19 | 0 |
| element-x-android | PASS 822 | depth 3 (L2 263, L3 404) | 17 frozen | 5 new | 28 / 127 | 4 noop, 1 write (deferred) | 31 → 0 / 0 / 0 | 0 | 0 | 50 | 14 |
| kotlinconf-app | PASS 96 | depth 3 | 1 frozen | 4 new | 46 / 18 | 2 noop, 2 write (deferred) | 21 → 0 / 0 / 0 | 0 | 0 | 1 | 0 |
| HarmonyOS-Cases | PASS 405 | depth 2 (L2 172, L3 28) | 84 frozen | 4 new | 46 / 179 | 3 noop, 1 write (deferred) | 420 → 0 / 0 / 0 | 0 | 0 | 666 | 20 |
| sunflower | PASS 22 | depth 2 | 1 frozen | 4 new | 8 / 0 | 4 noop | 5 → 0 / 0 / 0 | 0 | 0 | 2 | 0 |
| wikipedia-ios | PASS 432 | depth 3 | 6 frozen | 5 new | 66 / 173 | 4 noop, 1 write (deferred) | 25 → 0 / 0 / 0 | 0 | 0 | 34 | 5 |
| NextE (HarmonyOS) | PASS 390 | depth 2 | 120 frozen, 1 adopted | 4 new | 51 / 57 | 2 noop, 2 write (deferred) | 152 → 0 / 0 / 0 | 0 | 0 | 0 | 428 |
| DroidconKotlin | PASS 22 | depth 2 | 1 frozen | 5 new | 6 / 0 | 5 noop | 10 → 0 / 0 / 0 | 0 | 0 | 1 | 0 |

¹ Entries over the per-run line budget (100 / 150 lines) are written on the next run. The output now reports them as `deferred N (line budget; next run)`, so a second run that writes is expected and visible. Before this change the cut was silent.

² `kb links` over all docs. Every broken link is in human text. The docs kb wrote contained 0 broken links in every repo. Some of the human-text cases are real stale references, such as element-x `./tools/docs/generateModuleGraph.sh` where kb suggests `../tools/...`. Others are references to sibling repositories (NextE `../eros_fe`). `kb links` only reports and never edits.

**Link-checker precision (wave 4).** The checker now follows the SFK rule exactly.

What is checked:

- markdown links (a target may contain balanced parentheses, e.g. `fig(5).png`);
- backticked paths that start with `./` or `../`;
- backticked repo paths: they contain `/`, end in a known extension or a trailing `/`, and their first segment exists at the repo root or in one of the file's ancestor directories.

What is skipped:

- code-ish strings (calls, operators, `::`, quotes, whitespace), globs, URLs and placeholders (`vX.Y.Z`, `<module>`, `{x}`, `[x]`, `…`);
- fenced code;
- `../` paths whose first named segment exists nowhere up the tree. These point at sibling repositories, e.g. NextE's `../eros_fe/lib/...`.

Broken links per repo before → after:

| repo | before | after |
|---|---|---|
| element-x | 14 | 11 |
| HarmonyOS-Cases | 20 | 12 |
| wikipedia-ios | 5 | 5 |
| NextE | 428 | 288 (506 originally) |
| the other 4 | 0 | 0 |

**Sample of 20 remaining broken links** (stratified over all 316):

- **19 true.** 15 point at NextE `scripts/test_*.mjs` contract scripts that no longer exist. The `scripts/` directory exists and holds 84 other `test_*.mjs` files, so these references are stale; they are not gitignored or generated files. 2 are moved files, where kb suggests the new location (`shared/Index.ets` → `entry/src/main/ets/pages/Index.ets`). 1 is element-x `libs.versions.toml`, linked from the wrong directory. 1 is Cases `../reference/apis-arkts/js-apis-worker.md`, which works on the upstream docs site but not in this repo.
- **1 false.** element-x `../app/build/reports/kover/html/index.html` is a build artifact.

**Precision ≈ 95% (19/20).** A first sample, taken before the sibling-repo rule, gave 15/20; its 5 false positives were all `../eros_fe/…`-style sibling-repo paths.

**`kb verify --docs` semantics (wave 4).**

- It fails only on broken references inside kb-owned content, i.e. the items `parseDocument` recognises: generated entries, index rows and kb blocks. A missing `**Source**` path also fails.
- Broken links in human-owned text are returned as `human_review_candidates` (`W_DOCS_HUMAN_LINK`) and exit 0. `--strict` makes them fail.
- `kb links` still reports everything and marks each link `[human text]` or kb-owned.
- On the 8 repos: 0 kb-owned errors; the human review candidates are 11 / 12 / 5 / 288 on element-x, Cases, wikipedia-ios and NextE, and 0 elsewhere.
- Tests: `test/v3.test.ts` covers "verify --docs semantics" and "link checker SFK rule".

**Review candidates.** Every run had 0 files in `review`, 0 dropped entries and 0 parity differences. The candidates for a person to look at are:

- the unregistered custom docs, 232 across the 8 repos. These are registered in `.kb/docs-schema-extra.yaml` with `enabled: true`. kb lists them, and in template mode it never writes to them.
- the deferred entries.

**Destructive writes: none.**

- 0 human files deleted, 0 changed, 0 independent-check violations and 0 guard violations, over 708 human `.md` files.
- `git status` in each copy shows only new docs files, `wiki/`, `codewiki.yaml`, `.kb/` and the `.gitignore` entry that `kb init` adds.

**What the table does not show.** On real repositories every pre-existing human doc started out `frozen`. Their names do not match the default schema (`docs/architecture.md`, …), so the first run only creates new files next to them. To exercise `adopted` on real human text, the dimensions were pointed at existing docs through `codewiki.yaml`:

```yaml
docs_schema:
    dimensions:
        - id: architecture
          output_path: docs/ArchitectureLearningJourney.md
```

This setting is new: `docs_schema` overrides used to be ignored. Results:

| repo | adopted file (real human doc) | entries appended | independent check | second run |
|---|---|---|---|---|
| nowinandroid | `docs/ArchitectureLearningJourney.md` (321 lines), `docs/ModularizationLearningJourney.md` | +2, +3 | every original line still present, in order; 0 violations | noop |
| element-x-android | `docs/design.md`, `docs/screenshot_testing.md` | +3, +1 | 0 violations | noop (1 deferred write elsewhere) |
| wikipedia-ios | `docs/ci.md` | +16 (6 deferred) | 0 violations | deferred entries written |

The diffs consist of a frontmatter block added at the top plus appended `##` sections; no original line moved or changed. The diffs are saved as `diff-*.txt` next to each run.

The single broken link in element-x `docs/screenshot_testing.md` L72 was in the human text. It used to fail `kb docs compound` with exit 1. It is now reported as `[pre-existing, human content]` and does not fail the run.

### Bugs found by the real-repo runs (all fixed, with regression tests in `test/v3.test.ts`)

| # | Where | Symptom | Fix |
|---|---|---|---|
| 1 | HarmonyOS-Cases (wave 2) | 660 `E_DEAD_LINK`: route ids containing `/` put feature pages one directory deeper, so the fixed `../` links broke | related-page links depend on page depth |
| 2 | element-x-android | `services/*` Gradle modules became "projects" with their own docs roots | container children of a root Gradle settings or HarmonyOS app (AppScope) are modules unless they are independent builds |
| 3 | HarmonyOS-Cases | `kb init` found no platform (the app is in `CommonAppDevelopment/`), so the wiki and docs were empty | when nothing is found at the top level, detect one directory down |
| 4 | NextE | verify FAIL: a route id `index` gave `pages/features/index.md`, which was taken for a tree index | v1 directories never hold tree indexes; top-level tree ids avoid v1 directory names |
| 5 | all | `kb … --json \| …` was cut at 64 KiB (`process.exit` before the pipe drained) | exit only after stdout and stderr flush |
| 6 | NextE | 506 broken links, many of them template paths (`changelog/vX.Y.Z.md`) | backtick paths with placeholders are not links (now 428) |
| 7 | element-x, wikipedia-ios | second run wrote again with no explanation | budget-deferred entries are reported |
| 8 | element-x adopted | a human broken link failed the whole run | pre-existing human links are reported but do not fail the run |

## 2. Real LLM path (claude haiku, `demo/llm-demo.sh`, output in `demo/sample-output/llm-claude/`)

The demo uses `examples/monorepo` and has three steps:

1. **Code change.** The cart-limit change is merged, then `kb compound --agent claude --model haiku --max-llm-tasks 6` runs. Four LLM tasks run: 3 feature pages and the L3 cluster page `shop-android/cart-view-model`.
2. **Docs entries.** `kb docs compound --agent claude --model haiku` runs. The agent gets read-only tools (`Read,Glob,Grep`) and answers in the contract format. kb unwraps the JSON result and routes each target file as the agent of the scope that owns it. It then checks Source paths and merges. Result: 53 entries accepted, 0 rejected.
3. **Parent pages.** The L1 and L2 pages of shop-ios are deleted, and `kb compound --agent claude` writes them again from their children's summaries.

| check | result |
|---|---|
| write-set guard | no violations and no rollbacks in any task |
| human-content guard (docs) | 6 human files checked: 3 unchanged (frozen `onboarding.md`, the ADR, `notes.md`); 3 changed — adopted `docs/architecture.md` got appended sections only, and skeletons `docs/testing.md` and `shop-ios/docs/navigation.md` lost only their `[DESCRIPTION]` / TODO placeholders; independent check and kb guard: 0 violations |
| kb blocks | breadcrumb, child table, symbol table, mermaid and Sources are rewritten by kb after the agent; verify checks block / diagram hashes: PASS |
| verify | PASS after every step (33 pages, 201 anchors); `kb verify --docs` PASS; `kb links`: no broken links |
| prose | specific and checkable: navigation graph, route table, per-screen behaviour, `MAX_CART_ITEMS = 20`, testTags, API calls. One weakness: the L3 page says "三端对照未包含在输入中", because a cluster covers one platform. |
| cost | compound ≈ $0.06 + tree pages $0.025 + docs agent ≈ $0.02 per call (3 calls while fixing the bugs below), about $0.15 in total |

Bugs this run found in the docs agent path, all fixed:

- `--agent claude` results were always discarded. The JSON wrapper was never unwrapped, and every project-docs group was rejected as "repository results may only write root docs".
- The agent ran with write tools at the repo root. It is now read-only, and any change to the working tree discards its result.
- The first prompt produced entries that only repeated the titles. The prompt now asks the agent to read each Source file and write 1–3 concrete sentences.

Agent usage is now printed.

## 3. Architecture A/B on element-x-android

See [bench/agent-qa/README.md](../bench/agent-qa/README.md) (round 10) and `demo/sample-output/agent-bench-elementx-arch/`.

- **Setup:** 5 architecture questions, ground truth from the raw `build.gradle.kts` files, haiku, 2 runs per arm, $0.14.
- **Arm A** (wiki + skill + pointer block): 10/10, 5.9 turns, $0.064.
- **Arm B** (source only): 10/10, 7.8 turns, $0.078.

The honest reading: the dependency questions (E1, E4, E5) were answered by grepping build files in both arms, and A never used kb on them. So the efficiency difference cannot be credited to the hierarchy. A used kb or the wiki only on E2 and E3, in 4 of 10 runs.

Follow-ups built from this result:

- a `kb:dependents` block on module pages;
- `kb tree deps <module>` and `kb tree deps --top N`, whose answers match the ground truth exactly (25 deps, 2 dependents, 69 / 62 most deps, fan-in 147);
- a pointer-block row for these commands.

Re-running arm A on E1, E2, E4 and E5 with the command ($0.052): 7 of 8 runs called `kb tree deps` (before: 0), and all 8 passed. Turns were unchanged, though: 6.4 before, 6.4 after, against 8.3 for B. The agent re-checked the command's answer by grepping the build files. Conclusion: the hierarchy answers architecture questions correctly and agents do use it, but with haiku this produced no measurable efficiency gain.

## 4. Performance: parallel reference resolution

Reference resolution is now split over `worker_threads`. Each worker resolves one slice of the symbol table. The graph is serialized once (13 MB) into a `SharedArrayBuffer`, and every worker deserializes it in parallel. Output is identical to the serial pass; this is checked on Cases (20141 symbols, 7518 with refs, same hash) and by a test on minishop.

Measured on HarmonyOS-Cases warm scans (4-core container):

| cost | ms |
|---|---|
| serial resolve (warm JIT) | 970–1230 |
| per-worker overhead: serialize 50 + deserialize 60–90 + worker start 55–70 | ~200 |
| slice of 1/4 (index build ~130 + passes) | 165–435 |
| whole `scanRepo`, fresh process, `KB_WORKERS=1` / `2` / `4` | 2007–2108 / 1913–1928 / 1842–1863 |

**Result of parallelization alone:** the warm scan is about 8–10% faster with 4 workers (2.05 s → 1.85 s). Each worker starts with a cold JIT and rebuilds the name indexes (about 130 ms), and the measurements were taken while another agent's runs kept the load average at 3–11.

**Second change: a resolved-refs cache.** The references are a pure function of the parsed inputs, so the scan cache now also stores them. The key is sha256 over cache version + (path, platform-relative path, lang, platform, content hash, error) of every file. When nothing changed, the refs are reused and no resolution runs; any change triggers a full parallel resolve.

On Cases this gives identical refs to an uncached scan (same hash), and the tests cover reuse, invalidation and identity. Warm `scanRepo` drops to **1.21–1.33 s**, down from 2.05 s before both changes.

A full `kb scan` process takes about 2.1–2.3 s. The CPU profile shows where it goes:

| part of a full warm `kb scan` | ms |
|---|---|
| `extractFacts` (owned by the facts work) | 630 |
| cache load: gunzip 230 + v8 deserialize of 62 MB 365 | ~600 |
| directory walk + hashing | ~290 |

Go's warm scan takes about 1.1 s. To get closer, the next steps are a smaller or lazier cache format and facts extraction from cached per-file results.

### Wave 4: facts result cache + lazily loaded call sites

Two more caches are now in the warm path.

**Facts result cache** (`wiki/.kb/cache/facts.v8.gz`). Facts extraction resolves across files, so it is cached as one result. Its key combines three things:

1. the scan's `inputsKey`: content hash of every source file plus the extractor and facts fingerprint;
2. `treeStamp`: (path, size, mtime) of every non-excluded file under the platform roots, which covers the manifests, plists, `router_map.json` and `module.json5` that facts read;
3. the configuration.

A change to any of them is a miss, followed by a full re-extraction.

A true per-file facts cache would need the facts extractor (owned by the facts agent) to be split into per-file and cross-file stages. That was out of scope.

**Lazily loaded call sites.** Call sites are 34 MB of the 62 MB scan cache. They now live in `scan.calls.v8.gz`, paired with the main file by a stamp, and are deserialized only when facts must be recomputed.

**Identity.** `test/v3.test.ts` ("warm-scan caches") checks that a cold run, a warm run with cached facts and lazy calls, and a run after a manifest change all produce facts and calls identical to an uncached run.

Full warm `kb scan` process on HarmonyOS-Cases. The old build (`339c5ce`) and the new one each had their own warm wiki, and the runs were interleaved because another agent kept the load average at about 11.5:

| build | runs (ms) |
|---|---|
| before (`339c5ce`) | 2156, 2165, 2436, 2938 |
| after | 1146, 1205, 1235, 1331 |

The result is about 1.15–1.33 s, against Go's about 1.1 s measured at low load. A warm `kb compound` noop on Cases takes about 7 s at load 14; most of that is wiki verify and publish, not scanning.

## 5. e2epilot interop (read-only on /home/user/e2epilot)

e2epilot was cloned into scratch at `fefd111` and built with `go build -o <scratch>/e2e ./cmd/e2e`. The commands below ran against the minishop wiki produced by `demo/run.sh` with the TypeScript kb. All of them exited 0, and nothing in e2epilot had to change:

| command | result |
|---|---|
| `e2e seed --routes … --testids … --platform android / ios / harmony` | 8 / 7 / 7 deep-link edges and 3 static tap edges each, from 8 / 8 / 7 routes and 13 testIDs |
| `e2e path --to cart` | L0: deep link; L1: product_detail → `#add_to_cart` |
| `e2e graph invalidate --changed-routes cart,MainActivity` | 5 edges invalidated |
| `e2e impact --codewiki-diff wiki/.kb/plan.json` | changed routes `MainActivity RootView profile`, changed testIDs, `profile` flagged as a new route |
| `e2e trace --specs wiki/facts/requirements.json` | 33 requirements, 10 conflicts |

The schema changes in the TypeScript kb are backward-compatible:

- routes gained `name` and `deeplinks[]`, which e2epilot ignores;
- typed routes use the class name as `route_id` (`MainActivity`, `RootView`).

The README's old `e2e impact --changed-routes … --requirements …` example did not match the current e2epilot flags and has been corrected.

## Reproduce

```bash
demo/sfk-real-repo.sh <checkout> <outdir>                                  # section 1 (never writes to <checkout>)
demo/sfk-real-repo.sh <nowinandroid> <outdir> architecture=docs/ArchitectureLearningJourney.md   # adopted experiment
demo/llm-demo.sh                                                          # real LLM path (claude CLI)
AGENT_QUESTIONS=bench/agent-qa/questions-elementx-arch.json AGENT_REPS=2 AGENT_MAX_TURNS=40 bench/agent-qa/run.sh <element-x copy with wiki>
python3 -I bench/agent-qa/elementx-groundtruth.py <element-x checkout>
```
