# codewiki · tree (hierarchical wiki, L0–L3)

`wiki/module_tree.json` is the single source of structure. kb builds it from build files and
the symbol graph; you never edit it by hand (use a tree-patch, below).

| Level | Node | Page | Index |
|---|---|---|---|
| L0 | repo | `pages/overview.md` | `index.md` (tree section) |
| L1 | project (Gradle settings, Package.swift, Xcode, hvigor; heuristic per platform) | `pages/<p>/overview.md` | `pages/<p>/index.md` |
| L2 | build module (Gradle module, SwiftPM / Xcode target, HAP/HAR/HSP) | `pages/<p>/<m>/overview.md` | `pages/<p>/<m>/index.md` |
| L3 | feature cluster (Leiden over core symbols; only for modules > `tree.budget_tokens`) | `pages/<holder>/<slug>.md` | — |

Levels collapse when they carry no information (one project → no L1 page, one module → the
project page is the module page), so depth can be smaller than the level number.

## Commands

```bash
kb tree show [--json]                  # the tree (computed when there is no wiki yet)
kb tree explain <symbol-id|file>       # which page documents it: node, page, breadcrumb path
kb tree build [--rebuild] [--dry-run]  # (re)build module_tree.json; kb compound does this every run
kb tree patch ops.json [--dry-run]     # rename / merge / split clusters (validated); then kb compound
kb plan --json                         # plan.tree: build|repair|rebuild, decisions, tree page tasks
```

`kb compound` builds the tree on the first run (or `--full`) and repairs it incrementally
(rename → delete → same_file → same_dir → neighbor_majority → misc; `tau_grow` re-clusters a
module, `tau_tree` rebuilds), keeping cluster ids and page paths stable.

## Pages

Every tree page has frontmatter `level`, `tree_node`, `parent`, `summary`, `importance`,
`children_digest` (parents) or `sources` (leaves), and kb-owned blocks:
`<!-- kb:breadcrumb -->`, `kb:children` (child table with summaries), `kb:symbols` (L4 symbol
table), `kb:routes` (feature pages), `kb:diagram id=… hash=…` (mermaid: projects, module deps,
navigation, clusters) and `kb:sources` (`Sources: path:start-end`).

As the per-task writer for a tree page: write prose only **outside** the kb blocks (kb rewrites
them after you), describe the node from the given children summaries (parents) or the given
source (leaves), keep the frontmatter you were given. Pages are written bottom-up.

`kb verify` fails with `E_KB_BLOCK_STALE` / `E_TREE_STALE` when blocks, digests or anchors no
longer match the code; `kb compound` fixes them.

## Config (`codewiki.yaml`)

```yaml
tree:
  budget_tokens: 32000        # split a module into L3 clusters above this (small repos: lower it)
  max_core_per_cluster: 40
  pins: [{ match: "apps/shop-android/**/cart/**", cluster: cart }]
  titles: { "shop-android/c-1d92f54a": "购物车" }
```
