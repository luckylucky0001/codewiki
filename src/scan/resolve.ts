// Scope-aware reference resolution: identifier names -> symbol ids.
import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import type { Graph, Symbol } from '../model.js';
import { getSym, reindexGraph } from '../model.js';
import { cmpStr, cut } from '../util/go.js';

const isES = (l: string) => l === 'arkts' || l === 'typescript' || l === 'tsx' || l === 'javascript';

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

/**
 * Same-file declarations first, then explicit imports (external imports
 * shadow project symbols), then members of visible types, then top-level
 * symbols visible by package / module. Ambiguous names are dropped.
 */
export function resolveRefs(g: Graph): void {
  reindexGraph(g);
  assignRefs(g, 0, computeRefs(g, 0, g.symbols.length));
}

function assignRefs(g: Graph, lo: number, refs: string[][]): void {
  refs.forEach((r, k) => {
    const s = g.symbols[lo + k]!;
    if (r.length) s.refs = r;
    else delete s.refs;
  });
}

/** Resolved refs for g.symbols[lo, hi). Each symbol depends only on the whole-graph indexes, so slices can run in parallel. */
export function computeRefs(g: Pick<Graph, 'symbols' | 'files'>, lo: number, hi: number): string[][] {
  const byName = new Map<string, Symbol[]>(); // platform\0name
  const byNameTop = new Map<string, Symbol[]>(); // platform\0name, top-level only
  const byNameMember = new Map<string, Symbol[]>(); // platform\0name, members only
  const byID = new Map<string, Symbol>();
  for (const s of g.symbols) byID.set(s.id, s);
  const getS = (id: string) => byID.get(id);
  const byFile = new Map<string, Symbol[]>(); // file\0name
  const byParent = new Map<string, Symbol[]>(); // platform\0parent\0name
  const byMember = new Map<string, Symbol[]>(); // platform\0name
  const parentName = new Map<Symbol, string>();
  const fileScope = new Map<string, Set<string>>();
  const projectPkgs = new Set<string>();
  const imports = new Map<string, Map<string, string>>();
  const wild = new Map<string, string[]>();
  for (const [f, fi] of Object.entries(g.files)) {
    if (fi.package) projectPkgs.add(fi.package);
    const m = new Map<string, string>();
    for (const imp of fi.imports ?? []) {
      const [name, src] = cut(imp, '|');
      if (name === '*') {
        push(wild, f, src);
        continue;
      }
      m.set(name, src);
    }
    imports.set(f, m);
    fileScope.set(f, new Set(m.keys()));
  }
  for (const s of g.symbols) {
    push(byName, s.platform + '\0' + s.name, s);
    push(s.parent ? byNameMember : byNameTop, s.platform + '\0' + s.name, s);
    push(byFile, s.file + '\0' + s.name, s);
    if (s.parent) {
      const p = getS(s.parent);
      if (p) {
        push(byParent, s.platform + '\0' + p.name + '\0' + s.name, s);
        push(byMember, s.platform + '\0' + s.name, s);
        parentName.set(s, p.name);
      }
    }
    let sc = fileScope.get(s.file);
    if (!sc) {
      sc = new Set();
      fileScope.set(s.file, sc);
    }
    for (const n of s.refNames ?? []) sc.add(n);
  }
  const pkgOf = (file: string) => g.files[file]?.package ?? '';
  const langOf = (file: string) => g.files[file]?.lang ?? '';

  const resolveImport = (s: Symbol, n: string): [Symbol[], boolean] => {
    let src = imports.get(s.file)?.get(n);
    if (src === undefined) return [[], false];
    const lang = langOf(s.file);
    if (lang === 'kotlin' || lang === 'java') {
      const i = src.lastIndexOf('.');
      const pkg = i >= 0 ? src.slice(0, i) : src;
      const orig = src.slice(src.lastIndexOf('.') + 1);
      const out: Symbol[] = [];
      for (const c of byName.get(s.platform + '\0' + orig) ?? []) {
        if (pkgOf(c.file) === pkg && !c.parent) out.push(c);
      }
      if (out.length === 0 && !projectPkgs.has(pkg)) {
        const j = pkg.lastIndexOf('.');
        const outerPkg = j >= 0 ? pkg.slice(0, j) : pkg;
        if (!projectPkgs.has(outerPkg)) return [[], true];
      }
      return [out, true];
    }
    if (isES(lang)) {
      let orig = n;
      const i = src.indexOf('#');
      if (i >= 0) {
        orig = src.slice(i + 1);
        src = src.slice(0, i);
      }
      if (!src.startsWith('.')) return [[], true];
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(s.file), src));
      const out: Symbol[] = [];
      for (const ext of ['', '.ets', '.ts', '.js', '.tsx', '.mjs', '/index.ets', '/index.ts', '/index.js']) {
        for (const c of byFile.get(base + ext + '\0' + orig) ?? []) if (!c.parent) out.push(c);
      }
      return [out, true];
    }
    return [[], false];
  };

  const pass = (s: Symbol, scope: Set<string>): string[] => {
    const self = (c: Symbol) =>
      c.id === s.id || c.id === s.parent || c.parent === s.id || (s.id.length > c.id.length && s.id[c.id.length] === '.' && s.id.startsWith(c.id));
    const refNames = s.refNames ?? [];
    const called = new Set(s.callNames ?? []);
    const lang = langOf(s.file);
    const refs = new Set<string>();
    let refSet: Set<string> | null = null;
    let owners: Set<string> | null = null;
    const ownerSet = (): Set<string> => {
      if (!owners) {
        owners = new Set();
        for (const pn of refNames) {
          const [imp, ok] = resolveImport(s, pn);
          if (ok) for (const o of imp) owners.add(o.id);
          for (const o of byFile.get(s.file + '\0' + pn) ?? []) owners.add(o.id);
        }
      }
      return owners;
    };
    for (const n of refNames) {
      let pick: Symbol[] = [];
      for (const c of byFile.get(s.file + '\0' + n) ?? []) if (!self(c)) pick.push(c);
      if (pick.length === 0) {
        const [cands, handled] = resolveImport(s, n);
        if (handled) {
          for (const c of cands) if (!self(c)) pick.push(c);
          if (pick.length === 0) continue;
        }
      }
      if (pick.length === 0) {
        const preferred: Symbol[] = [];
        const consider = (c: Symbol) => {
          if (self(c)) return;
          pick.push(c);
          if (ownerSet().has(c.parent ?? '')) preferred.push(c);
        };
        const members = byMember.get(s.platform + '\0' + n) ?? [];
        if (members.length <= refNames.length) {
          if (!refSet) refSet = new Set(refNames);
          for (const c of members) if (refSet.has(parentName.get(c) ?? '')) consider(c);
        } else {
          for (const pn of refNames) for (const c of byParent.get(s.platform + '\0' + pn + '\0' + n) ?? []) consider(c);
        }
        if (preferred.length > 0) pick = preferred;
      }
      if (pick.length === 0) {
        const vis: Symbol[] = [];
        const key = s.platform + '\0' + n;
        const mem = byNameMember.get(key);
        if (mem) {
          const fsc = fileScope.get(s.file);
          if (mem.length > scope.size + (fsc?.size ?? 0)) {
            // fewer visible owner names than candidates: look members up by owner
            const seenOwner = new Set<string>();
            for (const set of [scope, fsc]) {
              if (!set) continue;
              for (const pn of set) {
                if (seenOwner.has(pn)) continue;
                seenOwner.add(pn);
                for (const c of byParent.get(s.platform + '\0' + pn + '\0' + n) ?? []) if (!self(c)) vis.push(c);
              }
            }
          } else {
            for (const c of mem) {
              if (self(c)) continue;
              const pn = parentName.get(c);
              if (pn !== undefined && (scope.has(pn) || fsc?.has(pn))) vis.push(c);
            }
          }
        }
        if (lang === 'kotlin' || lang === 'java') {
          const pk = pkgOf(s.file);
          const w = wild.get(s.file);
          for (const c of byNameTop.get(key) ?? []) if (!self(c) && (pkgOf(c.file) === pk || (w !== undefined && w.includes(pkgOf(c.file))))) vis.push(c);
        } else if (!isES(lang)) {
          for (const c of byNameTop.get(key) ?? []) if (!self(c)) vis.push(c);
        }
        if (vis.length <= 3) {
          let top = vis.filter((c) => !c.parent);
          if (top.length === 0) {
            top = vis;
            if (top.length > 1) {
              const fit = top.filter((c) => {
                const isFn = c.kind === 'function' || c.kind === 'method' || c.kind === 'constructor';
                return isFn === called.has(n);
              });
              top = fit.length === 1 ? fit : [];
            }
          }
          pick = top;
        }
      }
      if (pick.length > 3) continue;
      for (const c of pick) refs.add(c.id);
    }
    return [...refs].sort(cmpStr);
  };
  const out: string[][] = [];
  for (let i = lo; i < hi; i++) {
    const s = g.symbols[i]!;
    const scope = new Set<string>();
    for (const r of pass(s, new Set())) {
      const rs = getS(r);
      if (rs) {
        scope.add(rs.name);
        for (const n of rs.refNames ?? []) scope.add(n);
      }
    }
    out.push(pass(s, scope));
  }
  return out;
}

const MIN_PARALLEL_SYMBOLS = 4000;

/** resolveRefs on worker_threads: each worker builds the indexes once and resolves one slice; results are identical. */
export async function resolveRefsParallel(g: Graph, want?: number, minSymbols = MIN_PARALLEL_SYMBOLS): Promise<number> {
  let workers = want && want > 0 ? want : Math.max(1, Math.min(os.availableParallelism(), 8));
  if (process.env.KB_WORKERS) workers = Math.max(1, parseInt(process.env.KB_WORKERS, 10) || 1);
  const n = g.symbols.length;
  if (n < minSymbols || workers < 2) {
    resolveRefs(g);
    return 1;
  }
  reindexGraph(g);
  const symbols = g.symbols.map((s) => ({ id: s.id, name: s.name, platform: s.platform, file: s.file, parent: s.parent, kind: s.kind, refNames: s.refNames, callNames: s.callNames }));
  const files: Graph['files'] = {};
  for (const [f, fi] of Object.entries(g.files)) files[f] = { package: fi.package, lang: fi.lang, imports: fi.imports } as Graph['files'][string];
  // serialize once into shared memory: every worker deserializes in parallel instead of the main
  // thread structured-cloning the graph once per worker
  const buf = v8.serialize({ symbols, files });
  const sab = new SharedArrayBuffer(buf.length);
  new Uint8Array(sab).set(buf);
  const url = fileURLToPath(new URL('./resolve-worker.js', import.meta.url));
  const size = Math.ceil(n / workers);
  await Promise.all(
    Array.from({ length: workers }, (_, k) => {
      const lo = k * size;
      const hi = Math.min(n, lo + size);
      if (lo >= hi) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const w = new Worker(url, { workerData: { sab, lo, hi } });
        w.once('message', (refs: string[][]) => {
          assignRefs(g, lo, refs);
          void w.terminate();
          resolve();
        });
        w.once('error', reject);
      });
    }),
  );
  return workers;
}
