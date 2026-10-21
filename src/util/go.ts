// Helpers that reproduce Go standard-library semantics where output parity
// with the legacy Go implementation matters (JSON escaping, strings.Fields,
// byte-length truncation, sorting).
import { createHash } from 'node:crypto';

/** Go's unicode.IsSpace. */
export function isGoSpace(c: number): boolean {
  if (c <= 0xff) return c === 0x20 || (c >= 0x09 && c <= 0x0d) || c === 0x85 || c === 0xa0;
  return c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000;
}

/** strings.Fields */
export function fields(s: string): string[] {
  const out: string[] = [];
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    const sp = isGoSpace(s.charCodeAt(i));
    if (sp) {
      if (start >= 0) { out.push(s.slice(start, i)); start = -1; }
    } else if (start < 0) start = i;
  }
  if (start >= 0) out.push(s.slice(start));
  return out;
}

/** strings.TrimSpace */
export function trimSpace(s: string): string {
  let a = 0, b = s.length;
  while (a < b && isGoSpace(s.charCodeAt(a))) a++;
  while (b > a && isGoSpace(s.charCodeAt(b - 1))) b--;
  return s.slice(a, b);
}

export function compact(s: string): string {
  return fields(s).join(' ');
}

export function byteLen(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/** Go's s[:n] + "…" truncation on UTF-8 bytes. */
export function truncate(s: string, n: number): string {
  if (s.length <= n && byteLen(s) <= n) return s;
  const b = Buffer.from(s, 'utf8');
  if (b.length <= n) return s;
  return b.subarray(0, n).toString('utf8') + '…';
}

export function sha256hex(s: string | Buffer): string {
  return createHash('sha256').update(s).digest('hex');
}

/** Byte-wise (UTF-8) string comparison like Go's < on strings. */
export function cmpStr(a: string, b: string): number {
  if (a === b) return 0;
  // fast path: for BMP-only strings without surrogates, UTF-16 order equals byte order
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i), y = b.charCodeAt(i);
    if (x !== y) {
      if ((x >= 0xd800 && x <= 0xdfff) || (y >= 0xd800 && y <= 0xdfff)) {
        return Buffer.compare(Buffer.from(a.slice(i)), Buffer.from(b.slice(i)));
      }
      return x < y ? -1 : 1;
    }
  }
  return a.length < b.length ? -1 : 1;
}

export function sortStrings(xs: string[]): string[] {
  return xs.sort(cmpStr);
}

/** Stable sort (Go sort.SliceStable); Array.prototype.sort is stable in V8. */
export function sortBy<T>(xs: T[], less: (a: T, b: T) => boolean): T[] {
  return xs.sort((a, b) => (less(a, b) ? -1 : less(b, a) ? 1 : 0));
}

const goEscRe = new RegExp('[<>&' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');
function escapeGo(json: string): string {
  return json.replace(goEscRe, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

/** json.Marshal / json.MarshalIndent output (HTML-escaped like Go). */
export function goJSON(v: unknown, indent?: string, escapeHTML = true): string {
  const s = indent === undefined ? JSON.stringify(v) : JSON.stringify(v, null, indent);
  return escapeHTML ? escapeGo(s ?? 'null') : s ?? 'null';
}

/** Returns a copy of a record with keys sorted (Go encodes map keys sorted). */
export function sortedRecord<V>(m: Record<string, V> | Map<string, V>): Record<string, V> {
  const out: Record<string, V> = {};
  const entries = m instanceof Map ? [...m.entries()] : Object.entries(m);
  entries.sort((a, b) => cmpStr(a[0], b[0]));
  for (const [k, v] of entries) out[k] = v;
  return out;
}

export function regexQuoteMeta(s: string): string {
  return s.replace(/[\\.+*?()|[\]{}^$]/g, '\\$&');
}

/** strings.Cut */
export function cut(s: string, sep: string): [string, string, boolean] {
  const i = s.indexOf(sep);
  if (i < 0) return [s, '', false];
  return [s.slice(0, i), s.slice(i + sep.length), true];
}

/** strings.Trim with a cutset */
export function trimChars(s: string, cutset: string): string {
  let a = 0, b = s.length;
  while (a < b && cutset.includes(s[a]!)) a++;
  while (b > a && cutset.includes(s[b - 1]!)) b--;
  return s.slice(a, b);
}
export function trimRightChars(s: string, cutset: string): string {
  let b = s.length;
  while (b > 0 && cutset.includes(s[b - 1]!)) b--;
  return s.slice(0, b);
}
export function trimLeftChars(s: string, cutset: string): string {
  let a = 0;
  while (a < s.length && cutset.includes(s[a]!)) a++;
  return s.slice(a);
}
export function trimPrefix(s: string, p: string): string {
  return s.startsWith(p) ? s.slice(p.length) : s;
}
export function trimSuffix(s: string, p: string): string {
  return p && s.endsWith(p) ? s.slice(0, s.length - p.length) : s;
}
