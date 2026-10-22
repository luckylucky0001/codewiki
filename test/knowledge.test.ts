// Agent-led business knowledge + page retirement (port of legacy-go knowledge_test.go / retire_test.go),
// plus CLI end-to-end runs with fake agents (planner + writers, IDE file handoff). No real LLM.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/config.js';
import { GraphVersion, getSym, reindexGraph, graphJSON, type Graph, type Symbol } from '../src/model.js';
import { analyze, compound, TaskEnv, type Analysis, type Options, type Result } from '../src/engine/compound.js';
import { diffGraphs } from '../src/engine/diff.js';
import { KnowledgePlanFile, KnowledgeSections, applyKnowledgePlan, inKnowledgeScope, prepareResume, reuseKnowledge, runKnowledgeTasks, validateKnowledgePlan, type KnowledgePlan } from '../src/engine/knowledge.js';
import { RetiredPagesFile, retirePages, suppressRetiredPlaceholders } from '../src/engine/retire.js';
import { OverviewPage, type Plan } from '../src/engine/plan.js';
import { SharedPage } from '../src/engine/anchors.js';
import { renderPage, writeFileAtomic, type Page } from '../src/wiki/page.js';
import { goJSON } from '../src/util/go.js';

const repo = path.resolve(__dirname, '..');
const cli = path.join(repo, 'dist/cli.js');
let tmp = '';
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-knowledge-'));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

let n = 0;
/** fresh minishop copy with codewiki.yaml */
function minishop(): string {
  const d = path.join(tmp, `m${n++}`);
  fs.cpSync(path.join(repo, 'examples/minishop'), d, { recursive: true });
  expect(spawnSync('node', [cli, '--root', d, 'init', '--quiet']).status).toBe(0);
  return d;
}
const writeJSON = (p: string, v: unknown) => writeFileAtomic(p, goJSON(v, '  '));
const quiet: Partial<Options> = { log: () => {} };
const sym = (id: string, hash: string, file = ''): Symbol => ({ id, platform: 'android', lang: 'kotlin', kind: 'function', name: id, qual: id, file, start_line: 1, end_line: 1, signature: id, hash, sig_hash: hash, norm_hash: hash } as Symbol);
const graph = (syms: Symbol[], commit?: string): Graph => {
  const g = { version: GraphVersion, commit, symbols: syms, files: {}, parse_failures: [] } as Graph;
  reindexGraph(g);
  return g;
};
/** a knowledge page that passes the structural checks */
function knowledgePage(p: string, anchors: { sym: string; hash: string }[], filler = '受控测试正文说明状态边界与证据。'): Page {
  let body = anchors.map((a) => '`' + a.sym + '`\n').join('');
  for (const h of KnowledgeSections) body += `\n## ${h}\n` + filler.repeat(30) + '\n';
  return { path: p, hasFM: true, front: { id: p.slice('pages/'.length, -3), title: '业务', kind: 'concept', status: 'current', sources: anchors }, body };
}

describe('knowledge plan (knowledge.go)', () => {
  const good = (): KnowledgePlan => ({ version: 1, rationale: 'code research', modules: { net: 'pages/modules/net.md' }, pages: [{ page: 'pages/modules/net.md', kind: 'concept', title: 'Network', scope: ['net'], questions: ['entry', 'state', 'retry'], symbols: ['a', 'b', 'c'] }] });

  it('rejects unsafe and unmapped plans', () => {
    expect(() => validateKnowledgePlan(good())).not.toThrow();
    for (const p of ['../escape.md', 'pages/modules/../../AGENTS.md', 'pages/modules/a.md/evil', '/tmp/x.md', 'pages/net/overview.md']) {
      const kp = good();
      kp.pages[0]!.page = p;
      expect(() => validateKnowledgePlan(kp), p).toThrow();
    }
    for (const scope of [['../outside'], ['net/'], ['/abs'], ['a\\b'], []]) {
      const kp = good();
      kp.pages[0]!.scope = scope;
      expect(() => validateKnowledgePlan(kp), JSON.stringify(scope)).toThrow();
    }
    let kp = good();
    kp.modules.db = 'pages/modules/missing.md';
    expect(() => validateKnowledgePlan(kp)).toThrow(/unknown page/);
    kp = good();
    kp.pages[0]!.questions = ['only one'];
    expect(() => validateKnowledgePlan(kp)).toThrow(/questions/);
    kp = good();
    kp.pages[0]!.kind = 'feature';
    expect(() => validateKnowledgePlan(kp)).toThrow(/kind/);
  });

  it('scope catches unanchored changes and keeps noop; no directory prefix collision', () => {
    const old = graph([sym('seed', 'same', 'net/a.java'), sym('unanchored', 'old', 'net/b.java')]);
    const cur = graph([sym('seed', 'same', 'net/a.java'), sym('unanchored', 'new', 'net/b.java')]);
    const kp = { pages: [{ page: 'pages/modules/net.md', kind: 'concept', title: 'Net', scope: ['net'], symbols: ['seed'], questions: [] }] } as unknown as KnowledgePlan;
    const pages = [{ path: 'pages/modules/net.md', hasFM: true, body: '', front: { id: 'modules/net', title: 'Net', sources: [{ sym: 'seed', hash: 'same' }] } }];
    const a = { graph: cur, old, diff: diffGraphs(old, cur), plan: { mode: 'incremental', tasks: [] } as unknown as Plan, pages };
    applyKnowledgePlan(a, kp, false);
    expect(a.plan.tasks.length).toBe(1);
    expect(a.plan.tasks[0]!.knowledge).toBe(true);
    expect(a.plan.tasks[0]!.reasons.map((r) => r.code)).toContain('knowledge_scope_changed');
    const b = { graph: cur, old: cur, diff: diffGraphs(cur, cur), plan: { mode: 'noop', tasks: [] } as unknown as Plan, pages };
    applyKnowledgePlan(b, kp, false);
    expect(b.plan.tasks).toEqual([]);
    expect(b.plan.mode).toBe('noop');
    expect(inKnowledgeScope('network/a.java', ['net'])).toBe(false);
    expect(inKnowledgeScope('net/a.java', ['net'])).toBe(true);
    expect(inKnowledgeScope('anything', ['.'])).toBe(true);
  });

  it('cannot restamp with template, and a budget never silently falls back', async () => {
    const env = new TaskEnv({ llm: 'template' } as Options, {} as Analysis, tmp, tmp, '', '');
    const r = await runKnowledgeTasks(env, [{ id: 'test', op: 'create', kind: 'concept', page: 'pages/modules/net.md', title: 'n', write_set: [], reasons: [], context: [], priority: 1, knowledge: true }]);
    expect(r.map((x) => x.status)).toEqual(['failed']);
    expect(r[0]!.error).toMatch(/template restamping is forbidden/);
    const env2 = new TaskEnv({ llm: 'cmd', maxTasks: 1 } as Options, {} as Analysis, tmp, tmp, '', '');
    const t = { id: 'x', op: 'create', kind: 'concept', page: 'pages/modules/a.md', title: 'a', write_set: [], reasons: [], context: [], priority: 1, knowledge: true };
    const r2 = await runKnowledgeTasks(env2, [t, { ...t, id: 'y', page: 'pages/modules/b.md' }]);
    expect(r2.every((x) => x.status === 'failed' && /budget/.test(x.error ?? ''))).toBe(true);
  });

  it('agent publish, failure and noop (in-process compound on minishop)', async () => {
    const dir = minishop();
    const cfg = loadConfig(dir);
    const first = await compound({ cfg, llm: 'template', ...quiet });
    expect(first.published).toBe(true);
    const a = await analyze({ cfg, llm: 'template' });
    const ids = a.graph.symbols.filter((s) => s.platform === 'android').slice(0, 3).map((s) => s.id);
    const kp: KnowledgePlan = { version: 1, rationale: 'fixture research', modules: { android: 'pages/modules/business.md' }, pages: [{ page: 'pages/modules/business.md', title: '业务', kind: 'concept', scope: ['android'], questions: ['entry', 'state', 'failure'], symbols: ids }] };
    writeJSON(path.join(cfg.root, 'wiki', KnowledgePlanFile), kp);
    const overview = () => fs.readFileSync(path.join(dir, 'wiki', OverviewPage), 'utf8');
    const oldOverview = overview();
    // the agent fails: nothing is published
    const failed = await compound({ cfg, llm: 'cmd', llmCmd: 'exit 7', workers: 2, ...quiet });
    expect(failed.published).toBe(false);
    expect(failed.verify?.ok).toBe(false);
    expect(failed.verify?.errors[0]!.code).toBe('E_TASK_FAILED');
    expect(overview()).toBe(oldOverview);
    // a stale hash is rejected, never restamped
    const pg = knowledgePage('pages/modules/business.md', ids.map((id) => ({ sym: id, hash: getSym(a.graph, id)!.hash })));
    const fixture = path.join(dir, 'writer-fixture.txt');
    const good = pg.front.sources![0]!.hash;
    pg.front.sources![0]!.hash = 'stale-hash';
    fs.writeFileSync(fixture, renderPage(pg));
    const cmd = `mkdir -p pages/modules && cp '${fixture}' pages/modules/business.md`;
    const stale = await compound({ cfg, llm: 'cmd', llmCmd: cmd, workers: 2, ...quiet });
    expect(stale.published).toBe(false);
    expect(stale.verify?.ok).toBe(false);
    expect(stale.tasks.find((t) => t.page === 'pages/modules/business.md')?.error).toMatch(/stale or missing hash/);
    // too short / missing sections is rejected
    fs.writeFileSync(fixture, renderPage({ ...pg, front: { ...pg.front, sources: ids.map((id) => ({ sym: id, hash: getSym(a.graph, id)!.hash })) }, body: ids.map((i) => '`' + i + '`').join('\n') }));
    const thin = await compound({ cfg, llm: 'cmd', llmCmd: cmd, ...quiet });
    expect(thin.published).toBe(false);
    expect(thin.tasks.find((t) => t.page === 'pages/modules/business.md')?.error).toMatch(/>=1200 characters/);
    // a valid page publishes; overview becomes knowledge navigation without legacy boilerplate
    pg.front.sources![0]!.hash = good;
    fs.writeFileSync(fixture, renderPage(pg));
    const ok = await compound({ cfg, llm: 'cmd', llmCmd: cmd, workers: 2, ...quiet });
    expect(ok.verify?.errors ?? []).toEqual([]);
    expect(ok.published).toBe(true);
    expect(overview()).toContain('(modules/business.md)');
    expect(overview()).toContain('模块与业务知识导航');
    expect(overview()).not.toContain('cart=<sku');
    expect(fs.readFileSync(path.join(dir, 'wiki/index.md'), 'utf8')).toContain('modules/business.md');
    // nothing changed: no writer needed (template backend is fine)
    const noop = await compound({ cfg, llm: 'template', ...quiet });
    expect(noop.published).toBe(false);
    expect(noop.mode).toBe('noop');
    // a scope-only change (unanchored file under scope) re-plans the page; template cannot write it
    const f = path.join(dir, 'android/app/src/main/java/com/minishop/data/TokenStore.java');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('!token.isEmpty()', 'token.length() > 0'));
    const p2 = (await analyze({ cfg, llm: 'template' })).plan;
    const kt = p2.tasks.filter((t) => t.knowledge);
    expect(kt.map((t) => t.page)).toEqual(['pages/modules/business.md']);
    expect(kt[0]!.reasons.some((r) => r.code.startsWith('knowledge_'))).toBe(true);
    const refused = await compound({ cfg, llm: 'template', ...quiet });
    expect(refused.published).toBe(false);
    expect(refused.verify?.errors[0]!.code).toBe('E_TASK_FAILED');
  });

  it('resume validates evidence and status', () => {
    const root = fs.mkdtempSync(path.join(tmp, 'resume-'));
    const priorDir = path.join(root, 'prior');
    const stage = path.join(root, 'stage');
    fs.mkdirSync(path.join(priorDir, 'wiki', '.kb'), { recursive: true });
    fs.mkdirSync(path.join(stage, '.kb'), { recursive: true });
    const g = graph([sym('one', 'h1'), sym('two', 'h2'), sym('three', 'h3')], 'abc');
    fs.writeFileSync(path.join(priorDir, 'graph.json'), goJSON(graphJSON(g), ' '));
    const page = 'pages/modules/example.md';
    const kp: KnowledgePlan = { version: 1, rationale: 'research', modules: { example: page }, pages: [{ page, title: 'Example', kind: 'concept', scope: ['example'], questions: ['entry', 'state', 'failure'], symbols: ['one', 'two', 'three'] }] };
    writeJSON(path.join(priorDir, 'wiki', KnowledgePlanFile), kp);
    const prior = { run_id: 'original', head: 'abc', work_dir: priorDir, tasks: [{ id: 'task', page, status: 'ok' }] } as Result;
    const resultPath = path.join(root, 'result.json');
    writeJSON(resultPath, { ok: false, result: prior });
    const pg = knowledgePage(page, g.symbols.map((s) => ({ sym: s.id, hash: s.hash })), '测试内容解释状态和异常。');
    writeFileAtomic(path.join(priorDir, 'writers', 'task', page), renderPage(pg));
    const a = { graph: g, facts: {}, scan: { dir: root } } as unknown as Analysis;
    const env = new TaskEnv({ resumeResult: resultPath, llm: 'cmd' } as Options, a, stage, path.join(root, 'work'), '', 'abc');
    prepareResume(env);
    expect(fs.existsSync(path.join(stage, KnowledgePlanFile))).toBe(true);
    const task = { id: 'new-task', op: 'create', kind: 'concept', page, title: 'Example', write_set: [page], reasons: [], context: [], priority: 1, knowledge: true };
    let tr = reuseKnowledge(env, task);
    expect(tr?.status).toBe('ok');
    expect(tr?.writer).toBe('reuse:original');
    env.resume!.tasks[0]!.status = 'failed';
    expect(reuseKnowledge(env, task)).toBeNull();
    env.resume!.tasks[0]!.status = 'ok';
    env.resume!.tasks[0]!.id = '../escape';
    expect(reuseKnowledge(env, task)).toBeNull();
    env.resume!.tasks[0]!.id = 'task';
    pg.front.sources![0]!.hash = 'stale';
    writeFileAtomic(path.join(priorDir, 'writers', 'task', page), renderPage(pg));
    tr = reuseKnowledge(env, task);
    expect(tr?.status).toBe('failed');
    expect(tr?.error).toMatch(/resume evidence invalid/);
    g.symbols[0]!.hash = 'changed';
    expect(() => prepareResume(env)).toThrow(/graph differs/);
    g.symbols[0]!.hash = 'h1';
    for (const bad of [{ replan: true }, { full: true }, { feedbackFile: 'x' }, { knowledgePages: 'p' }]) {
      const e2 = new TaskEnv({ resumeResult: resultPath, llm: 'cmd', ...bad } as Options, a, stage, root, '', 'abc');
      expect(() => prepareResume(e2)).toThrow(/cannot be combined/);
    }
    const e3 = new TaskEnv({ resumeResult: resultPath, llm: 'cmd' } as Options, a, stage, root, '', 'other-head');
    expect(() => prepareResume(e3)).toThrow(/matching HEAD/);
  });
});

describe('page retirement (retire.go)', () => {
  it('preserves the original and rejects broken links', async () => {
    const dir = minishop();
    const cfg = loadConfig(dir);
    expect((await compound({ cfg, llm: 'template', ...quiet })).published).toBe(true);
    const page = 'pages/concepts/obsolete.md';
    const original = '---\nid: concepts/obsolete\ntitle: Obsolete\nkind: concept\nstatus: current\n---\n# Old unsupported claim\n';
    writeFileAtomic(path.join(dir, 'wiki', page), original);
    const ref = path.join(dir, 'wiki/pages/concepts/reference.md');
    writeFileAtomic(ref, '---\nid: concepts/reference\ntitle: Reference\nkind: concept\nstatus: current\n---\n[Old](obsolete.md)\n');
    const o = { cfg, llm: 'template', retirePages: page, retireReason: 'Superseded by researched module pages', ...quiet };
    let r = await compound(o);
    expect(r.published).toBe(false);
    expect(r.verify?.ok).toBe(false);
    expect(r.verify?.errors.some((e) => e.code === 'E_DEAD_LINK')).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'wiki', page), 'utf8')).toBe(original);
    const failedWork = r.work_dir;
    fs.rmSync(ref);
    r = await compound(o);
    expect(r.verify?.errors ?? []).toEqual([]);
    expect(r.published).toBe(true);
    expect(r.run_id).not.toBe(path.basename(failedWork ?? ''));
    expect(fs.existsSync(path.join(dir, 'wiki', page))).toBe(false);
    const runs = fs.readdirSync(path.join(dir, 'wiki/.kb/retired'));
    expect(runs.length).toBe(1);
    const archive = path.join(dir, 'wiki/.kb/retired', runs[0]!, page);
    expect(fs.readFileSync(archive, 'utf8')).toBe(original);
    expect(fs.readFileSync(archive + '.reason.txt', 'utf8')).toContain('Superseded');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'wiki', RetiredPagesFile), 'utf8'))[page]).toContain('Superseded');
  });

  it('rejects unsafe and reserved pages', () => {
    for (const page of ['../outside.md', 'pages/../outside.md', 'pages/overview.md', 'pages/parity.md', 'pages/_conflicts.md', 'facts/routes.md', 'pages/x.txt']) {
      expect(() => retirePages({ o: { retirePages: page, retireReason: 'obsolete' } as Options, staging: fs.mkdtempSync(path.join(tmp, 'ret-')), work: '/tmp/run' }), page).toThrow();
    }
    expect(() => retirePages({ o: { retirePages: 'pages/concepts/x.md', retireReason: ' ' } as Options, staging: tmp, work: '/tmp/run' })).toThrow(/retire-reason/);
  });

  it('a retired empty concept stays retired, new evidence or a knowledge task restores it', () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'retired-'));
    writeFileAtomic(path.join(dir, RetiredPagesFile), JSON.stringify({ 'pages/concepts/shared-components.md': 'superseded' }));
    for (const tc of [{ context: [] as string[], knowledge: false, want: 0 }, { context: ['new-symbol'], knowledge: false, want: 1 }, { context: [], knowledge: true, want: 1 }]) {
      const a = { plan: { mode: 'incremental', reason: '', tasks: [{ id: '', op: 'update', page: SharedPage, kind: 'concept', title: '', write_set: [], reasons: [], context: tc.context, priority: 0, knowledge: tc.knowledge }] } as unknown as Plan };
      suppressRetiredPlaceholders(a, dir);
      expect(a.plan.tasks.length).toBe(tc.want);
      if (tc.want === 0) expect(a.plan.mode).toBe('noop');
    }
  });
});

// ---------- CLI with fake agents ----------

/** Fake planner + writer agent: reads the prompt on stdin, writes only its write set (cwd = staging). */
const fakeAgent = fs.readFileSync(path.join(repo, 'test/fixtures/knowledge-agent.py'), 'utf8');

describe('kb compound --knowledge (CLI, fake agents)', () => {
  const kb = (root: string, args: string[], env: NodeJS.ProcessEnv = {}) => {
    const r = spawnSync('node', [cli, '--root', root, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
    return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
  };

  it('plans, writes in parallel isolated stagings, persists the plan, then noop / incremental / replan', () => {
    const root = minishop();
    expect(kb(root, ['compound', '--llm', 'template']).code).toBe(0);
    const agent = path.join(tmp, 'fake-agent.py');
    fs.writeFileSync(agent, fakeAgent, { mode: 0o755 });
    const logf = path.join(tmp, 'writers.log');
    const env = { FAKE_LOG: logf };
    // template cannot plan
    const t = kb(root, ['compound', '--knowledge', '--llm', 'template']);
    expect(t.code).toBe(3);
    expect(t.err).toMatch(/needs --agent or --llm-cmd/);
    // usage: --llm-cmd with an explicit --llm template
    expect(kb(root, ['compound', '--llm-cmd', 'true', '--llm', 'template']).code).toBe(2);
    const r = kb(root, ['compound', '--knowledge', '--llm-cmd', `python3 ${agent}`, '--workers', '2', '--json'], env);
    const res = JSON.parse(r.out);
    expect(res.ok, r.err + r.out).toBe(true);
    expect(res.result.published).toBe(true);
    expect(res.result.tasks.map((x: { id: string }) => x.id)).toContain('knowledge-planner');
    const pages = fs.readFileSync(logf, 'utf8').trim().split('\n').sort();
    expect(pages).toEqual(['pages/flows/login.md', 'pages/modules/android-app.md']);
    const w = path.join(root, 'wiki');
    const plan = JSON.parse(fs.readFileSync(path.join(w, KnowledgePlanFile), 'utf8'));
    expect(plan.modules).toEqual({ 'android/app': 'pages/modules/android-app.md' });
    expect(plan.pages[1].scope).toEqual(['android/app/src/main/java/com/minishop/ui/login']);
    expect(fs.readFileSync(path.join(w, 'pages/flows/login.md'), 'utf8')).toContain('## 异常与恢复');
    expect(fs.readFileSync(path.join(w, OverviewPage), 'utf8')).toContain('[登录链路](flows/login.md)');
    // v2 integration: module tree pages untouched in place, wiki verifies
    expect(fs.existsSync(path.join(w, 'pages/android/overview.md'))).toBe(true);
    expect(kb(root, ['verify']).code).toBe(0);
    expect(kb(root, ['plan', '--json', '--dry-run']).out).not.toContain('"knowledge": true');
    // no change: noop without calling the agent
    fs.writeFileSync(logf, '');
    const noop = JSON.parse(kb(root, ['compound', '--knowledge', '--llm-cmd', `python3 ${agent}`, '--json'], env).out);
    expect(noop.result.mode).toBe('noop');
    expect(fs.readFileSync(logf, 'utf8')).toBe('');
    // change a file in the login scope: only the login flow is rewritten (plan kept)
    const f = path.join(root, 'android/app/src/main/java/com/minishop/ui/login/LoginViewModel.kt');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/fun /, 'fun   ').replace(/\n}\s*$/, '\n    fun extraCheck(): Boolean = true\n}\n'));
    const plan2 = JSON.parse(kb(root, ['plan', '--json', '--dry-run']).out);
    expect(plan2.tasks.filter((x: { knowledge?: boolean }) => x.knowledge).map((x: { page: string }) => x.page)).toEqual(['pages/flows/login.md']);
    const inc = JSON.parse(kb(root, ['compound', '--knowledge', '--llm-cmd', `python3 ${agent}`, '--json'], env).out);
    expect(inc.ok).toBe(true);
    expect(inc.result.tasks.map((x: { id: string }) => x.id)).not.toContain('knowledge-planner');
    expect(fs.readFileSync(logf, 'utf8').trim()).toBe('pages/flows/login.md');
    // targeted review: selected page only, feedback reaches the prompt
    const fb = path.join(tmp, 'review.md');
    fs.writeFileSync(fb, 'login retry is not explained');
    fs.writeFileSync(logf, '');
    const rev = JSON.parse(kb(root, ['compound', '--knowledge-pages', 'pages/modules/android-app.md', '--feedback', fb, '--llm-cmd', `python3 ${agent}`, '--json', '--keep-work'], env).out);
    expect(rev.ok).toBe(true);
    expect(fs.readFileSync(logf, 'utf8').trim()).toBe('pages/modules/android-app.md');
    const prompt = fs.readdirSync(path.join(rev.result.work_dir, 'tasks')).filter((x) => x.endsWith('.prompt.md'));
    expect(prompt.length).toBe(1);
    expect(fs.readFileSync(path.join(rev.result.work_dir, 'tasks', prompt[0]!), 'utf8')).toContain('login retry is not explained');
    expect(kb(root, ['compound', '--knowledge-pages', 'pages/modules/nope.md', '--llm-cmd', 'true']).code).toBe(3);
    // planned pages cannot be retired
    expect(kb(root, ['compound', '--retire-pages', 'pages/flows/login.md', '--retire-reason', 'x']).code).toBe(3);
    // replan: a planner writing outside its write set is a violation and blocks publication
    const idx = fs.readFileSync(path.join(w, 'index.md'), 'utf8');
    const evil = kb(root, ['compound', '--knowledge', '--replan', '--llm-cmd', `python3 ${agent}`, '--json'], { ...env, FAKE_EVIL: '1' });
    expect(evil.code).toBe(3);
    expect(evil.err).toMatch(/knowledge planner failed: reverted writes outside write set: index.md/);
    expect(fs.readFileSync(path.join(w, 'index.md'), 'utf8')).toBe(idx);
    fs.writeFileSync(logf, '');
    const replan = JSON.parse(kb(root, ['compound', '--knowledge', '--replan', '--llm-cmd', `python3 ${agent}`, '--json'], env).out);
    expect(replan.ok).toBe(true);
    expect(replan.result.tasks[0].id).toBe('knowledge-planner');
    // a fresh plan rewrites every planned page (knowledge_full)
    expect(fs.readFileSync(logf, 'utf8').trim().split('\n').sort()).toEqual(['pages/flows/login.md', 'pages/modules/android-app.md']);
  });

  it('IDE file handoff: file-agent.py bridges kb compound to an agent that answers request.json files', async () => {
    const root = minishop();
    expect(kb(root, ['compound', '--llm', 'template']).code).toBe(0);
    const agent = path.join(tmp, 'fake-agent2.py');
    fs.writeFileSync(agent, fakeAgent, { mode: 0o755 });
    const exchange = path.join(tmp, 'exchange');
    const bridge = path.join(repo, 'skills/codewiki/scripts/file-agent.py');
    const child = spawn('node', [cli, '--root', root, 'compound', '--knowledge', '--workers', '1', '--json', '--llm-cmd', `python3 ${bridge} --exchange-dir ${exchange} --timeout 60`], { env: { ...process.env } });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    const exited = new Promise<number>((res) => child.on('close', (c) => res(c ?? -1)));
    let done = false;
    void exited.then(() => (done = true));
    let served = 0;
    // the "IDE agent": services pending requests (prompt + cwd) and signals completion atomically
    while (!done) {
      for (const id of fs.existsSync(exchange) ? fs.readdirSync(exchange) : []) {
        const d = path.join(exchange, id);
        if (!fs.existsSync(path.join(d, 'request.json')) || fs.existsSync(path.join(d, 'response.json')) || fs.existsSync(path.join(d, 'closed.json'))) continue;
        const req = JSON.parse(fs.readFileSync(path.join(d, 'request.json'), 'utf8'));
        const r = spawnSync('python3', [agent], { cwd: req.cwd, input: req.prompt, env: { ...process.env, FAKE_LOG: path.join(tmp, 'ide.log') } });
        const resp = r.status === 0 ? { status: 'ok' } : { status: 'error', error: String(r.stderr) };
        fs.writeFileSync(req.response + '.tmp', JSON.stringify(resp));
        fs.renameSync(req.response + '.tmp', req.response);
        served++;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(await exited).toBe(0);
    expect(JSON.parse(out).result.published).toBe(true);
    expect(served).toBe(3); // planner + 2 writers
    expect(fs.existsSync(path.join(root, 'wiki/pages/modules/android-app.md'))).toBe(true);
  }, 120000);
});

describe('agents: TRAE CN', () => {
  it('install --agent trae-cn ships the skill with references/scripts, no instructions file, idempotent', () => {
    const target = fs.mkdtempSync(path.join(tmp, 'trae-'));
    const kb = (args: string[]) => spawnSync('node', [cli, ...args], { encoding: 'utf8' });
    expect(kb(['install', '--agent', 'trae-cn', '--target', target]).status).toBe(0);
    for (const rel of ['.trae/skills/codewiki/SKILL.md', '.trae/skills/codewiki/references/ide-handoff.md', '.trae/skills/codewiki/scripts/file-agent.py']) expect(fs.existsSync(path.join(target, rel)), rel).toBe(true);
    expect(fs.existsSync(path.join(target, 'AGENTS.md'))).toBe(false);
    const again = JSON.parse(kb(['install', '--agent', 'trae-cn', '--target', target, '--json']).stdout);
    expect(again.actions.every((x: { action: string }) => x.action === 'unchanged')).toBe(true);
    const mcp = JSON.parse(kb(['install', '--agent', 'trae-cn', '--target', target, '--mcp', '--json']).stdout);
    expect(mcp.notes.join('\n')).toContain('use the IDE MCP settings');
    const ag = JSON.parse(kb(['agents', '--json']).stdout);
    expect(ag.agents.length).toBe(7);
    const trae = ag.agents.find((x: { name: string }) => x.name === 'trae-cn');
    expect(trae.backend_command).toBeUndefined();
    expect(trae.skills_dir).toBe('.trae/skills');
    expect(trae.notes).toContain('docs.trae.cn');
    const r = spawnSync('node', [cli, '--root', target, 'compound', '--agent', 'trae-cn'], { encoding: 'utf8' });
    expect(r.status).not.toBe(0);
  });
});
