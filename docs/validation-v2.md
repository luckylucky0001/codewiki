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

**Result:** the warm scan is about 8–10% faster with 4 workers (2.05 s → 1.85 s), not close to Go's ~1.1 s. The measurements were taken while another agent's accuracy runs kept the load average at 3–11. Each worker also starts with a cold JIT and rebuilds the name indexes, about 130 ms. The CPU profile of a warm serial scan shows where the rest goes:

| part of the warm serial scan | ms |
|---|---|
| resolve `pass` | 554 |
| v8 deserialize of the scan cache | 347 |
| GC | 291 |
| zlib | 114 |

The next steps are a cheaper cache format (per-file lazy deserialize) and lower allocation in `pass`, not more threads.

## Reproduce

```bash
demo/sfk-real-repo.sh <checkout> <outdir>                                  # section 1 (never writes to <checkout>)
demo/sfk-real-repo.sh <nowinandroid> <outdir> architecture=docs/ArchitectureLearningJourney.md   # adopted experiment
demo/llm-demo.sh                                                          # real LLM path (claude CLI)
AGENT_QUESTIONS=bench/agent-qa/questions-elementx-arch.json AGENT_REPS=2 AGENT_MAX_TURNS=40 bench/agent-qa/run.sh <element-x copy with wiki>
python3 -I bench/agent-qa/elementx-groundtruth.py <element-x checkout>
```
