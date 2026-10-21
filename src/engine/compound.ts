// The compound pipeline: scan → diff → plan → writers → verify → atomic publish.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import type { Config } from '../config/config.js';
import { wikiPath } from '../config/config.js';
import { GraphVersion, type Facts, type Graph, type Anchor, getSym, graphJSON, reindexGraph } from '../model.js';
import { scan, scanRepo, type ScanResult } from '../scan/scan.js';
import { extractFactsCached } from './factscache.js';
import { renderFacts } from '../facts/render.js';
import { type SuggestOptions, applyOverlay, suggest } from '../facts/llm.js';
import { goJSON, cmpStr } from '../util/go.js';
import { type Page, loadPages, parsePage, renderPage, writeFileAtomic, idFromPath, StatusCurrent } from '../wiki/page.js';
import { appendLog, initWiki } from '../wiki/layout.js';
import { fixIndex, verifyWiki, type Report } from '../wiki/verify.js';
import { computeImpact, diffGraphs, loadRoutes, loadTestIDs, type Diff } from './diff.js';
import { buildPlan, ConflictsPage, VerdictsFile, OpRecheck, type Plan, type Task } from './plan.js';
import { NavigationPage, SharedPage, routeIDs } from './anchors.js';
import { ParityPage, computeParity, renderParity } from './parity.js';
import { platformsOf, templateConcept, templateFeature, templateOverview } from './template.js';
import { buildPrompt } from './prompt.js';
import type { ModuleTree } from '../tree/index.js';
import * as treeLib from '../tree/index.js';
import { verifyTree, TreeFile, bottomUp, computeTree, finalizeTreePage, loadTree, templateTreePage, treeTasks } from './hier.js';
import { type Usage, usageAdd, usageEmpty, usageParsers, usageString } from '../agents/agents.js';
import { short, shortHead } from './graphutil.js';
import { type DocEntry, allClaims, copyDocs, loadRawManifest, renderConflicts } from './docs.js';
import { Checker, ClaimConflict, ClaimUnverifiable, ClaimVerified, claimJSON, type Claim } from './claims.js';
import { requirementsJSON } from '../facts/render.js';
import { conflictsPrompt } from './prompt.js';
import { scanInjection } from './safety.js';
import type { Requirement } from '../model.js';

export const PromptVersion = '2026-10-20.1';

export interface Options {
  cfg: Config;
  llm: string; // template | cmd
  llmCmd?: string;
  agent?: string;
  base?: string;
  full?: boolean;
  dryRun?: boolean;
  fallback?: boolean;
  maxTasks?: number;
  kind?: string;
  log?: (s: string) => void;
  date?: string;
  kbPath?: string;
  keep?: boolean;
  ingestDocs?: DocEntry[];
  /** LLM-assisted fallback extraction of routes/APIs (verified; see facts/llm.ts). */
  llmFacts?: SuggestOptions;
}

export interface TaskResult {
  id: string;
  page: string;
  op: string;
  writer: string;
  agent?: string;
  status: string;
  reverted?: string[];
  error?: string;
  millis: number;
  usage?: Usage;
}

export interface Result {
  run_id: string;
  kind: string;
  base: string;
  head: string;
  mode: string;
  llm: string;
  agent?: string;
  plan: Plan;
  diff: Diff;
  tasks: TaskResult[];
  usage?: Usage;
  verify?: Report;
  published: boolean;
  changed: string[];
  work_dir?: string;
  message: string;
}

export interface Analysis {
  scan: ScanResult;
  graph: Graph;
  old: Graph;
  facts: Facts;
  diff: Diff;
  plan: Plan;
  pages: Page[];
  /** v2 hierarchy (absent for ingest runs) */
  tree?: ModuleTree;
}

export function gitHead(root: string): string {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

export function loadGraph(p: string): Graph | null {
  let raw: string;
  try {
    raw = zlib.gunzipSync(fs.readFileSync(p + '.gz')).toString('utf8');
  } catch {
    try {
      raw = fs.readFileSync(p, 'utf8');
    } catch {
      return null;
    }
  }
  try {
    const g = JSON.parse(raw) as Graph;
    g.symbols ??= [];
    g.files ??= {};
    g.parse_failures ??= [];
    reindexGraph(g);
    return g;
  } catch {
    return null;
  }
}

function writeGraph(kbDir: string, g: Graph): void {
  writeFileAtomic(path.join(kbDir, 'graph.json.gz'), zlib.gzipSync(goJSON(graphJSON(g)), { level: 1 }));
  fs.rmSync(path.join(kbDir, 'graph.json'), { force: true });
}

export async function scanRevision(cfg: Config, sha: string): Promise<ScanResult> {
  const tmp = fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'kb-base-'));
  try {
    const r = spawnSync('sh', ['-c', `git -C '${cfg.root}' archive '${sha}' | tar -x -C '${tmp}'`], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git archive ${sha}: ${r.stderr}`);
    const res = await scan(cfg, tmp);
    res.graph.commit = sha;
    return res;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function mergeGitChanges(root: string, base: string, head: string, wikiDir: string, files: string[]): string[] {
  if (!base || !head || base === head) return files;
  let out: string;
  try {
    out = execFileSync('git', ['-C', root, 'diff', '--name-only', base, head], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return files;
  }
  const set = new Set(files);
  const wd = wikiDir.replace(/\/+$/, '') + '/';
  for (const l of out.trim().split('\n')) if (l && !l.startsWith(wd)) set.add(l);
  return [...set].sort(cmpStr);
}

/** Whether raw/docs holds ingested documents. */
export function hasRawDocs(wikiDir: string): boolean {
  return loadRawManifest(wikiDir).docs.length > 0;
}

export async function analyze(o: Options): Promise<Analysis> {
  const cfg = o.cfg;
  const res = await scanRepo(cfg);
  res.graph.commit = gitHead(cfg.root) || undefined;
  let facts = extractFactsCached(cfg, res);
  if (o.llmFacts) {
    // the overlay and answer cache live in <wiki>/.kb: create the skeleton first on a fresh wiki
    if (!fs.existsSync(wikiPath(cfg)) && !o.dryRun) initWiki(wikiPath(cfg), false);
    const sr = suggest(cfg, res, facts, { ...o.llmFacts, log: o.log });
    o.log?.(`llm-facts: ${sr.candidates.length} candidate file(s), ${sr.agent_calls} agent call(s), ${sr.cached_files} cached; accepted ${sr.accepted.routes.length} route(s) / ${sr.accepted.apis.length} api(s), rejected ${sr.rejected.length}, rule conflicts ${sr.skipped_conflict}${sr.usage.cost_usd ? `, $${sr.usage.cost_usd.toFixed(4)}` : ''}${sr.errors.length ? ' — ' + sr.errors.join('; ') : ''}\n`);
  }
  facts = applyOverlay(cfg, facts);
  let old: Graph | null = null;
  if (o.base) old = (await scanRevision(cfg, o.base)).graph;
  else old = loadGraph(path.join(wikiPath(cfg), '.kb', 'graph.json'));
  const diff = diffGraphs(old, res.graph);
  computeImpact(diff, old, res.graph, loadRoutes(wikiPath(cfg)), loadTestIDs(wikiPath(cfg)), facts);
  diff.changed_files = mergeGitChanges(cfg.root, diff.base, res.graph.commit ?? '', cfg.wiki_dir, diff.changed_files);
  const oldG = old ?? { version: 0, symbols: [], files: {}, parse_failures: [] };
  const [pages] = loadPages(wikiPath(cfg));
  const plan = buildPlan({ cfg, diff, old: oldG, cur: res.graph, facts, pages, forceFull: !!o.full, hasDocs: hasRawDocs(wikiPath(cfg)) || (o.ingestDocs?.length ?? 0) > 0 });
  if (o.kind === 'ingest') {
    let keep = plan.tasks.filter((t) => t.kind === 'conflicts');
    if (!keep.length) keep = [{ id: 't01-_conflicts', op: OpRecheck, kind: 'conflicts', page: ConflictsPage, title: '文档核对', write_set: [VerdictsFile], reasons: [{ code: 'ingest' }], context: [], priority: 0 }];
    plan.tasks = keep;
    plan.mode = 'ingest';
    plan.reason = 'check ingested documents against code';
  }
  for (const t of plan.tasks) if (t.kind === 'conflicts') t.write_set = [VerdictsFile];
  let t: ModuleTree | undefined;
  if (o.kind !== 'ingest') {
    const prev = loadTree(wikiPath(cfg));
    const ct = computeTree(cfg, res.graph, old, facts, prev, !!o.full || !!diff.incompatible || !prev, res.graph.commit ?? '');
    t = ct.tree;
    const tasks = treeTasks(t, res.graph, pages);
    plan.tree = { ...ct.plan, tasks };
    if (plan.mode === 'noop' && tasks.length) {
      plan.mode = 'incremental';
      plan.reason = 'module tree pages changed';
    }
  }
  return { scan: res, graph: res.graph, old: oldG, facts, diff, plan, pages, tree: t };
}

export function expectedFacts(cfg: Config, g: Graph, f: Facts): Map<string, string> {
  const plats = cfg.platforms.map((p) => p.name);
  const out = renderFacts(f, g, plats);
  out.set(ParityPage, renderParity(computeParity(g, f, plats)));
  return out;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
function runStamp(d = new Date()): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}`;
}
export const today = () => new Date().toISOString().slice(0, 10);

function lock(dir: string, name: string): () => void {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  for (let i = 0; i < 2; i++) {
    try {
      fs.writeFileSync(p, `${process.pid}\n`, { flag: 'wx' });
      return () => fs.rmSync(p, { force: true });
    } catch {
      try {
        if (Date.now() - fs.statSync(p).mtimeMs > 3600_000) {
          fs.rmSync(p, { force: true });
          continue;
        }
      } catch {
        continue;
      }
      throw new Error('another kb run holds ' + p + ' (delete it if stale)');
    }
  }
  throw new Error('could not acquire lock ' + p);
}

function copyDir(src: string, dst: string): void {
  fs.cpSync(src, dst, { recursive: true });
}

export function snapshot(dir: string): Map<string, string> {
  const m = new Map<string, string>();
  const rec = (d: string) => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else {
        try {
          m.set(path.relative(dir, p).split(path.sep).join('/'), createHash('sha256').update(fs.readFileSync(p)).digest('hex'));
        } catch {
          /* vanished */
        }
      }
    }
  };
  rec(dir);
  return m;
}

export function changedFiles(a: Map<string, string>, b: Map<string, string>): string[] {
  const out = new Set<string>();
  for (const [k, v] of b) if (a.get(k) !== v) out.add(k);
  for (const k of a.keys()) if (!b.has(k)) out.add(k);
  return [...out].sort(cmpStr);
}

function writeJSON(p: string, v: unknown): void {
  writeFileAtomic(p, goJSON(v, '  ') + '\n');
}

function publish(staging: string, wikiDir: string, work: string): void {
  const prev = path.join(work, 'wiki.prev');
  if (fs.existsSync(wikiDir)) fs.renameSync(wikiDir, prev);
  try {
    fs.renameSync(staging, wikiDir);
  } catch (e) {
    if (fs.existsSync(prev)) fs.renameSync(prev, wikiDir);
    throw e;
  }
}

/** Check anchors recorded in facts/requirements.json. */
export function verifyRequirements(wikiDir: string, g: Graph, rep: Report): void {
  let b: string;
  try {
    b = fs.readFileSync(path.join(wikiDir, 'facts', 'requirements.json'), 'utf8');
  } catch {
    return;
  }
  let doc: { requirements?: { id: string; anchors?: Anchor[] | null }[] };
  try {
    doc = JSON.parse(b);
  } catch {
    rep.errors.push({ code: 'E_REQUIREMENTS', page: 'facts/requirements.json', detail: 'invalid JSON' });
    rep.ok = false;
    return;
  }
  for (const r of doc.requirements ?? []) {
    for (const a of r.anchors ?? []) {
      rep.anchors++;
      const s = getSym(g, a.sym);
      if (!s || s.hash !== a.hash) {
        rep.errors.push({ code: 'E_REQ_ANCHOR_STALE', page: 'facts/requirements.json', detail: 'requirement ' + r.id + ' anchor is stale (re-run kb compound / kb ingest)', sym: a.sym });
        rep.ok = false;
      }
    }
  }
}

const TreeKinds = new Set(['cluster', 'module', 'project']);

/** Child summaries + deterministic draft appended to a tree page prompt (bottom-up writing). */
function treePromptExtra(t: ModuleTree, task: Task, g: Graph, f: Facts, commit: string): string {
  const n = treeLib.findNode(t, task.tree_node!)!;
  let b = '\n## 模块树上下文\n\n';
  b += `- 节点：\`${n.id}\`（${n.kind}，L${n.level}）\n- 摘要（kb 生成，可在正文中细化）：${n.summary ?? ''}\n`;
  if (n.children?.length) b += '\n### 子页面摘要（只依据这些摘要写父页，不要读源码）\n\n' + n.children.map((c) => `- [${c.title}](${treeLib.relLink(n.page, c.page)})：${c.summary ?? ''}`).join('\n') + '\n';
  b += '\n`<!-- kb:… -->` 块（breadcrumb、子页面表、符号表、Sources、mermaid）由 kb 在写后覆盖，不要手写。\n';
  b += '\n### 确定性草稿\n\n````markdown\n' + templateTreePage(t, n, g, f, commit) + '\n````\n';
  return b;
}

/** After the writers: kb blocks + tree frontmatter on every tree page, obsolete tree pages removed. */
function syncTreePages(staging: string, t: ModuleTree, g: Graph, f: Facts, commit: string): void {
  const want = new Set<string>();
  for (const n of bottomUp(t)) {
    want.add(n.page);
    const p = path.join(staging, n.page);
    let text: string;
    try {
      text = fs.readFileSync(p, 'utf8');
    } catch {
      text = templateTreePage(t, n, g, f, commit);
    }
    const next = finalizeTreePage(text, t, n, g, f, commit);
    if (next !== text || !fs.existsSync(p)) writeFileAtomic(p, next);
  }
  const [pages] = loadPages(staging);
  for (const pg of pages) if (pg.front.tree_node && !want.has(pg.path)) fs.rmSync(path.join(staging, pg.path), { force: true });
}

function loadRequirements(wikiDir: string): Requirement[] {
  try {
    return (JSON.parse(fs.readFileSync(path.join(wikiDir, 'facts', 'requirements.json'), 'utf8')).requirements as Requirement[]) ?? [];
  } catch {
    return [];
  }
}

function llmEvidence(llm: string[] | undefined, templ: string[] | undefined): string {
  const known = new Set((templ ?? []).map((t) => t.trim()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of llm ?? []) {
    for (let part of e.split(/[；;]/)) {
      part = part.trim();
      while (part.startsWith('[llm]')) part = part.slice(5).trim();
      if (!part || known.has(part) || seen.has(part)) continue;
      seen.add(part);
      out.push(part);
    }
  }
  return out.join('；');
}

class TaskEnv {
  claims: Claim[] | null = null;
  constructor(public o: Options, public a: Analysis, public staging: string, public work: string, public graphPath: string, public head: string) {}

  platforms(): string[] {
    return this.o.cfg.platforms.map((p) => p.name);
  }

  writePage(pg: Page): void {
    writeFileAtomic(path.join(this.staging, pg.path), renderPage(pg));
  }

  run(t: Task, writer: string): TaskResult {
    const start = Date.now();
    const tr: TaskResult = { id: t.id, page: t.page, op: t.op, writer, status: 'ok', millis: 0 };
    try {
      if (writer === 'template') this.runTemplate(t);
      else {
        if (this.o.agent) tr.agent = this.o.agent;
        const reverted = this.runCmd(t, tr);
        if (reverted.length) {
          tr.reverted = reverted;
          tr.status = 'violation';
          tr.error = 'reverted writes outside write set: ' + reverted.join(', ');
        }
      }
    } catch (e) {
      tr.status = 'failed';
      tr.error = (e as Error).message;
      const rv = (e as { reverted?: string[] }).reverted;
      if (rv?.length) tr.reverted = rv;
    }
    tr.millis = Date.now() - start;
    // Go field order: id, page, op, writer, agent, status, reverted, error, millis, usage
    const o: TaskResult = { id: tr.id, page: tr.page, op: tr.op, writer: tr.writer } as TaskResult;
    if (tr.agent) o.agent = tr.agent;
    o.status = tr.status;
    if (tr.reverted?.length) o.reverted = tr.reverted;
    if (tr.error) o.error = tr.error;
    o.millis = tr.millis;
    if (tr.usage) o.usage = tr.usage;
    return o;
  }

  runTemplate(t: Task): void {
    const { graph: g, facts: f } = this.a;
    const c = short(this.head);
    switch (t.kind) {
      case 'feature':
        return this.writePage(templateFeature(g, f, t.route_id!, c));
      case 'overview':
        return this.writePage(templateOverview(f, this.platforms(), c));
      case 'concept':
        if (t.page === NavigationPage || t.page === SharedPage) return this.writePage(templateConcept(g, f, t.page, c));
        return this.restamp(t);
      case 'cluster':
      case 'module':
      case 'project': {
        const n = treeLib.findNode(this.a.tree!, t.tree_node!)!;
        writeFileAtomic(path.join(this.staging, t.page), templateTreePage(this.a.tree!, n, g, f, c));
        return;
      }
      case 'conflicts':
        this.claims = this.templateClaims();
        writeJSON(path.join(this.staging, VerdictsFile), { version: 1, claims: this.claims.map(claimJSON) });
        return;
      default:
        return this.restamp(t);
    }
  }

  restamp(t: Task): void {
    const b = fs.readFileSync(path.join(this.staging, t.page), 'utf8');
    const [pg, err] = parsePage(t.page, b);
    if (err) throw err;
    const src: Anchor[] = [];
    for (const a of pg.front.sources ?? []) {
      const s = getSym(this.a.graph, a.sym);
      if (s) src.push({ sym: s.id, hash: s.hash });
    }
    pg.front.sources = src.length ? src : undefined;
    pg.front.status = StatusCurrent;
    pg.front.source_commit = short(this.head);
    this.writePage(pg);
  }

  templateClaims(): Claim[] {
    const claims = allClaims(this.staging);
    const ck = new Checker(this.a.graph, this.a.facts, this.a.scan.dir);
    const prev = new Map(loadRequirements(this.staging).map((r) => [r.id, r]));
    for (const c of claims) {
      ck.check(c);
      const p = prev.get(c.id);
      if (p && p.evidence?.length && p.evidence[0]!.startsWith('[llm]') && p.anchors?.length && p.text === c.text) {
        let fresh = true;
        const ids: string[] = [];
        for (const a of p.anchors) {
          const s = getSym(this.a.graph, a.sym);
          if (!s || s.hash !== a.hash) {
            fresh = false;
            break;
          }
          ids.push(a.sym);
        }
        if (fresh) {
          c.status = p.status;
          c.evidence = p.evidence;
          c.anchors = ids;
          if (p.route_ids?.length) c.route_ids = p.route_ids;
        }
      }
    }
    return claims;
  }

  renderClaims(): void {
    if (!this.claims) return;
    const [pg, reqs] = renderConflicts(this.claims, this.a.graph, short(this.head));
    this.writePage(pg);
    writeFileAtomic(path.join(this.staging, 'facts', 'requirements.json'), requirementsJSON(reqs));
  }

  mergeVerdicts(templ: Claim[]): void {
    let v: { claims?: Claim[] };
    try {
      v = JSON.parse(fs.readFileSync(path.join(this.staging, VerdictsFile), 'utf8'));
    } catch (e) {
      throw new Error((e as NodeJS.ErrnoException).code === 'ENOENT' ? `LLM did not write ${VerdictsFile}` : `invalid ${VerdictsFile}: ${(e as Error).message}`);
    }
    const byID = new Map((v.claims ?? []).map((c) => [c.id, c]));
    for (const t of templ) {
      const c = byID.get(t.id);
      if (!c || t.suspicious) continue;
      if (![ClaimVerified, ClaimConflict, ClaimUnverifiable].includes(c.status ?? '')) continue;
      const anchors = (c.anchors ?? []).filter((a) => getSym(this.a.graph, a));
      let status = c.status!;
      if (status === ClaimVerified && !anchors.length && !t.anchors?.length) status = ClaimUnverifiable;
      t.status = status;
      if (anchors.length) t.anchors = anchors;
      const ev = llmEvidence(c.evidence, t.evidence);
      if (ev) t.evidence = ['[llm] ' + ev, ...(t.evidence ?? [])];
      if (c.route_ids?.length) t.route_ids = c.route_ids;
    }
    this.claims = templ;
    writeJSON(path.join(this.staging, VerdictsFile), { version: 1, claims: templ.map(claimJSON) });
  }

  runCmd(t: Task, tr?: TaskResult): string[] {
    const cmdline = this.o.llmCmd || this.o.cfg.llm.cmd;
    const templ = t.kind === 'conflicts' ? this.templateClaims() : [];
    const pctx = { g: this.a.graph, f: this.a.facts, srcDir: this.a.scan.dir, staging: this.staging, head: this.head, platforms: this.platforms() };
    let prompt = t.kind === 'conflicts' ? conflictsPrompt(pctx, t, templ) : buildPrompt(pctx, t);
    if (TreeKinds.has(t.kind) && this.a.tree) prompt += treePromptExtra(this.a.tree, t, this.a.graph, this.a.facts, short(this.head));
    const tdir = path.join(this.work, 'tasks');
    fs.mkdirSync(tdir, { recursive: true });
    fs.writeFileSync(path.join(tdir, t.id + '.prompt.md'), prompt);
    const before = snapshot(this.staging);
    const saved = new Map<string, Buffer>();
    for (const f of before.keys()) {
      try {
        saved.set(f, fs.readFileSync(path.join(this.staging, f)));
      } catch {
        /* ignore */
      }
    }
    const timeout = (this.o.cfg.llm.timeout_sec > 0 ? this.o.cfg.llm.timeout_sec : 600) * 1000;
    const env: NodeJS.ProcessEnv = { ...process.env, KB_ROOT: this.o.cfg.root, KB_GRAPH: this.graphPath, KB_TASK: t.id };
    if (this.o.kbPath) env.PATH = path.dirname(this.o.kbPath) + path.delimiter + (process.env.PATH ?? '');
    const r = spawnSync('sh', ['-c', cmdline], { cwd: this.staging, input: prompt, env, timeout, maxBuffer: 64 << 20 });
    fs.writeFileSync(path.join(tdir, t.id + '.log'), Buffer.concat([r.stdout ?? Buffer.alloc(0), r.stderr ?? Buffer.alloc(0)]));
    const parse = this.o.agent ? usageParsers[this.o.agent] : undefined;
    let usage: Usage | undefined;
    if (parse) {
      const u = parse((r.stdout ?? Buffer.alloc(0)).toString('utf8'));
      if (!usageEmpty(u) || u.error) usage = u;
    }
    if (tr && usage) tr.usage = usage;
    const after = snapshot(this.staging);
    const allowed = new Set(t.write_set);
    const reverted: string[] = [];
    for (const f of changedFiles(before, after)) {
      if (allowed.has(f)) continue;
      reverted.push(f);
      const p = path.join(this.staging, f);
      const b = saved.get(f);
      if (b) {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, b);
      } else fs.rmSync(p, { force: true });
    }
    if (r.error || r.status !== 0) {
      const why = (r.error ? r.error.message : `exit status ${r.status}`) + (usage?.error ? ': ' + usage.error : '');
      throw Object.assign(new Error(`llm command failed: ${why} (see ${path.join(tdir, t.id + '.log')})`), { reverted });
    }
    if (t.kind === 'conflicts') this.mergeVerdicts(templ);
    else if (TreeKinds.has(t.kind)) {
      if (!fs.existsSync(path.join(this.staging, t.page))) throw new Error(`LLM did not write ${t.page}`);
    } else this.postProcess(t);
    return reverted;
  }

  postProcess(t: Task): void {
    let b: string;
    try {
      b = fs.readFileSync(path.join(this.staging, t.page), 'utf8');
    } catch {
      throw new Error(`LLM did not write ${t.page}`);
    }
    const [pg, err] = parsePage(t.page, b);
    if (err) throw new Error(`LLM output ${t.page}: ${err.message}`);
    const ctx = new Set(t.context);
    const src: Anchor[] = [];
    const seen = new Set<string>();
    for (const a of pg.front.sources ?? []) {
      const s = getSym(this.a.graph, a.sym);
      if (!s) throw new Error(`LLM anchored unknown symbol ${a.sym}`);
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      src.push({ sym: a.sym, hash: ctx.has(s.id) || a.hash !== s.hash ? s.hash : a.hash });
    }
    if (!src.length && t.kind !== 'overview') for (const id of t.context) src.push({ sym: id, hash: getSym(this.a.graph, id)!.hash });
    pg.front.sources = src.length ? src : undefined;
    pg.front.id = idFromPath(t.page);
    if (!pg.front.title) pg.front.title = t.title;
    if (t.kind) pg.front.kind = t.kind;
    if (t.route_id) {
      pg.front.routes = [t.route_id];
      pg.front.platforms = platformsOf(this.a.facts, t.route_id);
    }
    if (t.kind === 'overview') pg.front.routes = routeIDs(this.a.facts);
    pg.front.source_commit = short(this.head);
    pg.front.status = StatusCurrent;
    this.writePage(pg);
  }
}

function advanceBaseline(wikiDir: string, g: Graph, head: string, llm: string): void {
  const kb = path.join(wikiDir, '.kb');
  writeGraph(kb, g);
  writeJSON(path.join(kb, 'state.json'), { last_sha: head, graph_version: GraphVersion, prompt_version: PromptVersion, llm, updated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z') });
}

export async function compound(o: Options): Promise<Result> {
  o.kind ||= 'compound';
  o.date ||= today();
  const log = o.log ?? (() => {});
  const cfg = o.cfg;
  const a = await analyze(o);
  const head = a.graph.commit ?? '';
  const runID = runStamp() + '-' + (head ? short(head) : 'nogit');
  const r: Result = { run_id: runID, kind: o.kind, base: a.diff.base, head, mode: a.plan.mode, llm: o.llm, plan: a.plan, diff: a.diff, tasks: [], published: false, changed: [], message: '' };
  if (o.agent) r.agent = o.agent;
  log(`kb ${o.kind}: head=${shortHead(head)} base=${short(a.diff.base)} mode=${a.plan.mode} tasks=${a.plan.tasks.length} (${a.plan.reason})`);
  if (o.dryRun) {
    r.message = 'dry-run: nothing written';
    return r;
  }
  const wikiDir = wikiPath(cfg);
  const workRoot = path.join(path.dirname(wikiDir), '.kb-work');
  const work = path.join(workRoot, runID);
  const staging = path.join(work, 'wiki');
  fs.mkdirSync(work, { recursive: true });
  const unlock = lock(workRoot, 'lock-' + path.basename(wikiDir));
  try {
    r.work_dir = work;
    if (fs.existsSync(wikiDir)) copyDir(wikiDir, staging);
    else initWiki(staging, false);
    const before = snapshot(staging);
    if (o.ingestDocs?.length) {
      const docs = copyDocs(cfg.root, staging, o.ingestDocs);
      log(`ingested ${docs.length} document(s) into raw/docs`);
      for (const d of docs) {
        const b = fs.readFileSync(path.join(staging, d.raw!), 'utf8');
        for (const f of scanInjection(b)) log(`  ⚠ ${d.path} L${f.line}: suspected prompt injection (${f.pattern}): ${f.text}`);
      }
    }
    const expected = expectedFacts(cfg, a.graph, a.facts);
    for (const [rel, b] of expected) writeFileAtomic(path.join(staging, rel), b);
    const graphPath = path.join(work, 'graph.json');
    fs.writeFileSync(graphPath, goJSON(graphJSON(a.graph), ' '));
    const env = new TaskEnv(o, a, staging, work, graphPath, head);
    let llmUsed = 0;
    for (const t of a.plan.tasks) {
      let writer = o.llm;
      if (writer !== 'template' && !(o.maxTasks && o.maxTasks > 0 && t.priority > o.maxTasks)) llmUsed++;
      if (o.maxTasks && o.maxTasks > 0 && t.priority > o.maxTasks && writer !== 'template') writer = 'template';
      let tr = env.run(t, writer);
      if (tr.status !== 'ok' && o.fallback && writer !== 'template') {
        log(`  task ${t.id} failed (${tr.error}); falling back to template writer`);
        const tr2 = env.run(t, 'template');
        tr2.error = 'fallback after: ' + tr.error;
        if (tr.usage) tr2.usage = tr.usage;
        tr = tr2;
      }
      r.tasks.push(tr);
      if (tr.usage) usageAdd((r.usage ??= {}), tr.usage);
      log(`  [${tr.status}] ${t.op.padEnd(8)} ${t.page.padEnd(34)} ${tr.writer} ${tr.error ?? ''}${tr.usage && !usageEmpty(tr.usage) ? ' ' + usageString(tr.usage) : ''}`);
    }
    env.renderClaims();
    if (a.tree) {
      writeFileAtomic(path.join(staging, TreeFile), treeLib.serializeTree(a.tree));
      const tt = a.plan.tree?.tasks ?? [];
      for (const tk of tt) {
        const n = treeLib.findNode(a.tree, tk.node)!;
        const task: Task = { id: `tree-${tk.level}-${n.id.replace(/[^A-Za-z0-9]+/g, '-')}`, op: tk.op === 'create' ? 'create' : 'update', kind: n.kind, page: n.page, title: n.title, write_set: [n.page], reasons: tk.reasons.map((code) => ({ code })), context: n.core ?? [], priority: 0, tree_node: n.id };
        let writer = o.llm;
        if (o.maxTasks && o.maxTasks > 0 && llmUsed >= o.maxTasks) writer = 'template';
        let tr = env.run(task, writer);
        if (writer !== 'template') llmUsed++;
        if (tr.status !== 'ok' && o.fallback && writer !== 'template') {
          const tr2 = env.run(task, 'template');
          tr2.error = 'fallback after: ' + tr.error;
          tr = tr2;
        }
        r.tasks.push(tr);
        log(`  [${tr.status}] ${task.op.padEnd(8)} ${task.page.padEnd(34)} ${tr.writer} ${tr.error ?? ''}`);
      }
      syncTreePages(staging, a.tree, a.graph, a.facts, short(head));
    }
    fixIndex(staging);
    r.changed = changedFiles(before, snapshot(staging));
    if (r.changed.length === 0 && o.kind === 'compound' && a.plan.mode === 'noop') {
      r.message = 'noop: wiki already up to date';
      if (head && head !== a.diff.base) {
        try {
          advanceBaseline(wikiDir, a.graph, head, o.llm);
          r.message = 'noop: wiki already up to date (baseline advanced to ' + short(head) + ')';
        } catch {
          /* keep message */
        }
      }
      r.verify = verifyWiki(wikiDir, a.graph, expected);
      verifyRequirements(wikiDir, a.graph, r.verify);
      verifyTree(wikiDir, a.graph, a.facts, r.verify);
      if (!o.keep) fs.rmSync(work, { recursive: true, force: true });
      delete r.work_dir;
      return r;
    }
    const bullets = r.tasks.map((tr) => `${tr.op} \`${tr.page}\` (${tr.writer}, ${tr.status})`);
    appendLog(staging, o.date, o.kind, `${short(head)} ${a.plan.mode}, ${r.tasks.length} task(s), ${r.changed.length} file(s) changed`, bullets);
    if (o.kind === 'compound') {
      fs.mkdirSync(path.join(staging, '.kb'), { recursive: true });
      writeGraph(path.join(staging, '.kb'), a.graph);
      writeJSON(path.join(staging, '.kb', 'state.json'), { last_sha: head, graph_version: GraphVersion, prompt_version: PromptVersion, llm: o.llm, updated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z') });
    }
    writeJSON(path.join(staging, '.kb', 'plan.json'), a.plan);
    const rep = verifyWiki(staging, a.graph, expected);
    verifyRequirements(staging, a.graph, rep);
    verifyTree(staging, a.graph, a.facts, rep);
    r.verify = rep;
    writeJSON(path.join(staging, '.kb', 'update_record.json'), {
      base_sha: a.diff.base, changed: r.changed, date: o.date, head_sha: head, kind: o.kind, llm: o.llm, mode: a.plan.mode, reason: a.plan.reason, run_id: runID, tasks: r.tasks, verify_errors: rep.errors.length, verify_ok: rep.ok,
    });
    r.changed = changedFiles(before, snapshot(staging));
    if (!rep.ok) {
      r.message = `verify failed with ${rep.errors.length} error(s); staging kept at ${staging}; wiki NOT published`;
      return r;
    }
    publish(staging, wikiDir, work);
    r.published = true;
    r.message = `published ${r.changed.length} changed file(s) to ${wikiDir}`;
    if (!o.keep) {
      fs.rmSync(work, { recursive: true, force: true });
      delete r.work_dir;
    }
    return r;
  } finally {
    unlock();
  }
}
