// Core-symbol selection and the weighted core-level graph used for L3 clustering
// (design-v2 §2.3): w = 3·ref/call + 2·inherit + 2·route + 1·import + 0.5·same_file,
// plus +0.5 on existing edges whose endpoints share a directory.
import type { Facts, Graph, GraphSymbol } from '../types.js';
import { cmp, dirname } from '../util.js';

export const W_REF = 3;
export const W_INHERIT = 2;
export const W_ROUTE = 2;
export const W_IMPORT = 1;
export const W_SAME_FILE = 0.5;
export const W_SAME_DIR = 0.5;
export const WeightsLabel = '3/2/2/1/0.5';

const TYPE_KINDS = new Set(['class', 'struct', 'interface', 'enum', 'object', 'protocol', 'component', 'actor', 'trait', 'record', 'annotation']);
const FUNC_KINDS = new Set(['function', 'composable', 'func', 'method']);

export interface CoreGraph {
  /** module key → sorted core symbol ids */
  core: Map<string, string[]>;
  /** any symbol id → owning core id (absent when it has no owner) */
  owner: Map<string, string>;
  /** core id → module key */
  coreModule: Map<string, string>;
  /** core id → file */
  coreFile: Map<string, string>;
  /** core id → symbol */
  sym: Map<string, GraphSymbol>;
  /** undirected weighted edges between core ids, key = a + '\u0000' + b with a < b */
  edges: Map<string, number>;
  /** route ids per core id */
  routes: Map<string, string[]>;
}

export function edgeKey(a: string, b: string): string {
  return a < b ? a + '\u0000' + b : b + '\u0000' + a;
}

/** Selects core symbols of one module: types (+ top-level functions when OOP is rare, + composables always). */
export function selectCore(tops: GraphSymbol[]): GraphSymbol[] {
  const types = tops.filter((s) => TYPE_KINDS.has(s.kind));
  const funcs = tops.filter((s) => FUNC_KINDS.has(s.kind));
  const rare = types.length < 20 || types.length < 0.2 * (types.length + funcs.length);
  return tops.filter((s) => TYPE_KINDS.has(s.kind) || s.kind === 'composable' || (rare && FUNC_KINDS.has(s.kind)));
}

function inherits(sig: string, name: string): boolean {
  // `class A : B, C`, `class A extends B implements C`, `struct V: View`, `enum E: String, Codable`
  const m = /(?::|\bextends\b|\bimplements\b)([^{=]*)/.exec(sig);
  if (!m) return false;
  return new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(m[1]!);
}

export function buildCoreGraph(graph: Graph, fileModule: Map<string, string>, facts?: Facts | null): CoreGraph {
  // canonical order: results (incl. floating-point weight sums) never depend on scanner output order
  const symbols = graph.symbols.slice().sort((a, b) => cmp(a.id, b.id) || a.start_line - b.start_line || cmp(a.kind, b.kind) || cmp(a.hash, b.hash));
  const byId = new Map<string, GraphSymbol>();
  for (const s of symbols) byId.set(s.id, s);
  const tops = new Map<string, GraphSymbol[]>(); // module → top-level symbols
  for (const s of symbols) {
    if (s.parent) continue;
    const m = fileModule.get(s.file);
    if (!m) continue;
    let xs = tops.get(m);
    if (!xs) tops.set(m, (xs = []));
    xs.push(s);
  }
  const core = new Map<string, string[]>();
  const coreModule = new Map<string, string>();
  const coreFile = new Map<string, string>();
  const sym = new Map<string, GraphSymbol>();
  const owner = new Map<string, string>();
  for (const [m, xs] of [...tops.entries()].sort((a, b) => cmp(a[0], b[0]))) {
    const cs = selectCore(xs);
    const ids = cs.map((s) => s.id).sort(cmp);
    core.set(m, ids);
    const byName = new Map<string, string>();
    const byFile = new Map<string, GraphSymbol[]>();
    for (const s of cs) {
      coreModule.set(s.id, m);
      coreFile.set(s.id, s.file);
      sym.set(s.id, s);
      owner.set(s.id, s.id);
      if (!byName.has(s.name)) byName.set(s.name, s.id);
      let f = byFile.get(s.file);
      if (!f) byFile.set(s.file, (f = []));
      f.push(s);
    }
    // non-core top-level symbols: extension → same-name type; else nearest preceding core in the same file
    for (const s of xs) {
      if (owner.has(s.id)) continue;
      const t = byName.get(s.name);
      if (t && (s.kind === 'extension' || s.kind === 'type')) {
        owner.set(s.id, t);
        continue;
      }
      const inFile = byFile.get(s.file);
      if (!inFile?.length) continue;
      let best = inFile[0]!;
      for (const c of inFile) if (c.start_line <= s.start_line && c.start_line >= best.start_line) best = c;
      owner.set(s.id, best.id);
    }
  }
  // members follow their parent chain
  const ownerOf = (id: string): string | undefined => {
    const o = owner.get(id);
    if (o !== undefined) return o;
    let s = byId.get(id);
    let guard = 0;
    while (s?.parent && guard++ < 32) {
      const p = owner.get(s.parent);
      if (p !== undefined) {
        owner.set(id, p);
        return p;
      }
      s = byId.get(s.parent);
    }
    return undefined;
  };
  for (const s of symbols) ownerOf(s.id);

  const edges = new Map<string, number>();
  const add = (a: string, b: string, w: number) => {
    if (a === b) return;
    const k = edgeKey(a, b);
    edges.set(k, (edges.get(k) ?? 0) + w);
  };
  // reference / inheritance edges
  for (const s of symbols) {
    if (!s.refs?.length) continue;
    const a = owner.get(s.id);
    if (!a) continue;
    for (const r of s.refs.slice().sort(cmp)) {
      const b = owner.get(r);
      if (!b || b === a) continue;
      const t = byId.get(r);
      const isInherit = !s.parent && sym.has(a) && t && !t.parent && TYPE_KINDS.has(t.kind) && inherits(s.signature, t.name);
      add(a, b, isInherit ? W_INHERIT : W_REF);
    }
  }
  // import edges: file F imports Name → core type Name of the same module, linked to F's cores
  const fileCores = new Map<string, string[]>();
  for (const [id, f] of coreFile) {
    let xs = fileCores.get(f);
    if (!xs) fileCores.set(f, (xs = []));
    xs.push(id);
  }
  const nameIndex = new Map<string, Map<string, string | null>>(); // module → name → id (null = ambiguous)
  for (const [id, m] of coreModule) {
    let mm = nameIndex.get(m);
    if (!mm) nameIndex.set(m, (mm = new Map()));
    const n = sym.get(id)!.name;
    mm.set(n, mm.has(n) ? null : id);
  }
  for (const f of Object.keys(graph.files).sort(cmp)) {
    const info = graph.files[f]!;
    const m = fileModule.get(f);
    const fc = fileCores.get(f);
    if (!m || !fc?.length || !info.imports?.length) continue;
    const idx = nameIndex.get(m);
    if (!idx) continue;
    for (const imp of info.imports) {
      const name = imp.split('|')[0]!.split('.').pop()!;
      const t = idx.get(name);
      if (!t) continue;
      for (const c of fc) add(c, t, W_IMPORT / Math.max(1, fc.length > 4 ? fc.length / 4 : 1));
    }
  }
  // same-file edges (pairwise up to 8 cores, otherwise a chain in source order)
  for (const [, ids] of fileCores) {
    if (ids.length < 2) continue;
    const ord = ids.slice().sort((x, y) => sym.get(x)!.start_line - sym.get(y)!.start_line || cmp(x, y));
    if (ord.length <= 8) {
      for (let i = 0; i < ord.length; i++) for (let j = i + 1; j < ord.length; j++) add(ord[i]!, ord[j]!, W_SAME_FILE);
    } else for (let i = 1; i < ord.length; i++) add(ord[i - 1]!, ord[i]!, W_SAME_FILE);
  }
  // route ownership + navigation edges between route pages
  const routes = new Map<string, string[]>();
  const routeOwner = new Map<string, string>();
  const routeList = (facts?.routes ?? []).slice().sort((a, b) => cmp(a.route_id, b.route_id) || cmp(a.symbol, b.symbol));
  for (const r of routeList) {
    const o = owner.get(r.symbol);
    if (!o) continue;
    routeOwner.set(r.route_id, o);
    let xs = routes.get(o);
    if (!xs) routes.set(o, (xs = []));
    if (!xs.includes(r.route_id)) xs.push(r.route_id);
  }
  for (const xs of routes.values()) xs.sort(cmp);
  for (const e of (facts?.navigation ?? []).slice().sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to))) {
    const a = routeOwner.get(e.from);
    const b = routeOwner.get(e.to);
    if (a && b) add(a, b, W_ROUTE);
  }
  // same-directory bonus on existing edges
  for (const [k, w] of edges) {
    const [a, b] = k.split('\u0000') as [string, string];
    if (dirname(coreFile.get(a)!) === dirname(coreFile.get(b)!)) edges.set(k, w + W_SAME_DIR);
  }
  return { core, owner, coreModule, coreFile, sym, edges, routes };
}

/** PageRank over the core graph (weighted, undirected), 30 iterations, damping 0.85. */
export function pageRank(cg: CoreGraph): Map<string, number> {
  const ids = [...cg.coreModule.keys()].sort(cmp);
  const ix = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const nb: [number, number][][] = Array.from({ length: n }, () => []);
  const deg = new Array<number>(n).fill(0);
  for (const [k, w] of cg.edges) {
    const [a, b] = k.split('\u0000') as [string, string];
    const i = ix.get(a)!, j = ix.get(b)!;
    nb[i]!.push([j, w]);
    nb[j]!.push([i, w]);
    deg[i]! += w;
    deg[j]! += w;
  }
  let pr = new Array<number>(n).fill(1 / Math.max(1, n));
  for (let it = 0; it < 30; it++) {
    const next = new Array<number>(n).fill((1 - 0.85) / Math.max(1, n));
    let dangling = 0;
    for (let i = 0; i < n; i++) {
      if (deg[i] === 0) {
        dangling += pr[i]!;
        continue;
      }
      for (const [j, w] of nb[i]!) next[j]! += (0.85 * pr[i]! * w) / deg[i]!;
    }
    for (let i = 0; i < n; i++) next[i]! += (0.85 * dangling) / Math.max(1, n);
    pr = next;
  }
  return new Map(ids.map((id, i) => [id, pr[i]!]));
}
