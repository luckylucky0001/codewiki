// In-memory ScopeFs / LinkFs for tests. Paths ending in '/' are directories; symlinks via `@link:`.
import type { ScopeFs } from '../../src/docs/scope.js';

export function memFs(paths: string[], symlinks: string[] = []) {
  const files = new Set<string>();
  const dirs = new Set<string>(['']);
  const links = new Set(symlinks);
  for (const raw of [...paths, ...symlinks.map((s) => s + '/')]) {
    const isDir = raw.endsWith('/');
    const p = raw.replace(/\/$/, '');
    const segs = p.split('/');
    for (let i = 1; i < segs.length; i++) dirs.add(segs.slice(0, i).join('/'));
    if (isDir) dirs.add(p);
    else files.add(p);
  }
  const fsv: ScopeFs & { exists(p: string): boolean; files: string[] } = {
    isDir: (p) => dirs.has(p),
    isFile: (p) => files.has(p),
    isSymlink: (p) => links.has(p),
    readdir: (p) => {
      const pre = p === '' ? '' : p + '/';
      const out = new Set<string>();
      for (const x of [...files, ...dirs]) {
        if (x === p || !x.startsWith(pre) || x === '') continue;
        out.add(x.slice(pre.length).split('/')[0]!);
      }
      return [...out].sort();
    },
    exists: (p) => files.has(p) || dirs.has(p),
    files: [...files].sort(),
  };
  return fsv;
}
