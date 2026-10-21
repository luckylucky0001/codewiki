// Ingest parity with Go, and the LLM writer path with a fake agent CLI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repo = path.resolve(__dirname, '..');
const cli = path.join(repo, 'dist/cli.js');
const golden = path.join(repo, 'test/golden/minishop');
let tmp = '';
let root = '';
const kb = (args: string[], env: NodeJS.ProcessEnv = {}) => {
  const r = spawnSync('node', [cli, '--root', root, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
};

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-agent-'));
  root = path.join(tmp, 'minishop');
  fs.cpSync(path.join(repo, 'examples/minishop'), root, { recursive: true });
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('ingest + agent writer', () => {
  it('discover-docs + ingest produce Go-identical requirements and conflicts page', () => {
    expect(kb(['init']).code).toBe(0);
    const docs = JSON.parse(kb(['discover-docs', '--json']).out);
    const want = JSON.parse(fs.readFileSync(path.join(golden, 'discover-docs.json'), 'utf8'));
    expect(docs.docs).toEqual(want.docs);
    fs.writeFileSync(path.join(tmp, 'docs.json'), JSON.stringify(docs));
    expect(kb(['ingest', '--manifest', path.join(tmp, 'docs.json'), '--kinds', 'spec,design,adr,agent-guide,doc', '--llm', 'template']).code).toBe(0);
    expect(kb(['compound', '--llm', 'template']).code).toBe(0);
    expect(fs.readFileSync(path.join(root, 'wiki/facts/requirements.json'), 'utf8')).toBe(fs.readFileSync(path.join(golden, 'requirements.json'), 'utf8'));
    expect(fs.readFileSync(path.join(root, 'wiki/pages/_conflicts.md'), 'utf8')).toBe(fs.readFileSync(path.join(golden, '_conflicts.md'), 'utf8'));
    const c = JSON.parse(kb(['conflicts', '--json']).out);
    expect(c.counts.conflict).toBeGreaterThan(0);
  });

  it('--agent claude runs the agent CLI per task; anchors are re-stamped; data is wrapped as untrusted', () => {
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(bin);
    // fake `claude`: copy the frontmatter block from the prompt, add a body, write the page
    fs.writeFileSync(
      path.join(bin, 'claude'),
      `#!/bin/sh
P="\${TMPDIR:-/tmp}/kbfake-$$.prompt"; cat > "$P"
page=$(sed -n 's/^- page: \`\\(.*\\)\`$/\\1/p' "$P" | head -1)
grep -q '安全规则（最高优先级）' "$P" || exit 7
case "$page" in pages/features/*) grep -q '<untrusted-data kind="source"' "$P" || exit 8;; esac
mkdir -p "$(dirname "$page")"
awk '/^\`\`\`yaml$/{f=1;next} f&&/^\`\`\`$/{exit} f' "$P" | sed 's/<中文标题>/LLM 页面/' > "$page"
printf '\\n# LLM 页面\\n\\n由假 agent 写入。\\n' >> "$page"
echo '{"type":"result","usage":{"input_tokens":1,"output_tokens":1}}'
`,
      { mode: 0o755 },
    );
    fs.cpSync(path.join(repo, 'examples/minishop-changes/03-profile-route/files'), root, { recursive: true });
    const r = kb(['compound', '--agent', 'claude', '--json'], { PATH: bin + path.delimiter + process.env.PATH });
    const res = JSON.parse(r.out).result;
    expect(res.agent).toBe('claude');
    const llmTasks = res.tasks.filter((t: { writer: string }) => t.writer === 'cmd');
    expect(llmTasks.length).toBeGreaterThan(0);
    expect(res.tasks.filter((t: { status: string }) => t.status !== 'ok')).toEqual([]);
    expect(fs.readFileSync(path.join(root, 'wiki/pages/features/profile.md'), 'utf8')).toContain('由假 agent 写入');
    expect(kb(['verify']).code).toBe(0);
  });
});
