// Real Codex / Gemini CLI binaries against local mock model servers (port of legacy-go
// internal/cli/{codex,gemini}_real_test.go). Skipped unless the binary is found:
//   KB_CODEX_BIN=/path/to/codex KB_GEMINI_BIN=/path/to/gemini npm test -- test/agents-real.test.ts
// REAL: the agent binary (exec / -p mode, config, provider, sandbox, tools, JSON output), kb (prompt,
// untrusted-data wrapping, write-set guard, usage parsing, verify, publish). MOCKED: only the model.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';

const repo = path.resolve(__dirname, '..');
const cli = path.join(repo, 'dist/cli.js');
const which = (name: string, env: string): string => {
  if (process.env[env]) return process.env[env]!;
  const r = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
};
const codexBin = which('codex', 'KB_CODEX_BIN');
const geminiBin = which('gemini', 'KB_GEMINI_BIN');

const writeSetRe = /^- `(pages\/[^`]+\.md)`$/gm;
const claimIdRe = /"id":\s*"([^"]+)"/g;
const writeSet = (text: string): string[] => {
  let ws = text;
  const i = ws.indexOf('## 可写集合');
  if (i >= 0) {
    ws = ws.slice(i);
    const j = ws.indexOf('## 规则');
    if (j >= 0) ws = ws.slice(0, j);
  }
  return [...ws.matchAll(writeSetRe)].map((m) => m[1]!);
};

interface Mock {
  url: string;
  requests: number;
  paths: string[];
  tools: string[];
  prompts: string[];
  close: () => Promise<void>;
}

async function serve(handler: (req: http.IncomingMessage, body: string, res: http.ServerResponse, m: Mock) => void): Promise<Mock> {
  const m: Mock = { url: '', requests: 0, paths: [], tools: [], prompts: [], close: async () => {} };
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => handler(req, body, res, m));
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  m.url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  m.close = () => new Promise((r) => srv.close(() => r()));
  return m;
}

/** OpenAI Responses API: turn 1 asks codex's shell tool to write the write set + one file outside it; turn 2 says "done". */
function responsesHandler(req: http.IncomingMessage, body: string, res: http.ServerResponse, m: Mock): void {
  if (req.method !== 'POST') {
    res.setHeader('content-type', 'application/json');
    res.end('{"data":[],"models":[]}');
    return;
  }
  let r: { input?: { type?: string; content?: { text?: string }[] }[]; tools?: { name?: string }[] } = {};
  try {
    r = JSON.parse(body);
  } catch {
    /* empty */
  }
  let text = '';
  let hasOutput = false;
  for (const it of r.input ?? []) {
    if ((it.type ?? '').endsWith('_output')) hasOutput = true;
    for (const c of Array.isArray(it.content) ? it.content : []) if (typeof c?.text === 'string') text += c.text + '\n';
  }
  const n = ++m.requests;
  m.tools = (r.tools ?? []).map((t) => t.name ?? '');
  m.prompts.push(text);
  let item: Record<string, unknown>;
  if (!hasOutput) {
    let sh = '';
    for (const p of writeSet(text)) {
      const id = p.replace(/^pages\//, '').replace(/\.md$/, '');
      sh += `printf -- '---\\nid: ${id}\\ntitle: codex page\\nsources: []\\n---\\n# codex real page\\n\\n[总览](../overview.md)\\n' > '${p}'; `;
    }
    if (text.includes('`.kb/ingest/verdicts.json`')) {
      const cl = [...text.matchAll(claimIdRe)].map((mm) => JSON.stringify({ id: mm[1], status: 'unverifiable', evidence: ['codex mock'] }));
      sh += `mkdir -p .kb/ingest && printf '%s' '${JSON.stringify({ version: 1, claims: '__C__' }).replace('"__C__"', '[' + cl.join(',') + ']')}' > .kb/ingest/verdicts.json; `;
    }
    sh += 'echo outside > pages/evil-codex.md';
    const exec = m.tools.includes('exec_command');
    item = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: exec ? 'exec_command' : 'shell', arguments: JSON.stringify(exec ? { cmd: sh } : { command: ['bash', '-lc', sh] }) };
  } else {
    item = { type: 'message', role: 'assistant', id: 'msg_1', content: [{ type: 'output_text', text: 'done' }] };
  }
  res.setHeader('content-type', 'text/event-stream');
  const rid = `resp_${n}`;
  for (const ev of [
    { type: 'response.created', response: { id: rid } },
    { type: 'response.output_item.done', item },
    { type: 'response.completed', response: { id: rid, usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 100 }, output_tokens: 20, output_tokens_details: { reasoning_tokens: 5 }, total_tokens: 1020 } } },
  ]) res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
  res.end();
}

/** Gemini API: generateContent (router) gets a fixed choice; streamGenerateContent turn 1 = write_file calls, turn 2 = "done". */
function geminiHandler(req: http.IncomingMessage, body: string, res: http.ServerResponse, m: Mock): void {
  let r: { contents?: { parts?: Record<string, unknown>[] }[]; tools?: { functionDeclarations?: { name: string }[] }[] } = {};
  try {
    r = JSON.parse(body);
  } catch {
    /* empty */
  }
  let text = '';
  let answered = false;
  for (const c of r.contents ?? []) {
    for (const p of c.parts ?? []) {
      if (typeof p.text === 'string') text += p.text + '\n';
      if ('functionResponse' in p) answered = true;
    }
  }
  m.requests++;
  m.paths.push(req.url ?? '');
  if (r.tools?.length) m.tools = r.tools.flatMap((t) => (t.functionDeclarations ?? []).map((f) => f.name));
  m.prompts.push(text);
  const usageMetadata = { promptTokenCount: 900, candidatesTokenCount: 30, totalTokenCount: 930, thoughtsTokenCount: 4 };
  if (!(req.url ?? '').includes('streamGenerateContent')) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: '{"reasoning":"simple","model_choice":"flash"}' }] }, finishReason: 'STOP' }], usageMetadata }));
    return;
  }
  let parts: unknown[];
  if (answered) parts = [{ text: 'done' }];
  else {
    parts = writeSet(text).map((p) => {
      const id = p.replace(/^pages\//, '').replace(/\.md$/, '');
      return { functionCall: { name: 'write_file', args: { file_path: p, content: `---\nid: ${id}\ntitle: gemini page\nsources: []\n---\n# gemini real page\n\n[总览](../overview.md)\n` } } };
    });
    parts.push({ functionCall: { name: 'write_file', args: { file_path: 'pages/evil-gemini.md', content: 'outside\n' } } });
  }
  res.setHeader('content-type', 'text/event-stream');
  res.end(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }], usageMetadata })}\n\n`);
}

/** async kb run: the mock server lives in this process, so the child must not block the event loop */
function kbAsync(dir: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn('node', [cli, '--root', dir, ...args], { env: { ...process.env, ...env } });
    let out = '';
    let err = '';
    p.stdout.on('data', (c) => (out += c));
    p.stderr.on('data', (c) => (err += c));
    p.on('close', (code) => resolve({ code: code ?? -1, out, err }));
  });
}
const kb = (dir: string, ...args: string[]) => spawnSync('node', [cli, '--root', dir, ...args], { encoding: 'utf8' });
const git = (dir: string, ...a: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { stdio: 'pipe' });

/** minishop with a template wiki committed and the 01-cart-limit change on top */
function repoWithChange(): string {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-real-')), 'minishop');
  fs.cpSync(path.join(repo, 'examples/minishop'), dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'master');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  expect(kb(dir, 'init').status).toBe(0);
  expect(kb(dir, 'compound', '--llm', 'template').status).toBe(0);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'wiki');
  fs.cpSync(path.join(repo, 'examples/minishop-changes/01-cart-limit/files'), dir, { recursive: true });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'change: cart limit');
  return dir;
}
const shim = (name: string, bin: string): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-shim-'));
  fs.writeFileSync(path.join(d, name), `#!/bin/sh\nexec "${bin}" "$@"\n`, { mode: 0o755 });
  return d;
};
const noProxy = { NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' };
type Task = { status: string; reverted?: string[]; usage?: Record<string, number>; agent?: string };

describe.skipIf(!codexBin)('real codex CLI + mock model', () => {
  it('kb compound / kb ingest --agent codex: pages written, out-of-set write reverted, usage parsed, verify passes', async () => {
    const m = await serve(responsesHandler);
    try {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-codex-home-'));
      fs.writeFileSync(path.join(home, 'config.toml'), `model = "mock-model"\nmodel_provider = "mock"\n[model_providers.mock]\nname = "mock"\nbase_url = "${m.url}/v1"\nwire_api = "responses"\nsupports_websockets = false\nrequest_max_retries = 0\nstream_max_retries = 0\n`);
      const env = { PATH: shim('codex', codexBin) + path.delimiter + process.env.PATH, CODEX_HOME: home, ...noProxy };
      const dir = repoWithChange();
      const r = await kbAsync(dir, ['compound', '--agent', 'codex', '--keep-work', '--json'], env);
      expect(r.code, r.err).toBe(0);
      const tasks = JSON.parse(r.out).result.tasks as Task[];
      expect(tasks.length).toBeGreaterThan(0);
      expect(m.requests).toBeGreaterThanOrEqual(2 * tasks.length);
      for (const t of tasks) {
        expect(t.status).toBe('violation');
        expect(t.reverted).toEqual(['pages/evil-codex.md']);
        expect(t.usage?.input_tokens).toBeGreaterThan(0);
        expect(t.usage?.turns).toBe(1);
      }
      expect(fs.readFileSync(path.join(dir, 'wiki/pages/features/cart.md'), 'utf8')).toContain('codex real page');
      expect(fs.existsSync(path.join(dir, 'wiki/pages/evil-codex.md'))).toBe(false);
      const p0 = m.prompts[0]!;
      expect(p0).toContain('codewiki 任务');
      expect(p0).toContain('## 安全规则');
      expect(p0).toContain('<untrusted-data kind=');
      expect(kb(dir, 'verify').status).toBe(0);
      const ri = await kbAsync(dir, ['ingest', path.join(dir, 'docs/legacy/cart.md'), '--agent', 'codex', '--json'], env);
      expect(ri.code, ri.err).toBe(0);
      const it2 = JSON.parse(ri.out).result.tasks as Task[];
      expect(it2.length).toBeGreaterThan(0);
      for (const t of it2) {
        expect(t.agent).toBe('codex');
        expect(t.status).toBe('violation');
        expect(t.reverted).toEqual(['pages/evil-codex.md']);
      }
      expect(fs.existsSync(path.join(dir, 'wiki/pages/_conflicts.md'))).toBe(true);
    } finally {
      await m.close();
    }
  }, 240_000);

  it('after kb install --agent codex --mcp, codex sees the AGENTS.md block and the codewiki skill; MCP only once trusted', () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-codex-inst-')), 'minishop');
    fs.cpSync(path.join(repo, 'examples/minishop'), dir, { recursive: true });
    git(dir, 'init', '-q', '-b', 'master');
    kb(dir, 'init');
    kb(dir, 'compound', '--llm', 'template');
    expect(kb(dir, 'install', '--agent', 'codex', '--mcp', '--target', dir).status).toBe(0);
    fs.mkdirSync(path.join(dir, 'android', 'app'), { recursive: true });
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-codex-home-'));
    const codex = (cwd: string, ...args: string[]) => {
      const r = spawnSync(codexBin, args, { cwd, encoding: 'utf8', env: { ...process.env, CODEX_HOME: home } });
      expect(r.status, r.stderr).toBe(0);
      return r.stdout;
    };
    const input = codex(path.join(dir, 'android', 'app'), 'debug', 'prompt-input', 'hi');
    expect(input.split('Code-anchored wiki (codewiki)').length - 1).toBe(1);
    expect(input).toContain('`kb routes`');
    expect(input).toContain('codewiki:');
    expect(codex(dir, 'mcp', 'list')).not.toContain('codewiki');
    fs.writeFileSync(path.join(home, 'config.toml'), `[projects.${JSON.stringify(dir)}]\ntrust_level = "trusted"\n`);
    const l = codex(dir, 'mcp', 'list');
    expect(l).toContain('codewiki');
    expect(l).toContain('--root ' + dir);
  }, 120_000);
});

describe.skipIf(!geminiBin)('real gemini CLI + mock model', () => {
  const geminiHome = (dir?: string) => {
    const h = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-gemini-home-'));
    fs.mkdirSync(path.join(h, '.gemini'));
    fs.writeFileSync(path.join(h, '.gemini', 'settings.json'), '{"security":{"auth":{"selectedType":"gemini-api-key"}}}');
    if (dir) fs.writeFileSync(path.join(h, '.gemini', 'trustedFolders.json'), JSON.stringify({ [dir]: 'TRUST_FOLDER' }));
    return h;
  };

  it('kb compound --agent gemini: write_file pages published, out-of-set write reverted, no shell tool, usage parsed', async () => {
    const m = await serve(geminiHandler);
    try {
      const env = { PATH: shim('gemini', geminiBin) + path.delimiter + process.env.PATH, GEMINI_CLI_HOME: geminiHome(), GEMINI_API_KEY: 'dummy', GOOGLE_GEMINI_BASE_URL: m.url, ...noProxy };
      const dir = repoWithChange();
      const r = await kbAsync(dir, ['compound', '--agent', 'gemini', '--keep-work', '--json'], env);
      expect(r.code, r.err + '\nmock paths: ' + m.paths.join(' ')).toBe(0);
      const tasks = JSON.parse(r.out).result.tasks as Task[];
      expect(tasks.length).toBeGreaterThan(0);
      for (const t of tasks) {
        expect(t.status).toBe('violation');
        expect(t.reverted).toEqual(['pages/evil-gemini.md']);
        expect(t.usage?.input_tokens).toBeGreaterThan(0);
        expect(t.usage?.output_tokens).toBeGreaterThan(0);
      }
      expect(fs.readFileSync(path.join(dir, 'wiki/pages/features/cart.md'), 'utf8')).toContain('gemini real page');
      expect(fs.existsSync(path.join(dir, 'wiki/pages/evil-gemini.md'))).toBe(false);
      expect(m.tools).not.toContain('run_shell_command');
      expect(kb(dir, 'verify').status).toBe(0);
    } finally {
      await m.close();
    }
  }, 240_000);

  it('after kb install --agent gemini --mcp, gemini sends the GEMINI.md block and the skill and offers the kb MCP tools', async () => {
    const m = await serve(geminiHandler);
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-gemini-inst-')), 'minishop');
      fs.cpSync(path.join(repo, 'examples/minishop'), dir, { recursive: true });
      git(dir, 'init', '-q', '-b', 'master');
      kb(dir, 'init');
      kb(dir, 'compound', '--llm', 'template');
      expect(kb(dir, 'install', '--agent', 'gemini', '--mcp', '--target', dir).status).toBe(0);
      const kbShim = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-shim-'));
      fs.writeFileSync(path.join(kbShim, 'kb'), `#!/bin/sh\nexec node "${cli}" "$@"\n`, { mode: 0o755 });
      const r = await new Promise<{ code: number; out: string }>((resolve) => {
        const p = spawn(geminiBin, ['-p', 'Which routes does the app have?', '-o', 'json'], {
          cwd: dir,
          env: { ...process.env, PATH: kbShim + path.delimiter + process.env.PATH, GEMINI_CLI_HOME: geminiHome(dir), GEMINI_API_KEY: 'dummy', GOOGLE_GEMINI_BASE_URL: m.url, ...noProxy },
        });
        let out = '';
        p.stdout.on('data', (c) => (out += c));
        p.stderr.on('data', (c) => (out += c));
        p.on('close', (code) => resolve({ code: code ?? -1, out }));
      });
      expect(r.code, r.out).toBe(0);
      const all = m.prompts.join('\n');
      expect(all).toContain('Code-anchored wiki (codewiki)');
      expect(all).toContain('`kb routes`');
      expect(all).toContain('codewiki');
      const tools = m.tools.join(',');
      for (const t of ['mcp_codewiki_kb_search', 'mcp_codewiki_kb_context', 'mcp_codewiki_kb_conflicts']) expect(tools).toContain(t);
    } finally {
      await m.close();
    }
  }, 180_000);
});
