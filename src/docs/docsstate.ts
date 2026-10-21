// .kb/docs-state.json — codewiki extension: per-scope incremental base.
// SFK derives the base only from file frontmatter (`last_compound_scan`), which
// is refreshed only when content is written; a no-op run therefore never moves
// the base forward. kb records every completed scan here instead:
//   { "<scope_id>": { "last_scan_commit": "<sha>", "last_scan_date": "YYYY-MM-DD" } }
// When present it is the base; otherwise the earliest `last_compound_scan` is used.
import fs from 'node:fs';
import path from 'node:path';
import { earliestScanBase, type ManagedFileInfo, type ScanBase } from './changes.js';
import { isValidScanDate } from './text.js';

export interface ScopeScanRecord {
  last_scan_commit?: string;
  last_scan_date?: string;
}

export type DocsState = Record<string, ScopeScanRecord>;

export const DocsStateFile = path.join('.kb', 'docs-state.json');

export function parseDocsState(text: string | null): DocsState {
  if (!text) return {};
  let v: unknown;
  try { v = JSON.parse(text); } catch { return {}; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: DocsState = {};
  for (const [id, rec] of Object.entries(v as Record<string, unknown>)) {
    if (!rec || typeof rec !== 'object') continue;
    const r = rec as Record<string, unknown>;
    const commit = typeof r['last_scan_commit'] === 'string' && /^[0-9a-f]{4,64}$/i.test(r['last_scan_commit']) ? r['last_scan_commit'] : undefined;
    const date = typeof r['last_scan_date'] === 'string' && isValidScanDate(r['last_scan_date']) ? r['last_scan_date'] : undefined;
    if (commit || date) out[id] = { ...(commit ? { last_scan_commit: commit } : {}), ...(date ? { last_scan_date: date } : {}) };
  }
  return out;
}

export function serializeDocsState(s: DocsState): string {
  const sorted: DocsState = {};
  for (const k of Object.keys(s).sort()) sorted[k] = s[k]!;
  return JSON.stringify(sorted, null, 2) + '\n';
}

/** Records a completed scan of a scope (call after every successful run, including no-op runs). */
export function recordScopeScan(s: DocsState, scopeId: string, commit: string | undefined, date: string): DocsState {
  return { ...s, [scopeId]: { ...(commit ? { last_scan_commit: commit } : {}), last_scan_date: date } };
}

/** Incremental base of a scope: docs-state record, else the earliest managed-file frontmatter, else null (full). */
export function resolveScanBase(scopeId: string, state: DocsState, managed: ManagedFileInfo[]): (ScanBase & { from: 'docs-state' | 'frontmatter' }) | null {
  const rec = state[scopeId];
  if (rec && (rec.last_scan_commit || rec.last_scan_date)) {
    return { ...(rec.last_scan_commit ? { commit: rec.last_scan_commit } : {}), ...(rec.last_scan_date ? { date: rec.last_scan_date } : {}), from: 'docs-state' };
  }
  const fm = earliestScanBase(managed);
  return fm ? { ...fm, from: 'frontmatter' } : null;
}

export function loadDocsState(kbParent: string): DocsState {
  try { return parseDocsState(fs.readFileSync(path.join(kbParent, DocsStateFile), 'utf8')); } catch { return {}; }
}

export function saveDocsState(kbParent: string, s: DocsState): void {
  const p = path.join(kbParent, DocsStateFile);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, serializeDocsState(s));
  fs.renameSync(tmp, p);
}
