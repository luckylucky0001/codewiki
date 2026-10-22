import { describe, expect, it } from 'vitest';
import {
  detectProjects,
  memorySource,
  parseGradleSettings,
  parseGradleDeps,
  parsePackageSwift,
  parsePbxproj,
  parseJSON5,
  parseOpenStep,
  harmonyModuleType,
} from '../../src/tree/index.js';
import { gradleRepo, harmonyRepo, pbxproj, swiftPackage } from './fixtures.js';

describe('json5', () => {
  it('parses comments, unquoted keys, single quotes, trailing commas, hex', () => {
    expect(parseJSON5(`{ // c\n a: 'x', "b": [1, 0x10, -2.5e1,], /* k */ c: { d: null, e: true }, }`)).toEqual({ a: 'x', b: [1, 16, -25], c: { d: null, e: true } });
  });
  it('returns undefined on garbage and drops __proto__', () => {
    expect(parseJSON5('{ a: }')).toBeUndefined();
    const o = parseJSON5('{ "__proto__": { "polluted": 1 }, ok: 1 }') as Record<string, unknown>;
    expect(o).toEqual({ ok: 1 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('gradle', () => {
  it('parses include variants, nested :a:b paths and projectDir overrides', () => {
    const s = parseGradleSettings(gradleRepo['settings.gradle.kts']!);
    expect(s.rootName).toBe('MiniShop');
    expect(s.includes).toEqual([':app', ':core:net', ':feature:cart', ':legacy']);
    expect(s.projectDirs).toEqual({ ':legacy': 'old/legacy-module' });
    expect(s.dynamic).toBe(false);
  });
  it('parses groovy include lists', () => {
    const s = parseGradleSettings(`include ':app', ':lib:a',\n        ':lib:b'\ninclude 'plain'\nincludeBuild 'build-logic'`);
    expect(s.includes).toEqual([':app', ':lib:a', ':lib:b', ':plain']);
    expect(s.includeBuilds).toEqual(['build-logic']);
  });
  it('flags dynamic includes', () => {
    expect(parseGradleSettings(`fun includeAll(dir: File) { dir.listFiles().forEach { include(":x:\${it.name}") } }`).dynamic).toBe(true);
  });
  it('resolves project() and type-safe accessors', () => {
    expect(parseGradleDeps(`implementation(project(":core:net"))\napi(projects.featureCart)\nimplementation(projects.core.designSystem)`, [':core:net', ':feature-cart', ':core:design-system'])).toEqual([
      ':core:design-system',
      ':core:net',
      ':feature-cart',
    ]);
  });
  it('detects modules, types and deps', () => {
    const [p] = detectProjects(memorySource(gradleRepo));
    expect(p!.build).toBe('gradle');
    expect(p!.modules.map((m) => [m.name, m.roots[0], m.module_type, m.deps])).toEqual([
      [':app', 'app', 'android-app', [':core:net', ':feature:cart']],
      [':core:net', 'core/net', 'android-library', []],
      [':feature:cart', 'feature/cart', 'android-library', [':core:net']],
      [':legacy', 'old/legacy-module', 'jvm-library', []],
    ]);
  });
  it('infers modules from build scripts when includes are dynamic', () => {
    const [p] = detectProjects(
      memorySource({
        'settings.gradle.kts': 'include(":app")\nfun includeProjects(d: File) { d.listFiles().forEach { include(":features:" + it.name) } }\nincludeBuild("plugins")',
        'app/build.gradle.kts': '',
        'features/a/impl/build.gradle.kts': '',
        'features/b/build.gradle.kts': '',
        'plugins/build.gradle.kts': '',
      }),
    );
    expect(p!.modules.map((m) => m.name)).toEqual([':app', ':features:a:impl', ':features:b']);
    expect(p!.warnings[0]).toMatch(/dynamic include/);
  });
});

describe('swiftpm', () => {
  it('parses targets, default/explicit paths and internal deps', () => {
    const p = parsePackageSwift(swiftPackage);
    expect(p.name).toBe('Shop');
    expect(p.targets.map((t) => [t.kind, t.name, t.path, t.deps])).toEqual([
      ['target', 'Core', undefined, []],
      ['target', 'Cart', 'Sources/CartFeature', ['Core', 'Net']],
      ['target', 'Net', undefined, []],
      ['executableTarget', 'Tool', undefined, ['Core']],
      ['testTarget', 'CartTests', undefined, ['Cart']],
    ]);
    const [proj] = detectProjects(memorySource({ 'ios/Package.swift': swiftPackage }));
    expect(proj!.root).toBe('ios');
    expect(proj!.modules.map((m) => [m.name, m.roots[0], m.module_type])).toEqual([
      ['Cart', 'ios/Sources/CartFeature', 'swift-target'],
      ['CartTests', 'ios/Tests/CartTests', 'swift-test'],
      ['Core', 'ios/Sources/Core', 'swift-target'],
      ['Net', 'ios/Sources/Net', 'swift-target'],
      ['Tool', 'ios/Sources/Tool', 'swift-executable'],
    ]);
  });
});

describe('xcode', () => {
  it('parses OpenStep plists', () => {
    expect(parseOpenStep('{ a = (x, "y z",); b = { c = 1; }; }')).toEqual({ a: ['x', 'y z'], b: { c: '1' } });
  });
  it('resolves target membership through the group tree and synchronized folders', () => {
    const ts = parsePbxproj(pbxproj)!;
    expect(ts.map((t) => [t.name, t.files, t.syncRoots, t.deps])).toEqual([
      ['Shop', ['Shop/AppDelegate.swift', 'Shop/Features/Cart/CartView.swift'], [], ['ShopWidget']],
      ['ShopKit', [], ['ShopKit'], []],
      ['ShopWidget', ['Widget/WidgetMain.swift'], [], []],
    ]);
    const [p] = detectProjects(memorySource({ 'ios/Shop.xcodeproj/project.pbxproj': pbxproj }));
    expect(p!.root).toBe('ios');
    expect(p!.modules.map((m) => [m.name, m.roots, m.module_type])).toEqual([
      ['Shop', ['ios/Shop'], 'xcode-app'],
      ['ShopKit', ['ios/ShopKit'], 'xcode-framework'],
      ['ShopWidget', ['ios/Widget'], 'xcode-extension'],
    ]);
    expect(p!.modules[0]!.files).toEqual(['ios/Shop/AppDelegate.swift', 'ios/Shop/Features/Cart/CartView.swift']);
  });
});

describe('harmonyos', () => {
  it('maps module.type to HAP/HAR/HSP', () => {
    expect(['entry', 'feature', 'har', 'shared', undefined].map(harmonyModuleType)).toEqual(['HAP', 'HAP', 'HAR', 'HSP', 'harmony-module']);
  });
  it('detects modules from build-profile.json5 and file: deps from oh-package.json5', () => {
    const ps = detectProjects(memorySource(harmonyRepo));
    expect(ps).toHaveLength(1); // module-level build-profile.json5 (no modules[]) is not a project
    expect(ps[0]!.modules.map((m) => [m.name, m.roots[0], m.module_type, m.deps])).toEqual([
      ['cart', 'feature/cart', 'HAR', ['common']],
      ['common', 'common/utils', 'HSP', []],
      ['dyn', 'feature/dyn', 'HAP', []],
      ['entry', 'product/entry', 'HAP', ['cart']],
    ]);
  });
});
