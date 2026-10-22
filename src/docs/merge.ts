// Non-destructive merge of Compound items into a docs file. Human-owned
// content (everything without an ownership marker) is never modified,
// removed or reordered; this is enforced by assertHumanContentPreserved()
// on every result before it is returned as writable.
import {
  entryKey,
  humanChunks,
  normalizeHeading,
  parseDocument,
  parseHeadingLine,
  parseSourceLine,
  renderSourceLine,
  type ParsedDoc,
  type ReviewNote,
  type SourceTag,
} from './markers.js';
import { isPlaceholderLine, lineBudget, type FileState } from './ownership.js';
import { detectEol, findFrontmatter, isBlank, joinLines, OwnedFrontmatterKeys, setFrontmatterKeys, splitLines, type Line } from './text.js';

export interface NewEntry {
  kind: 'entry';
  dimension: string;
  heading: string;
  body: string;
  source: SourceTag;
  /** heading of the section the entry belongs under (created at EOF when missing) */
  section?: string;
  level?: number;
}

export interface NewBlock {
  kind: 'block';
  key: string;
  body: string;
  evidence: string;
  section?: string;
}

export interface NewRow {
  kind: 'row';
  /** full key incl. prefix, e.g. index:docs/api.md or debt:... */
  key: string;
  /** row text without the marker (marker is appended) */
  line: string;
  section?: string;
}

export type CompoundItem = NewEntry | NewBlock | NewRow;

export function itemKey(it: CompoundItem): string {
  return it.kind === 'entry' ? entryKey(it.source.origin, it.source.path, it.dimension, it.heading) : it.key;
}

export interface MergeInput {
  path: string;
  /** current file text, null when the file does not exist */
  text: string | null;
  state: FileState;
  dimension: string;
  items: CompoundItem[];
  /** YYYY-MM-DD written to last_compound_scan */
  scanDate: string;
  scanMode: 'full' | 'incremental';
  sourceCommit?: string;
  /** title for new files */
  title?: string;
  /** knowledge-layer file (<docs_root>/adr/**, <docs_root>/tech-debt.md, see isKnowledgeLayerFile): never gets frontmatter */
  knowledgeLayer?: boolean;
  /** managed only: existing owned entries whose source no longer exists are retagged [Pending] */
  sourceExists?: (path: string) => boolean;
  /** override the per-state line budget */
  budget?: number;
}

export type MergeAction = 'write' | 'skip' | 'noop' | 'review';

export interface MergeResult {
  action: MergeAction;
  state: FileState;
  path: string;
  text?: string;
  inserted: string[];
  replaced: string[];
  unchanged: string[];
  markedPending: string[];
  dropped: { key: string; reason: string }[];
  truncated: string[];
  /** blocking ambiguities (action=review) and non-blocking parse notes */
  review: ReviewNote[];
  linesAdded: number;
}

export class HumanContentViolation extends Error {
  constructor(
    message: string,
    readonly detail: { index: number; before?: string; after?: string },
  ) {
    super(message);
    this.name = 'HumanContentViolation';
  }
}

export interface PreserveOptions {
  dimension?: string;
  /** skeleton writes may drop objective placeholder lines from `before` */
  allowPlaceholderRemoval?: boolean;
  /** human chunks the merge itself added (new section headings); ignored in `after` */
  addedChunks?: string[];
}

function frontmatterHumanLines(text: string): string[] {
  const lines = splitLines(text);
  const fm = findFrontmatter(lines);
  if (!fm) return [];
  const out: string[] = [];
  for (let i = fm.start + 1; i < fm.end; i++) {
    const m = /^([A-Za-z_][\w-]*):/.exec(lines[i]!.text);
    if (m && (OwnedFrontmatterKeys as readonly string[]).includes(m[1]!)) continue;
    out.push(lines[i]!.text);
  }
  return out;
}

/** Returns null if human content is preserved, else a description of the first difference. */
export function checkHumanContentPreserved(before: string, after: string, opts: PreserveOptions = {}): HumanContentViolation | null {
  const bdoc = parseDocument(opts.allowPlaceholderRemoval ? stripSkeletonPlaceholders(before) : before, { dimension: opts.dimension });
  const adoc = parseDocument(after, { dimension: opts.dimension });
  const b = humanChunks(bdoc);
  let a = humanChunks(adoc);
  if (opts.addedChunks?.length) {
    const pool = [...opts.addedChunks];
    a = a.filter((c) => {
      const k = pool.indexOf(c);
      if (k >= 0 && !b.includes(c)) { pool.splice(k, 1); return false; }
      return true;
    });
  }
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return new HumanContentViolation(`human content changed at chunk ${i}`, { index: i, before: b[i], after: a[i] });
    }
  }
  const fb = frontmatterHumanLines(before);
  const fa = frontmatterHumanLines(after);
  if (fb.join('\n') !== fa.join('\n')) {
    return new HumanContentViolation('human frontmatter keys changed', { index: -1, before: fb.join('\n'), after: fa.join('\n') });
  }
  return null;
}

/** Throws HumanContentViolation unless every human block of `before` is byte-identical and in order in `after`. */
export function assertHumanContentPreserved(before: string, after: string, opts: PreserveOptions = {}): void {
  const v = checkHumanContentPreserved(before, after, opts);
  if (v) throw v;
}

/**
 * Removes template-only HTML comments and objective placeholder lines from a
 * skeleton file, keeping frontmatter, headings and fenced code. Consecutive
 * blank lines are collapsed.
 */
export function stripSkeletonPlaceholders(text: string): string {
  const noComments = text.replace(/<!--([\s\S]*?)-->[ \t]*(\r?\n)?/g, (m, inner: string) => (/compound:/.test(inner) ? m : ''));
  const doc = parseDocument(noComments);
  const fmEnd = doc.frontmatter ? doc.frontmatter.end : -1;
  const kept: Line[] = [];
  let lastBlank = false;
  doc.lines.forEach((l, i) => {
    if (i <= fmEnd || doc.inFence[i] || parseHeadingLine(l.text)) { kept.push(l); lastBlank = false; return; }
    if (isBlank(l.text)) { if (!lastBlank) kept.push(l); lastBlank = true; return; }
    if (isPlaceholderLine(l.text)) return;
    kept.push(l);
    lastBlank = false;
  });
  return joinLines(kept);
}

// ---------------------------------------------------------------------------

function bodyLines(body: string): string[] {
  const ls = body.replace(/\r\n?/g, '\n').split('\n');
  while (ls.length && isBlank(ls[0]!)) ls.shift();
  while (ls.length && isBlank(ls[ls.length - 1]!)) ls.pop();
  return ls;
}

function renderItem(it: CompoundItem, level: number): string[] {
  if (it.kind === 'entry') {
    const b = bodyLines(it.body);
    return [`${'#'.repeat(level)} ${it.heading.trim()}`, '', ...b, ...(b.length ? [''] : []), renderSourceLine(it.source)];
  }
  if (it.kind === 'block') {
    return [`<!-- compound:owned:start key="${it.key}" -->`, ...bodyLines(it.body), `Evidence: ${it.evidence.trim()}`, '<!-- compound:owned:end -->'];
  }
  return [`${it.line.replace(/\r?\n/g, ' ').trimEnd()} <!-- compound:owned key="${it.key}" -->`];
}

/** Rejects item bodies that would change the parse of the file (headings, Source lines, markers). */
function validateItem(it: CompoundItem): string | null {
  if (it.section !== undefined) {
    const h = parseHeadingLine(`## ${it.section.trim()}`);
    if (!it.section.trim() || /[\r\n]/.test(it.section) || !h || h.text !== it.section.trim()) return 'section is not a single-line heading text';
  }
  if (it.kind === 'row') {
    if (/<!--\s*compound:/.test(it.line)) return 'row text contains a compound marker';
    if (!/^[\w-]+:/.test(it.key)) return 'row key needs a prefix (index:/debt:/xref:)';
    return null;
  }
  if (it.kind === 'entry') {
    const h = parseHeadingLine(`### ${it.heading.trim()}`);
    if (!it.heading.trim() || /[\r\n]/.test(it.heading) || !h || h.text !== it.heading.trim()) return 'entry heading is not a single-line heading text';
  }
  let fence = false;
  for (const l of bodyLines(it.body)) {
    if (/^ {0,3}(`{3,}|~{3,})/.test(l)) fence = !fence;
    if (fence) continue;
    if (/<!--\s*compound:/.test(l)) return 'body contains a compound marker';
    if (it.kind === 'entry' && parseHeadingLine(l)) return 'entry body contains a heading';
    if (parseSourceLine(l)) return 'body contains a **Source** line';
  }
  if (fence) return 'body has an unterminated code fence';
  if (it.kind === 'block' && !it.evidence.trim()) return 'owned block without evidence';
  return null;
}

interface Ctx {
  lines: Line[];
  eol: '\n' | '\r\n';
  dimension: string;
  addedChunks: string[];
}

function toLines(texts: string[], eol: '\n' | '\r\n'): Line[] {
  return texts.map((t) => ({ text: t, eol }));
}

function headingLevelFor(doc: ParsedDoc, sectionLine: number | null, it: CompoundItem): number {
  if (it.kind === 'entry' && it.level) return it.level;
  if (sectionLine === null) return 3;
  const h = doc.headings.find((x) => x.line === sectionLine);
  return Math.min(6, (h?.level ?? 2) + 1);
}

/** Inserts `it`; returns a blocking review note when the position is ambiguous. */
function insertItem(ctx: Ctx, it: CompoundItem, depth = 0): ReviewNote | null {
  const doc = parseDocument(joinLines(ctx.lines), { dimension: ctx.dimension });
  const n = ctx.lines.length;
  const ownedHeadingLines = new Set(doc.items.filter((x) => x.kind === 'entry').map((x) => x.start));
  let regionStart = -1;
  let regionEnd = n;
  let sectionLine: number | null = null;
  if (it.section) {
    const want = normalizeHeading(it.section);
    const hits = doc.headings.filter((h) => !ownedHeadingLines.has(h.line) && normalizeHeading(h.text) === want);
    if (hits.length > 1) {
      return { line: hits[1]!.line, key: itemKey(it), reason: `section "${it.section}" appears ${hits.length} times (ambiguous insertion)` };
    }
    if (hits.length === 1) {
      const h = hits[0]!;
      sectionLine = h.line;
      regionStart = h.line;
      const next = doc.headings.find((x) => x.line > h.line && x.level <= h.level && !ownedHeadingLines.has(x.line));
      regionEnd = next ? next.line : n;
    } else {
      // create the section at EOF
      const head = `## ${it.section.trim()}`;
      appendAt(ctx, n, [head], true);
      ctx.addedChunks.push(head);
      if (depth > 0) return { line: n, key: itemKey(it), reason: `could not create section "${it.section}"` };
      return insertItem(ctx, it, depth + 1);
    }
  }
  const level = headingLevelFor(doc, sectionLine, it);
  const rendered = renderItem(it, level);
  // candidate anchor: last owned item of a compatible kind inside the region
  const prefix = it.kind === 'row' ? it.key.split(':')[0] + ':' : '';
  let pos = -1;
  let tight = false;
  for (const o of doc.items) {
    if (o.start <= regionStart || o.end >= regionEnd) continue;
    if (it.kind === 'row') {
      if (o.kind === 'row' && o.key.startsWith(prefix)) { pos = o.end; tight = true; }
    } else if (o.kind === 'entry' || o.kind === 'block') pos = o.end;
  }
  if (pos < 0) {
    let last = regionStart;
    for (let i = Math.max(regionStart, 0); i < regionEnd; i++) {
      if (!isBlank(ctx.lines[i]!.text) || doc.inFence[i]) last = i;
    }
    if (it.kind === 'row' && last > regionStart && last >= 0) {
      const t = ctx.lines[last]!.text.trim();
      const isTable = t.startsWith('|');
      const isList = /^(?:[-*+]|\d+[.)])\s/.test(t);
      const rowIsTable = it.line.trim().startsWith('|');
      if ((isTable && rowIsTable) || (isList && !rowIsTable)) tight = true;
    }
    pos = last;
  }
  appendAt(ctx, pos + 1, rendered, !tight);
  return null;
}

/** Inserts rendered lines before index `at`, separating with blank lines when `spaced`. */
function appendAt(ctx: Ctx, at: number, texts: string[], spaced: boolean): void {
  const lines = ctx.lines;
  const ins: Line[] = toLines(texts, ctx.eol);
  if (at > 0 && lines[at - 1]!.eol === '') lines[at - 1] = { text: lines[at - 1]!.text, eol: ctx.eol };
  const prevBlank = at === 0 || isBlank(lines[at - 1]!.text);
  const nextExists = at < lines.length;
  const nextBlank = !nextExists || isBlank(lines[at]!.text);
  if (spaced && !prevBlank) ins.unshift({ text: '', eol: ctx.eol });
  if (nextExists && !nextBlank && spaced) ins.push({ text: '', eol: ctx.eol });
  if (!nextExists) {
    // keep the original "no trailing newline" style? always end with EOL for new content
    ins[ins.length - 1] = { text: ins[ins.length - 1]!.text, eol: ctx.eol };
  }
  lines.splice(at, 0, ...ins);
}

function replaceSpan(ctx: Ctx, start: number, end: number, texts: string[]): void {
  const lastEol = ctx.lines[end]!.eol;
  const ins = toLines(texts, ctx.eol);
  ins[ins.length - 1] = { text: ins[ins.length - 1]!.text, eol: lastEol };
  ctx.lines.splice(start, end - start + 1, ...ins);
}

function spanText(lines: Line[], start: number, end: number): string {
  return lines.slice(start, end + 1).map((l) => l.text).join('\n');
}

function emptyResult(input: MergeInput, action: MergeAction): MergeResult {
  return {
    action, state: input.state, path: input.path,
    inserted: [], replaced: [], unchanged: [], markedPending: [], dropped: [], truncated: [], review: [], linesAdded: 0,
  };
}

/**
 * Merges Compound items into one docs file, applying the single per-state
 * decision. Never throws for content problems: ambiguity → action 'review'.
 */
export function mergeDocument(input: MergeInput): MergeResult {
  const res = emptyResult(input, 'noop');
  const { state } = input;
  if (state === 'disabled') { res.action = 'skip'; return res; }

  // ---- filter items for the state
  const items: CompoundItem[] = [];
  const seenKeys = new Set<string>();
  for (const it of input.items) {
    const key = itemKey(it);
    const bad = validateItem(it);
    if (bad) { res.dropped.push({ key, reason: bad }); continue; }
    if (seenKeys.has(key)) { res.dropped.push({ key, reason: 'duplicate key in input' }); continue; }
    if (it.kind === 'entry') {
      if (it.source.status === 'Pending' && state !== 'managed') {
        res.dropped.push({ key, reason: `[Pending] entries are not inserted into ${state} files` });
        continue;
      }
      if (state === 'new' && !it.source.status) {
        res.dropped.push({ key, reason: 'new files are created only with verified content' });
        continue;
      }
    }
    seenKeys.add(key);
    items.push(it);
  }

  if (state === 'new' && items.length === 0) { res.action = 'skip'; return res; }
  if (input.text === null && state !== 'new') { res.action = 'skip'; res.review.push({ line: 0, reason: `state ${state} without file text` }); return res; }

  const before = input.text ?? '';
  const eol = input.text ? detectEol(input.text) : '\n';
  const ctx: Ctx = { lines: splitLines(before), eol, dimension: input.dimension, addedChunks: [] };
  const initialDoc = parseDocument(before, { dimension: input.dimension });
  res.review.push(...initialDoc.review);
  const dupKeys = new Set(initialDoc.review.filter((r) => r.key && r.reason.startsWith('duplicate')).map((r) => r.key!));

  if (state === 'new') {
    const title = (input.title ?? input.dimension).trim() || 'Docs';
    ctx.lines = toLines([`# ${title}`], eol);
    ctx.addedChunks.push(`# ${title}`);
  }

  // ---- skeleton: drop objective placeholder lines (headings kept)
  if (state === 'skeleton') ctx.lines = splitLines(stripSkeletonPlaceholders(before));
  const baseLen = ctx.lines.length;
  const budget = input.budget ?? lineBudget(state);

  // ---- managed: retag owned entries whose source disappeared
  const producedKeys = new Set(items.map(itemKey));
  if (state === 'managed' && input.sourceExists) {
    for (const o of initialDoc.items) {
      if (o.kind !== 'entry' || !o.source || producedKeys.has(o.key)) continue;
      if (o.source.origin !== 'Code Direct' || o.source.status === 'Pending') continue;
      if (input.sourceExists(o.source.path)) continue;
      const sl = o.end;
      ctx.lines[sl] = { text: renderSourceLine({ ...o.source, status: 'Pending' }), eol: ctx.lines[sl]!.eol };
      res.markedPending.push(o.key);
    }
  }

  // ---- apply items in order
  const blocking: ReviewNote[] = [];
  let stop = false;
  for (const it of items) {
    const key = itemKey(it);
    if (stop) { res.truncated.push(key); continue; }
    if (dupKeys.has(key)) {
      blocking.push({ line: 0, key, reason: `key "${key}" is duplicated in the file (ambiguous)` });
      continue;
    }
    const doc = parseDocument(joinLines(ctx.lines), { dimension: input.dimension });
    let existing = doc.items.find((o) => o.key === key);
    if (!existing && it.kind === 'entry' && it.source.origin === 'Code Direct') {
      // upgrade path: [AI Inferred] entry with the same (dimension, heading)
      const alt = entryKey('AI Inferred', '', it.dimension, it.heading);
      existing = doc.items.find((o) => o.key === alt);
    }
    const snapshot = ctx.lines.slice();
    const addedSnapshot = ctx.addedChunks.length;
    if (existing) {
      if (state === 'adopted' || state === 'new') { res.unchanged.push(key); continue; }
      if (existing.kind !== it.kind) {
        blocking.push({ line: existing.start, key, reason: `key "${key}" exists with kind ${existing.kind}` });
        continue;
      }
      const rendered = renderItem(it, existing.headingLevel ?? headingLevelFor(doc, null, it));
      let next = rendered;
      if (it.kind === 'row') {
        // keep the original marker position style: row text + marker
        next = rendered;
      }
      if (spanText(ctx.lines, existing.start, existing.end) === next.join('\n')) { res.unchanged.push(key); continue; }
      replaceSpan(ctx, existing.start, existing.end, next);
      res.replaced.push(key);
    } else {
      const note = insertItem(ctx, it);
      if (note) { blocking.push(note); ctx.lines = snapshot; ctx.addedChunks.length = addedSnapshot; continue; }
      res.inserted.push(key);
    }
    if (ctx.lines.length - baseLen > budget) {
      ctx.lines = snapshot;
      ctx.addedChunks.length = addedSnapshot;
      const arr = existing ? res.replaced : res.inserted;
      arr.pop();
      res.truncated.push(key);
      stop = true;
    }
  }
  res.linesAdded = Math.max(0, ctx.lines.length - baseLen);

  if (blocking.length) {
    res.action = 'review';
    res.review.push(...blocking);
    return res;
  }
  const changed = res.inserted.length + res.replaced.length + res.markedPending.length > 0;
  if (!changed) { res.action = state === 'new' ? 'skip' : 'noop'; return res; }

  let out = joinLines(ctx.lines);
  if (!input.knowledgeLayer) {
    out = setFrontmatterKeys(out, {
      last_compound_scan: input.scanDate,
      compound_scan_mode: input.scanMode,
      compound_source_commit: input.sourceCommit,
    });
  }
  if (state !== 'new') {
    const v = checkHumanContentPreserved(before, out, {
      dimension: input.dimension,
      allowPlaceholderRemoval: state === 'skeleton',
      addedChunks: ctx.addedChunks,
    });
    if (v) {
      res.action = 'review';
      res.review.push({ line: 0, reason: `internal invariant: ${v.message}` });
      return res;
    }
  }
  res.action = 'write';
  res.text = out;
  return res;
}
