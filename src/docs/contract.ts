// Agent result contract: entries grouped by destination file, terminated by a
// `COMPOUND_META {...}` line. Routing: repo results → root docs only, project
// results → that project's docs only; sources outside the agent's allowlist
// are rejected; per-file line budgets (150 first write / 100 append).
import { parseDocument } from './markers.js';
import type { CompoundItem, NewBlock, NewEntry, NewRow } from './merge.js';
import { itemKey } from './merge.js';
import { isWritableDocPath, scopeOf, type ScopePlan } from './scope.js';
import { isUnder, joinLines, normalizeRepoPath } from './text.js';

export interface CompoundMeta {
  status: 'done' | 'continuation';
  remaining_scope: string[];
}

export interface ResultGroup {
  dest: string;
  dimension: string;
  items: CompoundItem[];
  /** non-owned text found in the group (ignored) */
  ignoredLines: number;
}

export interface ParsedAgentResult {
  meta: CompoundMeta | null;
  groups: ResultGroup[];
  errors: string[];
}

const DEST_RE = /^===\s+(\S+?)(?:\s+\[([\w-]+)\])?\s*(?:===)?\s*$/;
const META_RE = /^\s*COMPOUND_META\s+(\{.*\})\s*$/;

export function parseMeta(line: string): CompoundMeta | null {
  const m = META_RE.exec(line);
  if (!m) return null;
  try {
    const v = JSON.parse(m[1]!) as Partial<CompoundMeta>;
    if (v.status !== 'done' && v.status !== 'continuation') return null;
    const rs = Array.isArray(v.remaining_scope) ? v.remaining_scope.filter((x): x is string => typeof x === 'string') : [];
    if (v.status === 'continuation' && rs.length === 0) return null;
    return { status: v.status, remaining_scope: rs };
  } catch {
    return null;
  }
}

/** Converts a markdown fragment written in docs entry syntax into Compound items. */
export function itemsFromMarkdown(md: string, dimension: string): { items: CompoundItem[]; ignoredLines: number } {
  const doc = parseDocument(md, { dimension });
  const items: CompoundItem[] = [];
  const owned = new Set<number>();
  const entryHeadingLines = new Set(doc.items.filter((x) => x.kind === 'entry').map((x) => x.start));
  for (const it of doc.items) {
    for (let j = it.start; j <= it.end; j++) owned.add(j);
    if (it.kind === 'entry') {
      const sec = [...doc.headings].reverse().find((h) => h.line < it.start && !entryHeadingLines.has(h.line) && h.level < (it.headingLevel ?? 7));
      const body = joinLines(doc.lines.slice(it.start + 1, it.end)).replace(/\r\n/g, '\n');
      const e: NewEntry = {
        kind: 'entry', dimension, heading: it.heading!, body, source: it.source!,
        ...(sec ? { section: sec.text } : {}), level: it.headingLevel!,
      };
      items.push(e);
    } else if (it.kind === 'block') {
      const inner = doc.lines.slice(it.start + 1, it.end).map((l) => l.text).filter((t) => !/^\s*(?:[-*]\s*)?(?:\*\*)?Evidence(?:\*\*)?\s*[:：]/.test(t));
      const sec = [...doc.headings].reverse().find((h) => h.line < it.start && !entryHeadingLines.has(h.line));
      const b: NewBlock = { kind: 'block', key: it.key, body: inner.join('\n'), evidence: it.evidence!, ...(sec ? { section: sec.text } : {}) };
      items.push(b);
    } else if (it.kind === 'row') {
      const t = doc.lines[it.start]!.text.replace(/\s*<!--\s*compound:owned\s+key="[^"]+"\s*-->\s*/, ' ').trimEnd();
      const sec = [...doc.headings].reverse().find((h) => h.line < it.start && !entryHeadingLines.has(h.line));
      const r: NewRow = { kind: 'row', key: it.key, line: t, ...(sec ? { section: sec.text } : {}) };
      items.push(r);
    }
  }
  let ignored = 0;
  const sectionLines = new Set(doc.headings.map((h) => h.line));
  doc.lines.forEach((l, i) => { if (!owned.has(i) && !sectionLines.has(i) && l.text.trim() !== '') ignored++; });
  return { items, ignoredLines: ignored };
}

export function parseAgentResult(text: string): ParsedAgentResult {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const errors: string[] = [];
  let meta: CompoundMeta | null = null;
  let metaLine = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*COMPOUND_META\b/.test(lines[i]!)) {
      meta = parseMeta(lines[i]!);
      metaLine = i;
      if (!meta) errors.push(`invalid COMPOUND_META at line ${i + 1}`);
      break;
    }
  }
  if (metaLine < 0) errors.push('missing COMPOUND_META line');
  const body = metaLine >= 0 ? lines.slice(0, metaLine) : lines;
  const groups: ResultGroup[] = [];
  let cur: { dest: string; dimension: string; lines: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const { items, ignoredLines } = itemsFromMarkdown(cur.lines.join('\n'), cur.dimension);
    groups.push({ dest: cur.dest, dimension: cur.dimension, items, ignoredLines });
  };
  let fence = false;
  for (const l of body) {
    if (/^ {0,3}(`{3,}|~{3,})/.test(l)) fence = !fence;
    const m = !fence ? DEST_RE.exec(l) : null;
    if (m) {
      flush();
      const dest = normalizeRepoPath(m[1]!);
      cur = { dest, dimension: m[2] ?? dest.replace(/^.*\//, '').replace(/\.md$/, ''), lines: [] };
      continue;
    }
    if (cur) cur.lines.push(l);
    else if (l.trim()) errors.push('content before the first "=== <dest> ===" line ignored');
  }
  flush();
  return { meta, groups, errors: [...new Set(errors)] };
}

export type AgentScope = { kind: 'repo' } | { kind: 'project'; projectId: string };

export interface RouteOptions {
  plan: ScopePlan;
  agent: AgentScope;
  /** repo-relative prefixes the agent was allowed to read; sources outside are rejected */
  allowlist: string[];
  /** line budget of a destination (default 100) */
  budgetFor?: (dest: string) => number;
}

export interface RoutedResult {
  accepted: { dest: string; dimension: string; items: CompoundItem[] }[];
  rejected: { dest: string; key?: string; reason: string }[];
}

function itemLines(it: CompoundItem): number {
  if (it.kind === 'row') return 1;
  const body = it.body.trim() ? it.body.trim().split('\n').length : 0;
  return it.kind === 'entry' ? 4 + body : 3 + body;
}

function evidencePath(it: CompoundItem): string | null {
  if (it.kind === 'entry') return it.source.path;
  if (it.kind === 'block') {
    const m = /`([^`]+)`/.exec(it.evidence) ?? /^(\S+)/.exec(it.evidence.trim());
    return m ? m[1]!.replace(/#.*$/, '').replace(/:\d+(?:-\d+)?$/, '') : null;
  }
  return null;
}

export function routeAgentResult(groups: ResultGroup[], opts: RouteOptions): RoutedResult {
  const out: RoutedResult = { accepted: [], rejected: [] };
  const { plan, agent } = opts;
  for (const g of groups) {
    const dest = g.dest;
    if (!isWritableDocPath(plan, dest)) {
      out.rejected.push({ dest, reason: 'destination is not a writable docs path for this run' });
      continue;
    }
    const owner = scopeOf(plan, dest);
    if (agent.kind === 'repo' && owner !== 'repo') {
      out.rejected.push({ dest, reason: 'repository results may only write root docs' });
      continue;
    }
    if (agent.kind === 'project') {
      const pr = plan.projects.find((p) => p.id === agent.projectId);
      if (!pr || owner !== pr.id || !isUnder(dest, pr.docsRoot)) {
        out.rejected.push({ dest, reason: `project ${agent.projectId} results may only write ${pr?.docsRoot ?? '<unknown project>'}` });
        continue;
      }
    }
    const budget = opts.budgetFor?.(dest) ?? 100;
    let used = 0;
    const items: CompoundItem[] = [];
    let over = false;
    for (const it of g.items) {
      const key = itemKey(it);
      const ev = evidencePath(it);
      if (ev !== null && !opts.allowlist.some((a) => isUnder(normalizeRepoPath(ev), a))) {
        out.rejected.push({ dest, key, reason: `source ${ev} outside the agent allowlist` });
        continue;
      }
      const n = itemLines(it) + 1;
      if (over || used + n > budget) {
        over = true;
        out.rejected.push({ dest, key, reason: `line budget ${budget} exceeded (truncated at entry boundary)` });
        continue;
      }
      used += n;
      items.push(it);
    }
    if (items.length) out.accepted.push({ dest, dimension: g.dimension, items });
  }
  return out;
}
