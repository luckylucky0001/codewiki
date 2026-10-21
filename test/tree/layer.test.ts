import { describe, expect, it } from 'vitest';
import { buildTree, detectProjects, layer, memorySource, parseTree, serializeTree, explain, prepare, ancestors } from '../../src/tree/index.js';
import { gradleRepo, harmonyRepo, makeGraph, pbxproj, swiftPackage } from './fixtures.js';

describe('layering', () => {
  it('maps files to the deepest module root and groups leftovers heuristically', () => {
    const g = makeGraph([
      { file: 'app/src/main/App.kt', name: 'App' },
      { file: 'feature/cart/src/main/Cart.kt', name: 'Cart', refs: ['Net'] },
      { file: 'core/net/src/Net.kt', name: 'Net' },
      { file: 'old/legacy-module/src/Legacy.kt', name: 'Legacy' },
      { file: 'buildSrc/Deps.kt', name: 'Deps' }, // under the project root, no module
    ]);
    const L = layer(g, detectProjects(memorySource(gradleRepo)));
    expect(L.fileModule.get('feature/cart/src/main/Cart.kt')).toBe('gradle::::feature:cart');
    expect(L.fileModule.get('old/legacy-module/src/Legacy.kt')).toBe('gradle::::legacy');
    expect(L.fileModule.get('buildSrc/Deps.kt')).toBe('gradle:::(root)');
    expect(L.projects[0]!.modules.map((m) => m.slug)).toEqual(['app', 'core-net', 'feature-cart', 'legacy', '_root']);
  });

  it('builds L0 → L2 for one Gradle project (L1 collapses) with deps and ref_deps', () => {
    const g = makeGraph([
      { file: 'app/src/main/App.kt', name: 'App', refs: ['Cart'] },
      { file: 'feature/cart/src/main/Cart.kt', name: 'Cart', refs: ['Net'] },
      { file: 'core/net/src/Net.kt', name: 'Net' },
    ]);
    const t = buildTree({ graph: g, projects: detectProjects(memorySource(gradleRepo)), title: 'MiniShop' });
    expect(t.root.kind).toBe('repo');
    expect(t.root.build).toBe('gradle');
    expect(t.root.children!.map((c) => [c.id, c.level, c.kind, c.page])).toEqual([
      ['app', 2, 'module', 'pages/app/overview.md'],
      ['core-net', 2, 'module', 'pages/core-net/overview.md'],
      ['feature-cart', 2, 'module', 'pages/feature-cart/overview.md'],
    ]); // empty :legacy collapses
    const app = t.root.children![0]!;
    expect(app.deps).toEqual(['core-net', 'feature-cart']);
    expect(app.ref_deps).toEqual(['feature-cart']);
    expect(t.root.children![2]!.ref_deps).toEqual(['app', 'core-net']);
    expect(t.root.index).toBe('index.md');
    expect(parseTree(serializeTree(t))).toEqual(JSON.parse(serializeTree(t)));
    expect(serializeTree(t).endsWith('}\n')).toBe(true);
  });

  it('keeps L1 for multi-project repos and collapses single-module projects into L1', () => {
    const files = {
      ...Object.fromEntries(Object.entries(gradleRepo).map(([k, v]) => [`android/${k}`, v])),
      'ios/Package.swift': swiftPackage,
      ...Object.fromEntries(Object.entries(harmonyRepo).map(([k, v]) => [`harmony/${k}`, v])),
      'ios/App/App.xcodeproj/project.pbxproj': pbxproj,
    };
    const g = makeGraph([
      { file: 'android/app/src/A.kt', name: 'A' },
      { file: 'android/core/net/src/N.kt', name: 'N' },
      { file: 'ios/Sources/CartFeature/CartView.swift', name: 'CartView', platform: 'ios' },
      { file: 'ios/Sources/Core/Core.swift', name: 'Core', platform: 'ios' },
      { file: 'ios/App/Shop/Features/Cart/CartView.swift', name: 'XcCartView', platform: 'ios' },
      { file: 'harmony/feature/cart/src/main/ets/Cart.ets', name: 'HCart', platform: 'harmony' },
    ]);
    const t = buildTree({ graph: g, projects: detectProjects(memorySource(files)) });
    const ids = t.root.children!.map((c) => [c.id, c.kind, c.level, c.children?.length ?? 0]);
    expect(ids).toEqual([
      ['android', 'project', 1, 2],
      ['app', 'project', 1, 0], // Xcode project with one populated target → L2 collapsed
      ['harmony', 'project', 1, 0],
      ['ios', 'project', 1, 2],
    ]);
    const h = t.root.children!.find((c) => c.id === 'harmony')!;
    expect(h.module_type).toBe('HAR');
    expect(h.platform).toBe('harmony');
    expect(t.root.children!.find((c) => c.id === 'ios')!.children!.map((c) => c.id)).toEqual(['ios/cart', 'ios/core']);
    expect(ancestors(t, 'ios/cart').map((n) => n.id)).toEqual(['repo', 'ios', 'ios/cart']);
    const ctx = prepare({ graph: g, projects: detectProjects(memorySource(files)) });
    expect(explain(t, 'ios://ios/Sources/Core/Core.swift#Core', ctx.cg)!.node.id).toBe('ios/core');
    expect(explain(t, 'android/app/src/A.kt')!.node.id).toBe('android/app');
  });

  it('falls back to the v1 heuristic without build files', () => {
    const g = makeGraph([
      { file: 'shop/cart/src/main/Cart.kt', name: 'Cart' },
      { file: 'shop/home/Home.kt', name: 'Home' },
    ]);
    const t = buildTree({ graph: g, projects: [] });
    expect(t.root.children!.map((c) => [c.id, c.module_type])).toEqual([
      ['shop-cart', 'heuristic'],
      ['shop-home', 'heuristic'],
    ]);
    expect(t.warnings![0]).toMatch(/heuristically/);
  });
});
