// Types of the hierarchical wiki tree (design-v2 §2): L0 repo → L1 project →
// L2 build module → L3 feature cluster. The symbol graph / facts types come from
// src/model.ts; everything here is tree-specific.
import type { Graph, Facts, Symbol as GraphSymbol } from '../model.js';

export type { Graph, Facts, GraphSymbol };

export const TreeVersion = 2;
export const ClusterAlgo = 'leiden-v1';

export type NodeKind = 'repo' | 'project' | 'module' | 'cluster';
export type Importance = 'high' | 'medium' | 'low';
export type TitleSource = 'det' | 'llm' | 'user';

/** One node of module_tree.json. JSON field names are snake_case (serialized as-is, keys sorted). */
export interface TreeNode {
  id: string;
  level: 0 | 1 | 2 | 3;
  kind: NodeKind;
  title: string;
  title_source?: TitleSource;
  slug?: string;
  /** wiki-relative page path, e.g. pages/shop-android/feature-cart/cart-state.md */
  page: string;
  /** wiki-relative index page for nodes with children (L0/L1/L2) */
  index?: string;
  /** repo-relative project root (L1) or module root (L2) */
  root?: string;
  /** module roots (an Xcode target or merged module may own several dirs) */
  paths?: string[];
  platform?: string;
  /** gradle | swiftpm | xcode | hvigor | heuristic */
  build?: string;
  /** e.g. android-module, swift-target, xcode-target, HAP, HAR, HSP */
  module_type?: string;
  /** stable module key "<build>:<project root>::<module name>" (L2 holders; survives level collapsing) */
  key?: string;
  /** build-file dependencies (module node ids) */
  deps?: string[];
  /** modules linked by cross-module symbol references (either direction) */
  ref_deps?: string[];
  /** repo-relative files (L2 only; L3 files are derived from core) */
  files?: string[];
  /** core symbol ids (L3; L2 leaf modules keep theirs too) */
  core?: string[];
  members_hash?: string;
  routes?: string[];
  importance?: Importance;
  /** top-3 related clusters by cross-cluster reference weight */
  related?: string[];
  tokens?: number;
  summary?: string;
  /** sha256 over children (id, members_hash, summary) — parent pages go stale when it changes */
  children_digest?: string;
  /** user pin patterns that forced members into this node */
  pinned?: string[];
  /** repair marked this node for LLM routing / merge review */
  needs_review?: string[];
  children?: TreeNode[];
}

export interface ModuleTree {
  version: 2;
  generated_by: string;
  head: string;
  algo: {
    cluster: string;
    gamma: number;
    weights: string;
    min_core: number;
    max_core: number;
    budget_tokens: number;
    seed: string;
  };
  root: TreeNode;
  warnings?: string[];
}

/** `tree:` section of codewiki.yaml (design-v2 §3.6). */
export interface TreeConfig {
  max_core_per_cluster: number;
  min_core_per_cluster: number;
  budget_tokens: number;
  tau_grow: number;
  tau_tree: number;
  gamma: number;
  pins: { match: string; cluster: string }[];
  titles: Record<string, string>;
  notes: { node: string; note: string }[];
}

export function defaultTreeConfig(): TreeConfig {
  return {
    max_core_per_cluster: 40,
    min_core_per_cluster: 3,
    budget_tokens: 32000,
    tau_grow: 0.33,
    tau_tree: 0.3,
    gamma: 1.0,
    pins: [],
    titles: {},
    notes: [],
  };
}

/** A detected build module (L2 candidate). */
export interface BuildModule {
  /** build-system name, e.g. ":feature:cart", "Library", "entry" */
  name: string;
  /** repo-relative module root dirs ("" = repo root) */
  roots: string[];
  /** explicit repo-relative file membership (Xcode source build phase) */
  files?: string[];
  module_type: string;
  /** dependency module names (same namespace as `name`) */
  deps: string[];
}

/** A detected project (L1 candidate). */
export interface BuildProject {
  /** repo-relative project root ("" = repo root) */
  root: string;
  build: 'gradle' | 'swiftpm' | 'xcode' | 'hvigor' | 'heuristic';
  name: string;
  platform?: string;
  /** the marker file that defined it (repo-relative) */
  marker: string;
  modules: BuildModule[];
  warnings: string[];
}

/** Read-only view of the repository used by build detection. */
export interface FileSource {
  /** repo-relative paths (forward slashes) of all candidate files */
  list(): string[];
  read(rel: string): string | undefined;
  /** byte size, used for the token estimate */
  size?(rel: string): number | undefined;
}

export interface TreeInput {
  graph: Graph;
  projects: BuildProject[];
  facts?: Facts | null;
  config?: Partial<TreeConfig>;
  /** repo-relative file → byte size (token estimate = bytes/4); falls back to symbol spans */
  fileBytes?: Record<string, number>;
  /** previous module_tree.json for Jaccard id inheritance */
  prev?: ModuleTree | null;
  title?: string;
  head?: string;
  generatedBy?: string;
}

/** Symbol-level change set between two graphs. */
export interface GraphDelta {
  added: string[];
  deleted: string[];
  renamed: { from: string; to: string }[];
  /** symbols whose body/signature changed (informational) */
  changed?: string[];
}

export type RepairRule =
  | 'pin'
  | 'rename'
  | 'delete'
  | 'same_file'
  | 'same_dir'
  | 'neighbor_majority'
  | 'llm_route'
  | 'new_module'
  | 'recluster'
  | 'rebuild';

export interface RepairDecision {
  symbol?: string;
  module: string;
  rule: RepairRule;
  cluster?: string;
  from?: string;
}

export interface RepairResult {
  tree: ModuleTree;
  decisions: RepairDecision[];
  reclustered: string[];
  created: string[];
  deleted: string[];
  renamedPages: { from: string; to: string }[];
  /** symbols that no rule could place (parked in misc / needs_review) */
  llmRoute: string[];
  rebuilt: boolean;
  /** (created+deleted+reclustered clusters) / all clusters */
  treeChangeRatio: number;
}

export type PatchOp =
  | { op: 'rename'; node: string; title?: string; slug?: string }
  | { op: 'merge'; node: string; into: string; title?: string; slug?: string }
  | { op: 'split'; node: string; members: string[][]; titles?: string[] };

export interface PatchError {
  index: number;
  op: string;
  node: string;
  error: string;
}
