// Opt-in evaluation on real repositories (read-only). Needs a symbol graph per repo
// (TS scanner or Go `kb scan --symbols --out graph.json`):
//   KB_TREE_REPOS='[{"root":"/path/repo","graph":"/path/graph.json"}]' npx vitest run test/tree/real-repos.test.ts
// Prints depth, node counts per level, cluster size distribution, determinism,
// stability under a small edit (1% of core symbols removed) and runtimes.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildTree,
  detectProjects,
  fsSource,
  prepare,
  repairTree,
  deltaFromGraphs,
  serializeTree,
  treeStats,
  treeNMI,
  idRetention,
  type Graph,
} from '../../src/tree/index.js';

const repos: { root: string; graph: string }[] = process.env.KB_TREE_REPOS ? JSON.parse(process.env.KB_TREE_REPOS) : [];

describe.skipIf(!repos.length)('real repositories', () => {
  for (const r of repos) {
    it(r.root.split('/').pop()!, () => {
      const g = JSON.parse(fs.readFileSync(r.graph, 'utf8')) as Graph;
      const t0 = performance.now();
      const src = fsSource(r.root);
      const projects = detectProjects(src);
      const t1 = performance.now();
      const fileBytes: Record<string, number> = {};
      for (const f of Object.keys(g.files)) {
        const n = src.size!(f);
        if (n !== undefined) fileBytes[f] = n;
      }
      const input = { graph: g, projects, fileBytes };
      const ctx = prepare(input);
      const tree = buildTree(input, ctx);
      const t2 = performance.now();
      // determinism: reversed symbol order gives byte-identical output
      const rev: Graph = { ...g, symbols: g.symbols.slice().reverse() };
      const same = serializeTree(buildTree({ ...input, graph: rev })) === serializeTree(tree);
      // small edit: drop every 100th core symbol (and its members)
      const core = [...ctx.cg.core.values()].flat().sort();
      const drop = new Set(core.filter((_, i) => i % 100 === 50));
      const g2: Graph = { ...g, symbols: g.symbols.filter((s) => !drop.has(s.id) && !(s.parent && drop.has(s.parent))) };
      const t3 = performance.now();
      const rebuilt = buildTree({ ...input, graph: g2, prev: tree });
      const t4 = performance.now();
      const rep = repairTree(tree, { ...input, graph: g2 }, deltaFromGraphs(g, g2));
      const t5 = performance.now();
      const st = treeStats(tree);
      const out = {
        repo: r.root.split('/').pop(),
        symbols: g.symbols.length,
        files: Object.keys(g.files).length,
        projects: projects.length,
        core: core.length,
        ...st,
        deterministic: same,
        smallEdit: {
          dropped: drop.size,
          rebuildIdRetention: +idRetention(tree, rebuilt).toFixed(3),
          rebuildNMI: +treeNMI(tree, rebuilt).toFixed(3),
          repairIdRetention: +idRetention(tree, rep.tree).toFixed(3),
          repairRebuilt: rep.rebuilt,
          repairChangeRatio: rep.treeChangeRatio,
        },
        ms: { detect: Math.round(t1 - t0), build: Math.round(t2 - t1), rebuild: Math.round(t4 - t3), repair: Math.round(t5 - t4) },
      };
      console.log(JSON.stringify(out));
      expect(same).toBe(true);
      expect(st.clusterSizes.max).toBeLessThanOrEqual(40);
    }, 600_000);
  }
});
