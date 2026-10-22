// Tech-debt register (docs/tech-debt.md): append-only TD-NNN rows marked with
// `<!-- compound:owned key="debt:..." -->`. Owned rows are refreshed only in
// the allowed columns and only while their Status is Open; human rows and
// human edits to Status are never touched.
import { checkHumanContentPreserved } from './merge.js';
import { detectEol, isBlank, joinLines, sha8, splitLines, type Line } from './text.js';

export interface DebtItem {
  /** `debt:<file>#<symbol>:<sha8>`; see debtKey() */
  key: string;
  description: string;
  source: string;
  location: string;
}

export interface DebtRow {
  line: number;
  id: string;
  key?: string;
  cells: string[];
}

export interface DebtTable {
  headerLine: number;
  sepLine: number;
  lastRowLine: number;
  columns: string[];
  rows: DebtRow[];
}

export interface DebtResult {
  action: 'write' | 'skip' | 'noop' | 'review';
  text?: string;
  added: { id: string; key: string }[];
  refreshed: string[];
  markedPending: string[];
  review: string[];
}

const MARKER_RE = /<!--\s*compound:owned\s+key="(debt:[^"]+)"\s*-->/;

export function debtKey(file: string, symbol: string, text: string): string {
  const norm = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return `debt:${file}${symbol ? '#' + symbol : ''}:${sha8(norm)}`;
}

/** Splits a markdown table row into raw cells (escaped pipes kept). */
export function splitRow(t: string): string[] {
  let s = t.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '\\|'; i++; continue; }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

export function escapeCell(s: string): string {
  return s.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

const COLS: Record<string, RegExp> = {
  id: /^(id|编号)$/i,
  description: /^(description|desc|描述|说明)$/i,
  source: /^(source|来源)$/i,
  location: /^(location|位置|file)$/i,
  status: /^(status|状态)$/i,
};

function colIndex(columns: string[], name: keyof typeof COLS): number {
  return columns.findIndex((c) => COLS[name]!.test(c.replace(/\*/g, '').trim()));
}

export function parseDebtTable(text: string): DebtTable | null {
  const lines = splitLines(text);
  for (let i = 0; i + 1 < lines.length; i++) {
    const t = lines[i]!.text.trim();
    if (!t.startsWith('|')) continue;
    const cols = splitRow(t);
    if (colIndex(cols, 'id') < 0) continue;
    if (!/^\|?\s*:?-{2,}/.test(lines[i + 1]!.text.trim())) continue;
    const rows: DebtRow[] = [];
    let last = i + 1;
    for (let j = i + 2; j < lines.length; j++) {
      const r = lines[j]!.text.trim();
      if (!r.startsWith('|')) break;
      last = j;
      const cells = splitRow(r);
      const id = cells[colIndex(cols, 'id')] ?? '';
      const km = MARKER_RE.exec(r);
      rows.push({ line: j, id: id.trim(), ...(km ? { key: km[1] } : {}), cells });
    }
    return { headerLine: i, sepLine: i + 1, lastRowLine: last, columns: cols, rows };
  }
  return null;
}

export function debtTemplate(): string {
  return [
    '# 技术债登记 / Tech Debt Register',
    '',
    '> 由 Compound 追加；带 `compound:owned` 标记的行只在 Status 为 Open 时刷新描述/来源/位置。人工行与人工修改的 Status 永不改动。',
    '',
    '| ID | Description | Source | Location | Status | Key |',
    '|----|-------------|--------|----------|--------|-----|',
    '',
  ].join('\n');
}

function renderRow(columns: string[], values: Record<string, string>, key: string): string {
  const cells = columns.map((c) => {
    for (const name of Object.keys(COLS)) if (COLS[name]!.test(c.replace(/\*/g, '').trim())) return values[name] ?? '';
    return '';
  });
  if (!columns.some((c) => /^key$/i.test(c.trim()))) cells.push('');
  const keyIdx = columns.findIndex((c) => /^key$/i.test(c.trim()));
  const marker = `<!-- compound:owned key="${key}" -->`;
  cells[keyIdx >= 0 ? keyIdx : cells.length - 1] = marker;
  return `| ${cells.join(' | ')} |`;
}

/**
 * Applies debt items to the register. `text === null` → create from template
 * only when at least one new item exists. `resolvedKeys` = keys whose evidence
 * disappeared: Open rows get `[Pending]` appended to Status (never deleted).
 */
export function applyDebt(text: string | null, items: DebtItem[], resolvedKeys: Set<string> = new Set()): DebtResult {
  const res: DebtResult = { action: 'noop', added: [], refreshed: [], markedPending: [], review: [] };
  if (text === null && items.length === 0) { res.action = 'skip'; return res; }
  const before = text ?? debtTemplate();
  const eol = text ? detectEol(text) : '\n';
  const table = parseDebtTable(before);
  if (!table) { res.action = 'review'; res.review.push('no table with an ID column found'); return res; }
  const lines: Line[] = splitLines(before);
  const ci = (n: keyof typeof COLS) => colIndex(table.columns, n);
  const statusI = ci('status');
  let maxId = 0;
  for (const r of table.rows) {
    const m = /^TD-(\d+)$/i.exec(r.id);
    if (m) maxId = Math.max(maxId, +m[1]!);
  }
  const byKey = new Map<string, DebtRow[]>();
  for (const r of table.rows) if (r.key) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
  for (const [k, rs] of byKey) if (rs.length > 1) res.review.push(`duplicate debt key ${k}`);

  for (const it of items) {
    const rs = byKey.get(it.key);
    if (rs && rs.length > 1) continue;
    const row = rs?.[0];
    if (!row) continue;
    const status = statusI >= 0 ? (row.cells[statusI] ?? '') : 'Open';
    if (!/^open$/i.test(status.trim())) continue; // human changed status, or [Pending]
    const cells = row.cells.slice();
    const set = (n: keyof typeof COLS, v: string) => { const i = ci(n); if (i >= 0) cells[i] = escapeCell(v); };
    set('description', it.description);
    set('source', it.source);
    set('location', it.location);
    const t = `| ${cells.join(' | ')} |`;
    if (t !== lines[row.line]!.text) {
      lines[row.line] = { text: t, eol: lines[row.line]!.eol };
      res.refreshed.push(it.key);
    }
  }
  for (const k of resolvedKeys) {
    const rs = byKey.get(k);
    if (!rs || rs.length !== 1 || statusI < 0) continue;
    const row = rs[0]!;
    const cells = splitRow(lines[row.line]!.text);
    if (!/^open$/i.test((cells[statusI] ?? '').trim())) continue;
    cells[statusI] = `${cells[statusI]!.trim()} [Pending]`;
    lines[row.line] = { text: `| ${cells.join(' | ')} |`, eol: lines[row.line]!.eol };
    res.markedPending.push(k);
  }
  const newRows: Line[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (byKey.has(it.key) || seen.has(it.key)) continue;
    seen.add(it.key);
    const id = `TD-${String(++maxId).padStart(3, '0')}`;
    newRows.push({
      text: renderRow(table.columns, { id, description: escapeCell(it.description), source: escapeCell(it.source), location: escapeCell(it.location), status: 'Open' }, it.key),
      eol,
    });
    res.added.push({ id, key: it.key });
  }
  if (text === null && newRows.length === 0) { res.action = 'skip'; return res; }
  if (newRows.length) {
    const at = table.lastRowLine + 1;
    if (lines[at - 1]!.eol === '') lines[at - 1] = { text: lines[at - 1]!.text, eol };
    const after = at < lines.length && !isBlank(lines[at]!.text) ? [{ text: '', eol } as Line] : [];
    if (at >= lines.length) newRows[newRows.length - 1]!.eol = eol;
    lines.splice(at, 0, ...newRows, ...after);
  }
  if (!res.added.length && !res.refreshed.length && !res.markedPending.length) return res;
  const out = joinLines(lines);
  if (text !== null) {
    const v = checkHumanContentPreserved(text, out);
    if (v) { res.action = 'review'; res.review.push(`internal invariant: ${v.message}`); return res; }
  }
  res.action = 'write';
  res.text = out;
  return res;
}

/** Extracts TODO/FIXME/HACK comments with an explanation of at least 4 words. */
export function extractDebtComments(file: string, text: string): { line: number; tag: string; text: string }[] {
  const out: { line: number; tag: string; text: string }[] = [];
  splitLines(text).forEach((l, i) => {
    const m = /(?:\/\/|#|\/\*+|\*|<!--|--)\s*(TODO|FIXME|HACK)\b[:(\s]?(?:\([^)]*\))?[:\s]*(.*?)(?:\*\/|-->)?\s*$/.exec(l.text);
    if (!m) return;
    const expl = m[2]!.trim();
    const words = expl.split(/\s+/).filter(Boolean).length;
    const cjk = (expl.match(/\p{Script=Han}/gu) ?? []).length;
    if (words >= 4 || cjk >= 6) out.push({ line: i + 1, tag: m[1]!, text: expl });
  });
  void file;
  return out;
}
