import { describe, expect, it } from 'vitest';
import { assignIds, discoverScopes, isWritableDocPath, nearestProjectRoot, scopeOf, writableDocsRoots } from '../../src/docs/scope.js';
import { memFs } from './memfs.js';

const MONO = memFs([
  'package.json',
  'specs/001-login/spec.md',
  'docs/architecture.md',
  'apps/shop-android/settings.gradle.kts',
  'apps/shop-android/app/src/main/AndroidManifest.xml',
  'apps/shop-android/app/src/main/java/Cart.kt',
  'apps/shop-ios/Shop.xcodeproj/',
  'apps/shop-ios/Sources/Cart.swift',
  'apps/shop-harmony/build-profile.json5',
  'apps/.hidden/package.json',
  'apps/node_modules/x/package.json',
  'packages/core/package.json',
  'packages/core/src/index.ts',
  'services/api/go.mod',
  'services/api/internal/x.go',
  'libs/build/package.json',
  'android/settings.gradle',
  'ios/Podfile',
  'harmony/README.md',
], ['apps/linked']);

describe('discoverScopes', () => {
  it('container children + mobile layouts with markers', () => {
    const plan = discoverScopes(MONO);
    expect(plan.singleRoot).toBe(false);
    expect(plan.projects.map((p) => [p.id, p.root, p.platform ?? '-', p.buildSystem ?? '-', p.origin])).toEqual([
      ['android', 'android', 'android', 'gradle', 'mobile'],
      ['shop-android', 'apps/shop-android', 'android', 'gradle', 'container'],
      ['shop-harmony', 'apps/shop-harmony', 'harmony', 'hvigor', 'container'],
      ['shop-ios', 'apps/shop-ios', 'ios', 'xcode', 'container'],
      ['ios', 'ios', 'ios', 'cocoapods', 'mobile'],
      ['core', 'packages/core', '-', 'npm', 'container'],
      ['api', 'services/api', '-', 'go', 'container'],
    ]);
    // harmony/ without markers, hidden, node_modules, build/, symlinks ignored
    expect(plan.projects.some((p) => /hidden|node_modules|linked|libs\/build|^harmony$/.test(p.root))).toBe(false);
  });
  it('repository scope defaults and project specs roots', () => {
    const plan = discoverScopes(MONO);
    expect(plan.repository).toEqual({ id: 'repo', root: '.', specsRoots: ['specs'], docsRoot: 'docs', docsReadEnabled: true, writeEnabled: true, scanMode: 'incremental' });
    const p = plan.projects.find((x) => x.id === 'shop-ios')!;
    expect(p.specsRoots).toEqual(['specs', 'apps/shop-ios/specs']);
    expect(p.docsRoot).toBe('apps/shop-ios/docs');
  });
  it('--no-root-write keeps docs readable', () => {
    const plan = discoverScopes(MONO, { noRootWrite: true });
    expect(plan.repository.writeEnabled).toBe(false);
    expect(plan.repository.docsReadEnabled).toBe(true);
    expect(writableDocsRoots(plan)).not.toContain('docs');
  });
  it('explicit file path → nearest ancestor with a build marker', () => {
    const plan = discoverScopes(MONO, { paths: ['apps/shop-android/app/src/main/java/Cart.kt'] });
    // app/ has src/ → weak marker; nearest wins
    expect(plan.projects.map((p) => p.root)).toEqual(['apps/shop-android/app']);
  });
  it('explicit project dir and container dir expansion', () => {
    const plan = discoverScopes(MONO, { paths: ['services/api/internal/x.go', 'packages'] });
    expect(plan.projects.map((p) => p.root)).toEqual(['packages/core', 'services/api']);
    expect(plan.projects.every((p) => p.origin === 'explicit')).toBe(true);
  });
  it('explicit repo root → repository only', () => {
    const plan = discoverScopes(MONO, { paths: ['.'] });
    expect(plan.projects).toEqual([]);
    expect(plan.singleRoot).toBe(true);
  });
  it('unresolved paths and ids are reported', () => {
    const plan = discoverScopes(MONO, { paths: ['nope/x.ts', '../outside'] });
    expect(plan.unresolved).toEqual(['nope/x.ts', '../outside']);
    const p2 = discoverScopes(MONO, { projectIds: ['core', 'ghost'] });
    expect(p2.projects.map((p) => p.id)).toEqual(['core']);
    expect(p2.unresolved).toEqual(['ghost']);
  });
  it('single-root repository', () => {
    const plan = discoverScopes(memFs(['package.json', 'src/index.ts', 'docs/a.md']));
    expect(plan.singleRoot).toBe(true);
    expect(plan.projects).toEqual([]);
  });
  it('exclude option', () => {
    const plan = discoverScopes(MONO, { exclude: ['apps/shop-harmony', 'services'] });
    expect(plan.projects.map((p) => p.id)).not.toContain('shop-harmony');
    expect(plan.projects.map((p) => p.id)).not.toContain('api');
  });
  it('configured projects keep their ids', () => {
    const plan = discoverScopes(MONO, { configured: [{ id: 'droid', root: 'apps/shop-android', platform: 'android' }, { root: 'apps/missing' }] });
    expect(plan.projects.map((p) => [p.id, p.origin])).toEqual([['droid', 'config']]);
    expect(plan.unresolved).toEqual(['apps/missing']);
  });
});

describe('ids', () => {
  it('collisions get -2, -3 in sorted root order; pinned ids win', () => {
    const ids = assignIds(['services/core', 'packages/core', 'libs/core']);
    expect([...ids.entries()]).toEqual([['libs/core', 'core'], ['packages/core', 'core-2'], ['services/core', 'core-3']]);
    const pinned = assignIds(['services/core', 'packages/core', 'libs/core'], { 'services/core': 'core' });
    expect(pinned.get('services/core')).toBe('core');
    expect(pinned.get('libs/core')).toBe('core-2');
  });
  it('repo id is reserved', () => {
    expect(assignIds(['apps/repo']).get('apps/repo')).toBe('repo-2');
  });
  it('ids are stable when discovery order changes', () => {
    const a = assignIds(['b/x', 'a/x']);
    const b = assignIds(['a/x', 'b/x']);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });
});

describe('ownership of paths', () => {
  const plan = discoverScopes(MONO);
  it('scopeOf picks the deepest project root', () => {
    expect(scopeOf(plan, 'apps/shop-ios/Sources/Cart.swift')).toBe('shop-ios');
    expect(scopeOf(plan, 'docs/architecture.md')).toBe('repo');
    expect(scopeOf(plan, 'apps/shop-iosx/a')).toBe('repo');
  });
  it('writable docs paths: own docs only, never specs', () => {
    expect(isWritableDocPath(plan, 'docs/architecture.md')).toBe(true);
    expect(isWritableDocPath(plan, 'apps/shop-ios/docs/arch/y.md')).toBe(true);
    expect(isWritableDocPath(plan, 'apps/shop-ios/Sources/x.md')).toBe(false);
    expect(isWritableDocPath(plan, 'specs/001-login/spec.md')).toBe(false);
    expect(isWritableDocPath(plan, 'apps/shop-ios/specs/x/spec.md')).toBe(false);
    expect(isWritableDocPath(plan, 'docs/diagram.png')).toBe(false);
    expect(isWritableDocPath(discoverScopes(MONO, { noRootWrite: true }), 'docs/architecture.md')).toBe(false);
  });
  it('nearestProjectRoot respects ignored dirs', () => {
    expect(nearestProjectRoot(MONO, 'apps/node_modules/x/package.json')).toBe(null);
  });
});
