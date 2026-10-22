// Small deterministic helpers private to src/tree (kept local so the module is self-contained).
import { createHash } from 'node:crypto';

export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sorted(xs: Iterable<string>): string[] {
  return [...xs].sort(cmp);
}

export function uniqSorted(xs: Iterable<string>): string[] {
  return [...new Set(xs)].sort(cmp);
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

/** Seeded PRNG (mulberry32) from a hex digest. */
export function rngFromSeed(seedHex: string): () => number {
  let a = parseInt(seedHex.slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle with the given rng (in place). */
export function shuffle<T>(xs: T[], rnd: () => number): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = xs[i]!;
    xs[i] = xs[j]!;
    xs[j] = t;
  }
  return xs;
}

export function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

export function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? p : p.slice(i + 1);
}

/** Normalizes a repo-relative path: forward slashes, no leading ./, no trailing /. */
export function normRel(p: string): string {
  let s = p.replace(/\\/g, '/');
  const parts: string[] = [];
  for (const seg of s.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  s = parts.join('/');
  return s;
}

export function joinRel(...ps: string[]): string {
  return normRel(ps.filter((p) => p !== '').join('/'));
}

/** True if file lies under dir ("" = everything). */
export function under(file: string, dir: string): boolean {
  return dir === '' || file === dir || file.startsWith(dir + '/');
}

export function commonDir(files: string[]): string {
  if (!files.length) return '';
  let parts = dirname(files[0]!).split('/');
  for (const f of files) {
    const q = dirname(f).split('/');
    let i = 0;
    while (i < parts.length && i < q.length && parts[i] === q[i]) i++;
    parts = parts.slice(0, i);
  }
  return parts.filter(Boolean).join('/');
}

export function kebab(s: string): string {
  return s
    .replace(/iOS/g, 'Ios')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  const [s, l] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of s) if (l.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Minimal glob → RegExp (`**`, `*`, `?`). */
export function globRe(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

/** JSON with recursively sorted keys, 2-space indent and trailing newline (stable diffs). */
export function stableJSON(v: unknown): string {
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === 'object') {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(x as object).sort(cmp)) {
        const val = (x as Record<string, unknown>)[k];
        if (val === undefined) continue;
        o[k] = norm(val);
      }
      return o;
    }
    return x;
  };
  return JSON.stringify(norm(v), null, 2) + '\n';
}
