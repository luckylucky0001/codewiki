// module_tree.json construction (L0–L3), serialization and navigation helpers.
import type { ModuleTree, TreeConfig, TreeInput, TreeNode, Importance, Graph } from './types.js';
import { ClusterAlgo, TreeVersion, defaultTreeConfig } from './types.js';
import { layer, type LayerModule, type Layering } from './layer.js';
import { buildCoreGraph, pageRank, WeightsLabel, type CoreGraph } from './cluster/symgraph.js';
import { clusterId, defaultSlug, humanize, matchPrev, membersHash, partitionModule, type PrevCluster } from './cluster/cluster.js';
import { cmp, globRe, kebab, sha256, stableJSON, uniqSorted } from './util.js';

export function resolveConfig(c?: Partial<TreeConfig>): TreeConfig {
  const d = defaultTreeConfig();
  if (!c) return d;
  const out = { ...d };
  for (const k of Object.keys(d) as (keyof TreeConfig)[]) {
    if (Object.prototype.hasOwnProperty.call(c, k) && c[k] !== undefined && c[k] !== null) (out as Record<string, unknown>)[k] = c[k];
  }
  return out;
}

/** Token estimate of a file: bytes/4; without sizes, ~40 bytes per line of its symbols. */
export function fileTokens(graph: Graph, fileBytes: Record<string, number> | undefined): Map<string, number> {
  const out = new Map<string, number>();
  const maxLine = new Map<string, number>();
  for (const s of graph.symbols) maxLine.set(s.file, Math.max(maxLine.get(s.file) ?? 0, s.end_line));
  for (const f of Object.keys(graph.files)) {
    const b = fileBytes && Object.prototype.hasOwnProperty.call(fileBytes, f) ? fileBytes[f]! : (maxLine.get(f) ?? 0) * 40;
    out.set(f, Math.ceil(b / 4));
  }
  return out;
}

export interface BuildContext {
  cfg: TreeConfig;
  layering: Layering;
  cg: CoreGraph;
  pr: Map<string, number>;
  tokens: Map<string, number>;
}

export function prepare(input: TreeInput): BuildContext {
  const cfg = resolveConfig(input.config);
  const layering = layer(input.graph, input.projects);
  const cg = buildCoreGraph(input.graph, layering.fileModule, input.facts);
  return { cfg, layering, cg, pr: pageRank(cg), tokens: fileTokens(input.graph, input.fileBytes) };
}

/** Collects previous clusters per module key (for Jaccard inheritance). */
export function prevClusters(prev: ModuleTree | null | undefined): Map<string, PrevCluster[]> {
  const out = new Map<string, PrevCluster[]>();
  if (!prev) return out;
  walk(prev.root, (n) => {
    if (!n.key || !n.children) return;
    const cs = n.children.filter((c) => c.kind === 'cluster');
    if (cs.length) out.set(n.key, cs.map((c) => ({ id: c.id, core: c.core ?? [], slug: c.slug, title: c.title, title_source: c.title_source, page: c.page })));
  });
  return out;
}

function prevNodes(prev: ModuleTree | null | undefined): Map<string, TreeNode> {
  const out = new Map<string, TreeNode>();
  if (prev) walk(prev.root, (n) => void out.set(n.id, n));
  return out;
}

export function pagesDir(holderId: string): string {
  return holderId ? `pages/${holderId}` : 'pages';
}

/** Builds L3 cluster children for a module holder node. Exported for repair (recluster). */
export function clusterHolder(ctx: BuildContext, holder: TreeNode, m: LayerModule, prev: PrevCluster[] | undefined, forced = false): void {
  const { cfg, cg, pr } = ctx;
  const core = cg.core.get(m.key) ?? [];
  const tokens = holder.tokens ?? 0;
  delete holder.children;
  holder.core = core.slice();
  if (!forced && tokens <= cfg.budget_tokens && core.length <= cfg.max_core_per_cluster) return;
  // user pins first
  const pinned = new Map<string, { ids: string[]; pats: string[] }>();
  const pinOf = new Map<string, string>();
  for (const p of cfg.pins) {
    const re = globRe(p.match);
    for (const id of core) {
      if (pinOf.has(id)) continue;
      if (re.test(cg.coreFile.get(id)!) || re.test(id)) {
        pinOf.set(id, p.cluster);
        let g = pinned.get(p.cluster);
        if (!g) pinned.set(p.cluster, (g = { ids: [], pats: [] }));
        g.ids.push(id);
        if (!g.pats.includes(p.match)) g.pats.push(p.match);
      }
    }
  }
  const free = core.filter((id) => !pinOf.has(id));
  const parts = partitionModule(m.key, free, cg, { gamma: cfg.gamma, minCore: cfg.min_core_per_cluster, maxCore: cfg.max_core_per_cluster });
  const groups: { core: string[]; pin?: string; pats?: string[] }[] = parts.map((c) => ({ core: c }));
  for (const [slug, g] of [...pinned.entries()].sort((a, b) => cmp(a[0], b[0]))) groups.push({ core: g.ids.sort(cmp), pin: slug, pats: g.pats });
  if (groups.length < 2 && !pinned.size) return; // a single cluster adds no level
  const match = matchPrev(groups.map((g) => g.core), prev ?? []);
  const usedSlug = new Set<string>(['overview', 'index']);
  const usedId = new Set<string>();
  const children: TreeNode[] = [];
  // inherited / pinned slugs reserve first so new clusters never steal them
  const order = groups.map((_, i) => i).sort((a, b) => Number(match.has(b) || !!groups[b]!.pin) - Number(match.has(a) || !!groups[a]!.pin) || a - b);
  const slugs: string[] = [];
  for (const i of order) {
    const g = groups[i]!;
    const p = match.get(i);
    let slug = g.pin ? kebab(g.pin) : p?.slug ?? defaultSlug(g.core, cg, m.roots, pr);
    if (usedSlug.has(slug)) {
      const top = g.core.reduce((a, b) => ((pr.get(b) ?? 0) > (pr.get(a) ?? 0) + 1e-15 ? b : a));
      const alt = kebab(slug + '-' + (cg.sym.get(top)?.name ?? ''));
      slug = alt && !usedSlug.has(alt) ? alt : slug;
      let k = 2;
      const base = slug;
      while (usedSlug.has(slug)) slug = `${base}-${k++}`;
    }
    usedSlug.add(slug);
    slugs[i] = slug;
  }
  groups.forEach((g, i) => {
    const p = match.get(i);
    const files = uniqSorted(g.core.map((c) => cg.coreFile.get(c)!));
    let cid = p ? p.id.split('/').pop()! : clusterId(g.core, files);
    let k = 2;
    const base = cid;
    while (usedId.has(cid)) cid = `${base}-${k++}`;
    usedId.add(cid);
    const id = holder.id ? `${holder.id}/${cid}` : cid;
    const slug = slugs[i]!;
    const n: TreeNode = {
      id,
      level: 3,
      kind: 'cluster',
      title: p?.title && p.title_source !== 'det' ? p.title : humanize(slug),
      title_source: p?.title_source && p.title_source !== 'det' ? p.title_source : 'det',
      slug,
      page: `${pagesDir(holder.id)}/${slug}.md`,
      core: g.core,
      members_hash: membersHash(g.core),
    };
    if (g.pin) n.pinned = g.pats;
    const routes = uniqSorted(g.core.flatMap((c) => cg.routes.get(c) ?? []));
    if (routes.length) n.routes = routes;
    n.tokens = files.reduce((s, f) => s + (ctx.tokens.get(f) ?? 0), 0);
    children.push(n);
  });
  holder.children = children.sort((a, b) => cmp(a.id, b.id));
  delete holder.core;
}

/** Builds the full tree (L0–L3) from scratch, inheriting cluster ids/slugs/titles from input.prev. */
export type ClusterFn = (ctx: BuildContext, holder: TreeNode, m: LayerModule, prev: PrevCluster[] | undefined) => void;

export function buildTree(input: TreeInput, ctx: BuildContext = prepare(input), clusterFn: ClusterFn = clusterHolder): ModuleTree {
  const { cfg, layering } = ctx;
  const prevC = prevClusters(input.prev);
  const root: TreeNode = { id: 'repo', level: 0, kind: 'repo', title: input.title ?? 'Repository', page: 'pages/overview.md', index: 'index.md' };
  const single = layering.projects.length === 1;
  const holders = new Map<string, TreeNode>(); // module key → node
  const projNodes: TreeNode[] = [];
  for (const p of layering.projects) {
    const pid = single ? '' : p.slug;
    const pn: TreeNode = single
      ? root
      : { id: pid, level: 1, kind: 'project', title: p.title, slug: p.slug, page: `pages/${pid}/overview.md`, index: `pages/${pid}/index.md` };
    pn.root = p.root;
    pn.build = p.build;
    if (p.platform) pn.platform = p.platform;
    const mods: TreeNode[] = [];
    for (const m of p.modules) {
      let h: TreeNode;
      if (p.modules.length === 1) h = pn; // L2 collapses into its project
      else {
        const id = pid ? `${pid}/${m.slug}` : m.slug;
        h = { id, level: 2, kind: 'module', title: m.name === '(root)' ? `${p.title} (root)` : m.name, slug: m.slug, page: `pages/${id}/overview.md` };
        mods.push(h);
      }
      fillModule(ctx, h, m);
      holders.set(m.key, h);
      clusterFn(ctx, h, m, prevC.get(m.key));
      if (h.children?.length || h === pn) h.index = h.id ? `pages/${h.id}/index.md` : 'index.md';
    }
    if (mods.length) pn.children = mods.sort((a, b) => cmp(a.id, b.id));
    if (!single) projNodes.push(pn);
  }
  if (!single) root.children = projNodes.sort((a, b) => cmp(a.id, b.id));
  const tree: ModuleTree = {
    version: TreeVersion,
    generated_by: input.generatedBy ?? 'kb 0.2.0',
    head: input.head ?? input.graph.commit ?? '',
    algo: { cluster: ClusterAlgo, gamma: cfg.gamma, weights: WeightsLabel, min_core: cfg.min_core_per_cluster, max_core: cfg.max_core_per_cluster, budget_tokens: cfg.budget_tokens, seed: 'sha256(module key)' },
    root,
  };
  if (layering.warnings.length) tree.warnings = layering.warnings.slice();
  finalize(tree, ctx, holders, input.prev);
  return tree;
}

export function fillModule(ctx: BuildContext, h: TreeNode, m: LayerModule): void {
  h.key = m.key;
  h.module_type = m.module_type;
  h.paths = m.roots.slice();
  h.files = m.files.slice();
  h.tokens = m.files.reduce((s, f) => s + (ctx.tokens.get(f) ?? 0), 0);
}

/** Recomputes derived fields: deps, related, routes, importance, titles, summaries, digests. */
export function finalize(tree: ModuleTree, ctx: BuildContext, holders: Map<string, TreeNode>, prev?: ModuleTree | null): void {
  const { cg, pr, cfg, layering } = ctx;
  // build deps
  const modByKey = new Map(layering.projects.flatMap((p) => p.modules.map((m) => [m.key, m] as const)));
  for (const [key, h] of holders) {
    const m = modByKey.get(key);
    const deps = uniqSorted((m?.deps ?? []).map((d) => holders.get(d)?.id).filter((x): x is string => x !== undefined && x !== h.id));
    if (deps.length) h.deps = deps;
    else delete h.deps;
  }
  // core → node (cluster or leaf module) for related/ref deps
  const coreNode = new Map<string, TreeNode>();
  const coreHolder = new Map<string, TreeNode>();
  for (const [key, h] of holders) {
    for (const c of cg.core.get(key) ?? []) coreHolder.set(c, h);
    if (h.children?.some((c) => c.kind === 'cluster')) for (const c of h.children) for (const id of c.core ?? []) coreNode.set(id, c);
    else for (const id of h.core ?? []) coreNode.set(id, h);
  }
  const rel = new Map<string, Map<string, number>>();
  const refDeps = new Map<string, Set<string>>();
  for (const [k, w] of cg.edges) {
    const [a, b] = k.split('\u0000') as [string, string];
    const na = coreNode.get(a), nb = coreNode.get(b);
    if (na && nb && na !== nb) {
      for (const [x, y] of [[na, nb], [nb, na]] as const) {
        let m = rel.get(x.id);
        if (!m) rel.set(x.id, (m = new Map()));
        m.set(y.id, (m.get(y.id) ?? 0) + w);
      }
    }
    const ha = coreHolder.get(a), hb = coreHolder.get(b);
    if (ha && hb && ha !== hb) {
      let s = refDeps.get(ha.id);
      if (!s) refDeps.set(ha.id, (s = new Set()));
      s.add(hb.id);
      let t = refDeps.get(hb.id);
      if (!t) refDeps.set(hb.id, (t = new Set()));
      t.add(ha.id);
    }
  }
  for (const h of holders.values()) {
    const s = refDeps.get(h.id);
    if (s?.size) h.ref_deps = uniqSorted(s);
    else delete h.ref_deps;
  }
  const prevById = prevNodes(prev);
  const score = new Map<string, number>();
  const visit = (n: TreeNode): number => {
    let s = 0;
    for (const c of n.core ?? []) s += pr.get(c) ?? 0;
    for (const c of n.children ?? []) s += visit(c);
    score.set(n.id, s);
    if (n.kind === 'cluster' || (n.core && !n.children)) {
      const r = [...(rel.get(n.id) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0])).slice(0, 3).map((x) => x[0]);
      if (r.length) n.related = r;
      else delete n.related;
      if (n.kind !== 'cluster') {
        const routes = uniqSorted((n.core ?? []).flatMap((c) => cg.routes.get(c) ?? []));
        if (routes.length) n.routes = routes;
      }
      if (n.core) n.members_hash = membersHash(n.core);
    }
    const t = cfg.titles[n.id];
    if (t) {
      n.title = t;
      n.title_source = 'user';
    }
    const p = prevById.get(n.id);
    if (p?.summary && p.members_hash === n.members_hash) n.summary = p.summary;
    return s;
  };
  visit(tree.root);
  // importance per level: top 20% high, bottom 40% low
  const byLevel = new Map<number, TreeNode[]>();
  walk(tree.root, (n) => {
    if (n.level === 0) return;
    let xs = byLevel.get(n.level);
    if (!xs) byLevel.set(n.level, (xs = []));
    xs.push(n);
  });
  for (const xs of byLevel.values()) {
    xs.sort((a, b) => score.get(b.id)! - score.get(a.id)! || cmp(a.id, b.id));
    xs.forEach((n, i) => {
      const q = (i + 0.5) / xs.length;
      n.importance = (q <= 0.2 ? 'high' : q > 0.6 ? 'low' : 'medium') as Importance;
    });
  }
  updateDigests(tree.root);
}

/** children_digest = sha256 over children (id, members_hash, sha256(summary)), bottom-up. */
export function updateDigests(n: TreeNode): void {
  if (!n.children?.length) {
    delete n.children_digest;
    return;
  }
  for (const c of n.children) updateDigests(c);
  const lines = n.children
    .map((c) => `${c.id}\t${c.members_hash ?? c.children_digest ?? ''}\t${sha256(c.summary ?? '')}`)
    .sort(cmp);
  n.children_digest = sha256(lines.join('\n'));
}

export function walk(n: TreeNode, fn: (n: TreeNode, parent: TreeNode | undefined, depth: number) => void, parent?: TreeNode, depth = 0): void {
  fn(n, parent, depth);
  for (const c of n.children ?? []) walk(c, fn, n, depth + 1);
}

export function findNode(tree: ModuleTree, id: string): TreeNode | undefined {
  let hit: TreeNode | undefined;
  walk(tree.root, (n) => {
    if (n.id === id) hit = n;
  });
  return hit;
}

/** Root-first ancestor chain ending at the node itself. */
export function ancestors(tree: ModuleTree, id: string): TreeNode[] {
  const path: TreeNode[] = [];
  const rec = (n: TreeNode): boolean => {
    path.push(n);
    if (n.id === id) return true;
    for (const c of n.children ?? []) if (rec(c)) return true;
    path.pop();
    return false;
  };
  return rec(tree.root) ? path : [];
}

/** Which node owns a symbol id or a file (kb tree explain). */
export function explain(tree: ModuleTree, target: string, cg?: CoreGraph): { node: TreeNode; via: 'core' | 'owner' | 'file' } | undefined {
  let out: { node: TreeNode; via: 'core' | 'owner' | 'file' } | undefined;
  const owner = cg?.owner.get(target);
  walk(tree.root, (n) => {
    if (out) return;
    if (n.core?.includes(target)) out = { node: n, via: 'core' };
    else if (owner && n.core?.includes(owner)) out = { node: n, via: 'owner' };
  });
  if (out) return out;
  walk(tree.root, (n) => {
    if (!out && n.files?.includes(target)) out = { node: n, via: 'file' };
  });
  const found = out as { node: TreeNode; via: 'core' | 'owner' | 'file' } | undefined;
  if (found && found.node.children && cg) {
    // descend into the cluster holding the file's cores
    for (const c of found.node.children) if (c.core?.some((id) => cg.coreFile.get(id) === target)) return { node: c, via: 'file' };
  }
  return found;
}

export interface TreeStats {
  depth: number;
  nodesPerLevel: Record<string, number>;
  clusters: number;
  clusterSizes: { min: number; p50: number; p90: number; max: number; mean: number; histogram: Record<string, number> };
  leafModules: number;
}

export function treeStats(tree: ModuleTree): TreeStats {
  let depth = 0;
  const per: Record<string, number> = {};
  const sizes: number[] = [];
  let leafModules = 0;
  walk(tree.root, (n, _p, d) => {
    depth = Math.max(depth, d);
    per[`L${n.level}`] = (per[`L${n.level}`] ?? 0) + 1;
    if (n.kind === 'cluster') sizes.push(n.core?.length ?? 0);
    else if (!n.children?.length) leafModules++;
  });
  sizes.sort((a, b) => a - b);
  const q = (p: number) => (sizes.length ? sizes[Math.min(sizes.length - 1, Math.floor(p * sizes.length))]! : 0);
  const hist: Record<string, number> = {};
  for (const s of sizes) {
    const b = s < 3 ? '<3' : s <= 5 ? '3-5' : s <= 10 ? '6-10' : s <= 20 ? '11-20' : s <= 40 ? '21-40' : '>40';
    hist[b] = (hist[b] ?? 0) + 1;
  }
  return {
    depth,
    nodesPerLevel: per,
    clusters: sizes.length,
    clusterSizes: { min: sizes[0] ?? 0, p50: q(0.5), p90: q(0.9), max: sizes[sizes.length - 1] ?? 0, mean: sizes.length ? +(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1) : 0, histogram: hist },
    leafModules,
  };
}

/** module_tree.json text: sorted keys, 2-space indent, trailing newline. */
export function serializeTree(tree: ModuleTree): string {
  return stableJSON(tree);
}

export function parseTree(text: string): ModuleTree {
  const o = JSON.parse(text) as ModuleTree;
  if (!o || typeof o !== 'object' || o.version !== TreeVersion || !o.root) throw new Error(`module_tree.json: unsupported version ${String((o as { version?: unknown })?.version)} (want ${TreeVersion})`);
  return o;
}
