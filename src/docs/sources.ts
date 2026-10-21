// Source verification (SFK phase 3): decides the final evidence tag of every
// Compound entry before it reaches the merge step.
import type { NewEntry } from './merge.js';
import type { FileState } from './ownership.js';
import type { SourceTag } from './markers.js';

export interface VerifyContext {
  /** file state of the destination */
  state: FileState;
  /** repo-relative path exists (symbol-level checks may be layered in by the caller) */
  exists: (path: string) => boolean;
  /** the entry derives only from Draft / status-less specs */
  draftOnly?: (e: NewEntry) => boolean;
  /** destination dimension accepts requirement-style [Unconfirmed] entries */
  requirementOriented?: boolean;
  /** evidence search for [AI Inferred] entries: returns a code source or null */
  findEvidence?: (e: NewEntry) => { path: string; anchor?: string } | null;
}

export interface VerifyOutcome {
  kept: NewEntry[];
  dropped: { entry: NewEntry; reason: string }[];
}

export function verifyEntrySources(entries: NewEntry[], ctx: VerifyContext): VerifyOutcome {
  const kept: NewEntry[] = [];
  const dropped: VerifyOutcome['dropped'] = [];
  const insertOnly = ctx.state === 'new' || ctx.state === 'adopted' || ctx.state === 'skeleton';
  for (const e of entries) {
    if (ctx.draftOnly?.(e)) {
      if (!ctx.requirementOriented) { dropped.push({ entry: e, reason: 'Draft-only content outside a requirement-oriented dimension' }); continue; }
      kept.push({ ...e, source: { ...e.source, status: 'Unconfirmed' } });
      continue;
    }
    let src: SourceTag = { ...e.source };
    if (src.origin === 'AI Inferred') {
      const ev = ctx.findEvidence?.(e) ?? null;
      if (!ev) { dropped.push({ entry: e, reason: '[AI Inferred] without code evidence (omitted)' }); continue; }
      src = { path: ev.path, origin: 'Code Direct', ...(ev.anchor ? { anchor: ev.anchor } : {}) };
    }
    if (ctx.exists(src.path)) {
      kept.push({ ...e, source: { ...src, status: 'Verified' } });
    } else if (insertOnly) {
      dropped.push({ entry: e, reason: `source ${src.path} missing ([Pending] not inserted into ${ctx.state} file)` });
    } else {
      kept.push({ ...e, source: { ...src, status: 'Pending' } });
    }
  }
  return { kept, dropped };
}
