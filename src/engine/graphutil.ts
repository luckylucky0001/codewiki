// Small graph helpers shared by diff / impact / anchors / parity.
import type { Graph } from '../model.js';
import { getSym } from '../model.js';
import { cmpStr } from '../util/go.js';

export const containerKinds = new Set(['class', 'struct', 'object', 'interface', 'enum', 'component', 'protocol', 'extension']);

export const sortedKeys = (m: Set<string> | Map<string, unknown>): string[] => [...m.keys()].sort(cmpStr);

export function childrenOf(g: Graph): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const s of g.symbols) {
    if (s.parent) {
      const a = children.get(s.parent);
      if (a) a.push(s.id);
      else children.set(s.parent, [s.id]);
    }
  }
  return children;
}

export const parityDepth = 3;

/** Follow reference edges (no container expansion) from a route symbol and its members. */
export function reach(g: Graph, children: Map<string, string[]>, root: string, depth: number): Set<string> {
  const seen = new Set<string>();
  const q: [string, number][] = [[root, 0]];
  for (const c of children.get(root) ?? []) q.push([c, 0]);
  const rs = getSym(g, root);
  if (rs) {
    for (const r of rs.refs ?? []) {
      const c = getSym(g, r);
      if (c && containerKinds.has(c.kind) && c.file === rs.file) for (const m of children.get(c.id) ?? []) q.push([m, 0]);
    }
  }
  for (let i = 0; i < q.length; i++) {
    const [id, d] = q[i]!;
    if (seen.has(id)) continue;
    seen.add(id);
    const s = getSym(g, id);
    if (!s || d >= depth) continue;
    for (const r of s.refs ?? []) {
      const x = getSym(g, r);
      if (x && !containerKinds.has(x.kind) && x.platform === s.platform) q.push([r, d + 1]);
    }
  }
  return seen;
}

export const round2 = (f: number): number => Math.trunc(f * 100 + 0.5) / 100;

export function short(sha: string): string {
  if (!sha) return '(none)';
  return sha.length > 7 ? sha.slice(0, 7) : sha;
}
export function shortHead(sha: string): string {
  return sha ? short(sha) : '(no git)';
}
