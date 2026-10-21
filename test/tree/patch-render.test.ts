import { describe, expect, it } from 'vitest';
import {
  applyPatch,
  validatePatch,
  buildTree,
  detectProjects,
  memorySource,
  findNode,
  renderBreadcrumb,
  renderIndex,
  renderIndexes,
  renderLlmsTxt,
  moduleDependencyDiagram,
  projectDiagram,
  clusterDiagram,
  navigationDiagram,
  diagramBlock,
  diagramFresh,
  nodeDiagrams,
  upsertKbBlock,
  readKbBlock,
  relLink,
  nmi,
  ari,
  treeNMI,
  walk,
  type ModuleTree,
  type TreeNode,
} from '../../src/tree/index.js';
import { featureModule, makeGraph, gradleRepo, swiftPackage } from './fixtures.js';

const proj = detectProjects(memorySource({ 'settings.gradle.kts': 'include(":app", ":lib")', 'app/build.gradle.kts': 'dependencies { implementation(project(":lib")) }', 'lib/build.gradle.kts': '' }));
const D = 'app/src/main/java/shop';
const specs = [...featureModule(D, ['cart', 'search', 'profile', 'checkout'], 10), { file: 'lib/src/Net.kt', name: 'Net' }, { file: 'lib/src/Json.kt', name: 'Json', refs: ['Net'] }];
specs[0]!.refs!.push('Net');
const tree = buildTree({ graph: makeGraph(specs), projects: proj, config: { budget_tokens: 100 }, title: 'MiniShop' });
const clusters = (t: ModuleTree) => {
  const out: TreeNode[] = [];
  walk(t.root, (n) => void (n.kind === 'cluster' && out.push(n)));
  return out;
};
const bySlug = (t: ModuleTree, s: string) => clusters(t).find((c) => c.slug === s)!;

describe('tree-patch', () => {
  it('accepts rename and applies title/slug/page', () => {
    const c = bySlug(tree, 'cart');
    const t2 = applyPatch(tree, [{ op: 'rename', node: c.id, title: '购物车', slug: 'cart-state' }]);
    const c2 = findNode(t2, c.id)!;
    expect([c2.title, c2.title_source, c2.slug, c2.page]).toEqual(['购物车', 'llm', 'cart-state', 'pages/app/cart-state.md']);
    expect(t2.root.children_digest).toBe(tree.root.children_digest); // title change is not a summary/member change
    expect(findNode(tree, c.id)!.title).not.toBe('购物车'); // input untouched
  });
  it('rejects bad renames', () => {
    const c = bySlug(tree, 'cart');
    expect(validatePatch(tree, [{ op: 'rename', node: c.id, slug: 'Bad Slug' }])[0]!.error).toMatch(/slug/);
    expect(validatePatch(tree, [{ op: 'rename', node: c.id, slug: 'search' }])[0]!.error).toMatch(/already used/);
    expect(validatePatch(tree, [{ op: 'rename', node: 'nope', title: 'x' }])[0]!.error).toBe('unknown node');
    expect(validatePatch(tree, [{ op: 'delete', node: c.id } as never])[0]!.error).toMatch(/unknown op/);
  });
  it('merges siblings within the size limit only', () => {
    const a = bySlug(tree, 'cart'), b = bySlug(tree, 'search');
    const t2 = applyPatch(tree, [{ op: 'merge', node: a.id, into: b.id }]);
    expect(findNode(t2, a.id)).toBeUndefined();
    expect(findNode(t2, b.id)!.core).toHaveLength(20);
    expect(validatePatch(t2, [{ op: 'merge', node: b.id, into: bySlug(t2, 'profile').id }, { op: 'merge', node: bySlug(t2, 'profile').id, into: bySlug(t2, 'checkout').id }])).toEqual([]);
    const t3 = applyPatch(t2, [{ op: 'merge', node: b.id, into: bySlug(t2, 'profile').id }]);
    expect(validatePatch(t3, [{ op: 'merge', node: bySlug(t3, 'profile').id, into: bySlug(t3, 'checkout').id }])).toEqual([]); // 30 + 10 = 40
    expect(validatePatch(t3, [{ op: 'merge', node: bySlug(t3, 'profile').id, into: bySlug(t3, 'checkout').id }], 35)[0]!.error).toMatch(/> 35/);
    expect(validatePatch(tree, [{ op: 'merge', node: a.id, into: 'lib' }])[0]!.error).toMatch(/cluster/);
  });
  it('splits only when groups partition the cluster', () => {
    const c = bySlug(tree, 'cart');
    const core = c.core!;
    expect(validatePatch(tree, [{ op: 'split', node: c.id, members: [core.slice(0, 5), core.slice(5, 9)] }])[0]!.error).toMatch(/cover/);
    expect(validatePatch(tree, [{ op: 'split', node: c.id, members: [core.slice(0, 2), core.slice(2)] }])[0]!.error).toMatch(/≥ 3/);
    expect(validatePatch(tree, [{ op: 'split', node: c.id, members: [core.slice(0, 5), [...core.slice(4)]] }])[0]!.error).toMatch(/twice/);
    const t2 = applyPatch(tree, [{ op: 'split', node: c.id, members: [core.slice(0, 4), core.slice(4)], titles: ['A', 'B'] }]);
    const kept = findNode(t2, c.id)!;
    expect(kept.core).toEqual(core.slice(4)); // larger half keeps id/page
    expect(kept.page).toBe(c.page);
    const app = findNode(t2, 'app')!;
    expect(app.children!.filter((x) => x.slug?.startsWith('cart'))).toHaveLength(2);
  });
});

describe('render', () => {
  it('relLink', () => {
    expect(relLink('pages/app/cart.md', 'pages/overview.md')).toBe('../overview.md');
    expect(relLink('pages/app/cart.md', 'pages/app/overview.md')).toBe('overview.md');
    expect(relLink('index.md', 'pages/app/overview.md')).toBe('pages/app/overview.md');
  });
  it('breadcrumb from root to node', () => {
    const c = bySlug(tree, 'cart');
    expect(renderBreadcrumb(tree, c.id)).toBe(`> [MiniShop](../overview.md) › [:app](overview.md) › ${c.title}`);
  });
  it('index tables per level', () => {
    const idx = renderIndexes(tree);
    expect([...idx.keys()].sort()).toEqual(['index.md', 'pages/app/index.md']);
    const app = renderIndex(tree, 'app');
    expect(app).toContain('<!-- maintained by kb; do not edit by hand -->');
    expect(app).toContain('| Page | Kind | Detail | Importance | Summary |');
    expect(app).toMatch(/\| \[Cart\]\(cart\.md\) \| cluster \| 10 symbols \|/);
    expect(idx.get('index.md')).toMatch(/\[:lib\]\(pages\/lib\/overview\.md\)/);
  });
  it('llms.txt hierarchy', () => {
    const t = structuredClone(tree);
    t.root.summary = 'A mini shop.';
    findNode(t, 'app')!.summary = 'The app. More text.';
    const txt = renderLlmsTxt(t);
    expect(txt.split('\n').slice(0, 5)).toEqual(['# MiniShop', '', '> A mini shop.', '', '- [MiniShop overview](pages/overview.md): A mini shop.']);
    expect(txt).toContain('- [:app](pages/app/overview.md): The app.');
    expect(txt).toContain('  - [Cart](pages/app/cart.md)');
  });
  it('mermaid diagrams are deterministic and wrapped in kb blocks', () => {
    const deps = moduleDependencyDiagram(tree);
    expect(deps.split('\n')[0]).toBe('flowchart LR');
    expect(deps).toMatch(/n[0-9a-f]{6} --> n[0-9a-f]{6}/); // app → lib build dep (also referenced)
    expect(moduleDependencyDiagram(tree)).toBe(deps);
    const cl = clusterDiagram(tree, 'app');
    expect(cl.split('\n').filter((l) => l.includes('["')).length).toBe(4);
    expect(cl).toMatch(/---/);
    const nav = navigationDiagram({ routes: [{ platform: 'android', route_id: 'home', pattern: '', deeplink: '', file: '', symbol: '' }], testids: null, apis: null, navigation: [{ platform: 'android', from: 'home', to: 'cart', kind: 'push', file: '', line: 1 }] });
    expect(nav).toMatch(/-->\|push\|/);
    const block = diagramBlock('app.deps', deps);
    expect(block).toMatch(/^<!-- kb:diagram hash=[0-9a-f]{12} id=app\.deps -->\n```mermaid\nflowchart LR/);
    expect(diagramFresh(block, 'app.deps', deps)).toBe(true);
    expect(diagramFresh(block, 'app.deps', deps + '\n  x')).toBe(false);
    expect(nodeDiagrams(tree, 'repo').map((d) => d.kind)).toEqual(['deps']);
    expect(nodeDiagrams(tree, 'app').map((d) => d.kind)).toEqual(['clusters']);
  });
  it('project diagram at L0 for multi-project repos', () => {
    const files = { ...Object.fromEntries(Object.entries(gradleRepo).map(([k, v]) => [`android/${k}`, v])), 'ios/Package.swift': swiftPackage };
    const g = makeGraph([
      { file: 'android/app/src/A.kt', name: 'A' },
      { file: 'android/core/net/src/N.kt', name: 'N' },
      { file: 'ios/Sources/Core/Core.swift', name: 'Core', platform: 'ios' },
      { file: 'ios/Sources/Net/Net.swift', name: 'INet', platform: 'ios' },
    ]);
    const t = buildTree({ graph: g, projects: detectProjects(memorySource(files)) });
    expect(projectDiagram(t).split('\n')).toHaveLength(3);
  });
  it('upserts kb blocks without touching human text', () => {
    const page = '---\nid: x\n---\n# Title\n\nHuman text.\n';
    const a = upsertKbBlock(page, 'breadcrumb', '> crumb');
    expect(a).toBe('---\nid: x\n---\n# Title\n\n<!-- kb:breadcrumb -->\n> crumb\n<!-- /kb:breadcrumb -->\n\nHuman text.\n');
    const b = upsertKbBlock(a, 'breadcrumb', '> crumb2');
    expect(b).toContain('> crumb2');
    expect(b).not.toContain('> crumb\n');
    const c = upsertKbBlock(b, 'diagram', 'D1', { id: 'a', hash: '1' });
    const d = upsertKbBlock(c, 'diagram', 'D2', { id: 'b', hash: '2' });
    const e = upsertKbBlock(d, 'diagram', 'D1b', { id: 'a', hash: '3' });
    expect(readKbBlock(e, 'diagram', 'a')).toBe('D1b');
    expect(readKbBlock(e, 'diagram', 'b')).toBe('D2');
    expect(e).toContain('Human text.');
  });
});

describe('nmi / ari', () => {
  const m = (o: Record<string, string>) => new Map(Object.entries(o));
  it('is 1 for identical partitions up to relabeling and ~0 for independent ones', () => {
    expect(nmi(m({ a: 'x', b: 'x', c: 'y', d: 'y' }), m({ a: '1', b: '1', c: '2', d: '2' }))).toBeCloseTo(1);
    expect(ari(m({ a: 'x', b: 'x', c: 'y', d: 'y' }), m({ a: '1', b: '1', c: '2', d: '2' }))).toBeCloseTo(1);
    expect(nmi(m({ a: 'x', b: 'x', c: 'y', d: 'y' }), m({ a: '1', b: '2', c: '1', d: '2' }))).toBeCloseTo(0);
  });
  it('treeNMI of a tree with itself is 1', () => {
    expect(treeNMI(tree, tree)).toBeCloseTo(1);
    expect(clusters(tree)).toHaveLength(4);
  });
});
