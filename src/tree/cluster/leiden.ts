// Deterministic Leiden community detection (Traag et al. 2019) on a weighted
// undirected graph: fast local moving → refinement (well-connected greedy merges
// inside each community) → aggregation on the refined partition, repeated until
// stable. Randomness only comes from the seeded rng (node visiting order), so the
// same graph + seed always yields the same partition. Quality = modularity with
// resolution gamma (CPM-free variant used by CodeWiki-style clustering).

export interface WGraph {
  /** neighbor lists (no self loops), symmetric */
  nb: number[][];
  /** weights parallel to nb */
  w: number[][];
  /** node strength (sum of incident weights in the original graph, aggregated) */
  k: number[];
}

export function makeGraph(n: number, edges: [number, number, number][]): WGraph {
  const maps: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  for (const [a, b, w] of edges) {
    if (a === b || !(w > 0)) continue;
    maps[a]!.set(b, (maps[a]!.get(b) ?? 0) + w);
    maps[b]!.set(a, (maps[b]!.get(a) ?? 0) + w);
  }
  const nb: number[][] = [];
  const w: number[][] = [];
  const k: number[] = [];
  for (const m of maps) {
    const keys = [...m.keys()].sort((x, y) => x - y);
    nb.push(keys);
    const ws = keys.map((x) => m.get(x)!);
    w.push(ws);
    k.push(ws.reduce((s, x) => s + x, 0));
  }
  return { nb, w, k };
}

export interface LeidenOptions {
  gamma?: number;
  rng: () => number;
  maxLevels?: number;
}

function order(n: number, rng: () => number): number[] {
  const xs = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = xs[i]!;
    xs[i] = xs[j]!;
    xs[j] = t;
  }
  return xs;
}

const EPS = 1e-12;

/** Fast local moving (queue based). Mutates comm; returns true if any node moved. */
function moveNodes(g: WGraph, comm: number[], m2: number, gamma: number, rng: () => number): boolean {
  const n = g.k.length;
  const tot = new Array<number>(n).fill(0);
  const size = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    tot[comm[i]!]! += g.k[i]!;
    size[comm[i]!]!++;
  }
  const empty: number[] = [];
  for (let c = n - 1; c >= 0; c--) if (size[c] === 0) empty.push(c);
  const queue = order(n, rng);
  const inQ = new Array<boolean>(n).fill(true);
  let head = 0;
  let moved = false;
  const wc = new Map<number, number>();
  while (head < queue.length) {
    const i = queue[head++]!;
    inQ[i] = false;
    const ci = comm[i]!;
    wc.clear();
    const nb = g.nb[i]!, ws = g.w[i]!;
    for (let e = 0; e < nb.length; e++) {
      const c = comm[nb[e]!]!;
      wc.set(c, (wc.get(c) ?? 0) + ws[e]!);
    }
    const ki = g.k[i]!;
    tot[ci]! -= ki;
    size[ci]!--;
    let best = ci;
    let bestGain = (wc.get(ci) ?? 0) - (gamma * ki * tot[ci]!) / m2;
    for (const [c, w] of wc) {
      if (c === ci) continue;
      const gain = w - (gamma * ki * tot[c]!) / m2;
      if (gain > bestGain + EPS || (Math.abs(gain - bestGain) <= EPS && c < best && best !== ci)) {
        best = c;
        bestGain = gain;
      }
    }
    if (bestGain < -EPS && size[ci]! > 0 && empty.length) {
      best = empty.pop()!;
      bestGain = 0;
    }
    if (size[ci] === 0 && best !== ci) empty.push(ci);
    comm[i] = best;
    tot[best]! += ki;
    size[best]!++;
    if (best !== ci) {
      moved = true;
      for (const j of nb) {
        if (!inQ[j] && comm[j] !== best) {
          inQ[j] = true;
          queue.push(j);
        }
      }
    }
  }
  return moved;
}

/** Leiden refinement: inside each community, greedily merge well-connected singletons. */
function refine(g: WGraph, comm: number[], m2: number, gamma: number, rng: () => number): number[] {
  const n = g.k.length;
  const ref = Array.from({ length: n }, (_, i) => i);
  const totS = new Map<number, number>();
  for (let i = 0; i < n; i++) totS.set(comm[i]!, (totS.get(comm[i]!) ?? 0) + g.k[i]!);
  // k_v,S−v: weight from v to the rest of its community
  const kin = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const nb = g.nb[i]!, ws = g.w[i]!;
    for (let e = 0; e < nb.length; e++) if (comm[nb[e]!] === comm[i]) kin[i]! += ws[e]!;
  }
  const rtot = g.k.slice();
  const ext = kin.slice(); // weight from refined community T to S−T
  const single = new Array<boolean>(n).fill(true);
  const wt = new Map<number, number>();
  for (const v of order(n, rng)) {
    if (!single[v]) continue;
    const S = comm[v]!;
    const TS = totS.get(S)!;
    const kv = g.k[v]!;
    if (kin[v]! < (gamma * kv * (TS - kv)) / m2 - EPS) continue;
    wt.clear();
    const nb = g.nb[v]!, ws = g.w[v]!;
    for (let e = 0; e < nb.length; e++) {
      const u = nb[e]!;
      if (comm[u] !== S) continue;
      const t = ref[u]!;
      if (t === ref[v]) continue;
      wt.set(t, (wt.get(t) ?? 0) + ws[e]!);
    }
    let best = -1;
    let bestGain = 0;
    for (const [t, w] of wt) {
      const Tt = rtot[t]!;
      if (ext[t]! < (gamma * Tt * (TS - Tt)) / m2 - EPS) continue; // T not well connected
      const gain = w - (gamma * kv * Tt) / m2;
      if (gain > bestGain + EPS || (best >= 0 && Math.abs(gain - bestGain) <= EPS && t < best)) {
        best = t;
        bestGain = gain;
      }
    }
    if (best < 0) continue;
    const wvT = wt.get(best)!;
    ext[best] = ext[best]! + kin[v]! - 2 * wvT;
    rtot[best]! += kv;
    rtot[v]! -= kv;
    ref[v] = best;
    single[v] = false;
    single[best] = false;
  }
  return ref;
}

function renumber(xs: number[]): number[] {
  const m = new Map<number, number>();
  return xs.map((x) => {
    let y = m.get(x);
    if (y === undefined) {
      y = m.size;
      m.set(x, y);
    }
    return y;
  });
}

function aggregate(g: WGraph, part: number[], count: number): WGraph {
  const maps: Map<number, number>[] = Array.from({ length: count }, () => new Map());
  const k = new Array<number>(count).fill(0);
  for (let i = 0; i < part.length; i++) {
    const a = part[i]!;
    k[a]! += g.k[i]!;
    const nb = g.nb[i]!, ws = g.w[i]!;
    for (let e = 0; e < nb.length; e++) {
      const b = part[nb[e]!]!;
      if (a !== b) maps[a]!.set(b, (maps[a]!.get(b) ?? 0) + ws[e]!);
    }
  }
  const nb: number[][] = [];
  const w: number[][] = [];
  for (const m of maps) {
    const keys = [...m.keys()].sort((x, y) => x - y);
    nb.push(keys);
    w.push(keys.map((x) => m.get(x)!));
  }
  return { nb, w, k };
}

/** Returns a community index per node, numbered by first appearance (node order). */
export function leiden(g0: WGraph, opts: LeidenOptions): number[] {
  const gamma = opts.gamma ?? 1;
  const n0 = g0.k.length;
  const m2 = g0.k.reduce((s, x) => s + x, 0);
  if (n0 === 0) return [];
  if (m2 <= 0) return Array.from({ length: n0 }, (_, i) => i);
  let g = g0;
  let comm = Array.from({ length: n0 }, (_, i) => i);
  // mapping original node -> current aggregated node
  let node = Array.from({ length: n0 }, (_, i) => i);
  const maxLevels = opts.maxLevels ?? 20;
  for (let level = 0; level < maxLevels; level++) {
    moveNodes(g, comm, m2, gamma, opts.rng);
    const cr = renumber(comm);
    const ncomm = Math.max(...cr) + 1;
    if (ncomm === g.k.length) {
      comm = cr;
      break;
    }
    const ref = renumber(refine(g, cr, m2, gamma, opts.rng));
    const nref = Math.max(...ref) + 1;
    const next = aggregate(g, ref, nref);
    const init = new Array<number>(nref).fill(0);
    for (let i = 0; i < ref.length; i++) init[ref[i]!] = cr[i]!;
    node = node.map((x) => ref[x]!);
    g = next;
    comm = init;
    if (nref === ref.length) {
      // refinement made no progress; one more move pass then stop
      moveNodes(g, comm, m2, gamma, opts.rng);
      comm = renumber(comm);
      break;
    }
  }
  return renumber(node.map((x) => comm[x]!));
}

/** Modularity Q of a partition (for tests / evaluation). */
export function modularity(g: WGraph, part: number[], gamma = 1): number {
  const m2 = g.k.reduce((s, x) => s + x, 0);
  if (m2 === 0) return 0;
  let q = 0;
  const tot = new Map<number, number>();
  for (let i = 0; i < part.length; i++) {
    tot.set(part[i]!, (tot.get(part[i]!) ?? 0) + g.k[i]!);
    const nb = g.nb[i]!, ws = g.w[i]!;
    for (let e = 0; e < nb.length; e++) if (part[nb[e]!] === part[i]) q += ws[e]!;
  }
  for (const t of tot.values()) q -= (gamma * t * t) / m2;
  return q / m2;
}
