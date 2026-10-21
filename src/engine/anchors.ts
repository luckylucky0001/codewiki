// Anchor partition: per-feature anchors, shared components, navigation infra.
import type { Facts, Graph } from '../model.js';
import { getSym } from '../model.js';
import { cmpStr } from '../util/go.js';
import { childrenOf, containerKinds, sortedKeys } from './graphutil.js';

export const NavigationPage = 'pages/concepts/navigation.md';
export const SharedPage = 'pages/concepts/shared-components.md';
export const SharedThreshold = 3;
const perPlatformAnchors = 12;
const maxConceptAnchors = 40;
const featureDepth = 2;
const navRe = /(route|router|navhost|navigation|destination|deeplink|pathstack|testparams)/i;

export interface AnchorSets {
  feature: Map<string, string[]>;
  shared: string[];
  navigation: string[];
  usedBy: Map<string, string[]>;
}

export function routeIDs(f: Facts): string[] {
  return [...new Set((f.routes ?? []).map((r) => r.route_id))].sort(cmpStr);
}

const cache = new WeakMap<Graph, WeakMap<Facts, AnchorSets>>();

export function computeAnchors(g: Graph, f: Facts): AnchorSets {
  let m = cache.get(g);
  if (!m) {
    m = new WeakMap();
    cache.set(g, m);
  }
  let a = m.get(f);
  if (!a) {
    a = compute(g, f);
    m.set(f, a);
  }
  return a;
}

export function featureSymbols(g: Graph, f: Facts, rid: string): string[] {
  return computeAnchors(g, f).feature.get(rid) ?? [];
}

function compute(g: Graph, f: Facts): AnchorSets {
  const children = childrenOf(g);
  const owned = new Set<string>();
  const cands: { rid: string; ids: string[] }[] = [];
  const count = new Map<string, Set<string>>();
  for (const r of f.routes ?? []) {
    if (!getSym(g, r.symbol)) continue;
    owned.add(r.symbol);
    for (const c of children.get(r.symbol) ?? []) owned.add(c);
    const [ids, touched] = bfsFeature(g, children, r.symbol, r.route_id);
    cands.push({ rid: r.route_id, ids });
    for (const id of [...ids, ...touched]) {
      let s = count.get(id);
      if (!s) {
        s = new Set();
        count.set(id, s);
      }
      s.add(r.route_id);
    }
  }
  const shared = new Set<string>();
  for (const [id, rids] of count) if (rids.size >= SharedThreshold && !owned.has(id)) shared.add(id);
  const nav = new Set<string>();
  for (const s of g.symbols) if (navRe.test(s.qual) && !owned.has(s.id)) nav.add(s.id);
  const a: AnchorSets = { feature: new Map(), shared: [], navigation: [], usedBy: new Map() };
  for (const [id, rids] of count) a.usedBy.set(id, sortedKeys(rids));
  const perPlat = new Map<string, Map<string, number>>();
  for (const c of cands) {
    const cur = a.feature.get(c.rid) ?? [];
    const set = new Set(cur);
    let pp = perPlat.get(c.rid);
    if (!pp) {
      pp = new Map();
      perPlat.set(c.rid, pp);
    }
    for (const id of c.ids) {
      const s = getSym(g, id)!;
      if (set.has(id) || shared.has(id) || (nav.has(id) && !owned.has(id)) || (pp.get(s.platform) ?? 0) >= perPlatformAnchors) continue;
      set.add(id);
      pp.set(s.platform, (pp.get(s.platform) ?? 0) + 1);
      cur.push(id);
    }
    a.feature.set(c.rid, cur);
  }
  for (const [rid, ids] of a.feature) a.feature.set(rid, ids.sort(cmpStr));
  const inFeature = new Set<string>();
  for (const ids of a.feature.values()) for (const id of ids) inFeature.add(id);
  const sharedPage = new Set<string>();
  for (const id of shared) {
    if (nav.has(id)) continue;
    sharedPage.add(id);
    const s = getSym(g, id);
    if (s && containerKinds.has(s.kind)) for (const c of children.get(id) ?? []) if (!inFeature.has(c) && !owned.has(c) && !nav.has(c)) sharedPage.add(c);
  }
  a.navigation = capSorted(g, [...nav]);
  a.shared = capSorted(g, [...sharedPage]);
  return a;
}

function capSorted(g: Graph, ids: string[]): string[] {
  ids.sort(cmpStr);
  if (ids.length > maxConceptAnchors) {
    const inn = new Map<string, number>();
    for (const s of g.symbols) for (const r of s.refs ?? []) inn.set(r, (inn.get(r) ?? 0) + 1);
    ids.sort((x, y) => (inn.get(y) ?? 0) - (inn.get(x) ?? 0));
    ids = ids.slice(0, maxConceptAnchors).sort(cmpStr);
  }
  return ids;
}

function bfsFeature(g: Graph, children: Map<string, string[]>, root: string, rid: string): [string[], string[]] {
  let stem = rid.split('_')[0] ?? '';
  if (stem) stem = stem[0]!.toUpperCase() + stem.slice(1);
  const seen = new Set<string>();
  const out: string[] = [], touched: string[] = [];
  const queue: [string, number][] = [[root, 0]];
  for (let i = 0; i < queue.length; i++) {
    const [id, depth] = queue[i]!;
    if (seen.has(id)) continue;
    seen.add(id);
    const s = getSym(g, id);
    if (!s) continue;
    if (!containerKinds.has(s.kind) || id === root) out.push(s.id);
    if (id === root) for (const c of children.get(s.id) ?? []) queue.push([c, 0]);
    if (depth >= featureDepth) continue;
    for (const ref of s.refs ?? []) {
      const rs = getSym(g, ref);
      if (!rs || rs.platform !== s.platform) continue;
      if (containerKinds.has(rs.kind)) {
        if (depth === 0 && (id === root || rs.name.startsWith(stem))) for (const c of children.get(rs.id) ?? []) queue.push([c, 1]);
        else touched.push(rs.id);
        continue;
      }
      queue.push([ref, depth + 1]);
    }
  }
  return [out, touched];
}
