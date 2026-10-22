import { describe, expect, it } from 'vitest';
import { buildTree, deltaFromGraphs, detectProjects, memorySource, repairTree, walk, type ModuleTree, type TreeNode } from '../../src/tree/index.js';
import { featureModule, makeGraph, symId, type SymSpec } from './fixtures.js';

const proj = detectProjects(memorySource({ 'settings.gradle.kts': 'include(":app", ":lib")', 'app/build.gradle.kts': '', 'lib/build.gradle.kts': '' }));
const cfg = { budget_tokens: 100 };
const D = 'app/src/main/java/shop';

function base(): SymSpec[] {
  return [...featureModule(D, ['cart', 'search', 'profile', 'checkout'], 10), { file: 'lib/src/Net.kt', name: 'Net' }, { file: 'lib/src/Json.kt', name: 'Json', refs: ['Net'] }];
}

function clusterOf(t: ModuleTree, sym: string): TreeNode | undefined {
  let hit: TreeNode | undefined;
  walk(t.root, (n) => {
    if (n.kind === 'cluster' && n.core?.includes(sym)) hit = n;
  });
  return hit;
}

const id = (file: string, name: string) => symId({ file, name });

describe('repair chain', () => {
  const prevSpecs = base();
  const prev = buildTree({ graph: makeGraph(prevSpecs), projects: proj, config: cfg });
  const cartId = clusterOf(prev, id(`${D}/cart/Cart0.kt`, 'Cart0'))!.id;
  const profileId = clusterOf(prev, id(`${D}/profile/Profile0.kt`, 'Profile0'))!.id;

  it('renames in place and deletes', () => {
    const specs = prevSpecs.filter((s) => s.name !== 'Search9').map((s) => (s.name === 'Cart3' ? { ...s, name: 'CartThree' } : s));
    const r = repairTree(prev, { graph: makeGraph(specs), projects: proj, config: cfg }, {
      added: [],
      deleted: [id(`${D}/search/Search9.kt`, 'Search9')],
      renamed: [{ from: id(`${D}/cart/Cart3.kt`, 'Cart3'), to: id(`${D}/cart/Cart3.kt`, 'CartThree') }],
    });
    expect(r.rebuilt).toBe(false);
    expect(clusterOf(r.tree, id(`${D}/cart/Cart3.kt`, 'CartThree'))!.id).toBe(cartId);
    expect(r.decisions.filter((d) => d.symbol).map((d) => d.rule).sort()).toEqual(['delete', 'rename']);
    expect(clusterOf(r.tree, id(`${D}/search/Search9.kt`, 'Search9'))).toBeUndefined();
  });

  it('routes added symbols: same_file → same_dir → neighbor_majority → llm_route', () => {
    const add: SymSpec[] = [
      { file: `${D}/cart/Cart0.kt`, name: 'CartHelper', line: 100 },
      { file: `${D}/cart/CartNew.kt`, name: 'CartNew' },
      { file: `${D}/elsewhere/Avatar.kt`, name: 'Avatar', refs: ['Profile0', 'Profile1', 'Profile2'] },
      { file: `${D}/orphan/Orphan.kt`, name: 'Orphan' },
    ];
    const r = repairTree(prev, { graph: makeGraph([...prevSpecs, ...add]), projects: proj, config: cfg }, { added: add.map((s) => symId(s)), deleted: [], renamed: [] });
    const rule = (name: string) => r.decisions.find((d) => d.symbol?.endsWith('#' + name))!;
    expect(rule('CartHelper')).toMatchObject({ rule: 'same_file', cluster: cartId });
    expect(rule('CartNew').rule).toBe('same_dir');
    expect(rule('Avatar')).toMatchObject({ rule: 'neighbor_majority' });
    expect(clusterOf(r.tree, id(`${D}/elsewhere/Avatar.kt`, 'Avatar'))!.id).toBe(profileId);
    expect(rule('Orphan').rule).toBe('llm_route');
    expect(r.llmRoute).toEqual([id(`${D}/orphan/Orphan.kt`, 'Orphan')]);
    const misc = clusterOf(r.tree, id(`${D}/orphan/Orphan.kt`, 'Orphan'))!;
    expect(misc.slug).toBe('misc');
    expect(misc.needs_review).toContain('llm_route');
    expect(r.reclustered).toEqual([]);
    expect(r.rebuilt).toBe(false); // 1 created (misc) / 5 clusters = 0.2 ≤ tau_tree
  });

  it('re-clusters a module when growth exceeds tau_grow, inheriting ids', () => {
    const add = featureModule(D, ['wishlist'], 15); // 15/40 > 0.33
    const r = repairTree(prev, { graph: makeGraph([...prevSpecs, ...add]), projects: proj, config: cfg }, { added: add.map((s) => symId(s)), deleted: [], renamed: [] });
    expect(r.reclustered).toEqual(['app']);
    expect(clusterOf(r.tree, id(`${D}/cart/Cart0.kt`, 'Cart0'))!.id).toBe(cartId);
    expect(clusterOf(r.tree, id(`${D}/wishlist/Wishlist0.kt`, 'Wishlist0'))!.slug).toBe('wishlist');
  });

  it('rebuilds the tree when the change ratio exceeds tau_tree', () => {
    const specs = prevSpecs.filter((s) => !/^(Search|Profile|Checkout)/.test(s.name));
    const g = makeGraph(specs);
    const r = repairTree(prev, { graph: g, projects: proj, config: cfg }, deltaFromGraphs(makeGraph(prevSpecs), g));
    expect(r.rebuilt).toBe(true);
    expect(r.treeChangeRatio).toBeGreaterThan(0.3);
    expect(r.decisions.at(-1)!.rule).toBe('rebuild');
  });

  it('handles new and deleted modules', () => {
    const p2 = detectProjects(memorySource({ 'settings.gradle.kts': 'include(":app", ":feed")', 'app/build.gradle.kts': '', 'feed/build.gradle.kts': '' }));
    const specs = [...prevSpecs.filter((s) => !s.file.startsWith('lib/')), { file: 'feed/src/Feed.kt', name: 'Feed' }];
    const r = repairTree(prev, { graph: makeGraph(specs), projects: p2, config: cfg }, { added: [id('feed/src/Feed.kt', 'Feed')], deleted: [], renamed: [] });
    expect(r.decisions.some((d) => d.rule === 'new_module' && d.module === 'feed')).toBe(true);
    expect(r.deleted).toContain('lib');
  });
});

describe('deltaFromGraphs', () => {
  it('detects renames by kind + norm_hash', () => {
    const a = makeGraph([{ file: 'a/A.kt', name: 'Old' }, { file: 'a/B.kt', name: 'Gone' }]);
    const b = makeGraph([{ file: 'a/A.kt', name: 'New' }, { file: 'a/C.kt', name: 'Fresh' }]);
    b.symbols[0]!.norm_hash = a.symbols[0]!.norm_hash;
    expect(deltaFromGraphs(a, b)).toEqual({
      added: ['android://a/C.kt#Fresh'],
      deleted: ['android://a/B.kt#Gone'],
      renamed: [{ from: 'android://a/A.kt#Old', to: 'android://a/A.kt#New' }],
      changed: [],
    });
  });
});
