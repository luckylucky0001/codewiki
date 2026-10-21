// wave 3: real-repo fixes (scopes of a single Gradle build, platform one level down, v1/tree path
// collisions), docs agent output parsing, parallel reference resolution.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { discoverScopes, nodeScopeFs } from '../src/docs/index.js';
import { detect } from '../src/config/config.js';
import { isTreeIndexPath } from '../src/wiki/page.js';
import { agentText } from '../src/engine/docsflow.js';

const repo = path.resolve(__dirname, '..');
const mk = (files: Record<string, string>) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kbv3-'));
  for (const [f, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    fs.writeFileSync(path.join(d, f), c);
  }
  return d;
};

describe('wave 3', () => {
  it('container children of a root Gradle build are modules, not projects', () => {
    const d = mk({ 'settings.gradle.kts': '', 'services/analytics/build.gradle.kts': '', 'services/push/build.gradle.kts': '', 'docs/a.md': '# a' });
    expect(discoverScopes(nodeScopeFs(d)).projects.map((p) => p.root)).toEqual([]);
    const m = mk({ 'apps/shop/settings.gradle': '', 'apps/web/package.json': '{}' });
    expect(discoverScopes(nodeScopeFs(m)).projects.map((p) => p.root).sort()).toEqual(['apps/shop', 'apps/web']);
  });

  it('detects a HarmonyOS app one directory down when the root has no platform', () => {
    const d = mk({ 'README.md': '# x', 'CommonAppDevelopment/build-profile.json5': '{}', 'CommonAppDevelopment/AppScope/app.json5': '{}' });
    expect(detect(d)).toEqual([{ name: 'harmony', root: 'CommonAppDevelopment' }]);
  });

  it('a route id named index is a feature page, not a tree index', () => {
    expect(isTreeIndexPath('pages/features/index.md')).toBe(false);
    expect(isTreeIndexPath('pages/android/index.md')).toBe(true);
  });

  it('unwraps agent JSON output (claude result / gemini response) and passes text through', () => {
    expect(agentText('{"type":"result","result":"=== docs/a.md [features] ===\\nx"}')).toBe('=== docs/a.md [features] ===\nx');
    expect(agentText('{"response":"hello"}')).toBe('hello');
    expect(agentText('=== plain ===')).toBe('=== plain ===');
  });

  it('parallel reference resolution is identical to the serial pass', async () => {
    const { detectedConfig } = await import(path.join(repo, 'dist/config/config.js'));
    const { scan } = await import(path.join(repo, 'dist/scan/scan.js'));
    const { resolveRefs, resolveRefsParallel } = await import(path.join(repo, 'dist/scan/resolve.js'));
    const root = path.join(repo, 'examples/minishop');
    const res = await scan(detectedConfig(root), root);
    const h = () => createHash('sha1').update(JSON.stringify(res.graph.symbols.map((s: { id: string; refs?: string[] }) => [s.id, s.refs ?? []]))).digest('hex');
    resolveRefs(res.graph);
    const serial = h();
    expect(await resolveRefsParallel(res.graph, 3, 0)).toBe(3);
    expect(h()).toBe(serial);
  });
});

describe('scan refs cache', () => {
  it('reuses resolved references only when no input changed, with identical results', async () => {
    const { detectedConfig } = await import(path.join(repo, 'dist/config/config.js'));
    const { scan, ScanCache } = await import(path.join(repo, 'dist/scan/scan.js'));
    const root = path.join(repo, 'examples/minishop');
    const cfg = detectedConfig(root);
    const h = (g: { symbols: { id: string; refs?: string[] }[] }) => JSON.stringify(g.symbols.map((s) => [s.id, s.refs ?? []]));
    const cache = new ScanCache();
    const a = await scan(cfg, root, { cache });
    expect(a.stats.refs_cached).toBeUndefined();
    const b = await scan(cfg, root, { cache });
    expect(b.stats.refs_cached).toBe(true);
    expect(h(b.graph)).toBe(h(a.graph));
    cache.refs!.key = 'stale';
    const c = await scan(cfg, root, { cache });
    expect(c.stats.refs_cached).toBeUndefined();
    expect(h(c.graph)).toBe(h(a.graph));
  });
});

describe('cli output', () => {
  it('large --json output is not cut when stdout is a pipe', async () => {
    const { spawnSync } = await import('node:child_process');
    const d = mk({ 'android/app/src/main/java/A.kt': 'class A', 'docs/many.md': Array.from({ length: 3000 }, (_, i) => `- [x](missing/file-${i}.md)`).join('\n') + '\n' });
    const r = spawnSync('node', [path.join(repo, 'dist/cli.js'), 'links', '--json'], { cwd: d, encoding: 'utf8', maxBuffer: 64 << 20 });
    expect(r.stdout.length).toBeGreaterThan(65536);
    expect(JSON.parse(r.stdout).broken.length).toBe(3000);
  });
});

describe('kb tree deps', () => {
  it('lists build dependencies, dependents and fan-in ranking; module pages carry kb:dependents', async () => {
    const { spawnSync } = await import('node:child_process');
    const d = mk({
      'settings.gradle.kts': 'include(":a", ":b", ":c")\n',
      'a/build.gradle.kts': 'plugins {}\n',
      'b/build.gradle.kts': 'dependencies {\n  implementation(projects.a)\n}\n',
      'c/build.gradle.kts': 'dependencies {\n  implementation(project(":a"))\n  implementation(projects.b)\n}\n',
      'a/src/main/kotlin/A.kt': 'class A { fun x() = 1 }\n',
      'b/src/main/kotlin/B.kt': 'class B { fun y() = A().x() }\n',
      'c/src/main/kotlin/C.kt': 'class C { fun z() = B().y() }\n',
    });
    const kb = (...a: string[]) => spawnSync('node', [path.join(repo, 'dist/cli.js'), ...a], { cwd: d, encoding: 'utf8' });
    expect(kb('init', '--quiet').status).toBe(0);
    expect(kb('compound', '--llm', 'template', '--quiet').status).toBe(0);
    const a = JSON.parse(kb('tree', 'deps', ':a', '--json').stdout);
    expect(a.dependents.map((x: { title: string }) => x.title)).toEqual([':b', ':c']);
    const c = JSON.parse(kb('tree', 'deps', 'c', '--json').stdout);
    expect(c.deps.map((x: { title: string }) => x.title).sort()).toEqual([':a', ':b']);
    const top = JSON.parse(kb('tree', 'deps', '--top', '1', '--json').stdout);
    expect(top.most_deps[0].title).toBe(':c');
    expect(top.most_dependents[0].title).toBe(':a');
    expect(kb('tree', 'deps', ':nope').status).toBe(1);
    expect(fs.readFileSync(path.join(d, 'wiki/pages/a/overview.md'), 'utf8')).toContain('<!-- kb:dependents -->');
    expect(kb('verify', '--quiet').status).toBe(0);
  });
});
