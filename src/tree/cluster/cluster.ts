// L3 clustering of one module: Leiden with seed = sha256(module key), then size
// post-processing (3 ≤ |core| ≤ 40), deterministic ids, Jaccard id inheritance
// and deterministic naming.
import { leiden, makeGraph } from './leiden.js';
import type { CoreGraph } from './symgraph.js';
import { cmp, commonDir, dirname, jaccard, kebab, rngFromSeed, sha1, sha256 } from '../util.js';

export interface ClusterOptions {
  gamma: number;
  minCore: number;
  maxCore: number;
}

/** Partition of the given core ids into clusters (each sorted; clusters sorted by first id). */
export function partitionModule(moduleKey: string, coreIds: string[], cg: CoreGraph, opt: ClusterOptions): string[][] {
  const ids = coreIds.slice().sort(cmp);
  if (ids.length <= opt.minCore) return ids.length ? [ids] : [];
  const ix = new Map(ids.map((id, i) => [id, i]));
  const weight = (a: string, b: string) => cg.edges.get(a < b ? a + '\u0000' + b : b + '\u0000' + a) ?? 0;
  const adj = new Map<string, Map<string, number>>();
  for (const id of ids) adj.set(id, new Map());
  for (const [k, w] of cg.edges) {
    const [a, b] = k.split('\u0000') as [string, string];
    if (!ix.has(a) || !ix.has(b)) continue;
    adj.get(a)!.set(b, w);
    adj.get(b)!.set(a, w);
  }
  const run = (members: string[], gamma: number, salt: string): string[][] => {
    const local = new Map(members.map((id, i) => [id, i]));
    const edges: [number, number, number][] = [];
    for (const a of members) for (const [b, w] of adj.get(a)!) if (a < b && local.has(b)) edges.push([local.get(a)!, local.get(b)!, w]);
    const part = leiden(makeGraph(members.length, edges), { gamma, rng: rngFromSeed(sha256(moduleKey + salt)) });
    const groups = new Map<number, string[]>();
    part.forEach((c, i) => {
      let g = groups.get(c);
      if (!g) groups.set(c, (g = []));
      g.push(members[i]!);
    });
    return [...groups.values()];
  };
  let clusters = run(ids, opt.gamma, '');

  // split oversize clusters: raise resolution, then fall back to directory-ordered chunks
  const splitBig = (cs: string[][], depth: number): string[][] => {
    const out: string[][] = [];
    for (const c of cs) {
      if (c.length <= opt.maxCore) {
        out.push(c);
        continue;
      }
      let parts: string[][] = [];
      for (let k = 1; k <= 3 && parts.length < 2; k++) parts = run(c.slice().sort(cmp), opt.gamma * 2 ** k, `#${depth}.${k}`);
      if (parts.length < 2 || depth > 6) {
        const ord = c.slice().sort((a, b) => cmp(cg.coreFile.get(a)!, cg.coreFile.get(b)!) || cmp(a, b));
        const n = Math.ceil(ord.length / opt.maxCore);
        const size = Math.ceil(ord.length / n);
        parts = [];
        for (let i = 0; i < ord.length; i += size) parts.push(ord.slice(i, i + size));
        out.push(...parts);
      } else out.push(...splitBig(parts, depth + 1));
    }
    return out;
  };
  clusters = splitBig(clusters, 0).map((c) => c.sort(cmp));

  // merge undersize clusters into their most connected neighbor (ties → smaller first id)
  const keyOf = (c: string[]) => c[0]!;
  for (let guard = 0; guard < 10000; guard++) {
    clusters.sort((a, b) => a.length - b.length || cmp(keyOf(a), keyOf(b)));
    const small = clusters.findIndex((c) => c.length < opt.minCore && !(c as Tagged).isolated);
    if (small < 0) break;
    const c = clusters[small]!;
    let best = -1;
    let bw = 0;
    for (let j = 0; j < clusters.length; j++) {
      if (j === small) continue;
      const d = clusters[j]!;
      if (d.length + c.length > opt.maxCore) continue;
      let w = 0;
      for (const a of c) for (const b of d) w += weight(a, b);
      if (w > bw || (w === bw && w > 0 && best >= 0 && cmp(keyOf(d), keyOf(clusters[best]!)) < 0)) {
        best = j;
        bw = w;
      }
    }
    if (best < 0) {
      (c as Tagged).isolated = true;
      continue;
    }
    const merged = [...clusters[best]!, ...c].sort(cmp);
    clusters = clusters.filter((_, j) => j !== small && j !== best);
    clusters.push(merged);
  }
  const isolated = clusters.filter((c) => (c as Tagged).isolated);
  clusters = clusters.filter((c) => !(c as Tagged).isolated);
  const iso = isolated.flat().sort(cmp);
  if (iso.length) {
    if (iso.length >= opt.minCore || !clusters.length) {
      for (let i = 0; i < iso.length; i += opt.maxCore) clusters.push(iso.slice(i, i + opt.maxCore));
    } else {
      // join the largest cluster in the same directory, else the smallest cluster with room
      for (const id of iso) {
        const dir = dirname(cg.coreFile.get(id)!);
        let target = clusters
          .filter((c) => c.length < opt.maxCore && c.some((x) => dirname(cg.coreFile.get(x)!) === dir))
          .sort((a, b) => b.length - a.length || cmp(a[0]!, b[0]!))[0];
        target ??= clusters.slice().sort((a, b) => a.length - b.length || cmp(a[0]!, b[0]!))[0]!;
        target.push(id);
        target.sort(cmp);
      }
    }
  }
  return clusters.map((c) => c.slice().sort(cmp)).sort((a, b) => cmp(a[0]!, b[0]!));
}

type Tagged = string[] & { isolated?: boolean };

/** c- + sha1(first 3 sorted core ids + common directory)[:8] */
export function clusterId(core: string[], files: string[]): string {
  const ids = core.slice().sort(cmp).slice(0, 3);
  return 'c-' + sha1(ids.join('\n') + '|' + commonDir(files)).slice(0, 8);
}

export function membersHash(core: string[]): string {
  return sha256(core.slice().sort(cmp).join('\n'));
}

export interface PrevCluster {
  id: string;
  core: string[];
  slug?: string;
  title?: string;
  title_source?: 'det' | 'llm' | 'user';
  page?: string;
}

/**
 * Greedy one-to-one Jaccard matching (≥ threshold) of new clusters against previous ones.
 * Returns new-index → prev cluster. Pairs are taken in descending Jaccard, ties by ids.
 */
export function matchPrev(next: string[][], prev: PrevCluster[], threshold = 0.5): Map<number, PrevCluster> {
  const pairs: [number, number, number][] = [];
  const ps = prev.map((p) => new Set(p.core));
  next.forEach((c, i) => {
    const s = new Set(c);
    ps.forEach((p, j) => {
      const jac = jaccard(s, p);
      if (jac >= threshold) pairs.push([jac, i, j]);
    });
  });
  pairs.sort((a, b) => b[0] - a[0] || a[1] - b[1] || cmp(prev[a[2]]!.id, prev[b[2]]!.id));
  const usedN = new Set<number>(), usedP = new Set<number>();
  const out = new Map<number, PrevCluster>();
  for (const [, i, j] of pairs) {
    if (usedN.has(i) || usedP.has(j)) continue;
    usedN.add(i);
    usedP.add(j);
    out.set(i, prev[j]!);
  }
  return out;
}

const GENERIC = new Set([
  'src', 'main', 'java', 'kotlin', 'swift', 'ets', 'sources', 'source', 'lib', 'impl', 'internal', 'api', 'com', 'org', 'io', 'net', 'app', 'common', 'core', 'ui', 'view', 'views', 'pages', 'components', 'model', 'models', 'util', 'utils', 'kotlinmultiplatform', 'commonmain', 'androidmain', 'iosmain', 'debug', 'release', 'test', 'tests', 'androidtest',
]);

/** Candidate default slugs: a distinctive common directory (if any) and the highest-PageRank type name. */
export function slugCandidates(core: string[], cg: CoreGraph, moduleRoots: string[], pr: Map<string, number>): { dir?: string; type: string } {
  const files = core.map((c) => cg.coreFile.get(c)!);
  const cd = commonDir(files);
  const rootLen = Math.max(0, ...moduleRoots.filter((r) => cd === r || cd.startsWith(r + '/') || r === '').map((r) => r.length));
  const rel = cd.slice(rootLen).split('/').filter(Boolean);
  const last = rel[rel.length - 1];
  let dir: string | undefined;
  if (last && !GENERIC.has(last.toLowerCase())) {
    const s = kebab(last);
    if (s && !GENERIC.has(s)) dir = s;
  }
  // prefer types over functions for the name
  let top: string | undefined;
  for (const c of core) {
    const isType = !['function', 'composable', 'method', 'func'].includes(cg.sym.get(c)?.kind ?? '');
    const t = top === undefined ? undefined : !['function', 'composable', 'method', 'func'].includes(cg.sym.get(top)?.kind ?? '');
    if (top === undefined || (isType && !t) || (isType === t && (pr.get(c) ?? 0) > (pr.get(top) ?? 0) + 1e-15)) top = c;
  }
  return { dir, type: kebab(cg.sym.get(top!)?.name ?? 'cluster') || 'cluster' };
}

/** Deterministic default slug: distinctive common directory, else the highest-PageRank type name. */
export function defaultSlug(core: string[], cg: CoreGraph, moduleRoots: string[], pr: Map<string, number>): string {
  const c = slugCandidates(core, cg, moduleRoots, pr);
  return c.dir ?? c.type;
}

export function humanize(slug: string): string {
  const s = slug.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
