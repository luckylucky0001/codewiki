import { describe, expect, it } from 'vitest';
import {
  leiden,
  makeGraph as makeW,
  modularity,
  buildTree,
  memorySource,
  detectProjects,
  serializeTree,
  treeStats,
  treeNMI,
  idRetention,
  matchPrev,
  type ModuleTree,
  type TreeNode,
} from '../../src/tree/index.js';
import { rngFromSeed, sha256 } from '../../src/tree/util.js';
import { featureModule, makeGraph, type SymSpec } from './fixtures.js';

function cliques(k: number, size: number, bridge = 0.1): [number, number, number][] {
  const e: [number, number, number][] = [];
  for (let c = 0; c < k; c++) {
    for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++) e.push([c * size + i, c * size + j, 1]);
    if (c > 0) e.push([c * size, (c - 1) * size, bridge]);
  }
  return e;
}

describe('leiden', () => {
  it('recovers planted cliques', () => {
    const g = makeW(30, cliques(5, 6));
    const part = leiden(g, { rng: rngFromSeed(sha256('m')) });
    for (let c = 0; c < 5; c++) {
      const label = part[c * 6]!;
      for (let i = 1; i < 6; i++) expect(part[c * 6 + i]).toBe(label);
    }
    expect(new Set(part).size).toBe(5);
    expect(modularity(g, part)).toBeGreaterThan(0.7);
  });
  it('is deterministic for a fixed seed (100 runs)', () => {
    const edges: [number, number, number][] = [];
    const r = rngFromSeed(sha256('graph'));
    for (let i = 0; i < 400; i++) edges.push([Math.floor(r() * 120), Math.floor(r() * 120), 1 + Math.floor(r() * 3)]);
    const g = makeW(120, edges);
    const first = JSON.stringify(leiden(g, { rng: rngFromSeed(sha256('seed')) }));
    for (let i = 0; i < 100; i++) expect(JSON.stringify(leiden(g, { rng: rngFromSeed(sha256('seed')) }))).toBe(first);
  });
  it('handles empty and edgeless graphs', () => {
    expect(leiden(makeW(0, []), { rng: rngFromSeed('00000000') })).toEqual([]);
    expect(leiden(makeW(3, []), { rng: rngFromSeed('00000000') })).toEqual([0, 1, 2]);
  });
});

const proj = detectProjects(memorySource({ 'settings.gradle.kts': 'include(":app", ":lib")', 'app/build.gradle.kts': '', 'lib/build.gradle.kts': '' }));

function bigModuleSpecs(): SymSpec[] {
  const feats = featureModule('app/src/main/java/shop', ['cart', 'search', 'profile', 'checkout'], 10);
  const lib: SymSpec[] = [
    { file: 'lib/src/Net.kt', name: 'Net' },
    { file: 'lib/src/Json.kt', name: 'Json', refs: ['Net'] },
  ];
  return [...feats, ...lib];
}

function clusters(t: ModuleTree): TreeNode[] {
  const out: TreeNode[] = [];
  const rec = (n: TreeNode) => {
    if (n.kind === 'cluster') out.push(n);
    n.children?.forEach(rec);
  };
  rec(t.root);
  return out;
}

describe('module clustering', () => {
  const cfg = { budget_tokens: 100 }; // force L3 for the 40-class module

  it('splits a module over budget into its feature clusters', () => {
    const t = buildTree({ graph: makeGraph(bigModuleSpecs()), projects: proj, config: cfg });
    const cs = clusters(t);
    expect(cs).toHaveLength(4);
    expect(cs.map((c) => c.slug).sort()).toEqual(['cart', 'checkout', 'profile', 'search']);
    for (const c of cs) {
      expect(c.core).toHaveLength(10);
      expect(c.id).toMatch(/^android-app\/c-[0-9a-f]{8}$|^app\/c-[0-9a-f]{8}$/);
      expect(c.page).toBe(`pages/app/${c.slug}.md`);
    }
    // small module stays a leaf (no L3)
    const lib = t.root.children!.find((n) => n.id === 'lib')!;
    expect(lib.children).toBeUndefined();
    expect(lib.core).toHaveLength(2);
  });

  it('does not create L3 when the module fits the budget', () => {
    const t = buildTree({ graph: makeGraph(bigModuleSpecs()), projects: proj, fileBytes: {} , config: { budget_tokens: 1e9, max_core_per_cluster: 50 } });
    expect(clusters(t)).toHaveLength(0);
  });

  it('is deterministic and independent of symbol input order', () => {
    const specs = bigModuleSpecs();
    const a = serializeTree(buildTree({ graph: makeGraph(specs), projects: proj, config: cfg }));
    const b = serializeTree(buildTree({ graph: makeGraph(specs), projects: proj, config: cfg }));
    const rev = makeGraph(specs.slice().reverse());
    const c = serializeTree(buildTree({ graph: rev, projects: proj, config: cfg }));
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('keeps cluster ids/pages stable under a small edit (Jaccard ≥ 0.5)', () => {
    const specs = bigModuleSpecs();
    const t1 = buildTree({ graph: makeGraph(specs), projects: proj, config: cfg });
    const edited = specs.filter((s) => s.name !== 'Cart3');
    edited.push({ file: 'app/src/main/java/shop/cart/CartBadge.kt', name: 'CartBadge', refs: ['Cart0', 'Cart1', 'Cart2'] });
    edited.push({ file: 'app/src/main/java/shop/search/SearchHistory.kt', name: 'SearchHistory', refs: ['Search0', 'Search4'] });
    const t2 = buildTree({ graph: makeGraph(edited), projects: proj, config: cfg, prev: t1 });
    expect(idRetention(t1, t2)).toBe(1);
    expect(treeNMI(t1, t2)).toBeGreaterThan(0.9);
    const cart = clusters(t2).find((c) => c.slug === 'cart')!;
    expect(cart.core).toContain('android://app/src/main/java/shop/cart/CartBadge.kt#CartBadge');
  });

  it('inherits llm titles and slugs through Jaccard matching', () => {
    const specs = bigModuleSpecs();
    const t1 = buildTree({ graph: makeGraph(specs), projects: proj, config: cfg });
    const c = clusters(t1).find((x) => x.slug === 'cart')!;
    c.slug = 'shopping-cart';
    c.title = 'Shopping cart';
    c.title_source = 'llm';
    const t2 = buildTree({ graph: makeGraph(specs), projects: proj, config: cfg, prev: t1 });
    const c2 = clusters(t2).find((x) => x.id === c.id)!;
    expect([c2.slug, c2.title, c2.title_source, c2.page]).toEqual(['shopping-cart', 'Shopping cart', 'llm', 'pages/app/shopping-cart.md']);
  });

  it('enforces 3..40 core symbols per cluster', () => {
    // one big dense blob of 100 classes + 2 isolated stragglers
    const specs: SymSpec[] = [];
    for (let i = 0; i < 100; i++) specs.push({ file: `app/src/blob/B${i}.kt`, name: `B${i}`, refs: [`B${(i + 1) % 100}`, `B${(i + 7) % 100}`, `B${(i + 31) % 100}`] });
    specs.push({ file: 'app/src/lonely/L1.kt', name: 'L1' }, { file: 'app/src/lonely2/L2.kt', name: 'L2' });
    const t = buildTree({ graph: makeGraph(specs), projects: proj, config: { budget_tokens: 10 } });
    const sizes = clusters(t).map((c) => c.core!.length);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(102);
    for (const s of sizes) {
      expect(s).toBeGreaterThanOrEqual(3);
      expect(s).toBeLessThanOrEqual(40);
    }
    const st = treeStats(t);
    expect(st.clusterSizes.max).toBeLessThanOrEqual(40);
  });

  it('honours pins and user titles', () => {
    const t = buildTree({
      graph: makeGraph(bigModuleSpecs()),
      projects: proj,
      config: { budget_tokens: 100, pins: [{ match: 'app/src/main/java/shop/checkout/**', cluster: 'payments' }], titles: { app: 'Shop app' } },
    });
    const pay = clusters(t).find((c) => c.slug === 'payments')!;
    expect(pay.core).toHaveLength(10);
    expect(pay.pinned).toEqual(['app/src/main/java/shop/checkout/**']);
    expect(t.root.children!.find((n) => n.id === 'app')!.title).toBe('Shop app');
  });
});

describe('matchPrev', () => {
  it('matches one-to-one by descending Jaccard with threshold 0.5', () => {
    const m = matchPrev(
      [['a', 'b', 'c'], ['d', 'e'], ['x']],
      [
        { id: 'p1', core: ['a', 'b'] },
        { id: 'p2', core: ['a', 'b', 'c', 'd'] },
        { id: 'p3', core: ['d', 'e', 'f', 'g', 'h'] },
      ],
    );
    expect(m.get(0)!.id).toBe('p2');
    expect(m.has(1)).toBe(false); // 2/5 < 0.5
    expect(m.has(2)).toBe(false);
  });
});
