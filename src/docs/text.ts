// Line-level text helpers for the docs ownership engine. Everything here is
// byte-preserving: a document split with splitLines() and re-joined with
// joinLines() is identical to the input, including CRLF / missing final EOL.
import { createHash } from 'node:crypto';

export type Eol = '' | '\n' | '\r\n';

export interface Line {
  text: string;
  eol: Eol;
}

export function splitLines(s: string): Line[] {
  const out: Line[] = [];
  let i = 0;
  while (i < s.length) {
    const j = s.indexOf('\n', i);
    if (j < 0) {
      out.push({ text: s.slice(i), eol: '' });
      break;
    }
    if (j > i && s.charCodeAt(j - 1) === 13) out.push({ text: s.slice(i, j - 1), eol: '\r\n' });
    else out.push({ text: s.slice(i, j), eol: '\n' });
    i = j + 1;
  }
  return out;
}

export function joinLines(lines: Line[]): string {
  let s = '';
  for (const l of lines) s += l.text + l.eol;
  return s;
}

/** Dominant line ending of a document (CRLF only when it is the majority). */
export function detectEol(s: string): '\n' | '\r\n' {
  let crlf = 0, lf = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 10) {
      if (i > 0 && s.charCodeAt(i - 1) === 13) crlf++;
      else lf++;
    }
  }
  return crlf > lf ? '\r\n' : '\n';
}

export function isBlank(s: string): boolean {
  return s.trim() === '';
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function sha8(s: string): string {
  return sha256(s).slice(0, 8);
}

/** ASCII kebab slug; non-ASCII letters (CJK) are kept so Chinese titles stay meaningful. */
export function slugify(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[`*_~"'()[\]{}<>.,;:!?/\\|@#$%^&+=]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** ASCII-only kebab slug (file names). Empty when nothing ASCII remains. */
export function asciiSlug(s: string): string {
  return slugify(s).replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/** Normalizes a repo-relative path: forward slashes, no ./, no duplicate or trailing slashes. */
export function normalizeRepoPath(p: string): string {
  let s = p.trim().replace(/\\/g, '/');
  while (s.startsWith('./')) s = s.slice(2);
  s = s.replace(/\/+/g, '/');
  const parts: string[] = [];
  for (const seg of s.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') {
      if (parts.length && parts[parts.length - 1] !== '..') parts.pop();
      else parts.push('..');
    } else parts.push(seg);
  }
  return parts.join('/');
}

export function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

export function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? p : p.slice(i + 1);
}

export function joinPath(...parts: string[]): string {
  return normalizeRepoPath(parts.filter((x) => x !== '').join('/'));
}

/** Relative path from directory `fromDir` to `to` (both repo-relative). */
export function relativePath(fromDir: string, to: string): string {
  const a = fromDir ? normalizeRepoPath(fromDir).split('/') : [];
  const b = normalizeRepoPath(to).split('/');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const up = a.slice(i).map(() => '..');
  const rest = b.slice(i);
  const r = [...up, ...rest].join('/');
  return r === '' ? '.' : r;
}

/** True if `p` equals `root` or lies under it ('' root = whole repo). */
export function isUnder(p: string, root: string): boolean {
  const r = normalizeRepoPath(root);
  const q = normalizeRepoPath(p);
  if (r === '' || r === '.') return !q.startsWith('../') && q !== '..';
  return q === r || q.startsWith(r + '/');
}

// ---------------------------------------------------------------------------
// Frontmatter (flat `key: value` YAML subset; unknown lines are kept verbatim)

export const OwnedFrontmatterKeys = ['last_compound_scan', 'compound_scan_mode', 'compound_source_commit'] as const;

export interface Frontmatter {
  /** index of the opening `---` line */
  start: number;
  /** index of the closing `---` line */
  end: number;
  values: Record<string, string>;
}

export function findFrontmatter(lines: Line[]): Frontmatter | null {
  if (!lines.length || lines[0]!.text.replace(/^\uFEFF/, '') !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i]!.text;
    if (t === '---' || t === '...') {
      const values: Record<string, string> = {};
      for (let k = 1; k < i; k++) {
        const m = /^([A-Za-z_][\w-]*):\s*(.*?)\s*$/.exec(lines[k]!.text);
        if (m) values[m[1]!] = unquote(m[2]!);
      }
      return { start: 0, end: i, values };
    }
  }
  return null;
}

function unquote(v: string): string {
  const s = v.replace(/\s+#.*$/, '');
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

export function parseFrontmatter(text: string): Record<string, string> | null {
  return findFrontmatter(splitLines(text))?.values ?? null;
}

/** YYYY-MM-DD (optionally followed by a time) that is a real calendar date. */
export function isValidScanDate(v: string | undefined): boolean {
  if (!v) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(v.trim());
  if (!m) return false;
  const y = +m[1]!, mo = +m[2]!, d = +m[3]!;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Sets kb-owned frontmatter keys, preserving every other line byte for byte. */
export function setFrontmatterKeys(text: string, kv: Record<string, string | undefined>): string {
  const lines = splitLines(text);
  const eol = detectEol(text);
  const fm = findFrontmatter(lines);
  const entries = Object.entries(kv).filter(([, v]) => v !== undefined) as [string, string][];
  if (!fm) {
    const head = ['---', ...entries.map(([k, v]) => `${k}: ${v}`), '---'].map((t) => t + eol).join('');
    return head + text;
  }
  const out = lines.slice();
  const seen = new Set<string>();
  for (let i = fm.start + 1; i < fm.end; i++) {
    const m = /^([A-Za-z_][\w-]*):/.exec(out[i]!.text);
    if (m && m[1]! in kv) {
      const v = kv[m[1]!];
      seen.add(m[1]!);
      if (v !== undefined) out[i] = { text: `${m[1]}: ${v}`, eol: out[i]!.eol };
    }
  }
  const add: Line[] = entries.filter(([k]) => !seen.has(k)).map(([k, v]) => ({ text: `${k}: ${v}`, eol: lines[fm.end - 1]?.eol || eol }));
  out.splice(fm.end, 0, ...add);
  return joinLines(out);
}

/** Text with the frontmatter block removed (used for placeholder detection). */
export function stripFrontmatter(text: string): string {
  const lines = splitLines(text);
  const fm = findFrontmatter(lines);
  return fm ? joinLines(lines.slice(fm.end + 1)) : text;
}

/** GitHub-style heading anchor slug. */
export function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}
