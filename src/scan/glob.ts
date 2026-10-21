// Minimal glob matcher with ** support (same translation as the Go version).
import { regexQuoteMeta } from '../util/go.js';

export function compileGlobs(pats: string[]): RegExp[] {
  const out: RegExp[] = [];
  for (const p of pats) {
    if (!p) continue;
    let b = '^';
    for (let i = 0; i < p.length; i++) {
      const ch = p[i]!;
      if (ch === '*') {
        if (p[i + 1] === '*') {
          i++;
          if (p[i + 1] === '/') {
            i++;
            b += '(?:.*/)?';
          } else b += '.*';
        } else b += '[^/]*';
      } else if (ch === '?') b += '[^/]';
      else b += regexQuoteMeta(ch);
    }
    b += '$';
    out.push(new RegExp(b, 's'));
  }
  return out;
}

export function matchAny(gs: RegExp[], s: string): boolean {
  for (const g of gs) if (g.test(s)) return true;
  return false;
}

export function matchGlob(pattern: string, p: string): boolean {
  return matchAny(compileGlobs([pattern]), p);
}
