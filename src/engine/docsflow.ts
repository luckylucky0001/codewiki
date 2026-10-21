// `kb docs …`: the SFK-style docs ownership workflow over repo `docs/` and
// `<project>/docs/` (docs/ownership.md). Entries are derived deterministically
// from facts, the module tree and specs (template), optionally enriched by an
// agent (contract format), verified, routed by evidence and merged with the
// human-content guard. specs/ are never written.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import type { Config } from '../config/config.js';
import { wikiPath } from '../config/config.js';
import type { Facts, Graph } from '../model.js';
import * as D from '../docs/index.js';
import type { CompoundItem, NewEntry, ScopePlan, Dimension, MergeResult, Evidence } from '../docs/index.js';
import * as tree from '../tree/index.js';
import type { ModuleTree, TreeNode } from '../tree/index.js';
import { scanRepo } from '../scan/scan.js';
import { extractFacts } from '../facts/facts.js';
import { cmpStr } from '../util/go.js';
import { gitHead, loadGraph, today } from './compound.js';
import { computeTree, loadTree } from './hier.js';
import { Checker, extractClaims } from './claims.js';
import { usageParsers, usageString } from '../agents/agents.js';

/** Default dimensions plus `docs_schema.dimensions` overrides from codewiki.yaml (e.g. point architecture at an existing human doc). */
export function schemaOf(cfg: Config): Dimension[] {
  const dims = (cfg.docs_schema as { dimensions?: unknown } | undefined)?.dimensions;
  if (!Array.isArray(dims)) return D.DefaultSchema;
  return D.mergeSchema(D.DefaultSchema, dims.filter((d): d is Partial<Dimension> & { id: string } => !!d && typeof (d as { id?: unknown }).id === 'string'));
}

export interface DocsOptions {
  projects?: string[];
  paths?: string[];
  noRootWrite?: boolean;
  noRootRead?: boolean;
  llm: string; // template | cmd
  llmCmd?: string;
  agent?: string;
  /** model for the built-in read-only agent command */
  model?: string;
  resume?: boolean;
  restart?: boolean;
  dryRun?: boolean;
  log?: (s: string) => void;
}

export interface DocFileResult {
  path: string;
  scope: string;
  dimension: string;
  state: string;
  action: string;
  inserted: number;
  replaced: number;
  unchanged: number;
  pending: number;
  /** entries over the per-run line budget, written on the next run */
  deferred?: number;
  dropped: { key: string; reason: string }[];
  review: string[];
  frozen?: boolean;
}

export interface DocsRunResult {
  ok: boolean;
  head: string;
  dry_run: boolean;
  run: { decision: string; reason: string };
  scopes: { id: string; root: string; docs_root: string; write: boolean; scan_mode: string }[];
  files: DocFileResult[];
  routing: { key: string; dest: string | null; reason: string; xref?: string[]; parity_diff?: boolean }[];
  broken_links: D.BrokenLink[];
  agent?: { status: string; accepted: number; rejected: number; errors: string[]; usage?: string };
}

// ---------- context ----------

export interface DocsContext {
  cfg: Config;
  root: string;
  plan: ScopePlan;
  graph: Graph;
  facts: Facts;
  tree: ModuleTree;
  schema: Dimension[];
  specs: { path: string; root: string; scope: string; meta: D.SpecMeta; text: string }[];
  head: string;
  files: string[];
}

function listFiles(root: string, exclude: string[]): string[] {
  const out: string[] = [];
  const rec = (dir: string) => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const rel = dir ? dir + '/' + e.name : e.name;
      if (e.isDirectory()) {
        if ((e.name !== '.kiro' && (D.isIgnoredName(e.name) || e.name.startsWith('.'))) || exclude.some((x) => rel === x || rel.startsWith(x + '/'))) continue;
        rec(rel);
      } else if (e.isFile()) out.push(rel);
    }
  };
  rec('');
  return out.sort(cmpStr);
}

export async function docsContext(cfg: Config, o: Pick<DocsOptions, 'projects' | 'paths' | 'noRootWrite' | 'noRootRead'>): Promise<DocsContext> {
  const root = cfg.root;
  const wikiRel = path.relative(root, wikiPath(cfg)).split(path.sep).join('/');
  const plan = D.discoverScopes(D.nodeScopeFs(root), {
    paths: o.paths,
    projectIds: o.projects,
    noRootWrite: o.noRootWrite,
    docsReadEnabled: !o.noRootRead,
    exclude: [wikiRel, ...(cfg.docs.exclude ?? [])],
    configured: cfg.scopes?.projects,
  });
  const res = await scanRepo(cfg);
  const facts = extractFacts(cfg, res);
  const head = gitHead(root);
  let t = loadTree(wikiPath(cfg));
  if (!t) t = computeTree(cfg, res.graph, loadGraph(path.join(wikiPath(cfg), '.kb', 'graph.json')), facts, null, true, head).tree;
  const files = listFiles(root, [wikiRel]);
  const specRoots = new Map<string, string>();
  specRoots.set('specs', 'repo');
  specRoots.set('.kiro/specs', 'repo');
  for (const p of plan.projects) for (const r of p.specsRoots) if (r !== 'specs') specRoots.set(r, p.id);
  const specs: DocsContext['specs'] = [];
  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    for (const [r, scope] of specRoots) {
      if (f.startsWith(r + '/')) {
        const text = fs.readFileSync(path.join(root, f), 'utf8');
        specs.push({ path: f, root: r, scope, meta: D.parseSpecMeta(text), text });
        break;
      }
    }
  }
  return { cfg, root, plan, graph: res.graph, facts, tree: t, schema: schemaOf(cfg), specs, head, files };
}

// ---------- deterministic evidence → entries ----------

interface Candidate {
  dimension: string;
  /** routing key (also used for the root entry heading) */
  key: string;
  evidence: Evidence[];
  /** entry per scope id ('repo' entry is used when routed to the repository) */
  entry: (scope: string) => CompoundItem | null;
}

const under = (f: string, root: string) => root === '' || f === root || f.startsWith(root + '/');

function scopeOfFile(plan: ScopePlan, f: string): string {
  let best = 'repo';
  let len = -1;
  for (const p of plan.projects) if (under(f, p.root) && p.root.length > len) {
    best = p.id;
    len = p.root.length;
  }
  return best;
}

const entry = (dimension: string, heading: string, body: string, source: string, section?: string): NewEntry => ({
  kind: 'entry', dimension, heading, body, source: { path: source, origin: 'Code Direct' }, ...(section ? { section } : {}),
});

function candidates(cx: DocsContext): Candidate[] {
  const { plan, facts, graph } = cx;
  const out: Candidate[] = [];
  const projById = new Map(plan.projects.map((p) => [p.id, p]));
  const relTo = (scope: string, f: string) => f; // sources are repo-relative
  // navigation (project only): one entry per route
  for (const r of facts.routes ?? []) {
    const sc = scopeOfFile(plan, r.file);
    if (sc === 'repo') continue;
    out.push({
      dimension: 'navigation', key: `route:${sc}:${r.route_id}`, evidence: [{ scope: sc, kind: 'code', path: r.file }],
      entry: () => entry('navigation', `路由 ${r.route_id}`, `- pattern：\`${r.pattern}\`\n- deeplink：\`${r.deeplink || '—'}\`\n- 入口符号：\`${r.symbol || '—'}\``, relTo(sc, r.file), 'Routes'),
    });
  }
  // testing: testIDs per route; the same ids in ≥2 projects → repository testing.md
  const tidGroups = new Map<string, Map<string, { tids: Set<string>; file: string }>>();
  for (const t of facts.testids ?? []) {
    const sc = scopeOfFile(plan, t.file);
    const rid = t.route_id || '(shared)';
    const m = tidGroups.get(rid) ?? new Map();
    const g = m.get(sc) ?? { tids: new Set<string>(), file: t.file };
    g.tids.add(t.tid);
    m.set(sc, g);
    tidGroups.set(rid, m);
  }
  for (const [rid, m] of [...tidGroups].sort((a, b) => cmpStr(a[0], b[0]))) {
    const ev: Evidence[] = [...m].map(([sc, g]) => ({ scope: sc, kind: 'code' as const, path: g.file, parityKey: 'tid:' + rid, value: [...g.tids].sort(cmpStr).join(',') }));
    out.push({
      dimension: 'testing', key: `tid:${rid}`, evidence: ev,
      entry: (scope) => {
        const mine = scope === 'repo' ? [...m] : [...m].filter(([sc]) => sc === scope);
        if (!mine.length) return null;
        const body = mine.map(([sc, g]) => `- ${scope === 'repo' ? sc + '：' : ''}${[...g.tids].sort(cmpStr).map((x) => '`' + x + '`').join('、')}`).join('\n');
        return entry('testing', `testID · ${rid}`, body, mine[0]![1].file, 'testID conventions');
      },
    });
  }
  // api contracts: METHOD path; ≥2 projects → repository contracts.md
  const apis = new Map<string, Evidence[]>();
  for (const a of facts.apis ?? []) {
    const sc = scopeOfFile(plan, a.file);
    const k = `${a.method} ${a.path}`;
    const ev = apis.get(k) ?? [];
    if (!ev.some((e) => e.scope === sc)) ev.push({ scope: sc, kind: 'code', path: a.file, parityKey: k, value: k });
    apis.set(k, ev);
  }
  for (const [k, ev] of [...apis].sort((a, b) => cmpStr(a[0], b[0]))) {
    out.push({
      dimension: 'api-contracts', key: `api:${k}`, evidence: ev,
      entry: (scope) => {
        const mine = scope === 'repo' ? ev : ev.filter((e) => e.scope === scope);
        if (!mine.length) return null;
        return entry('api-contracts', `\`${k}\``, mine.map((e) => `- ${e.scope === 'repo' ? '仓库' : e.scope}：\`${e.path}\``).join('\n'), mine[0]!.path, 'HTTP APIs');
      },
    });
  }
  // features: per route id across projects
  const feats = new Map<string, Evidence[]>();
  for (const r of facts.routes ?? []) {
    const sc = scopeOfFile(plan, r.file);
    const ev = feats.get(r.route_id) ?? [];
    if (!ev.some((e) => e.scope === sc)) ev.push({ scope: sc, kind: 'code', path: r.file, parityKey: 'route:' + r.route_id, value: r.pattern });
    feats.set(r.route_id, ev);
  }
  for (const [rid, ev] of [...feats].sort((a, b) => cmpStr(a[0], b[0]))) {
    out.push({
      dimension: 'features', key: `feature:${rid}`, evidence: ev,
      entry: (scope) => {
        const mine = scope === 'repo' ? ev : ev.filter((e) => e.scope === scope);
        if (!mine.length) return null;
        const pats = [...new Set(mine.map((e) => e.value))].join(' / ');
        return entry('features', `功能 ${rid}`, `- 实现：${mine.map((e) => e.scope).join('、')}\n- pattern：\`${pats}\`\n- wiki：\`${path.relative(cx.root, wikiPath(cx.cfg)).split(path.sep).join('/') || 'wiki'}/pages/features/${rid}.md\``, mine[0]!.path, 'Features');
      },
    });
  }
  // design patterns: ViewModel / Store types per project, ≥2 projects → repo entry
  const vm = new Map<string, Evidence[]>();
  for (const s of graph.symbols) {
    if (s.parent || !['class', 'struct'].includes(s.kind)) continue;
    const m = /(ViewModel|Store|Repository|Coordinator)$/.exec(s.name);
    if (!m) continue;
    const sc = scopeOfFile(plan, s.file);
    const pat = m[1] === 'ViewModel' ? 'MVVM（ViewModel）' : m[1] === 'Store' ? '状态容器（Store）' : m[1]!;
    const ev = vm.get(pat) ?? [];
    ev.push({ scope: sc, kind: 'code', path: s.file, parityKey: 'pattern:' + pat });
    vm.set(pat, ev);
  }
  for (const [pat, ev] of [...vm].sort((a, b) => cmpStr(a[0], b[0]))) {
    out.push({
      dimension: 'design-patterns', key: `pattern:${pat}`, evidence: ev,
      entry: (scope) => {
        const mine = (scope === 'repo' ? ev : ev.filter((e) => e.scope === scope)).slice().sort((a, b) => cmpStr(a.path, b.path));
        if (!mine.length) return null;
        return entry('design-patterns', pat, mine.slice(0, 8).map((e) => `- \`${e.path}\``).join('\n') + (mine.length > 8 ? `\n- … 另有 ${mine.length - 8} 处` : ''), mine[0]!.path, 'Patterns');
      },
    });
  }
  // architecture: project → module/cluster map from the tree; repo → project table
  tree.walk(cx.tree.root, (n: TreeNode) => {
    if (n.kind === 'repo') return;
    const files: string[] = [];
    tree.walk(n, (x) => {
      for (const f of x.files ?? []) files.push(f);
      for (const id of x.core ?? []) {
        const f = graph.symbols.find((s) => s.id === id)?.file;
        if (f) files.push(f);
      }
    });
    files.sort(cmpStr);
    if (!files.length) return;
    const sc = scopeOfFile(plan, files[0]!);
    if (n.kind === 'project') {
      out.push({
        dimension: 'architecture', key: `arch:project:${n.id}`, evidence: [{ scope: 'repo', kind: 'code', path: files[0]! }],
        entry: (scope) => (scope === 'repo' ? entry('architecture', `项目 ${n.title}`, `- 构建：${[n.build, n.platform].filter(Boolean).join(' · ')}\n- ${n.summary ?? ''}`, files[0]!, 'Projects') : null),
      });
      return;
    }
    if (sc === 'repo') return;
    out.push({
      dimension: 'architecture', key: `arch:${n.id}`, evidence: [{ scope: sc, kind: 'code', path: files[0]! }],
      entry: () => entry('architecture', `${n.kind === 'module' ? '模块' : '功能簇'} ${n.title}`, `- ${n.summary ?? ''}\n- wiki：\`${path.relative(cx.root, wikiPath(cx.cfg)).split(path.sep).join('/') || 'wiki'}/${n.page}\``, files[0]!, 'Module map'),
    });
  });
  // product-specs: index rows (links only)
  for (const s of cx.specs) {
    const title = /^#\s+(.+)$/m.exec(s.text)?.[1]?.trim() ?? path.posix.basename(s.path);
    out.push({
      dimension: 'product-specs', key: `index:${s.path}`, evidence: [{ scope: s.scope, kind: 'spec', path: s.path }],
      entry: (scope) => {
        const docsRoot = scope === 'repo' ? plan.repository.docsRoot : projById.get(scope)!.docsRoot;
        const rel = D.relativePath(docsRoot, s.path);
        return { kind: 'row', key: `index:${s.path}`, line: `- [${title}](${rel}) — **Status**: ${s.meta.status}${s.meta.declared ? '' : '（未声明，按 Draft）'}`, section: 'Specs' };
      },
    });
  }
  // requirements: spec claims checked against code; Draft → [Unconfirmed]
  const ck = new Checker(graph, facts, cx.root);
  for (const s of cx.specs) {
    for (const c of extractClaims(s.path, s.path, s.text)) {
      ck.check(c);
      const verdict = (c.status ?? 'unverifiable') as D.IngestVerdict;
      const td = D.trustDecision(s.meta.status, verdict);
      if (!td.tag) continue;
      const src = (c.anchors ?? []).map((a) => graph.symbols.find((x) => x.id === a)?.file).find((x): x is string => !!x) ?? s.path;
      const heading = `${path.posix.basename(path.posix.dirname(s.path))} · ${c.id}`;
      out.push({
        dimension: 'requirements', key: `req:${s.path}#${c.id}`, evidence: [{ scope: s.scope, kind: 'spec', path: s.path }],
        entry: () => ({
          kind: 'entry', dimension: 'requirements', heading, section: 'Requirements',
          body: `${c.text}\n\n- 规格：\`${s.path}\`（**Status**: ${s.meta.status}）\n- 代码核对：${verdict}${c.evidence?.length ? ' — ' + c.evidence[0] : ''}`,
          source: { path: src, origin: 'Code Direct', ...(td.tag!.status === 'Unconfirmed' ? {} : {}) },
          ...({ draftOnly: !D.isTrusted(s.meta.status) } as object),
        }) as CompoundItem,
      });
    }
  }
  return out;
}

// ---------- run ----------

function exists(root: string) {
  return (p: string) => fs.existsSync(path.join(root, p));
}

function readOrNull(root: string, p: string): string | null {
  try {
    return fs.readFileSync(path.join(root, p), 'utf8');
  } catch {
    return null;
  }
}

function writeText(root: string, p: string, t: string): void {
  fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
  fs.writeFileSync(path.join(root, p), t);
}

function docsScopes(plan: ScopePlan): D.DocsScopeRef[] {
  return [{ scope: 'repo', ownerRoot: '', docsRoot: plan.repository.docsRoot }, ...plan.projects.map((p) => ({ scope: 'project' as const, ownerRoot: p.root, docsRoot: p.docsRoot }))];
}

function gitRunner(root: string): D.GitRunner {
  return (args) => {
    const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    return { code: r.status ?? 1, stdout: r.stdout ?? '' };
  };
}

export async function docsCompound(cfg: Config, o: DocsOptions): Promise<DocsRunResult> {
  const log = o.log ?? (() => {});
  const cx = await docsContext(cfg, o);
  const { plan, root } = cx;
  const res: DocsRunResult = {
    ok: true, head: cx.head, dry_run: !!o.dryRun, run: { decision: 'fresh', reason: '' }, files: [], routing: [], broken_links: [],
    scopes: [
      { id: 'repo', root: '.', docs_root: plan.repository.docsRoot, write: plan.repository.writeEnabled, scan_mode: 'full' },
      ...plan.projects.map((p) => ({ id: p.id, root: p.root, docs_root: p.docsRoot, write: true, scan_mode: 'full' })),
    ],
  };
  // run state / resume
  const prevRun = D.loadRunState(root);
  const dec = D.decideResume(prevRun, cx.head || 'nogit', { resume: o.resume, restart: o.restart });
  res.run = { decision: dec.action, reason: dec.reason };
  let run: D.RunState = dec.action === 'resume' && prevRun ? prevRun : D.newRunState(cx.head || 'nogit', new Date(), res.scopes.map((s) => ({ id: s.id, mode: 'full' as const })));
  const completed = new Set<string>(run.completed_docs);
  // incremental bases
  const state = D.loadDocsState(root);
  for (const s of res.scopes) {
    const base = D.resolveScanBase(s.id, state, []);
    s.scan_mode = base ? 'incremental' : 'full';
  }
  // extra-schema registry (custom docs; enabled:false = frozen)
  const extraPath = D.ExtraSchemaFile;
  const extraText = readOrNull(root, extraPath);
  const scopesRef = docsScopes(plan);
  const md = cx.files.filter((f) => f.endsWith('.md'));
  const discovered = D.discoverExtraDocs(cx.schema, scopesRef, md, (p) => readOrNull(root, p));
  const upd = D.updateExtraSchema(extraText, discovered);
  if (upd.changed && !o.dryRun) writeText(root, extraPath, upd.text);
  const extra = D.parseExtraSchema(upd.text);
  // derive + route
  const items = new Map<string, { scope: string; dimension: string; items: CompoundItem[] }>();
  const add = (scope: string, dimension: string, it: CompoundItem) => {
    const dim = D.getDimension(cx.schema, dimension)!;
    if (!dim.scopes.includes(scope === 'repo' ? 'repo' : 'project')) return;
    const p = scope === 'repo' ? { root: '', docsRoot: plan.repository.docsRoot } : plan.projects.find((x) => x.id === scope)!;
    const out = D.dimensionOutput(dim, p.root, p.docsRoot);
    const k = out + '|' + dimension;
    const g = items.get(k) ?? { scope, dimension, items: [] };
    g.items.push(it);
    items.set(k, g);
  };
  for (const c of candidates(cx)) {
    const dim = D.getDimension(cx.schema, c.dimension)!;
    let decision: D.RouteDecision;
    if (!dim.scopes.includes('repo')) decision = { dest: c.evidence[0]!.scope === 'repo' ? null : c.evidence[0]!.scope, reason: 'project-only dimension' };
    else decision = D.routeByEvidence(c.evidence, plan);
    res.routing.push({ key: c.key, dest: decision.dest, reason: decision.reason, ...(decision.xrefProjects ? { xref: decision.xrefProjects } : {}), ...(decision.parityDiff ? { parity_diff: true } : {}) });
    if (!decision.dest) continue;
    const it = c.entry(decision.dest);
    if (!it) continue;
    add(decision.dest, c.dimension, it);
    if (decision.dest === 'repo' && decision.xrefProjects?.length && it.kind === 'entry') {
      const rootDoc = D.dimensionOutput(dim, '', plan.repository.docsRoot);
      for (const pid of decision.xrefProjects) {
        const p = plan.projects.find((x) => x.id === pid);
        if (!p || !dim.scopes.includes('project')) continue;
        const projDoc = D.dimensionOutput(dim, p.root, p.docsRoot);
        add(pid, c.dimension, { ...D.xrefRow(projDoc, rootDoc, c.key, it.heading.replace(/`/g, ''), D.githubSlug(it.heading)), section: 'Shared (repository docs)' });
      }
    }
  }
  // optional agent enrichment (contract format)
  if (o.llm === 'cmd' && o.llmCmd) {
    const ag = runDocsAgent(cx, o, [...items.entries()]);
    res.agent = { status: ag.status, accepted: 0, rejected: ag.rejected, errors: ag.errors };
    if (ag.usage) res.agent.usage = ag.usage;
    for (const a of ag.accepted) {
      const g = [...items.entries()].find(([k]) => k.startsWith(a.dest + '|'));
      if (g) {
        for (const it of a.items) {
          const k = D.itemKey(it);
          g[1].items = g[1].items.filter((x) => D.itemKey(x) !== k).concat([it]);
          res.agent.accepted++;
        }
      }
    }
  }
  // verify + merge
  const originals = new Map<string, string>();
  const ex = exists(root);
  const date = today();
  for (const [k, g] of [...items.entries()].sort((a, b) => cmpStr(a[0], b[0]))) {
    const file = k.slice(0, k.lastIndexOf('|'));
    if (dec.action === 'resume' && completed.has(file)) continue;
    const dim = D.getDimension(cx.schema, g.dimension)!;
    const fr: DocFileResult = { path: file, scope: g.scope, dimension: g.dimension, state: '', action: '', inserted: 0, replaced: 0, unchanged: 0, pending: 0, dropped: [], review: [] };
    if (D.isFrozenDoc(file, cx.schema, scopesRef, extra) || !D.isWritableDocPath(plan, file)) {
      fr.frozen = true;
      fr.action = 'skip';
      fr.state = 'frozen';
      res.files.push(fr);
      continue;
    }
    const text = readOrNull(root, file);
    const st = D.classifyFile(text, true);
    fr.state = st;
    const entries = g.items.filter((x): x is NewEntry => x.kind === 'entry');
    const others = g.items.filter((x) => x.kind !== 'entry');
    const vr = D.verifyEntrySources(entries, {
      state: st, exists: ex, requirementOriented: dim.requirement_oriented,
      draftOnly: (e) => !!(e as NewEntry & { draftOnly?: boolean }).draftOnly,
    });
    for (const d of vr.dropped) fr.dropped.push({ key: D.itemKey(d.entry), reason: d.reason });
    const clean = vr.kept.map((e) => {
      const { draftOnly: _d, ...rest } = e as NewEntry & { draftOnly?: boolean };
      return rest as NewEntry;
    });
    const scanMode = res.scopes.find((s) => s.id === g.scope)?.scan_mode === 'incremental' ? 'incremental' : 'full';
    const mr: MergeResult = D.mergeDocument({
      path: file, text, state: st, dimension: g.dimension, items: [...clean, ...others], scanDate: date, scanMode, sourceCommit: cx.head || undefined,
      title: dim.title, knowledgeLayer: D.isKnowledgeLayerFile(file, scopesRef.map((s) => s.docsRoot)), sourceExists: ex,
    });
    fr.action = mr.action;
    fr.inserted = mr.inserted.length;
    fr.replaced = mr.replaced.length;
    fr.unchanged = mr.unchanged.length;
    fr.pending = mr.markedPending.length;
    if (mr.truncated.length) fr.deferred = mr.truncated.length;
    fr.dropped.push(...mr.dropped);
    fr.review = mr.review.map((r) => `${(r as { line?: number }).line ?? ''} ${(r as { message?: string; reason?: string }).message ?? (r as { reason?: string }).reason ?? JSON.stringify(r)}`.trim());
    if (mr.action === 'write' && mr.text !== undefined && !o.dryRun) {
      writeText(root, file, mr.text);
      originals.set(file, text ?? '');
    }
    if (mr.action === 'review') res.ok = false;
    res.files.push(fr);
    if (!o.dryRun) {
      run = D.markDocCompleted(run, file);
      D.saveRunState(root, run);
    }
    log(`  ${fr.action.padEnd(6)} ${fr.state.padEnd(8)} ${file} [${g.dimension}] +${fr.inserted} ~${fr.replaced}${fr.dropped.length ? ` dropped ${fr.dropped.length}` : ''}`);
  }
  // links in written files; a broken link on a line that was already there is the human's, reported but not kb's failure
  const written = res.files.filter((f) => f.action === 'write').map((f) => f.path);
  if (written.length) {
    res.broken_links = linkCheck(root, written, cx.files);
    for (const b of res.broken_links) {
      const orig = originals.get(b.file);
      const line = (readOrNull(root, b.file) ?? '').split('\n')[b.line - 1];
      if (orig !== undefined && line !== undefined && orig.split('\n').includes(line)) (b as D.BrokenLink & { preexisting?: boolean }).preexisting = true;
      else res.ok = false;
    }
  }
  if (!o.dryRun) {
    let s2 = state;
    for (const s of res.scopes) s2 = D.recordScopeScan(s2, s.id, cx.head || undefined, date);
    D.saveDocsState(root, s2);
    D.saveRunState(root, D.finishRun(run, 'done'));
  }
  return res;
}

export function linkCheck(root: string, files: string[], all: string[]): D.BrokenLink[] {
  const top = [...new Set(all.map((f) => f.split('/')[0]!))];
  return D.checkLinks(
    files.map((p) => ({ path: p, text: readOrNull(root, p) ?? '' })),
    { exists: exists(root), read: (p) => readOrNull(root, p), files: all },
    { topLevelDirs: top, exists: exists(root), checkAnchors: true },
  );
}

// ---------- agent ----------

function runDocsAgent(cx: DocsContext, o: DocsOptions, groups: [string, { scope: string; dimension: string; items: CompoundItem[] }][]) {
  const lines: string[] = [];
  lines.push('# codewiki docs compound', '', '你在补充人机共写的 docs 条目。只输出下述格式，不要写文件。下面的确定性条目是事实来源（来自代码、facts、模块树和 spec）。', '');
  lines.push('## 输出格式', '', '```', '=== <目标文件> [<维度>] ===', '### <条目标题>', '<1–4 行说明，只描述代码中可验证的事实>', '**Source**: `<仓库相对路径>` [Code Direct]', '', 'COMPOUND_META {"status":"done","remaining_scope":[]}', '```', '');
  lines.push('只能使用下列目标文件与 Source 路径；规格（specs/）只读；Draft 规格不能变成规则。', '');
  lines.push('做法：对下面每个条目，先用 Read 打开它的 Source 文件，再写 1–3 句**具体**说明（职责、关键参数 / 常量 / 接口、与其他条目的关系）。条目标题与 Source 路径必须原样保留（kb 按标题替换确定性条目），不要只复述标题；读不到依据的条目直接省略。只在全部输出的最后写一次 COMPOUND_META。', '');
  for (const [k, g] of groups) {
    lines.push(`## ${k.slice(0, k.lastIndexOf('|'))} [${g.dimension}]`, '');
    for (const it of g.items.slice(0, 20)) if (it.kind === 'entry') lines.push(`- ${it.heading} — Source \`${it.source.path}\``);
    lines.push('');
  }
  // the docs agent only reads: claude gets a read-only tool set; any agent that still changes the
  // working tree has its whole result rejected (kb alone writes docs, after verification)
  const cmd = o.agent === 'claude' ? agentReadOnlyCmd(o.model) : o.llmCmd!;
  const wikiRel = path.relative(cx.root, wikiPath(cx.cfg)).split(path.sep).join('/');
  const before = treeFingerprint(cx.root, wikiRel);
  const r = spawnSync('sh', ['-c', cmd], { cwd: cx.root, input: lines.join('\n'), encoding: 'utf8', timeout: (cx.cfg.llm.timeout_sec || 600) * 1000, maxBuffer: 64 << 20 });
  const none = [] as { dest: string; items: CompoundItem[] }[];
  if (r.status !== 0) return { status: 'failed', accepted: none, rejected: 0, errors: [`agent exited ${r.status}`] };
  const after = treeFingerprint(cx.root, wikiRel);
  const touched = [...new Set([...before.keys(), ...after.keys()])].filter((f) => before.get(f) !== after.get(f)).sort(cmpStr);
  if (touched.length) return { status: 'failed', accepted: none, rejected: 0, errors: [`agent modified the working tree (result discarded): ${touched.slice(0, 10).join(', ')}`] };
  const parsed = D.parseAgentResult(agentText(r.stdout ?? ''));
  const allow = ['', ...cx.files.map((f) => f.split('/')[0]!)];
  // one call covers every scope: route each destination as the agent of the scope that owns it
  const allowlist = [...new Set(allow)].filter(Boolean);
  const accepted: { dest: string; items: CompoundItem[] }[] = [];
  let rejected = 0;
  const errors = [...parsed.errors];
  for (const grp of parsed.groups) {
    const owner = D.scopeOf(cx.plan, grp.dest);
    const agent: D.AgentScope = owner !== 'repo' ? { kind: 'project', projectId: owner } : { kind: 'repo' };
    const routed = D.routeAgentResult([grp], { plan: cx.plan, agent, allowlist });
    accepted.push(...routed.accepted);
    rejected += routed.rejected.length;
    for (const x of routed.rejected.slice(0, 3)) errors.push(`rejected ${x.dest}${(x as { key?: string }).key ? ' ' + (x as { key?: string }).key : ''}: ${x.reason}`);
  }
  const up = o.agent ? usageParsers[o.agent] : undefined;
  const usage = up ? usageString(up(r.stdout ?? '')) : '';
  return { status: parsed.meta?.status ?? 'done', accepted, rejected, errors, usage };
}

function agentReadOnlyCmd(model?: string): string {
  const q = (x: string) => "'" + x.replaceAll("'", "'\\''") + "'";
  return ['claude', '-p', '--allowedTools', 'Read,Glob,Grep', '--output-format', 'json', ...(model ? ['--model', q(model)] : [])].join(' ');
}

/** Agent CLIs in JSON mode wrap the answer (claude: {result}, gemini: {response}); plain text passes through. */
export function agentText(out: string): string {
  const t = out.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return out;
  let last = '';
  for (const line of t.startsWith('[') ? [t] : t.split('\n')) {
    try {
      const v = JSON.parse(line) as unknown;
      for (const m of Array.isArray(v) ? v : [v]) {
        const o = m as Record<string, unknown>;
        if (typeof o.result === 'string') last = o.result;
        else if (typeof o.response === 'string') last = o.response;
        else if (o.type === 'item.completed' && typeof (o.item as Record<string, unknown>)?.text === 'string') last = (o.item as Record<string, string>).text!;
      }
    } catch {
      /* not JSON */
    }
  }
  return last || out;
}

/** path -> size:mtime of every file outside .git and the wiki (detects writes by a read-only agent). */
function treeFingerprint(root: string, wikiRel: string): Map<string, string> {
  const m = new Map<string, string>();
  const rec = (d: string) => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(path.join(root, d), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const rel = d ? d + '/' + e.name : e.name;
      if (e.isDirectory()) {
        if (e.name === '.git' || e.name === 'node_modules' || rel === wikiRel) continue;
        rec(rel);
      } else if (e.isFile()) {
        const st = fs.statSync(path.join(root, rel), { bigint: true });
        m.set(rel, `${st.size}:${st.mtimeNs}`);
      }
    }
  };
  rec('');
  return m;
}

// ---------- status / specs / adr / debt ----------

export async function docsStatus(cfg: Config, o: Pick<DocsOptions, 'projects' | 'paths' | 'noRootWrite' | 'noRootRead'>) {
  const root = cfg.root;
  const wikiRel = path.relative(root, wikiPath(cfg)).split(path.sep).join('/');
  const plan = D.discoverScopes(D.nodeScopeFs(root), { projectIds: o.projects, paths: o.paths, noRootWrite: o.noRootWrite, exclude: [wikiRel], configured: cfg.scopes?.projects });
  const files = listFiles(root, [wikiRel]).filter((f) => f.endsWith('.md'));
  const scopesRef = docsScopes(plan);
  const extraText = readOrNull(root, D.ExtraSchemaFile);
  const extra = D.parseExtraSchema(extraText);
  const discovered = D.discoverExtraDocs(schemaOf(cfg), scopesRef, files, (p) => readOrNull(root, p));
  const docsRoots = scopesRef.map((s) => s.docsRoot);
  const out: { path: string; scope: string; state: string; dimension: string | null; frozen: boolean; knowledge_layer: boolean; last_compound_scan?: string; pending: number }[] = [];
  for (const f of files) {
    const sc = scopesRef.filter((s) => f.startsWith(s.docsRoot + '/')).sort((a, b) => b.docsRoot.length - a.docsRoot.length)[0];
    if (!sc) continue;
    const text = readOrNull(root, f);
    const t = D.resolveDocTarget(f, schemaOf(cfg), scopesRef, extra);
    const frozen = D.isFrozenDoc(f, schemaOf(cfg), scopesRef, extra);
    const fm = text ? D.parseFrontmatter(text) : null;
    out.push({
      path: f, scope: sc.scope === 'repo' ? 'repo' : plan.projects.find((p) => p.docsRoot === sc.docsRoot)?.id ?? sc.ownerRoot,
      state: frozen ? 'frozen' : D.classifyFile(text, true), dimension: !t ? null : t.kind === 'schema' ? t.dimension.id : t.kind === 'extra' ? 'extra' : 'knowledge-layer',
      frozen, knowledge_layer: D.isKnowledgeLayerFile(f, docsRoots), ...(fm?.last_compound_scan ? { last_compound_scan: fm.last_compound_scan } : {}),
      pending: (text?.match(/\[Pending\]/g) ?? []).length,
    });
  }
  return {
    scopes: { repository: plan.repository, projects: plan.projects, single_root: plan.singleRoot, unresolved: plan.unresolved },
    files: out,
    extra_registry: { path: D.ExtraSchemaFile, entries: extra, unregistered: discovered.filter((d) => !extra.some((e) => D.extraEntryPath(e) === D.extraEntryPath(d))).map(D.extraEntryPath) },
    docs_state: D.loadDocsState(root),
  };
}

export function specGit(root: string): D.SpecGit {
  return {
    lastCommitDate: (dir) => {
      try {
        const out = execFileSync('git', ['-C', root, 'log', '-1', '--format=%cI', '--', dir], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        return out || null;
      } catch {
        return null;
      }
    },
    everVerified: (file) => {
      try {
        return execFileSync('git', ['-C', root, 'log', '--format=%H', '-S', '**Status**: Verified', '--', file], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() !== '';
      } catch {
        return false;
      }
    },
  };
}

export async function staleSpecs(cfg: Config, days: number) {
  const cx = await docsContext(cfg, {});
  const ck = new Checker(cx.graph, cx.facts, cx.root);
  const conflicts = new Set<string>();
  for (const s of cx.specs) for (const c of extractClaims(s.path, s.path, s.text)) {
    ck.check(c);
    if (c.status === 'conflict') conflicts.add(s.path);
  }
  const docs = cx.specs.filter((s) => /(^|\/)(spec|requirements)\.md$/.test(s.path)).map((s) => ({ path: s.path, dir: path.posix.dirname(s.path), meta: s.meta }));
  return D.detectStaleSpecs(docs, specGit(cx.root), { now: new Date(), days, conflicts });
}

export async function adrProposals(cfg: Config, write: boolean) {
  const cx = await docsContext(cfg, {});
  const adrDir = cx.plan.repository.docsRoot + '/adr';
  const existingFiles = cx.files.filter((f) => f.startsWith(adrDir + '/')).map((f) => ({ name: path.posix.basename(f), text: readOrNull(cx.root, f) ?? '' }));
  const existing = D.parseExistingAdrs(adrDir, existingFiles);
  // decisions evidenced by trusted specs whose claims the code verifies
  const ck = new Checker(cx.graph, cx.facts, cx.root);
  const proposals: D.AdrProposal[] = [];
  for (const s of cx.specs) {
    const claims = extractClaims(s.path, s.path, s.text).map((c) => (ck.check(c), c));
    const ok = claims.filter((c) => c.status === 'verified');
    if (!ok.length) continue;
    const title = (/^#\s+(?:Feature Specification:|Requirements Document:)?\s*(.+)$/m.exec(s.text)?.[1] ?? path.posix.basename(path.posix.dirname(s.path))).trim();
    proposals.push({
      key: `adr:${path.posix.dirname(s.path)}/implementation`, title: `${title} 的实现约定`, specTrusted: D.isTrusted(s.meta.status), relatedSpec: s.path,
      context: `规格 \`${s.path}\`（**Status**: ${s.meta.status}）中的 ${ok.length} 条需求已由代码核对通过。`,
      decision: ok.map((c) => `- ${c.text}`).join('\n'),
      consequences: '改动这些行为时需要同步更新规格与本 ADR；`kb docs stale-specs` 会报告规格与代码的偏离。',
      evidence: [...new Set(ok.flatMap((c) => c.anchors ?? []))].slice(0, 6),
    });
  }
  const pl = D.planAdrs(adrDir, existing, proposals, today());
  if (write) for (const c of pl.create) writeText(cx.root, c.path, c.text);
  return pl;
}

export async function debtProposals(cfg: Config, write: boolean) {
  const cx = await docsContext(cfg, {});
  const file = cx.plan.repository.docsRoot + '/tech-debt.md';
  const items: D.DebtItem[] = [];
  for (const f of Object.keys(cx.graph.files).sort(cmpStr)) {
    const text = readOrNull(cx.root, f);
    if (!text) continue;
    for (const c of D.extractDebtComments(f, text)) {
      const sym = cx.graph.symbols.filter((s) => s.file === f && s.start_line <= c.line + 1 && s.end_line >= c.line).sort((a, b) => a.end_line - a.start_line - (b.end_line - b.start_line))[0];
      items.push({ key: D.debtKey(f, sym?.qual ?? '', c.text), description: `${c.tag}: ${c.text}`, source: `\`${f}:${c.line}\``, location: sym ? `\`${sym.qual}\`` : '—' });
    }
  }
  const cur = readOrNull(cx.root, file);
  const r = D.applyDebt(cur, items);
  if (write && r.action === 'write' && r.text !== undefined) writeText(cx.root, file, r.text);
  return { file, items, result: { action: r.action, added: r.added, refreshed: r.refreshed, marked_pending: r.markedPending, review: r.review } };
}

/** verify --docs: owned [Code Direct] entries whose Source no longer exists, broken links in docs. */
/**
 * `kb verify --docs`: fails only on broken references in kb-owned content (generated entries, index rows,
 * kb blocks — the items parseDocument recognises). Broken links in human-owned text are returned as
 * human_review_candidates and fail only with `strict`.
 */
export async function verifyDocs(cfg: Config, opts: { strict?: boolean } = {}) {
  const root = cfg.root;
  const wikiRel = path.relative(root, wikiPath(cfg)).split(path.sep).join('/');
  const plan = D.discoverScopes(D.nodeScopeFs(root), { exclude: [wikiRel], configured: cfg.scopes?.projects });
  const all = listFiles(root, [wikiRel]);
  const docs = all.filter((f) => f.endsWith('.md') && docsScopes(plan).some((s) => f.startsWith(s.docsRoot + '/')));
  const errors: { code: string; page: string; detail: string }[] = [];
  const human: { code: string; page: string; detail: string }[] = [];
  const owned = new Map<string, Set<number>>(); // file -> 1-based lines inside kb-owned items
  for (const f of docs) {
    const text = readOrNull(root, f) ?? '';
    const doc = D.parseDocument(text);
    const lines = new Set<number>();
    for (const it of doc.items ?? []) {
      for (let l = it.start; l <= it.end; l++) lines.add(l + 1);
      const src = (it as { source?: { path: string; origin: string } }).source;
      if (src && src.origin === 'Code Direct' && !fs.existsSync(path.join(root, src.path))) errors.push({ code: 'E_DOCS_SOURCE_MISSING', page: f, detail: `owned entry source ${src.path} no longer exists (run kb docs compound)` });
    }
    owned.set(f, lines);
  }
  for (const b of linkCheck(root, docs, all)) {
    const e = { code: 'E_DOCS_LINK', page: b.file, detail: `L${b.line} ${b.target}: ${b.reason}${b.suggestions.length ? ' (did you mean ' + b.suggestions[0] + ')' : ''}` };
    if (owned.get(b.file)?.has(b.line)) errors.push(e);
    else human.push({ ...e, code: 'W_DOCS_HUMAN_LINK' });
  }
  return { ok: errors.length === 0 && !(opts.strict && human.length), strict: !!opts.strict, files: docs.length, errors, human_review_candidates: human };
}
