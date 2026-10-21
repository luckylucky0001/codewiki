// Entry ownership parser. Splits a markdown file into owned items (generic
// sourced entries, constitution owned blocks, index / debt / xref rows, ADR
// proposal marker) and human content. Everything that is not unambiguously
// owned is human-owned. A small line-based block parser (fences, ATX headings,
// HTML comment markers) is enough and keeps byte offsets exact.
import { findFrontmatter, isBlank, normalizeRepoPath, splitLines, type Line } from './text.js';

export type SourceOrigin = 'Code Direct' | 'AI Inferred';
export type SourceStatus = 'Verified' | 'Pending' | 'Unconfirmed';

export interface SourceTag {
  path: string;
  origin: SourceOrigin;
  status?: SourceStatus;
  /** codewiki extension: `<!-- a=<symbol id>@<hash> -->` */
  anchor?: string;
}

export type ItemKind = 'entry' | 'block' | 'row' | 'proposed';

export interface OwnedItem {
  kind: ItemKind;
  key: string;
  /** first line index (inclusive) */
  start: number;
  /** last line index (inclusive) */
  end: number;
  heading?: string;
  headingLevel?: number;
  source?: SourceTag;
  /** for constitution blocks */
  evidence?: string;
}

export interface Heading {
  line: number;
  level: number;
  text: string;
}

export interface ReviewNote {
  line: number;
  reason: string;
  key?: string;
}

export interface ParsedDoc {
  lines: Line[];
  frontmatter: { start: number; end: number; values: Record<string, string> } | null;
  /** headings outside fences and owned blocks */
  headings: Heading[];
  items: OwnedItem[];
  /** per line: index into items, or -1 for human / frontmatter */
  owner: number[];
  /** per line: inside a fenced code block (including the fence lines) */
  inFence: boolean[];
  review: ReviewNote[];
  proposedKey?: string;
}

const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const SOURCE_RE = /^\s*\*\*Source\*\*\s*[:：]\s*(.+?)\s*$/;
const TAG_RE = /\[(Code Direct|AI Inferred|Verified|Pending|Unconfirmed)\]/g;
const OWNED_START_RE = /^\s*<!--\s*compound:owned:start\s+key="([^"]+)"\s*-->\s*$/;
const OWNED_END_RE = /^\s*<!--\s*compound:owned:end\s*-->\s*$/;
const OWNED_ROW_RE = /<!--\s*compound:owned\s+key="([^"]+)"\s*-->/;
const PROPOSED_RE = /^\s*<!--\s*compound:proposed\s+key="([^"]+)"\s*-->\s*$/;
const EVIDENCE_RE = /^\s*(?:[-*]\s*)?(?:\*\*)?Evidence(?:\*\*)?\s*[:：]\s*(.+)$/;

export function parseHeadingLine(t: string): { level: number; text: string } | null {
  const m = HEADING_RE.exec(t);
  if (!m) return null;
  const text = (m[2] ?? '').replace(/[ \t]+#+$/, '').replace(/^#+$/, '').trim();
  return { level: m[1]!.length, text };
}

export function normalizeHeading(h: string): string {
  return h.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Normalized source path used in merge keys: no ./, forward slashes, no #symbol / :line suffix. */
export function normalizeSource(p: string): string {
  let s = p.trim().replace(/^`|`$/g, '');
  s = s.replace(/#.*$/, '').replace(/:\d+(?:-\d+)?$/, '');
  return normalizeRepoPath(s);
}

export function entryKey(origin: SourceOrigin, sourcePath: string, dimension: string, heading: string): string {
  return origin === 'Code Direct'
    ? `src:${normalizeSource(sourcePath)}::${normalizeHeading(heading)}`
    : `dim:${dimension}::${normalizeHeading(heading)}`;
}

/** Parses the payload of a `**Source**:` line. Returns null when no origin tag is present. */
export function parseSourceLine(t: string): SourceTag | null {
  const m = SOURCE_RE.exec(t);
  if (!m) return null;
  let rest = m[1]!;
  let anchor: string | undefined;
  const am = /<!--\s*a=(\S+?)\s*-->/.exec(rest);
  if (am) {
    anchor = am[1];
    rest = rest.replace(am[0], '');
  }
  const tags = [...rest.matchAll(TAG_RE)].map((x) => x[1]!);
  const origin = tags.find((x) => x === 'Code Direct' || x === 'AI Inferred') as SourceOrigin | undefined;
  if (!origin) return null;
  const status = tags.find((x) => x === 'Verified' || x === 'Pending' || x === 'Unconfirmed') as SourceStatus | undefined;
  const firstTag = rest.indexOf('[');
  let p = (firstTag >= 0 ? rest.slice(0, firstTag) : rest).trim();
  const bt = /`([^`]+)`/.exec(p);
  if (bt) p = bt[1]!;
  return { path: p.trim(), origin, ...(status ? { status } : {}), ...(anchor ? { anchor } : {}) };
}

export function renderSourceLine(s: SourceTag): string {
  return `**Source**: \`${s.path}\` [${s.origin}]${s.status ? ` [${s.status}]` : ''}${s.anchor ? ` <!-- a=${s.anchor} -->` : ''}`;
}

export interface ParseOptions {
  /** dimension of the file, used for [AI Inferred] keys */
  dimension?: string;
}

export function parseDocument(text: string, opts: ParseOptions = {}): ParsedDoc {
  const lines = splitLines(text);
  const n = lines.length;
  const fm = findFrontmatter(lines);
  const owner = new Array<number>(n).fill(-1);
  const inFence = new Array<boolean>(n).fill(false);
  const review: ReviewNote[] = [];
  const items: OwnedItem[] = [];
  const bodyStart = fm ? fm.end + 1 : 0;

  // 1. fences
  let fence: { ch: string; len: number } | null = null;
  for (let i = bodyStart; i < n; i++) {
    const t = lines[i]!.text;
    const m = FENCE_RE.exec(t);
    if (fence) {
      inFence[i] = true;
      if (m && m[1]![0] === fence.ch && m[1]!.length >= fence.len && m[2]!.trim() === '') fence = null;
    } else if (m && !(m[1]![0] === '`' && m[2]!.includes('`'))) {
      inFence[i] = true;
      fence = { ch: m[1]![0]!, len: m[1]!.length };
    }
  }

  // 2. ADR proposal marker: first body line
  let proposedKey: string | undefined;
  if (bodyStart < n) {
    const pm = PROPOSED_RE.exec(lines[bodyStart]!.text);
    if (pm) {
      proposedKey = pm[1];
      items.push({ kind: 'proposed', key: pm[1]!, start: bodyStart, end: bodyStart });
      owner[bodyStart] = items.length - 1;
    }
  }

  // 3. owned blocks (constitution)
  const inBlock = new Array<boolean>(n).fill(false);
  for (let i = bodyStart; i < n; i++) {
    if (inFence[i]) continue;
    const t = lines[i]!.text;
    const sm = OWNED_START_RE.exec(t);
    if (!sm) {
      if (OWNED_END_RE.test(t)) review.push({ line: i, reason: 'orphan compound:owned:end marker (kept as human)' });
      continue;
    }
    let end = -1;
    let nested = false;
    for (let j = i + 1; j < n; j++) {
      if (inFence[j]) continue;
      if (OWNED_START_RE.test(lines[j]!.text)) { nested = true; break; }
      if (OWNED_END_RE.test(lines[j]!.text)) { end = j; break; }
    }
    if (end < 0) {
      review.push({ line: i, key: sm[1], reason: nested ? 'owned block start without end before next start (kept as human)' : 'owned block start without end marker (kept as human)' });
      continue;
    }
    let evidence: string | undefined;
    for (let j = i + 1; j < end; j++) {
      const em = EVIDENCE_RE.exec(lines[j]!.text);
      if (em) evidence = em[1]!.trim();
    }
    if (!evidence) {
      review.push({ line: i, key: sm[1], reason: 'owned block without Evidence: line (kept as human)' });
      for (let j = i; j <= end; j++) inBlock[j] = true; // still opaque for heading purposes
      i = end;
      continue;
    }
    items.push({ kind: 'block', key: sm[1]!, start: i, end, evidence });
    for (let j = i; j <= end; j++) { owner[j] = items.length - 1; inBlock[j] = true; }
    i = end;
  }

  // 4. owned rows
  for (let i = bodyStart; i < n; i++) {
    if (inFence[i] || inBlock[i] || owner[i] >= 0) continue;
    const t = lines[i]!.text;
    if (OWNED_START_RE.test(t) || OWNED_END_RE.test(t)) continue;
    const rm = OWNED_ROW_RE.exec(t);
    if (rm) {
      items.push({ kind: 'row', key: rm[1]!, start: i, end: i });
      owner[i] = items.length - 1;
    }
  }

  // 5. headings + generic entries
  const headings: Heading[] = [];
  for (let i = bodyStart; i < n; i++) {
    if (inFence[i] || inBlock[i] || owner[i] >= 0) continue;
    const h = parseHeadingLine(lines[i]!.text);
    if (h) headings.push({ line: i, level: h.level, text: h.text });
  }
  const firstHeading = headings.length ? headings[0]!.line : n;
  for (let i = bodyStart; i < firstHeading; i++) {
    if (!inFence[i] && !inBlock[i] && owner[i] < 0 && parseSourceLine(lines[i]!.text)) {
      review.push({ line: i, reason: '**Source** line outside any heading (kept as human)' });
    }
  }
  for (let hi = 0; hi < headings.length; hi++) {
    const h = headings[hi]!;
    const end = hi + 1 < headings.length ? headings[hi + 1]!.line : n;
    const srcLines: number[] = [];
    let blocked = false;
    for (let j = h.line + 1; j < end; j++) {
      if (inFence[j] || owner[j] >= 0 || inBlock[j]) {
        if (owner[j] >= 0 || inBlock[j]) blocked = true;
        continue;
      }
      if (parseSourceLine(lines[j]!.text)) srcLines.push(j);
    }
    if (srcLines.length === 0) continue;
    if (srcLines.length > 1) {
      review.push({ line: h.line, reason: `section "${h.text}" has ${srcLines.length} **Source** lines (ambiguous, kept as human)` });
      continue;
    }
    const sl = srcLines[0]!;
    if (blocked) {
      // owned rows / blocks between heading and Source line make the span ambiguous
      let mixed = false;
      for (let j = h.line + 1; j < sl; j++) if (owner[j] >= 0 || inBlock[j]) mixed = true;
      if (mixed) {
        review.push({ line: h.line, reason: `section "${h.text}" mixes owned markers and a **Source** line (kept as human)` });
        continue;
      }
    }
    const source = parseSourceLine(lines[sl]!.text)!;
    const key = entryKey(source.origin, source.path, opts.dimension ?? '', h.text);
    items.push({ kind: 'entry', key, start: h.line, end: sl, heading: h.text, headingLevel: h.level, source });
    for (let j = h.line; j <= sl; j++) owner[j] = items.length - 1;
  }

  // 6. duplicate keys -> human + review
  const byKey = new Map<string, number[]>();
  items.forEach((it, idx) => {
    if (it.kind === 'proposed') return;
    const a = byKey.get(it.key) ?? [];
    a.push(idx);
    byKey.set(it.key, a);
  });
  const dropped = new Set<number>();
  for (const [key, idxs] of byKey) {
    if (idxs.length < 2) continue;
    for (const idx of idxs) dropped.add(idx);
    review.push({ line: items[idxs[0]!]!.start, key, reason: `duplicate owned key "${key}" (${idxs.length} occurrences, kept as human)` });
  }
  let finalItems = items;
  if (dropped.size) {
    finalItems = [];
    const remap = new Map<number, number>();
    items.forEach((it, idx) => {
      if (dropped.has(idx)) return;
      remap.set(idx, finalItems.length);
      finalItems.push(it);
    });
    for (let i = 0; i < n; i++) if (owner[i]! >= 0) owner[i] = remap.has(owner[i]!) ? remap.get(owner[i]!)! : -1;
    // headings that were part of a dropped entry stay headings (they already are)
  }
  finalItems.sort((a, b) => a.start - b.start);
  for (let i = 0; i < n; i++) owner[i] = -1;
  finalItems.forEach((it, idx) => { for (let j = it.start; j <= it.end; j++) owner[j] = idx; });

  return {
    lines,
    frontmatter: fm,
    headings,
    items: finalItems,
    owner,
    inFence,
    review,
    ...(proposedKey ? { proposedKey } : {}),
  };
}

/** Human-owned content as chunks of consecutive non-blank human lines (frontmatter excluded). */
export function humanChunks(doc: ParsedDoc, skip?: (line: Line, idx: number) => boolean): string[] {
  const out: string[] = [];
  const start = doc.frontmatter ? doc.frontmatter.end + 1 : 0;
  let cur: Line[] = [];
  const flush = () => {
    if (!cur.length) return;
    let s = '';
    cur.forEach((l, k) => { s += l.text + (k < cur.length - 1 ? l.eol : ''); });
    out.push(s);
    cur = [];
  };
  for (let i = start; i < doc.lines.length; i++) {
    const l = doc.lines[i]!;
    if (doc.owner[i]! >= 0) { flush(); continue; }
    if (skip && skip(l, i)) { flush(); continue; }
    if (isBlank(l.text) && !doc.inFence[i]) { flush(); continue; }
    cur.push(l);
  }
  flush();
  return out;
}
