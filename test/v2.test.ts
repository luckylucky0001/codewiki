// v2 integration: hierarchical wiki in compound, kb tree, kb docs (SFK ownership).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkHumanContentPreserved, classifyFile } from '../src/docs/index.js';

const repo = path.resolve(__dirname, '..');
const cli = path.join(repo, 'dist/cli.js');
let tmp = '';
let root = '';
const kb = (args: string[], env: NodeJS.ProcessEnv = {}) => {
  const r = spawnSync('node', [cli, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
};
const git = (...a: string[]) => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { stdio: 'pipe' });
const hashDir = (d: string): string => {
  const h = createHash('sha256');
  const rec = (p: string) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const q = path.join(p, e.name);
      if (e.isDirectory()) rec(q);
      else h.update(path.relative(d, q) + '\0').update(fs.readFileSync(q));
    }
  };
  rec(d);
  return h.digest('hex');
};
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-v2-'));
  root = path.join(tmp, 'mono');
  fs.cpSync(path.join(repo, 'examples/monorepo'), root, { recursive: true });
  git('init', '-q', '-b', 'master');
  git('add', '-A');
  git('commit', '-qm', 'base');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('hierarchical wiki', () => {
  it('compound builds module_tree.json with ≥3 levels, every node page, per-level indexes; verify PASS', () => {
    expect(kb(['compound', '--llm', 'template']).code).toBe(0);
    const t = JSON.parse(read('wiki/module_tree.json'));
    const levels = new Set<number>();
    const pages: string[] = [];
    const walk = (n: { level: number; page: string; children?: unknown[] }) => {
      levels.add(n.level);
      pages.push(n.page);
      for (const c of (n.children ?? []) as typeof n[]) walk(c);
    };
    walk(t.root);
    expect(levels.size).toBeGreaterThanOrEqual(3);
    for (const p of pages) expect(fs.existsSync(path.join(root, 'wiki', p))).toBe(true);
    expect(read('wiki/index.md')).toContain('## 模块树 tree');
    expect(read('wiki/llms.txt')).toContain('module_tree.json');
    const leaf = pages.find((p) => !p.endsWith('overview.md'))!;
    const txt = read('wiki/' + leaf);
    for (const b of ['breadcrumb', 'symbols', 'sources']) expect(txt).toContain(`<!-- kb:${b} -->`);
    expect(txt).toMatch(/^level: 3$/m);
    expect(kb(['verify']).code).toBe(0);
    expect(kb(['compound', '--llm', 'template', '--json']).out).toContain('"mode": "noop"');
  });

  it('verify detects stale kb blocks; compound repairs them', () => {
    const t = JSON.parse(read('wiki/module_tree.json'));
    const page = 'wiki/' + t.root.children[0].page;
    fs.writeFileSync(path.join(root, page), read(page).replace(/<!-- kb:children -->[\s\S]*?<!-- \/kb:children -->/, '<!-- kb:children -->\nhand edit\n<!-- /kb:children -->'));
    const v = JSON.parse(kb(['verify', '--json']).out);
    expect(v.errors.map((e: { code: string }) => e.code)).toContain('E_KB_BLOCK_STALE');
    expect(kb(['compound']).code).toBe(0);
    expect(kb(['verify']).code).toBe(0);
  });

  it('kb tree show / explain / build --dry-run, and repair after a change set', () => {
    const ex = JSON.parse(kb(['tree', 'explain', 'apps/shop-android/app/src/main/java/com/minishop/ui/cart/CartViewModel.kt', '--json']).out);
    expect(ex.results[0].found).toBe(true);
    expect(ex.results[0].path.length).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(kb(['tree', 'show', '--json']).out).version).toBe(2);
    expect(JSON.parse(kb(['tree', 'build', '--dry-run', '--json']).out).path).toBeNull();
    git('add', '-A');
    git('commit', '-qm', 'wiki');
    fs.cpSync(path.join(repo, 'examples/monorepo-changes/01-cart-limit-20/files'), root, { recursive: true });
    const plan = JSON.parse(kb(['plan', '--json', '--dry-run']).out);
    expect(plan.tree.mode).toBe('repair');
    expect(kb(['compound']).code).toBe(0);
    expect(kb(['verify']).code).toBe(0);
    git('add', '-A');
    git('commit', '-qm', 'change');
  });
});

describe('kb docs (SFK ownership)', () => {
  it('scope finds the repository and both app projects', () => {
    const s = JSON.parse(kb(['docs', 'scope', '--json']).out);
    expect(s.projects.map((p: { id: string }) => p.id)).toEqual(['shop-android', 'shop-ios']);
  });

  it('dry-run and --no-root-write never touch repository docs; specs are never written', () => {
    const docsBefore = hashDir(path.join(root, 'docs'));
    const specs = hashDir(path.join(root, 'specs'));
    expect(kb(['docs', 'compound', '--dry-run']).code).toBe(0);
    expect(hashDir(path.join(root, 'docs'))).toBe(docsBefore);
    expect(kb(['docs', 'compound', '--no-root-write', '--project', 'shop-ios']).code).toBe(0);
    expect(hashDir(path.join(root, 'docs'))).toBe(docsBefore);
    expect(fs.existsSync(path.join(root, 'apps/shop-ios/docs/features.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'apps/shop-android/docs/features.md'))).toBe(false);
    expect(hashDir(path.join(root, 'specs'))).toBe(specs);
  });

  it('full run: adopted / skeleton keep human content, frozen doc untouched, evidence routing, noop rerun', () => {
    const before = Object.fromEntries(['docs/architecture.md', 'docs/testing.md', 'docs/onboarding.md', 'apps/shop-android/docs/notes.md'].map((p) => [p, read(p)]));
    const r = JSON.parse(kb(['docs', 'compound', '--restart', '--json']).out);
    const st = Object.fromEntries(r.files.map((f: { path: string; state: string }) => [f.path, f.state]));
    expect(st['docs/architecture.md']).toBe('adopted');
    expect(st['docs/testing.md']).toBe('skeleton');
    expect(st['docs/contracts.md']).toBe('new');
    for (const [p, b] of Object.entries(before)) {
      const a = read(p);
      const added = a.split('\n').filter((l) => /^#{2,6} /.test(l) && !b.split('\n').includes(l));
      expect(checkHumanContentPreserved(b, a, { allowPlaceholderRemoval: classifyFile(b, true) === 'skeleton', addedChunks: added })).toBeNull();
    }
    expect(read('docs/onboarding.md')).toBe(before['docs/onboarding.md']);
    // shared API → repository contracts.md + xref rows in the projects
    expect(read('docs/contracts.md')).toContain('POST /api/orders');
    expect(read('apps/shop-android/docs/contracts.md')).toContain('compound:owned key="xref:');
    // Draft spec → [Unconfirmed]; trusted + verified → [Verified]
    expect(read('docs/requirements.md')).toMatch(/002-wishlist[\s\S]*\[Unconfirmed\]/);
    expect(read('docs/requirements.md')).toMatch(/001-cart · FR-002[\s\S]*?\[Verified\]/);
    const again = JSON.parse(kb(['docs', 'compound', '--json']).out);
    expect(again.files.every((f: { action: string }) => f.action === 'noop' || f.action === 'skip')).toBe(true);
    expect(kb(['verify', '--docs']).code).toBe(0);
    expect(kb(['links']).code).toBe(0);
  });

  it('stale specs, ADR and debt proposals (dry-run by default)', () => {
    const st = JSON.parse(kb(['docs', 'stale-specs', '--json']).out);
    expect(st.stale.map((x: { reason: string }) => x.reason)).toContain('implemented-conflict');
    const adr = JSON.parse(kb(['docs', 'adr', '--json']).out);
    expect(adr.create.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(root, adr.create[0].path))).toBe(false);
    const debt = JSON.parse(kb(['docs', 'debt', '--write', '--json']).out);
    expect(debt.result.added.length).toBe(2);
    expect(read('docs/tech-debt.md')).toContain('TD-001');
  });

  it('agent backend: contract output is verified and merged; unknown sources rejected', () => {
    const bin = path.join(tmp, 'agent.sh');
    fs.writeFileSync(
      bin,
      `#!/bin/sh
cat >/dev/null
cat <<'OUT'
=== docs/design-patterns.md [design-patterns] ===
### 依赖注入
ViewModel 通过 Compose 的 viewModel() 获取实例。
**Source**: \`apps/shop-android/app/src/main/java/com/minishop/ui/cart/CartScreen.kt\` [Code Direct]

=== docs/design-patterns.md [design-patterns] ===
### 伪造条目
不存在的文件。
**Source**: \`nope/Missing.kt\` [Code Direct]

COMPOUND_META {"status":"done","remaining_scope":[]}
OUT
`,
      { mode: 0o755 },
    );
    const r = JSON.parse(kb(['docs', 'compound', '--llm-cmd', bin, '--json']).out);
    expect(r.agent.status).toBe('done');
    expect(read('docs/design-patterns.md')).toContain('### 依赖注入');
    expect(read('docs/design-patterns.md')).not.toContain('伪造条目');
  });
});
