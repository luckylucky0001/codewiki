// Scope-aware reference resolution: identifier names -> symbol ids.
import path from 'node:path';
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
  const byName = new Map<string, Symbol[]>(); // platform\0name
  const byFile = new Map<string, Symbol[]>(); // file\0name
  const byParent = new Map<string, Symbol[]>(); // platform\0parent\0name
  const byMember = new Map<string, Symbol[]>(); // platform\0name
  const parentName = new Map<Symbol, string>();
  reindexGraph(g);
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
    push(byFile, s.file + '\0' + s.name, s);
    if (s.parent) {
      const p = getSym(g, s.parent);
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
        for (const c of byName.get(s.platform + '\0' + n) ?? []) {
          if (self(c)) continue;
          if (c.parent) {
            const p = getSym(g, c.parent);
            if (p && (scope.has(p.name) || fileScope.get(s.file)?.has(p.name))) vis.push(c);
            continue;
          }
          if (lang === 'kotlin' || lang === 'java') {
            if (pkgOf(c.file) === pkgOf(s.file) || (wild.get(s.file) ?? []).includes(pkgOf(c.file))) vis.push(c);
          } else if (isES(lang)) {
            // top-level ES symbols must be imported
          } else vis.push(c);
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
  const first = g.symbols.map((s) => pass(s, new Set()));
  g.symbols.forEach((s, i) => {
    const scope = new Set<string>();
    for (const r of first[i]!) {
      const rs = getSym(g, r);
      if (rs) {
        scope.add(rs.name);
        for (const n of rs.refNames ?? []) scope.add(n);
      }
    }
    const refs = pass(s, scope);
    if (refs.length) s.refs = refs;
    else delete s.refs;
  });
}
