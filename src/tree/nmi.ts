// Tree-quality evaluation helpers: NMI / ARI between two flat labelings and
// between a module_tree.json level and a ground-truth grouping.
import type { ModuleTree } from './types.js';
import { walk } from './tree.js';

/** Normalized mutual information (arithmetic-mean normalization) over items present in both labelings. */
export function nmi(a: Map<string, string>, b: Map<string, string>): number {
  const items = [...a.keys()].filter((k) => b.has(k));
  const n = items.length;
  if (n === 0) return 0;
  const ca = new Map<string, number>(), cb = new Map<string, number>(), cab = new Map<string, number>();
  for (const k of items) {
    const x = a.get(k)!, y = b.get(k)!;
    ca.set(x, (ca.get(x) ?? 0) + 1);
    cb.set(y, (cb.get(y) ?? 0) + 1);
    const j = x + '\u0000' + y;
    cab.set(j, (cab.get(j) ?? 0) + 1);
  }
  const H = (c: Map<string, number>) => -[...c.values()].reduce((s, v) => s + (v / n) * Math.log(v / n), 0);
  const ha = H(ca), hb = H(cb);
  let mi = 0;
  for (const [j, v] of cab) {
    const [x, y] = j.split('\u0000') as [string, string];
    mi += (v / n) * Math.log((v * n) / (ca.get(x)! * cb.get(y)!));
  }
  if (ha === 0 && hb === 0) return 1;
  const denom = (ha + hb) / 2;
  return denom === 0 ? 0 : Math.max(0, Math.min(1, mi / denom));
}

/** Adjusted Rand index over items present in both labelings. */
export function ari(a: Map<string, string>, b: Map<string, string>): number {
  const items = [...a.keys()].filter((k) => b.has(k));
  const n = items.length;
  if (n < 2) return 1;
  const c2 = (x: number) => (x * (x - 1)) / 2;
  const ca = new Map<string, number>(), cb = new Map<string, number>(), cab = new Map<string, number>();
  for (const k of items) {
    const x = a.get(k)!, y = b.get(k)!;
    ca.set(x, (ca.get(x) ?? 0) + 1);
    cb.set(y, (cb.get(y) ?? 0) + 1);
    cab.set(x + '\u0000' + y, (cab.get(x + '\u0000' + y) ?? 0) + 1);
  }
  const sij = [...cab.values()].reduce((s, v) => s + c2(v), 0);
  const sa = [...ca.values()].reduce((s, v) => s + c2(v), 0);
  const sb = [...cb.values()].reduce((s, v) => s + c2(v), 0);
  const exp = (sa * sb) / c2(n);
  const max = (sa + sb) / 2;
  return max === exp ? 1 : (sij - exp) / (max - exp);
}

/**
 * Labels every core symbol of the tree with the id of its deepest node at or above `level`
 * (level 3 → cluster, or the leaf module when the module has no clusters; level 2 → module).
 */
export function treeLabels(tree: ModuleTree, level: 1 | 2 | 3 = 3): Map<string, string> {
  const out = new Map<string, string>();
  const rec = (n: (typeof tree)['root'], label: string) => {
    const l = n.level <= level ? n.id : label;
    for (const c of n.core ?? []) out.set(c, l);
    for (const c of n.children ?? []) rec(c, l);
  };
  rec(tree.root, tree.root.id);
  return out;
}

/** NMI between two trees at a level (e.g. stability across runs/commits). */
export function treeNMI(a: ModuleTree, b: ModuleTree, level: 1 | 2 | 3 = 3): number {
  return nmi(treeLabels(a, level), treeLabels(b, level));
}

/** Share of nodes (by id) of `a` whose id and page survive in `b` — the stability metric of design-v2 §7. */
export function idRetention(a: ModuleTree, b: ModuleTree, kind: 'cluster' | 'module' | 'all' = 'cluster'): number {
  const pages = new Map<string, string>();
  walk(b.root, (n) => void pages.set(n.id, n.page));
  let total = 0, kept = 0;
  walk(a.root, (n) => {
    if (kind !== 'all' && (kind === 'cluster' ? n.kind !== 'cluster' : !n.key)) return;
    total++;
    if (pages.get(n.id) === n.page) kept++;
  });
  return total ? kept / total : 1;
}
