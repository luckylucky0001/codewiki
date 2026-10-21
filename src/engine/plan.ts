// Planner: affected pages + explicit write sets (.kb/plan.json).
import type { Config } from '../config/config.js';
import type { Facts, Graph } from '../model.js';
import { getSym } from '../model.js';
import type { Page } from '../wiki/page.js';
import { cmpStr } from '../util/go.js';
import { type Change, type Diff, type RouteChange, ClassAdded, ClassBody, ClassDeleted, ClassRenamed, ClassSignature, moduleRatio, structuralRatio } from './diff.js';
import { NavigationPage, SharedPage, computeAnchors, featureSymbols, routeIDs } from './anchors.js';
import { round2 } from './graphutil.js';

export const OpCreate = 'create';
export const OpUpdate = 'update';
export const OpRecheck = 'recheck';
export const OverviewPage = 'pages/overview.md';
export const ConflictsPage = 'pages/_conflicts.md';
export const VerdictsFile = '.kb/ingest/verdicts.json';
export const featurePage = (rid: string) => 'pages/features/' + rid + '.md';

export interface Reason {
  code: string;
  sym?: string;
  detail?: string;
}

export interface Task {
  id: string;
  op: string;
  kind: string;
  page: string;
  title: string;
  route_id?: string;
  write_set: string[];
  reasons: Reason[];
  context: string[];
  priority: number;
}

export interface Plan {
  version: number;
  base: string;
  head: string;
  mode: string;
  reason: string;
  stats: { symbols: number; changes: Record<string, number>; module_ratio: number; structural_ratio: number; hops: number; propagated_symbols: number };
  tasks: Task[];
  changed_route_ids: string[];
  changed_routes: RouteChange[];
  changed_files: string[];
}

export interface PlanInput {
  cfg: Config;
  diff: Diff;
  old: Graph;
  cur: Graph;
  facts: Facts;
  pages: Page[];
  forceFull: boolean;
  hasDocs: boolean;
}

const R = (code: string, sym?: string, detail?: string): Reason => {
  const r: Reason = { code };
  if (sym) r.sym = sym;
  if (detail) r.detail = detail;
  return r;
};

function task(t: Omit<Task, 'id' | 'priority'>): Task {
  const o = { id: '', op: t.op, kind: t.kind, page: t.page, title: t.title } as Task;
  if (t.route_id) o.route_id = t.route_id;
  o.write_set = t.write_set;
  o.reasons = t.reasons;
  o.context = t.context;
  o.priority = 0;
  return o;
}

const fmt2 = (x: number) => x.toFixed(2);

export function buildPlan(inp: PlanInput): Plan {
  const p: Plan = {
    version: 1, base: inp.diff.base, head: inp.cur.commit ?? '', mode: '', reason: '',
    stats: { symbols: inp.cur.symbols.length, changes: inp.diff.counts, module_ratio: round2(moduleRatio(inp.diff)), structural_ratio: round2(structuralRatio(inp.diff, Math.max(inp.cur.symbols.length, inp.old.symbols.length))), hops: inp.cfg.plan.hops, propagated_symbols: 0 },
    tasks: [], changed_route_ids: inp.diff.changed_route_ids, changed_routes: inp.diff.changed_routes, changed_files: inp.diff.changed_files,
  };
  const pagesByPath = new Map(inp.pages.map((pg) => [pg.path, pg]));
  if (inp.forceFull) [p.mode, p.reason] = ['full', 'forced (--full)'];
  else if (inp.diff.incompatible) [p.mode, p.reason] = ['full', 'no compatible baseline graph (first compound or graph version change)'];
  else if (p.stats.module_ratio > inp.cfg.plan.rebuild_module_ratio) [p.mode, p.reason] = ['full', `module ratio ${fmt2(p.stats.module_ratio)} > ${fmt2(inp.cfg.plan.rebuild_module_ratio)}`];
  else if (p.stats.structural_ratio > inp.cfg.plan.rebuild_structural_ratio) [p.mode, p.reason] = ['full', `structural change ratio ${fmt2(p.stats.structural_ratio)} > ${fmt2(inp.cfg.plan.rebuild_structural_ratio)}`];
  else [p.mode, p.reason] = ['incremental', 'anchors changed ∪ signature changes propagated along reference edges'];
  const add = (t: Task) => {
    const ex = p.tasks.find((x) => x.page === t.page);
    if (ex) ex.reasons.push(...t.reasons);
    else p.tasks.push(t);
  };
  const rids = routeIDs(inp.facts);
  const featureTask = (rid: string, reasons: Reason[]) =>
    task({ op: pagesByPath.has(featurePage(rid)) ? OpUpdate : OpCreate, kind: 'feature', page: featurePage(rid), title: rid, route_id: rid, write_set: [featurePage(rid)], reasons, context: [...featureSymbols(inp.cur, inp.facts, rid)] });
  const conflictsTask = (reasons: Reason[]) => task({ op: pagesByPath.has(ConflictsPage) ? OpRecheck : OpCreate, kind: 'conflicts', page: ConflictsPage, title: '文档核对', write_set: [ConflictsPage, VerdictsFile], reasons, context: [] });
  const overviewTask = (reasons: Reason[]) => task({ op: pagesByPath.has(OverviewPage) ? OpUpdate : OpCreate, kind: 'overview', page: OverviewPage, title: '总览', write_set: [OverviewPage], reasons, context: [] });
  const anchors = computeAnchors(inp.cur, inp.facts);
  const conceptTask = (page: string, reasons: Reason[]) => {
    const nav = page === NavigationPage;
    return task({ op: pagesByPath.has(page) ? OpUpdate : OpCreate, kind: 'concept', page, title: nav ? '导航与深链' : '共享组件', write_set: [page], reasons, context: [...(nav ? anchors.navigation : anchors.shared)] });
  };
  if (p.mode === 'full') {
    add(conceptTask(NavigationPage, [R('full_rebuild')]));
    add(conceptTask(SharedPage, [R('full_rebuild')]));
    for (const rid of rids) add(featureTask(rid, [R('full_rebuild', undefined, p.reason)]));
    add(overviewTask([R('full_rebuild')]));
    if (inp.hasDocs) add(conflictsTask([R('full_rebuild')]));
    finalize(p);
    return p;
  }
  const klass = new Map<string, Change>();
  const added = new Set<string>();
  for (const c of inp.diff.changes) if (c.class === ClassAdded || c.class === ClassRenamed) added.add(c.id);
  const renamedTo = new Map<string, string>();
  const breaking = new Set<string>();
  for (const c of inp.diff.changes) {
    if (c.class === ClassBody || c.class === ClassSignature) {
      klass.set(c.id, c);
      if (c.class === ClassSignature) breaking.add(c.id);
    } else if (c.class === ClassDeleted) {
      klass.set(c.id, c);
      breaking.add(c.id);
    } else if (c.class === ClassRenamed) {
      klass.set(c.old_id!, c);
      renamedTo.set(c.old_id!, c.id);
      breaking.add(c.old_id!);
    }
  }
  const rev = new Map<string, string[]>();
  for (const g of [inp.cur, inp.old]) {
    for (const s of g.symbols) {
      for (const r of s.refs ?? []) {
        const a = rev.get(r);
        if (a) a.push(s.id);
        else rev.set(r, [s.id]);
      }
    }
  }
  const propagated = new Map<string, string>();
  let frontier = [...breaking].sort(cmpStr);
  const origin = new Map<string, string>(frontier.map((id) => [id, id]));
  for (let hop = 0; hop < inp.cfg.plan.hops; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const caller of rev.get(id) ?? []) {
        if (propagated.has(caller) || breaking.has(caller)) continue;
        propagated.set(caller, origin.get(id)!);
        origin.set(caller, origin.get(id)!);
        next.push(caller);
      }
    }
    frontier = next;
  }
  p.stats.propagated_symbols = propagated.size;
  for (const pg of inp.pages) {
    if (pg.front.generated || !pg.path.startsWith('pages/')) continue;
    const reasons: Reason[] = [];
    for (const a of pg.front.sources ?? []) {
      const c = klass.get(a.sym);
      if (c) {
        if (c.class === ClassRenamed) reasons.push(R('anchor_renamed', a.sym, `renamed to ${c.id} (similarity ${fmt2(c.similarity ?? 0)})`));
        else if (c.class === ClassDeleted) reasons.push(R('anchor_deleted', a.sym));
        else reasons.push(R('anchor_' + c.class + '_changed', a.sym));
        continue;
      }
      const src = propagated.get(a.sym);
      if (src !== undefined) {
        reasons.push(R('signature_propagation', a.sym, 'references changed signature of ' + src));
        continue;
      }
      const s = getSym(inp.cur, a.sym);
      if (!s) reasons.push(R('anchor_missing', a.sym));
      else if (s.hash !== a.hash) reasons.push(R('anchor_drift', a.sym, 'hash differs from page (manual edit or missed run)'));
    }
    let want: string[] = [];
    if (pg.path === NavigationPage) want = anchors.navigation;
    else if (pg.path === SharedPage) want = anchors.shared;
    else if (pg.front.kind === 'feature' && pg.front.routes?.length === 1) want = anchors.feature.get(pg.front.routes[0]!) ?? [];
    const have = new Set((pg.front.sources ?? []).map((a) => a.sym));
    for (const id of want) {
      if (have.has(id)) continue;
      if (added.has(id) || pg.front.kind === 'concept') reasons.push(R('anchor_added', id));
    }
    for (const rid of pg.front.routes ?? []) if (!rids.includes(rid)) reasons.push(R('route_removed', undefined, rid));
    if (reasons.length === 0) continue;
    if (pg.path === ConflictsPage) add(conflictsTask(reasons));
    else if (pg.path === OverviewPage) add(overviewTask(reasons));
    else if (pg.path === NavigationPage || pg.path === SharedPage) add(conceptTask(pg.path, reasons));
    else if (pg.front.kind === 'feature' && pg.front.routes?.length === 1 && rids.includes(pg.front.routes[0]!)) add(featureTask(pg.front.routes[0]!, reasons));
    else {
      const ctx: string[] = [];
      for (const a of pg.front.sources ?? []) {
        const nid = renamedTo.get(a.sym);
        if (nid !== undefined) ctx.push(nid);
        else if (getSym(inp.cur, a.sym)) ctx.push(a.sym);
      }
      const kind = pg.front.kind === 'feature' ? 'feature-removed' : pg.front.kind ?? '';
      add(task({ op: OpUpdate, kind, page: pg.path, title: pg.front.title, write_set: [pg.path], reasons, context: ctx }));
    }
  }
  const covered = new Set<string>();
  for (const pg of inp.pages) for (const rid of pg.front.routes ?? []) covered.add(rid);
  let routesChanged = false;
  for (const rid of rids) {
    if (!covered.has(rid)) {
      add(featureTask(rid, [R('route_added', undefined, rid)]));
      routesChanged = true;
    }
  }
  const ov = pagesByPath.get(OverviewPage);
  if (!ov || routesChanged || !sameSet(ov.front.routes ?? [], rids)) add(overviewTask([R('route_set_changed')]));
  for (const cp of [NavigationPage, SharedPage]) if (!pagesByPath.has(cp)) add(conceptTask(cp, [R('page_missing')]));
  if (inp.hasDocs && !pagesByPath.has(ConflictsPage)) add(conflictsTask([R('docs_unchecked')]));
  if (p.tasks.length === 0 && inp.diff.changes.length === 0) [p.mode, p.reason] = ['noop', 'no symbol changes affect the wiki'];
  finalize(p);
  return p;
}

function kindRank(k: string): number {
  return k === 'feature' ? 0 : k === 'flow' ? 1 : k === 'concept' ? 2 : 3;
}
function changedAnchors(t: Task): number {
  return t.reasons.filter((r) => r.code.startsWith('anchor_') || r.code === 'signature_propagation' || r.code === 'route_added').length;
}

export function rankForLLM(tasks: Task[]): number[] {
  const idx = tasks.map((_, i) => i);
  idx.sort((a, b) => {
    const ta = tasks[a]!, tb = tasks[b]!;
    return kindRank(ta.kind) - kindRank(tb.kind) || changedAnchors(tb) - changedAnchors(ta) || cmpStr(ta.page, tb.page);
  });
  return idx;
}

function finalize(p: Plan): void {
  p.tasks.sort((a, b) => cmpStr(a.page, b.page));
  p.tasks.forEach((t, i) => {
    const slug = t.page.replaceAll('pages/', '').replaceAll('/', '-').replaceAll('.md', '');
    t.id = `t${String(i + 1).padStart(2, '0')}-${slug}`;
  });
  rankForLLM(p.tasks).forEach((i, rank) => (p.tasks[i]!.priority = rank + 1));
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const m = new Set(a);
  return b.every((x) => m.has(x));
}
