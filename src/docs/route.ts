// Repository vs project ownership of a piece of knowledge. Repo-level rules
// need root-owned evidence or matching evidence from ≥2 selected projects.
import type { ScopePlan } from './scope.js';
import { dirname, relativePath } from './text.js';

export interface Evidence {
  /** 'repo' or a project id */
  scope: string;
  kind: 'code' | 'spec' | 'doc';
  path: string;
  line?: number;
  /** parity key (route id, constant name, METHOD path, schema name) */
  parityKey?: string;
  /** normalized value for parity comparison */
  value?: string;
}

export interface RouteDecision {
  /** 'repo', a project id, or null (do not write) */
  dest: string | null;
  reason: string;
  /** ≥2 projects share the key but disagree: a cross-project difference, not a rule */
  parityDiff?: boolean;
  /** projects that should get an xref line to the root entry */
  xrefProjects?: string[];
}

export function routeByEvidence(evidence: Evidence[], plan: ScopePlan): RouteDecision {
  const selected = new Set(plan.projects.map((p) => p.id));
  const ev = evidence.filter((e) => e.scope === 'repo' || selected.has(e.scope));
  const hasRoot = ev.some((e) => e.scope === 'repo');
  const projs = [...new Set(ev.filter((e) => e.scope !== 'repo').map((e) => e.scope))].sort();
  const repoDest = (reason: string, extra: Partial<RouteDecision> = {}): RouteDecision =>
    plan.repository.writeEnabled
      ? { dest: 'repo', reason, ...extra, ...(projs.length ? { xrefProjects: projs } : {}) }
      : { dest: null, reason: `${reason}; root docs write disabled (--no-root-write)`, ...extra };
  if (hasRoot) return repoDest('root-owned evidence');
  if (projs.length >= 2) {
    // matching = same parity key with equal values across ≥2 projects
    const byKey = new Map<string, Map<string, string | undefined>>();
    for (const e of ev) {
      if (!e.parityKey) continue;
      const m = byKey.get(e.parityKey) ?? new Map<string, string | undefined>();
      m.set(e.scope, e.value);
      byKey.set(e.parityKey, m);
    }
    const keyed = [...byKey.values()].filter((m) => m.size >= 2);
    if (keyed.length === 0) {
      // evidence from ≥2 projects without parity keys counts as matching
      return repoDest(`matching evidence from ${projs.length} projects`);
    }
    const agree = keyed.some((m) => new Set([...m.values()]).size === 1);
    if (agree) return repoDest(`matching parity evidence from ${projs.length} projects`);
    return repoDest('parity difference across projects', { parityDiff: true });
  }
  if (projs.length === 1) return { dest: projs[0]!, reason: 'single-project evidence' };
  return { dest: null, reason: 'no evidence from selected scopes' };
}

/** Cross-reference row for a project doc pointing at the canonical root entry (never copies the body). */
export function xrefRow(projectDoc: string, rootDoc: string, rootKey: string, title: string, anchor?: string): { kind: 'row'; key: string; line: string } {
  const rel = relativePath(dirname(projectDoc), rootDoc);
  return { kind: 'row', key: `xref:${rootKey}`, line: `- 参见 [${title}](${rel}${anchor ? '#' + anchor : ''})` };
}
