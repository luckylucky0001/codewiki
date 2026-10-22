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

describe('verify --docs semantics', () => {
  it('fails only on kb-owned broken references; human-text links are review candidates unless --strict', async () => {
    const { spawnSync } = await import('node:child_process');
    const owned = (link: string) => `### Cart\n\nCart screen, see [spec](${link}).\n\n**Source**: \`android/app/A.kt\` [Code Direct] [Verified]\n`;
    const d = mk({
      'android/app/A.kt': 'class A\n',
      'docs/notes.md': '# Notes\n\nHuman text with a [dead link](gone.md) and `tools/missing.sh`.\n',
      'docs/features.md': '# Features\n\n' + owned('nowhere.md'),
    });
    fs.mkdirSync(path.join(d, 'tools'));
    const kb = (...a: string[]) => spawnSync('node', [path.join(repo, 'dist/cli.js'), ...a], { cwd: d, encoding: 'utf8' });
    expect(kb('init', '--quiet').status).toBe(0);
    fs.rmSync(path.join(d, 'wiki'), { recursive: true });
    let r = kb('verify', '--docs', '--json');
    let j = JSON.parse(r.stdout);
    expect(r.status).toBe(1);
    expect(j.errors.map((e: { page: string }) => e.page)).toEqual(['docs/features.md']);
    expect(j.human_review_candidates.map((e: { detail: string }) => e.detail.split(' ')[1]!.replace(/:$/, '')).sort()).toEqual(['gone.md', 'tools/missing.sh']);
    fs.writeFileSync(path.join(d, 'docs/features.md'), '# Features\n\n' + owned('notes.md'));
    r = kb('verify', '--docs', '--json');
    j = JSON.parse(r.stdout);
    expect(r.status).toBe(0);
    expect(j.errors).toEqual([]);
    expect(j.human_review_candidates).toHaveLength(2);
    expect(kb('verify', '--docs', '--strict').status).toBe(1);
  });
});

describe('link checker SFK rule', () => {
  it('checks markdown links and only path-like backticks; skips code, globs, URLs, placeholders, fences, sibling repos', async () => {
    const { checkLinks } = await import('../src/docs/index.js');
    const files = new Set(['docs/a.md', 'src/main.kt', 'tools/run.sh']);
    const dirs = new Set(['docs', 'src', 'tools']);
    const exists = (p: string) => files.has(p) || dirs.has(p);
    const text = [
      '# A', '',
      '[ok](a.md) [dead](b.md) ![img](./fig(5).png)',
      '`src/main.kt` `src/gone.kt` `tools/` `tools/missing.sh` `./x.md` `../tools/run.sh`',
      '`foo(bar)/x.kt` `src/*.kt` `https://x.io/a.md` `changelog/vX.Y.Z.md` `<module>/src/a.kt` `a.b.c` `src/main` `nodir/a.kt` `../other_repo/lib/a.dart`',
      '```', '`src/inside-fence.kt` [f](fence.md)', '```',
    ].join('\n');
    const broken = checkLinks([{ path: 'docs/a.md', text }], { exists }, { exists }).map((b) => b.target).sort();
    expect(broken).toEqual(['./fig(5).png', './x.md', 'b.md', 'src/gone.kt', 'tools/missing.sh']);
  });
});

describe('warm-scan caches (facts result, lazy call sites)', () => {
  it('cached facts and lazily loaded calls are identical to an uncached run; a resource change misses', async () => {
    const { spawnSync } = await import('node:child_process');
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kbfc-'));
    fs.cpSync(path.join(repo, 'examples/minishop'), d, { recursive: true });
    expect(spawnSync('node', [path.join(repo, 'dist/cli.js'), 'init', '--quiet'], { cwd: d }).status).toBe(0);
    const { loadConfig } = await import(path.join(repo, 'dist/config/config.js'));
    const { scanRepo } = await import(path.join(repo, 'dist/scan/scan.js'));
    const { extractFacts } = await import(path.join(repo, 'dist/facts/facts.js'));
    const { extractFactsCached } = await import(path.join(repo, 'dist/engine/factscache.js'));
    const cfg = loadConfig(d);
    const fresh = async () => {
      process.env.KB_NO_CACHE = '1';
      try {
        const r = await scanRepo(cfg);
        return { calls: JSON.stringify(r.calls), facts: JSON.stringify(extractFacts(cfg, r)) };
      } finally {
        delete process.env.KB_NO_CACHE;
      }
    };
    const want = await fresh();
    const r1 = await scanRepo(cfg); // cold: fills both caches
    expect(JSON.stringify(extractFactsCached(cfg, r1))).toBe(want.facts);
    const r2 = await scanRepo(cfg); // warm: hits, calls loaded lazily
    expect(r2.stats.cache_hits).toBe(r2.stats.files);
    expect(JSON.stringify(r2.calls)).toBe(want.calls);
    expect(JSON.stringify(extractFactsCached(cfg, r2))).toBe(want.facts);
    // a non-source input of facts (deep-link scheme in the manifest) changes -> miss, new facts
    const mf = path.join(d, 'android/app/src/main/AndroidManifest.xml');
    fs.writeFileSync(mf, fs.readFileSync(mf, 'utf8').replace(/android:scheme="[^"]+"/, 'android:scheme="changedscheme"'));
    const want2 = await fresh();
    expect(want2.facts).not.toBe(want.facts);
    expect(JSON.stringify(extractFactsCached(cfg, await scanRepo(cfg)))).toBe(want2.facts);
  });
});

describe('discover-docs roots', () => {
  it('finds Documentation/ and top-level prose, skips kb\'s own wiki even without a config', async () => {
    const { discoverDocs } = await import('../src/engine/docs.js');
    const d = mk({
      'Documentation/How-it-works.md': '# How it works\n',
      'Documentation/Setup.md': '# Setup\n',
      'ARCHITECTURE.md': '# Arch\n',
      'CHANGELOG.md': '# Changes\n',
      'wiki/Home.md': '# project wiki\n',
      'kbwiki/.kb/state.json': '{}',
      'kbwiki/pages/features/a.md': '# page\n',
      'kbwiki/index.md': '# index\n',
    });
    const paths = discoverDocs(d, []).docs.map((x) => x.path);
    expect(paths).toEqual(['ARCHITECTURE.md', 'Documentation/How-it-works.md', 'Documentation/Setup.md', 'wiki/Home.md']);
  });
});
