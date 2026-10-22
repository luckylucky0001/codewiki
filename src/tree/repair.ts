// Incremental tree repair (design-v2 §3.2). Rule chain per added core symbol:
// pin → same_file → same_dir → neighbor_majority → llm_route (parked in `misc`,
// node marked needs_review). Renames are replaced in place, deletions removed.
// A module whose added core exceeds tau_grow·|core_before| is re-clustered (ids
// inherited by Jaccard); if (created+deleted+reclustered)/all clusters exceeds
// tau_tree the whole tree is rebuilt (again inheriting ids).
import type { Graph, GraphDelta, ModuleTree, RepairDecision, RepairResult, TreeInput, TreeNode } from './types.js';
import { buildTree, clusterHolder, pagesDir, prepare, walk, type BuildContext } from './tree.js';
import type { LayerModule } from './layer.js';
import type { PrevCluster } from './cluster/cluster.js';
import { membersHash } from './cluster/cluster.js';
import { cmp, dirname, globRe, sha1, uniqSorted } from './util.js';

/** Symbol delta between two graphs; renames = deleted/added pairs with equal kind+norm_hash in the same file (or same name+kind). */
export function deltaFromGraphs(prev: Graph, next: Graph): GraphDelta {
  const a = new Map(prev.symbols.map((s) => [s.id, s]));
  const b = new Map(next.symbols.map((s) => [s.id, s]));
  const added = [...b.keys()].filter((id) => !a.has(id)).sort(cmp);
  const deleted = [...a.keys()].filter((id) => !b.has(id)).sort(cmp);
  const changed = [...b.keys()].filter((id) => a.has(id) && a.get(id)!.hash !== b.get(id)!.hash).sort(cmp);
  const renamed: { from: string; to: string }[] = [];
  const byNorm = new Map<string, string[]>();
  for (const id of added) {
    const s = b.get(id)!;
    const k = `${s.kind}\u0000${s.norm_hash}`;
    byNorm.set(k, [...(byNorm.get(k) ?? []), id]);
  }
  const usedAdded = new Set<string>();
  const usedDeleted = new Set<string>();
  for (const id of deleted) {
    const s = a.get(id)!;
    const cands = (byNorm.get(`${s.kind}\u0000${s.norm_hash}`) ?? []).filter((x) => !usedAdded.has(x));
    if (cands.length === 1) {
      renamed.push({ from: id, to: cands[0]! });
      usedAdded.add(cands[0]!);
      usedDeleted.add(id);
    }
  }
  return { added: added.filter((x) => !usedAdded.has(x)), deleted: deleted.filter((x) => !usedDeleted.has(x)), renamed, changed };
}

export interface RepairOptions {
  /** force a full rebuild (kb tree --rebuild) */
  rebuild?: boolean;
}

export function repairTree(prev: ModuleTree, input: TreeInput, delta: GraphDelta, opts: RepairOptions = {}): RepairResult {
  const inp: TreeInput = { ...input, prev };
  const ctx = prepare(inp);
  const decisions: RepairDecision[] = [];
  const reclustered: string[] = [];
  const created: string[] = [];
  const deletedNodes: string[] = [];
  const llmRoute: string[] = [];
  const prevKeys = new Set<string>();
  walk(prev.root, (n) => {
    if (!n.key) return;
    prevKeys.add(n.key);
  });
  const renameMap = new Map(delta.renamed.map((r) => [r.from, r.to]));
  const addedSet = new Set(delta.added);
  for (const r of delta.renamed) addedSet.delete(r.to);

  const repairHolder = (c: BuildContext, h: TreeNode, m: LayerModule, prevC: PrevCluster[] | undefined): void => {
    if (opts.rebuild) {
      clusterHolder(c, h, m, prevC);
      return;
    }
    if (!prevKeys.has(m.key)) {
      clusterHolder(c, h, m, undefined);
      decisions.push({ module: h.id, rule: 'new_module' });
      for (const ch of h.children ?? []) created.push(ch.id);
      return;
    }
    if (!prevC?.length) {
      // previously a leaf module: cluster only if it now exceeds the budget
      clusterHolder(c, h, m, undefined);
      for (const ch of h.children ?? []) created.push(ch.id);
      if (h.children?.length) decisions.push({ module: h.id, rule: 'recluster' });
      return;
    }
    const cg = c.cg;
    const core = cg.core.get(m.key) ?? [];
    const coreSet = new Set(core);
    const clusters = prevC.map((p) => ({ ...p, core: p.core.slice(), review: [] as string[] }));
    const full = (cl: { id: string }) => (h.id ? `${h.id}/${cl.id.split('/').pop()!}` : cl.id.split('/').pop()!);
    const before = clusters.reduce((s, x) => s + x.core.length, 0);
    // 1. rename in place
    for (const cl of clusters) {
      cl.core = cl.core.map((id) => {
        const to = renameMap.get(id);
        if (to && coreSet.has(to)) {
          decisions.push({ symbol: to, from: id, module: h.id, rule: 'rename', cluster: full(cl) });
          return to;
        }
        return id;
      });
    }
    // 2. delete
    for (const cl of clusters) {
      const keep = cl.core.filter((id) => coreSet.has(id));
      for (const id of cl.core) if (!coreSet.has(id)) decisions.push({ symbol: id, module: h.id, rule: 'delete', cluster: full(cl) });
      cl.core = keep;
    }
    // 3. route new core symbols
    const placed = new Map<string, (typeof clusters)[number]>();
    for (const cl of clusters) for (const id of cl.core) placed.set(id, cl);
    const added = core.filter((id) => !placed.has(id)).sort(cmp);
    if (before > 0 && added.length / before > c.cfg.tau_grow) {
      clusterHolder(c, h, m, prevC, true);
      reclustered.push(h.id);
      decisions.push({ module: h.id, rule: 'recluster' });
      return;
    }
    const weight = (a: string, b: string) => cg.edges.get(a < b ? a + '\u0000' + b : b + '\u0000' + a) ?? 0;
    const neighbors = new Map<string, string[]>();
    for (const k of cg.edges.keys()) {
      const [a, b] = k.split('\u0000') as [string, string];
      if (!coreSet.has(a) || !coreSet.has(b)) continue;
      neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
      neighbors.set(b, [...(neighbors.get(b) ?? []), a]);
    }
    let misc = clusters.find((x) => x.slug === 'misc');
    for (const id of added) {
      const file = cg.coreFile.get(id)!;
      let target: (typeof clusters)[number] | undefined;
      let rule: RepairDecision['rule'] = 'llm_route';
      const pin = c.cfg.pins.find((p) => globRe(p.match).test(file));
      if (pin) {
        target = clusters.find((x) => x.slug === pin.cluster);
        if (target) rule = 'pin';
      }
      if (!target) {
        const sameFile = [...placed.entries()].filter(([x]) => cg.coreFile.get(x) === file).map(([, cl]) => cl);
        if (sameFile.length) {
          target = sameFile.sort((a, b) => cmp(a.id, b.id))[0];
          rule = 'same_file';
        }
      }
      if (!target) {
        const dir = dirname(file);
        const inDir = new Set([...placed.entries()].filter(([x]) => dirname(cg.coreFile.get(x)!) === dir).map(([, cl]) => cl));
        if (inDir.size === 1) {
          target = [...inDir][0];
          rule = 'same_dir';
        }
      }
      if (!target) {
        const votes = new Map<(typeof clusters)[number], number>();
        let total = 0;
        for (const nb of neighbors.get(id) ?? []) {
          const cl = placed.get(nb);
          if (!cl) continue;
          const w = weight(id, nb);
          votes.set(cl, (votes.get(cl) ?? 0) + w);
          total += w;
        }
        for (const [cl, w] of [...votes.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0].id, b[0].id))) {
          if (w > total / 2) {
            target = cl;
            rule = 'neighbor_majority';
          }
          break;
        }
      }
      if (!target) {
        llmRoute.push(id);
        if (!misc) {
          misc = { id: `c-${sha1(m.key + '\nmisc').slice(0, 8)}`, core: [], slug: 'misc', title: 'Misc', title_source: 'det', review: [] };
          clusters.push(misc);
          created.push(h.id ? `${h.id}/${misc.id}` : misc.id);
        }
        target = misc;
        misc.review.push('llm_route');
      }
      target.core.push(id);
      placed.set(id, target);
      decisions.push({ symbol: id, module: h.id, rule, cluster: full(target) });
    }
    // 4. materialize; empty clusters vanish, undersize ones are flagged for merge review
    const children: TreeNode[] = [];
    for (const cl of clusters) {
      const cid = cl.id.split('/').pop()!;
      const id = h.id ? `${h.id}/${cid}` : cid;
      if (!cl.core.length) {
        deletedNodes.push(id);
        continue;
      }
      const coreIds = cl.core.slice().sort(cmp);
      const files = uniqSorted(coreIds.map((x) => cg.coreFile.get(x)!));
      const n: TreeNode = {
        id,
        level: 3,
        kind: 'cluster',
        title: cl.title ?? cl.slug ?? cid,
        title_source: cl.title_source ?? 'det',
        slug: cl.slug,
        page: `${pagesDir(h.id)}/${cl.slug}.md`,
        core: coreIds,
        members_hash: membersHash(coreIds),
        tokens: files.reduce((s, f) => s + (c.tokens.get(f) ?? 0), 0),
      };
      const routes = uniqSorted(coreIds.flatMap((x) => cg.routes.get(x) ?? []));
      if (routes.length) n.routes = routes;
      const review = uniqSorted([...cl.review, ...(coreIds.length < c.cfg.min_core_per_cluster ? ['merge'] : []), ...(coreIds.length > c.cfg.max_core_per_cluster ? ['split'] : [])]);
      if (review.length) n.needs_review = review;
      children.push(n);
    }
    delete h.core;
    h.children = children.sort((a, b) => cmp(a.id, b.id));
    if (h.children.length < 2) {
      // a single remaining cluster is no level: fold back into the module
      if (h.children.length === 1) deletedNodes.push(h.children[0]!.id);
      delete h.children;
      h.core = core.slice();
    }
  };

  let tree = buildTree(inp, ctx, repairHolder);
  // modules that disappeared
  const newKeys = new Set<string>();
  walk(tree.root, (n) => void (n.key && newKeys.add(n.key)));
  walk(prev.root, (n) => {
    if (n.key && !newKeys.has(n.key)) {
      deletedNodes.push(n.id);
      for (const ch of n.children ?? []) if (ch.kind === 'cluster') deletedNodes.push(ch.id);
    }
  });
  let total = 0;
  let reclusteredClusters = 0;
  const rset = new Set(reclustered);
  walk(tree.root, (n, p) => {
    if (n.kind !== 'cluster') return;
    total++;
    if (p && rset.has(p.id)) reclusteredClusters++;
  });
  const ratio = (created.length + deletedNodes.filter((x) => /(^|\/)c-[0-9a-f]{8}/.test(x)).length + reclusteredClusters) / Math.max(1, total);
  let rebuilt = !!opts.rebuild;
  if (!rebuilt && ratio > ctx.cfg.tau_tree) {
    tree = buildTree(inp, prepare(inp));
    rebuilt = true;
    decisions.push({ module: '', rule: 'rebuild' });
  }
  const prevPages = new Map<string, string>();
  walk(prev.root, (n) => void prevPages.set(n.id, n.page));
  const renamedPages: { from: string; to: string }[] = [];
  walk(tree.root, (n) => {
    const p = prevPages.get(n.id);
    if (p && p !== n.page) renamedPages.push({ from: p, to: n.page });
  });
  return {
    tree,
    decisions,
    reclustered: uniqSorted(reclustered),
    created: uniqSorted(created),
    deleted: uniqSorted(deletedNodes),
    renamedPages,
    llmRoute: uniqSorted(llmRoute),
    rebuilt,
    treeChangeRatio: +ratio.toFixed(4),
  };
}
