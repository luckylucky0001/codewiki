# Hierarchical wiki tree (`src/tree`)

Implementation of design-v2 §2 / §3.2 / §3.4 / §3.5: the deterministic L0–L3 tree that
`kb tree` writes to `wiki/module_tree.json`, the repair chain used by `kb compound`, and the
renderers for index pages, breadcrumbs, `llms.txt` and mermaid diagrams. The module is
self-contained (only `src/model.ts` types are imported, no new dependencies) and every
function is pure over its inputs except `fsSource` (read-only directory walk).

```
src/tree/
  types.ts            TreeNode, ModuleTree, TreeConfig, BuildProject/BuildModule, GraphDelta, RepairResult, PatchOp
  build/parse.ts      tolerant JSON5 + OpenStep (pbxproj) parsers, comment stripper
  build/gradle.ts     settings.gradle(.kts) include / projectDir / dynamic includes; project() + projects.x deps
  build/swiftpm.ts    Package.swift .target/.executableTarget/.testTarget (path, internal deps)
  build/xcode.ts      PBXNativeTarget membership via Sources phase + group tree, synchronized folders, target deps
  build/hvigor.ts     build-profile.json5 modules[] + module.json5 type (HAP/HAR/HSP) + oh-package.json5 file: deps
  build/detect.ts     detectProjects(FileSource), fsSource(root), memorySource(map)
  layer.ts            files → module (explicit membership, deepest root), v1 heuristic for leftovers
  cluster/symgraph.ts core-symbol selection, weighted core graph, PageRank
  cluster/leiden.ts   deterministic Leiden (local moving + refinement + aggregation)
  cluster/cluster.ts  size post-processing, cluster ids, Jaccard matching, default slugs
  tree.ts             buildTree, finalize (deps/related/importance/digests), navigation helpers, (de)serialization
  repair.ts           repairTree (rule chain, tau_grow, tau_tree), deltaFromGraphs
  patch.ts            validatePatch / applyPatch (rename | merge | split)
  render.ts           kb blocks, breadcrumb, index tables, llms.txt, mermaid (deps / projects / clusters / navigation)
  nmi.ts              NMI, ARI, treeLabels, treeNMI, idRetention
  index.ts            public barrel
```

## API for the CLI

```ts
import * as tree from './tree/index.js';

// kb tree (full build)
const src = tree.fsSource(cfg.root);                      // read-only walk (skips build/, node_modules/, Pods/, oh_modules/ …)
const projects = tree.detectProjects(src);                // L1/L2 candidates
const fileBytes = Object.fromEntries(Object.keys(graph.files).map((f) => [f, src.size!(f) ?? 0]));
const input: tree.TreeInput = { graph, facts, projects, fileBytes, config: cfg.tree, prev, title: cfg.project, head };
const t = tree.buildTree(input);                          // ModuleTree
write('wiki/module_tree.json', tree.serializeTree(t));    // sorted keys, 2-space indent, trailing newline

// kb compound (incremental)
const prev = tree.parseTree(read('wiki/module_tree.json'));
const delta = tree.deltaFromGraphs(oldGraph, graph);      // or map the engine's diff: {added, deleted, renamed}
const r = tree.repairTree(prev, input, delta, { rebuild: flags.rebuild });
// r.tree, r.decisions[], r.created/deleted/reclustered, r.renamedPages (→ tree-history.json), r.llmRoute, r.rebuilt

// kb tree explain <symbol|file>
tree.explain(t, target, tree.prepare(input).cg);          // { node, via: 'core' | 'owner' | 'file' }

// LLM tree-patch (tree-name task output)
const errs = tree.validatePatch(t, ops);                  // [] when acceptable
const t2 = tree.applyPatch(t, ops);                       // title_source: 'llm'

// render (kb owns these blocks)
tree.renderIndexes(t);                                    // Map<wiki path, markdown> for index.md + pages/<id>/index.md
tree.upsertKbBlock(page, 'breadcrumb', tree.renderBreadcrumb(t, nodeId));
for (const d of tree.nodeDiagrams(t, nodeId, facts)) page = tree.upsertKbBlock(page, 'diagram', '```mermaid\n' + d.mermaid + '\n```', { id: d.id, hash: sha256(d.mermaid).slice(0, 12) });
// or tree.diagramBlock(id, mermaid); verify: tree.diagramFresh(page, id, mermaid)
tree.renderLlmsTxt(t);                                    // wiki/llms.txt

// evaluation
tree.treeStats(t); tree.treeNMI(a, b); tree.idRetention(a, b); tree.nmi(labelsA, labelsB); tree.ari(...)
```

Other exports: `layer`, `buildCoreGraph`, `pageRank`, `leiden`, `modularity`, `partitionModule`,
`matchPrev`, `clusterId`, `membersHash`, the individual build parsers (`parseGradleSettings`,
`parsePackageSwift`, `parsePbxproj`, `detectHvigor`, `parseJSON5`, `parseOpenStep`), `walk`,
`findNode`, `ancestors`, `updateDigests`, `resolveConfig`.

`TreeConfig` (the `tree:` section of `codewiki.yaml`, all optional): `max_core_per_cluster` 40,
`min_core_per_cluster` 3, `budget_tokens` 32000, `tau_grow` 0.33, `tau_tree` 0.3, `gamma` 1.0,
`pins: [{match, cluster}]`, `titles: {nodeId: title}`, `notes` (passed through for prompts).

## Levels

| Level | Node | Source |
|---|---|---|
| L0 | `repo` | fixed root |
| L1 | `project` | one per marker: `settings.gradle(.kts)`, `Package.swift`, `*.xcodeproj/project.pbxproj`, project-level `build-profile.json5` (has `modules[]`); a heuristic project per platform for files outside any project |
| L2 | `module` | Gradle `include(":a:b")` → `a/b` (`projectDir` overrides; dynamic includes → every dir with a build script, warning); SwiftPM targets (`path:` or `Sources/<name>`, `Tests/<name>`); Xcode native targets (Sources-phase files resolved through the PBXGroup tree, synchronized root groups; root = common dir of members); HarmonyOS `modules[].srcPath` with `module.json5` `type` entry/feature→HAP, har→HAR, shared→HSP. Files under a project root but in no module go to a `_root` module |
| L3 | `cluster` | Leiden over the module's core-symbol graph, only when the module exceeds `budget_tokens` (bytes/4 of its files) or has more than `max_core` core symbols |

File → module: explicit Xcode membership first, otherwise the module with the **deepest root**
containing the file (a real build module beats an Xcode target on the same root).

Collapsing ("null passthrough"): modules without graph files and projects without modules are
dropped; a repo with one project has no L1 node (modules hang off the root); a project with one
module takes that module's content (no L2 node); a module whose clustering yields a single
cluster gets no L3. `level` always states the semantic level (2 = module, 3 = cluster) even when
an intermediate level is collapsed, so depth can be < level.

## Page path scheme

Node ids are the page paths of the *visible* hierarchy, so the page id rule of design-v2 §1
(page path minus `pages/` and `.md`) holds:

| Node | id | page | index |
|---|---|---|---|
| L0 repo | `repo` | `pages/overview.md` | `index.md` |
| L1 project | `<p>` | `pages/<p>/overview.md` | `pages/<p>/index.md` |
| L2 module | `<p>/<m>` (or `<m>` when L1 collapsed) | `pages/<p>/<m>/overview.md` | `pages/<p>/<m>/index.md` (only when it has clusters) |
| L3 cluster | `<holder>/c-xxxxxxxx` | `pages/<holder>/<slug>.md` | — |

`<p>` = kebab of the project root's last segment (root project → platform name; collisions →
the full root path), `<m>` = kebab of the module name (`:feature:cart` → `feature-cart`,
`KsApi` → `ks-api`). Cluster **ids** are stable hashes (`c-` + sha1(first 3 sorted core ids +
common dir)[:8], inherited across runs) while the **page** uses the slug, which an LLM or user
may rename; renames are reported in `RepairResult.renamedPages` for `tree-history.json`.
Slugs `overview` and `index` are reserved.

## module_tree.json

```jsonc
{
  "version": 2, "generated_by": "kb 0.2.0", "head": "<commit>",
  "algo": { "cluster": "leiden-v1", "gamma": 1, "weights": "3/2/2/1/0.5", "min_core": 3, "max_core": 40, "budget_tokens": 32000, "seed": "sha256(module key)" },
  "root": {
    "id": "repo", "level": 0, "kind": "repo", "title": "…", "page": "pages/overview.md", "index": "index.md",
    "children_digest": "…",
    "children": [ { "id": "android", "level": 1, "kind": "project", "root": "", "build": "gradle", "platform": "android", …,
      "children": [ { "id": "android/core-designsystem", "level": 2, "kind": "module",
        "key": "gradle::::core:designsystem", "module_type": "android-library", "paths": ["core/designsystem"],
        "files": ["…"], "tokens": 43049, "deps": ["android/core-model"], "ref_deps": ["android/core-ui"],
        "importance": "high", "children_digest": "…",
        "children": [ { "id": "android/core-designsystem/c-884db64d", "level": 3, "kind": "cluster",
          "slug": "nia-theme", "title": "Nia theme", "title_source": "det", "page": "pages/android/core-designsystem/nia-theme.md",
          "core": ["android://…/Theme.kt#NiaTheme", "…"], "members_hash": "…", "routes": [], "related": ["…"],
          "tokens": 5120, "importance": "high" } ] } ] } ]
  },
  "warnings": ["settings.gradle.kts: dynamic include() detected; 257 module(s) inferred …"]
}
```

- `core`: core symbol ids only (members are derived from `parent` chains). Leaf modules (no L3)
  carry `core` themselves. `members_hash` = sha256 of sorted core ids.
- `key`: stable module key (`<build>:<project root>::<module name>`), used for Jaccard
  inheritance and repair even if collapsing changes visible ids.
- `deps`: build-file dependencies; `ref_deps`: modules linked by cross-module symbol references.
- `related`: top-3 nodes by cross-node reference weight. `routes`: route ids whose page symbol
  is owned by the node. `importance`: per level, top 20 % of summed PageRank `high`, bottom 40 % `low`.
- `summary` is kept from the previous tree when the node's id and `members_hash` are unchanged;
  `children_digest` = sha256 over children (id, members_hash/children_digest, sha256(summary)) —
  a parent page is stale when it changes.
- `pinned` (pins that formed the cluster), `needs_review` (`llm_route`, `merge`, `split`) are
  set by pins / repair.
- Serialization: keys sorted recursively, 2-space indent, trailing newline; `parseTree` rejects
  other versions.

## L3 clustering

1. **Core symbols** per module: top-level class/struct/interface/enum/object/protocol/component
   (ArkTS `@Component`)/actor + Compose `composable` functions; other top-level functions are core
   only when OOP is rare (< 20 types or < 20 %). Members map to their top-level owner;
   `extension`/`type` map to the same-name type; other non-core top-level symbols to the nearest
   preceding core symbol in the file.
2. **Weighted graph** between core symbols: `3·ref` (resolved `refs`), `2·inherit` (ref target
   named in the supertype list of the signature), `2·route` (facts.navigation between route
   owners), `1·import` (file imports a same-module core type), `0.5·same_file` (pairwise ≤ 8,
   else a chain), `+0.5` on edges within one directory. Symbols are canonicalized by id first so
   results never depend on scanner order.
3. **Leiden** (modularity, γ = 1): queue-based local moving, refinement that greedily merges
   well-connected singletons inside each community, aggregation on the refined partition, until
   stable. RNG = mulberry32 seeded with `sha256(module key)`.
4. **Sizes**: clusters > 40 are re-split with γ·2, γ·4, γ·8, then by file order into equal
   chunks; clusters < 3 merge into the most connected neighbour with room (ties → smaller
   first id); unconnected leftovers form `misc` chunks (≥ 3) or join the largest same-directory
   cluster. Pins (`tree.pins`) are carved out before clustering and become their own cluster.
5. **Ids & names**: Jaccard ≥ 0.5 greedy one-to-one matching against the previous tree's
   clusters of the same module key inherits id, slug, title and `title_source`; otherwise
   `c-<sha1>` and a default slug = distinctive common directory (if unique among the module's
   clusters, generic dirs like `src`/`ui`/`impl` excluded) else the highest-PageRank type name.
   `tree.titles` overrides titles (`title_source: user`).

Deviation from design-v2 §2.1: there is no L3.1 second-level split; oversize clusters are split
into flat L3 siblings so the 40-symbol limit always holds and depth stays ≤ 4.

## Repair (`repairTree`)

For every module whose key existed before and had clusters:

1. `rename`: renamed core ids are replaced in place.
2. `delete`: vanished core ids are removed; empty clusters are deleted, clusters < 3 get
   `needs_review: ["merge"]`.
3. If `added_core / core_before > tau_grow (0.33)` the module is re-clustered (`recluster`,
   Jaccard inheritance keeps ids).
4. Otherwise each added core symbol goes through `pin` → `same_file` (cluster of a core symbol in
   the same file) → `same_dir` (exactly one cluster in the directory) → `neighbor_majority`
   (> 50 % of the reference weight to placed neighbours) → `llm_route` (parked in a `misc`
   cluster with `needs_review: ["llm_route"]`, listed in `RepairResult.llmRoute`).

New modules (`new_module`) and formerly-leaf modules are clustered normally; removed modules and
their clusters are listed in `deleted`. If `(created + deleted + re-clustered clusters) / all
clusters > tau_tree (0.3)` the tree is rebuilt with `buildTree` (still inheriting ids);
`rebuilt: true`, decision `rebuild`.

## Rendering

All generated content lives in `<!-- kb:<name> [attrs] -->…<!-- /kb:<name> -->` blocks
(`upsertKbBlock` replaces by name and, for diagrams, by `id=`; human text is never touched;
breadcrumbs go after the first H1, other blocks are appended).

- `renderIndex(tree, id)`: `<!-- maintained by kb … -->`, H1, breadcrumb, overview link and a
  `| Page | Kind | Detail | Importance | Summary |` table of children ordered by importance.
- `renderBreadcrumb`: `> [Repo](../overview.md) › [:app](overview.md) › Cart` (relative links).
- `renderLlmsTxt`: `# title`, `> summary`, one `## <project>` section per L1 (or one section
  when L1 is collapsed) with nested `- [title](page): first sentence of summary`.
- Mermaid (node ids `n` + sha1[:6], labels quoted/escaped, capped node counts with `… +N`):
  `projectDiagram` (L0), `moduleDependencyDiagram` (build deps `-->`, reference-only links `-.-`),
  `clusterDiagram` (L2, from `related`), `navigationDiagram` (facts.routes + facts.navigation,
  edge label = nav kind). `nodeDiagrams(tree, id, facts)` picks the set for a node;
  `diagramBlock`/`diagramFresh` add/check the `hash=` attribute for verify.

## Evaluation on real repositories

`test/tree/real-repos.test.ts` (opt-in, `KB_TREE_REPOS='[{"root":…,"graph":…}]'`) runs
detection, layering and clustering on read-only checkouts using a symbol graph from
`kb scan --symbols --out graph.json`, checks determinism (reversed symbol order → byte-identical
JSON), and measures stability after dropping 1 % of core symbols. Results (Go v1 scanner graphs,
2026-10-21):

| Repo | symbols / core | projects | depth | nodes L1 / L2 / L3 | cluster size p50 / p90 / max | leaf modules | build ms | rebuild id-retention / NMI | repair id-retention |
|---|---|---|---|---|---|---|---|---|---|
| nowinandroid | 1,748 / 484 | 2 (gradle, build-logic) | 3 | 2 / 35 / 10 | 7 / 17 / 17 | 35 | 85 | 0.90 / 0.99 | 1.00 |
| element-x-android | 22,161 / 5,951 | 2 (dynamic includes → 257 modules) | 3 | 2 / 263 / 405 | 9 / 19 / 40 | 229 | 1,853 | 0.91 / 0.98 | 1.00 |
| HarmonyOS Cases (CommonAppDevelopment) | 12,947 / 1,815 | 1 hvigor (L1 collapsed) | 2 | – / 172 / 28 | 5 / 40 / 40 | 169 | 164 | 0.96 / 1.00 | 1.00 |
| kickstarter ios-oss | 37,731 / 2,577 | 10 (Xcode + 8 SwiftPM) | 3 | 9 / 33 / 254 | 5 / 25 / 40 | 25 | 648 | 0.89 / 0.97 | 1.00 |
| IceCubesApp | 6,058 / 539 | 14 (Xcode + SwiftPM packages) | 3 | 14 / 35 / 29 | 9 / 20 / 27 | 30 | 101 | 0.97 / 0.99 | 1.00 |
| kotlinconf-app (KMP) | 1,442 / 544 | 2 (Gradle + Xcode iosApp) | 3 | 2 / 8 / 47 | 8 / 26 / 37 | 5 | 128 | – | – |
| wikipedia-ios | 31,452 / 2,020 | 5 (Xcode 11 targets + 4 SwiftPM) | 3 | 5 / 19 / 211 | 6 / 22 / 40 | 11 | 634 | – | – |
| fishpi-harmony | 1,004 / 203 | 1 hvigor | 2 | – / 2 / 17 | 7 / 29 / 39 | 1 | 48 | – | – |

All runs deterministic; no cluster outside 3–40. "Build ms" covers core-graph construction,
PageRank, clustering and finalize (detection adds 25–260 ms). A small edit through
`repairTree` keeps every cluster id and page; a from-scratch rebuild with Jaccard inheritance
keeps ~90–97 %.

Known limits: Gradle DSL is never executed (dynamic `include` falls back to build-script
discovery); Xcode targets without a Sources phase and without synchronized groups are skipped;
Web/TS workspaces (`package.json` workspaces) are not detected yet.
