// CLI behaviour: exit codes, zero-config, install idempotency, skill spec, MCP.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';

const repo = path.resolve(__dirname, '..');
const cli = path.join(repo, 'dist/cli.js');
let tmp = '';
let root = '';

function kb(args: string[], opts: { cwd?: string; input?: string } = {}) {
  const r = spawnSync('node', [cli, ...args], { cwd: opts.cwd ?? root, input: opts.input, encoding: 'utf8' });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-cli-'));
  root = path.join(tmp, 'minishop');
  fs.cpSync(path.join(repo, 'examples/minishop'), root, { recursive: true });
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('kb CLI', () => {
  it('usage errors exit 2, unknown command exits 2, version exits 0', () => {
    expect(kb([]).code).toBe(2);
    expect(kb(['nope']).code).toBe(2);
    expect(kb(['scan', '--nope']).code).toBe(2);
    expect(kb(['version']).out).toMatch(/^kb /);
    expect(kb(['help', 'compound']).out).toContain('Usage: kb compound');
  });

  it('wiki commands without codewiki.yaml exit 2 with a JSON error', () => {
    const r = kb(['verify', '--json']);
    expect(r.code).toBe(2);
    expect(JSON.parse(r.out)).toMatchObject({ ok: false, exit_code: 2 });
  });

  it('zero-config source queries work before kb init and write nothing', () => {
    const r = kb(['routes', '--json']);
    expect(r.code).toBe(0);
    expect(r.err).toContain('zero-config mode');
    expect(JSON.parse(r.out).total).toBe(20);
    expect(fs.existsSync(path.join(root, 'codewiki.yaml'))).toBe(false);
  });

  it('init → compound → verify PASS; status exit 1 after a code change', () => {
    expect(kb(['init']).code).toBe(0);
    expect(kb(['init', '--json']).out).toContain('"created": []');
    expect(kb(['compound', '--llm', 'template']).code).toBe(0);
    expect(kb(['verify']).code).toBe(0);
    expect(kb(['status']).code).toBe(0);
    fs.cpSync(path.join(repo, 'examples/minishop-changes/01-cart-limit/files'), root, { recursive: true });
    const st = kb(['status', '--json']);
    expect(st.code).toBe(1);
    expect(JSON.parse(st.out).stale.length).toBeGreaterThan(0);
    expect(kb(['compound', '--dry-run']).code).toBe(0);
    expect(kb(['compound']).code).toBe(0);
    expect(kb(['status']).code).toBe(0);
  });

  it('write-set guard reverts writes outside the task write set', () => {
    fs.cpSync(path.join(repo, 'examples/minishop-changes/02-arkts-api-rename/files'), root, { recursive: true });
    const r = kb(['compound', '--json', '--llm-cmd', 'echo hacked > index.md; echo x > pages/evil.md; exit 3', '--fallback']);
    const res = JSON.parse(r.out).result;
    expect(res.tasks.every((t: { writer: string }) => t.writer === 'template')).toBe(true);
    expect(fs.readFileSync(path.join(root, 'wiki/index.md'), 'utf8')).not.toContain('hacked');
    expect(fs.existsSync(path.join(root, 'wiki/pages/evil.md'))).toBe(false);
    expect(kb(['verify']).code).toBe(0);
  });

  it('install is idempotent and ships one spec-conformant skill', () => {
    const target = path.join(tmp, 'target');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'AGENTS.md'), '# Mine\n\nkeep me\n');
    expect(kb(['install', '--agent', 'all', '--mcp', '--target', target]).code).toBe(0);
    const snap = () => Object.fromEntries(fs.readdirSync(target, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(target, f)).isFile()).map((f) => [f, fs.readFileSync(path.join(target, f), 'utf8')]));
    const first = snap();
    const again = JSON.parse(kb(['install', '--agent', 'all', '--mcp', '--target', target, '--json']).out);
    expect(again.actions.every((x: { action: string }) => x.action === 'unchanged')).toBe(true);
    expect(snap()).toEqual(first);
    expect(first['AGENTS.md']).toContain('keep me');
    expect(first['AGENTS.md']).toContain('<!-- codewiki:begin');
    const skills = Object.keys(first).filter((f) => f.endsWith('SKILL.md'));
    expect(skills.sort()).toEqual(['.agents/skills/codewiki/SKILL.md', '.claude/skills/codewiki/SKILL.md', '.trae/skills/codewiki/SKILL.md']);
    expect(JSON.parse(first['.mcp.json']!).mcpServers.codewiki.args).toEqual(['mcp', '--root', target]);
  });

  it('skill frontmatter follows the agentskills spec', () => {
    const dir = path.join(repo, 'skills');
    expect(fs.readdirSync(dir)).toEqual(['codewiki']);
    const s = fs.readFileSync(path.join(dir, 'codewiki/SKILL.md'), 'utf8');
    const fm = YAML.parse(s.split('---')[1]!);
    expect(fm.name).toBe('codewiki');
    expect(fm.description.length).toBeLessThan(1024);
    expect(s.split('\n').length).toBeLessThan(500);
    for (const m of s.matchAll(/\]\((references\/[^)]+)\)/g)) expect(fs.existsSync(path.join(dir, 'codewiki', m[1]!))).toBe(true);
    // one level deep: every bundled reference is routed from SKILL.md, and scripts are named there
    for (const f of fs.readdirSync(path.join(dir, 'codewiki/references'))) expect(s).toContain(`](references/${f})`);
    for (const f of fs.readdirSync(path.join(dir, 'codewiki/scripts'))) expect(s).toContain(`scripts/${f}`);
    expect(fs.readdirSync(path.join(dir, 'codewiki')).sort()).toEqual(['SKILL.md', 'references', 'scripts']);
  });

  it('mcp server lists tools and runs them', () => {
    const input = ['{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}', '{"jsonrpc":"2.0","method":"notifications/initialized"}', '{"jsonrpc":"2.0","id":2,"method":"tools/list"}', '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"kb_get","arguments":{"page":"features/cart"}}}', '{"jsonrpc":"2.0","id":4,"method":"nope"}'].join('\n') + '\n';
    const r = kb(['mcp', '--root', root], { input });
    const lines = r.out.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.id)).toEqual([1, 2, 3, 4]);
    expect(lines[1].result.tools.map((t: { name: string }) => t.name)).toContain('kb_conflicts');
    expect(JSON.parse(lines[2].result.content[0].text).path).toBe('pages/features/cart.md');
    expect(lines[3].error.code).toBe(-32601);
  });
});
