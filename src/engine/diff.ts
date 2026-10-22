// Graph diff: unchanged / body / signature / added / deleted / renamed.
import path from 'node:path';
import fs from 'node:fs';
import { GraphVersion, type Graph, type Route, type Symbol, type TestID, type Facts, getSym, reindexGraph } from '../model.js';
import { similarity } from '../extract/hash.js';
import { cmpStr } from '../util/go.js';
import { childrenOf, parityDepth, reach, round2, sortedKeys } from './graphutil.js';
import { featureSymbols, routeIDs } from './anchors.js';

export const ClassUnchanged = 'unchanged';
export const ClassBody = 'body';
export const ClassSignature = 'signature';
export const ClassAdded = 'added';
export const ClassDeleted = 'deleted';
export const ClassRenamed = 'renamed';

export interface Change {
  class: string;
  id: string;
  old_id?: string;
  kind: string;
  file: string;
  similarity?: number;
  old_hash?: string;
  new_hash?: string;
}

export interface RouteChange {
  route_id: string;
  platforms: string[];
  reasons: string[];
  symbols?: string[];
}

export interface Diff {
  base: string;
  head: string;
  counts: Record<string, number>;
  changes: Change[];
  modules_total: number;
  modules_changed: string[];
  changed_files: string[];
  changed_route_ids: string[];
  changed_routes: RouteChange[];
  incompatible?: boolean;
}

export const RenameThreshold = 0.8;

function change(c: Change): Change {
  const o: Change = { class: c.class, id: c.id } as Change;
  if (c.old_id) o.old_id = c.old_id;
  o.kind = c.kind;
  o.file = c.file;
  if (c.similarity) o.similarity = c.similarity;
  if (c.old_hash) o.old_hash = c.old_hash;
  if (c.new_hash) o.new_hash = c.new_hash;
  return o;
}

export function diffGraphs(old: Graph | null, cur: Graph): Diff {
  const d: Diff = { base: '', head: cur.commit ?? '', counts: {}, changes: [], modules_total: 0, modules_changed: [], changed_files: [], changed_route_ids: [], changed_routes: [] };
  if (!old || old.version !== GraphVersion) {
    d.incompatible = true;
    old = { version: 0, symbols: [], files: {}, parse_failures: [] };
  } else d.base = old.commit ?? '';
  reindexGraph(old);
  reindexGraph(cur);
  const inc = (k: string) => (d.counts[k] = (d.counts[k] ?? 0) + 1);
  const added: Symbol[] = [], deleted: Symbol[] = [];
  for (const s of cur.symbols) {
    const o = getSym(old, s.id);
    if (!o) added.push(s);
    else if (o.sig_hash !== s.sig_hash) d.changes.push(change({ class: ClassSignature, id: s.id, kind: s.kind, file: s.file, old_hash: o.hash, new_hash: s.hash }));
    else if (o.hash !== s.hash) d.changes.push(change({ class: ClassBody, id: s.id, kind: s.kind, file: s.file, old_hash: o.hash, new_hash: s.hash }));
    else inc(ClassUnchanged);
  }
  for (const s of old.symbols) if (!getSym(cur, s.id)) deleted.push(s);
  const usedA = new Set<string>();
  const remaining: Symbol[] = [];
  for (const o of deleted) {
    let best: Symbol | undefined;
    let bestSim = 0;
    for (const a of added) {
      if (usedA.has(a.id) || a.kind !== o.kind || a.platform !== o.platform) continue;
      let sim = 0;
      if (a.norm_hash === o.norm_hash) sim = 1;
      else if (a.file === o.file || path.posix.dirname(a.file) === path.posix.dirname(o.file)) sim = similarity(a.simhash, o.simhash);
      if (sim > bestSim) {
        best = a;
        bestSim = sim;
      }
    }
    if (best && bestSim >= RenameThreshold) {
      usedA.add(best.id);
      d.changes.push(change({ class: ClassRenamed, id: best.id, old_id: o.id, kind: o.kind, file: best.file, similarity: round2(bestSim), old_hash: o.hash, new_hash: best.hash }));
      continue;
    }
    remaining.push(o);
  }
  for (const a of added) if (!usedA.has(a.id)) d.changes.push(change({ class: ClassAdded, id: a.id, kind: a.kind, file: a.file, new_hash: a.hash }));
  for (const o of remaining) d.changes.push(change({ class: ClassDeleted, id: o.id, kind: o.kind, file: o.file, old_hash: o.hash }));
  d.changes.sort((a, b) => cmpStr(a.class, b.class) || cmpStr(a.id, b.id));
  for (const c of d.changes) inc(c.class);
  const mods = new Set<string>();
  const changedMods = new Set<string>();
  for (const f of Object.keys(cur.files)) mods.add(path.posix.dirname(f));
  for (const f of Object.keys(old.files)) mods.add(path.posix.dirname(f));
  const files = new Set<string>();
  for (const [f, fi] of Object.entries(cur.files)) {
    const ofi = old.files[f];
    if (!ofi || ofi.hash !== fi.hash) files.add(f);
  }
  for (const f of Object.keys(old.files)) if (!cur.files[f]) files.add(f);
  for (const c of d.changes) changedMods.add(path.posix.dirname(c.file));
  d.changed_files = [...files].sort(cmpStr);
  d.modules_changed = [...changedMods].sort(cmpStr);
  d.modules_total = mods.size;
  const counts: Record<string, number> = {};
  for (const k of Object.keys(d.counts).sort(cmpStr)) counts[k] = d.counts[k]!;
  d.counts = counts;
  return d;
}

export function structuralRatio(d: Diff, total: number): number {
  if (total === 0) return 0;
  const c = d.counts;
  return ((c[ClassAdded] ?? 0) + (c[ClassDeleted] ?? 0) + (c[ClassRenamed] ?? 0) + (c[ClassSignature] ?? 0)) / total;
}

export function moduleRatio(d: Diff): number {
  return d.modules_total === 0 ? 0 : d.modules_changed.length / d.modules_total;
}

export function loadRoutes(wikiDir: string): Route[] | null {
  try {
    return (JSON.parse(fs.readFileSync(path.join(wikiDir, 'facts', 'routes.json'), 'utf8')).routes as Route[]) ?? null;
  } catch {
    return null;
  }
}

export function loadTestIDs(wikiDir: string): TestID[] | null {
  try {
    return (JSON.parse(fs.readFileSync(path.join(wikiDir, 'facts', 'testids.json'), 'utf8')).testids as TestID[]) ?? null;
  } catch {
    return null;
  }
}

/** Fill changed_route_ids / changed_routes (e2epilot contract). */
export function computeImpact(d: Diff, old: Graph | null, cur: Graph, oldRoutes: Route[] | null, oldTids: TestID[] | null, f: Facts): void {
  const changed = new Set<string>();
  for (const c of d.changes) {
    changed.add(c.id);
    if (c.old_id) changed.add(c.old_id);
  }
  const res = new Map<string, { plats: Set<string>; reasons: Set<string>; syms: Set<string> }>();
  const mark = (rid: string, plat: string, reason: string, sym: string) => {
    let a = res.get(rid);
    if (!a) {
      a = { plats: new Set(), reasons: new Set(), syms: new Set() };
      res.set(rid, a);
    }
    a.plats.add(plat);
    a.reasons.add(reason);
    if (sym) a.syms.add(sym);
  };
  const check = (g: Graph | null, routes: Route[] | null) => {
    if (!g || g.symbols.length === 0) return;
    const children = childrenOf(g);
    for (const r of routes ?? []) {
      if (!getSym(g, r.symbol)) continue;
      for (const id of reach(g, children, r.symbol, parityDepth)) if (changed.has(id)) mark(r.route_id, r.platform, 'symbol_changed', id);
    }
  };
  check(cur, f.routes);
  check(old, oldRoutes);
  for (const rid of routeIDs(f)) {
    for (const id of featureSymbols(cur, f, rid)) {
      if (changed.has(id)) {
        const s = getSym(cur, id);
        if (s) mark(rid, s.platform, 'symbol_changed', id);
      }
    }
  }
  if (oldRoutes) {
    const key = (r: Route) => r.platform + '\0' + r.route_id;
    const om = new Map<string, Route>();
    for (const r of oldRoutes) om.set(key(r), r);
    const nm = new Map<string, Route>();
    for (const r of f.routes ?? []) {
      nm.set(key(r), r);
      const o = om.get(key(r));
      if (!o) mark(r.route_id, r.platform, 'route_added', '');
      else if (o.pattern !== r.pattern || o.deeplink !== r.deeplink || o.symbol !== r.symbol) mark(r.route_id, r.platform, 'route_changed', '');
    }
    for (const [k, r] of om) if (!nm.has(k)) mark(r.route_id, r.platform, 'route_removed', '');
  }
  if (oldTids) {
    const set = (ts: TestID[]) => new Set(ts.filter((t) => t.route_id).map((t) => t.platform + '\0' + t.route_id + '\0' + t.tid));
    const a = set(oldTids), b = set(f.testids ?? []);
    for (const t of f.testids ?? []) if (t.route_id && !a.has(t.platform + '\0' + t.route_id + '\0' + t.tid)) mark(t.route_id, t.platform, 'testid_changed', '');
    for (const t of oldTids) if (t.route_id && !b.has(t.platform + '\0' + t.route_id + '\0' + t.tid)) mark(t.route_id, t.platform, 'testid_changed', '');
  }
  d.changed_route_ids = [...res.keys()].sort(cmpStr);
  d.changed_routes = d.changed_route_ids.map((rid) => {
    const a = res.get(rid)!;
    const rc: RouteChange = { route_id: rid, platforms: sortedKeys(a.plats), reasons: sortedKeys(a.reasons) };
    if (a.syms.size) rc.symbols = sortedKeys(a.syms);
    return rc;
  });
}
