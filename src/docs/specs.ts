// Spec status trust: `**Status**:` decides whether a spec may feed docs.
// specs/ is input only and is never written.

export type SpecStatus = 'Draft' | 'Implemented' | 'Verified' | 'Archived';

export interface SpecMeta {
  status: SpecStatus;
  /** false when no `**Status**:` line was found (Draft by default) */
  declared: boolean;
  /** raw status word as written */
  raw?: string;
  created?: string;
}

const STATUS_RE = /^\s*(?:[-*]\s*)?\*\*Status\*\*\s*[:：]\s*\**\s*([A-Za-z]+)/m;
const CREATED_RE = /^\s*(?:[-*]\s*)?\*\*Created\*\*\s*[:：]\s*\**\s*(\d{4}-\d{2}-\d{2})/m;

export function parseSpecMeta(md: string): SpecMeta {
  const sm = STATUS_RE.exec(md);
  const cm = CREATED_RE.exec(md);
  const raw = sm?.[1];
  const norm = raw ? raw[0]!.toUpperCase() + raw.slice(1).toLowerCase() : undefined;
  const status: SpecStatus = norm === 'Implemented' || norm === 'Verified' || norm === 'Archived' ? norm : 'Draft';
  return { status, declared: !!sm, ...(raw ? { raw } : {}), ...(cm ? { created: cm[1] } : {}) };
}

export function isTrusted(status: SpecStatus): boolean {
  return status === 'Implemented' || status === 'Verified' || status === 'Archived';
}

/** Dimensions a spec of this status may feed. Draft only feeds requirement-oriented ones, never constitution/ADR/debt. */
export function specAllowedFor(status: SpecStatus, dim: { id: string; requirementOriented?: boolean }): boolean {
  if (isTrusted(status)) return true;
  if (dim.id === 'constitution' || dim.id === 'adr' || dim.id === 'tech-debt' || dim.id === 'debt') return false;
  return !!dim.requirementOriented;
}

export type IngestVerdict = 'verified' | 'conflict' | 'unverifiable';

export interface TrustDecision {
  /** null = do not write an entry */
  tag: { origin: 'Code Direct' | 'AI Inferred'; status?: 'Verified' | 'Unconfirmed' } | null;
  requirementOnly: boolean;
  report?: 'conflict' | 'stale-implemented';
}

/** Trust table (status × ingest verdict), see sfk-compound-mapping §7. */
export function trustDecision(status: SpecStatus, verdict: IngestVerdict): TrustDecision {
  if (isTrusted(status)) {
    if (verdict === 'verified') return { tag: { origin: 'Code Direct', status: 'Verified' }, requirementOnly: false };
    if (verdict === 'conflict') return { tag: null, requirementOnly: false, report: 'stale-implemented' };
    return { tag: { origin: 'AI Inferred' }, requirementOnly: true };
  }
  if (verdict === 'conflict') return { tag: null, requirementOnly: true, report: 'conflict' };
  return { tag: { origin: 'AI Inferred', status: 'Unconfirmed' }, requirementOnly: true };
}

export interface SpecDoc {
  /** path of spec.md */
  path: string;
  /** spec directory */
  dir: string;
  meta: SpecMeta;
}

export interface SpecGit {
  /** ISO date of the last commit touching `dir`, null if none / not git */
  lastCommitDate(dir: string): string | null;
  /** true if the file ever contained `**Status**: Verified` in history (git log -S) */
  everVerified(file: string): boolean;
}

export interface StaleSpec {
  path: string;
  status: SpecStatus;
  reason: 'draft-stale' | 'draft-no-history' | 'implemented-never-verified' | 'implemented-conflict';
  detail: string;
}

export function detectStaleSpecs(
  specs: SpecDoc[],
  git: SpecGit,
  opts: { now: Date; days?: number; conflicts?: Set<string> },
): StaleSpec[] {
  const days = opts.days ?? 30;
  const cutoff = opts.now.getTime() - days * 86400_000;
  const out: StaleSpec[] = [];
  for (const s of [...specs].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const st = s.meta.status;
    if (st === 'Draft') {
      const last = git.lastCommitDate(s.dir);
      const ref = last ?? s.meta.created ?? null;
      if (!ref) {
        out.push({ path: s.path, status: st, reason: 'draft-no-history', detail: 'Draft without commits or **Created** date' });
        continue;
      }
      const t = Date.parse(ref);
      if (!Number.isNaN(t) && t < cutoff) {
        out.push({ path: s.path, status: st, reason: 'draft-stale', detail: `Draft, last ${last ? 'commit' : 'created'} ${ref.slice(0, 10)} (> ${days} days)` });
      }
    } else if (st === 'Implemented') {
      if (!git.everVerified(s.path)) out.push({ path: s.path, status: st, reason: 'implemented-never-verified', detail: 'Implemented but never marked Verified' });
      if (opts.conflicts?.has(s.path)) out.push({ path: s.path, status: st, reason: 'implemented-conflict', detail: 'Implemented but the code contradicts it' });
    }
  }
  return out;
}

/** True for paths under any specs root: specs are never written. */
export function isSpecPath(p: string, specsRoots: string[]): boolean {
  const n = p.replace(/\\/g, '/').replace(/^\.\//, '');
  return specsRoots.some((r) => {
    const root = r.replace(/\/+$/, '');
    return n === root || n.startsWith(root + '/');
  });
}
