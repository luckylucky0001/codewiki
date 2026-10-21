import { describe, expect, it } from 'vitest';
import { detectStaleSpecs, isSpecPath, isTrusted, parseSpecMeta, specAllowedFor, trustDecision, type SpecDoc } from '../../src/docs/specs.js';
import { verifyEntrySources } from '../../src/docs/sources.js';
import type { NewEntry } from '../../src/docs/merge.js';

describe('parseSpecMeta', () => {
  it('reads status and created', () => {
    expect(parseSpecMeta('# Spec\n\n**Status**: Implemented\n**Created**: 2026-01-02\n')).toEqual({ status: 'Implemented', declared: true, raw: 'Implemented', created: '2026-01-02' });
    expect(parseSpecMeta('- **Status**: verified')).toMatchObject({ status: 'Verified' });
    expect(parseSpecMeta('**Status**：Archived')).toMatchObject({ status: 'Archived' });
  });
  it('Draft by default, unknown words are Draft', () => {
    expect(parseSpecMeta('# no status')).toEqual({ status: 'Draft', declared: false });
    expect(parseSpecMeta('**Status**: InReview')).toMatchObject({ status: 'Draft', declared: true, raw: 'InReview' });
  });
  it('trust table', () => {
    expect(isTrusted('Implemented')).toBe(true);
    expect(isTrusted('Draft')).toBe(false);
    expect(trustDecision('Implemented', 'verified').tag).toEqual({ origin: 'Code Direct', status: 'Verified' });
    expect(trustDecision('Verified', 'conflict')).toMatchObject({ tag: null, report: 'stale-implemented' });
    expect(trustDecision('Archived', 'unverifiable')).toMatchObject({ tag: { origin: 'AI Inferred' }, requirementOnly: true });
    expect(trustDecision('Draft', 'verified')).toMatchObject({ tag: { status: 'Unconfirmed' }, requirementOnly: true });
    expect(trustDecision('Draft', 'conflict')).toMatchObject({ tag: null, report: 'conflict' });
  });
  it('Draft only feeds requirement-oriented dimensions, never constitution/adr/debt', () => {
    expect(specAllowedFor('Draft', { id: 'requirements', requirementOriented: true })).toBe(true);
    expect(specAllowedFor('Draft', { id: 'architecture' })).toBe(false);
    expect(specAllowedFor('Draft', { id: 'constitution', requirementOriented: true })).toBe(false);
    expect(specAllowedFor('Draft', { id: 'adr', requirementOriented: true })).toBe(false);
    expect(specAllowedFor('Implemented', { id: 'constitution' })).toBe(true);
  });
  it('spec paths are never writable', () => {
    expect(isSpecPath('specs/001/spec.md', ['specs'])).toBe(true);
    expect(isSpecPath('./apps/a/specs/x.md', ['specs', 'apps/a/specs'])).toBe(true);
    expect(isSpecPath('specsx/a.md', ['specs'])).toBe(false);
  });
});

describe('detectStaleSpecs', () => {
  const now = new Date('2026-10-21T00:00:00Z');
  const spec = (path: string, md: string): SpecDoc => ({ path, dir: path.replace(/\/spec\.md$/, ''), meta: parseSpecMeta(md) });
  const specs = [
    spec('specs/001/spec.md', '**Status**: Draft'),
    spec('specs/002/spec.md', '**Status**: Draft'),
    spec('specs/003/spec.md', '**Status**: Implemented'),
    spec('specs/004/spec.md', '**Status**: Implemented'),
    spec('specs/005/spec.md', '# none\n**Created**: 2025-01-01'),
    spec('specs/006/spec.md', '# none'),
    spec('specs/007/spec.md', '**Status**: Verified'),
  ];
  const dates: Record<string, string> = { 'specs/001': '2026-09-01T00:00:00Z', 'specs/002': '2026-10-10T00:00:00Z' };
  const git = {
    lastCommitDate: (d: string) => dates[d] ?? null,
    everVerified: (f: string) => f === 'specs/004/spec.md',
  };
  it('reports Draft >30d, Draft without history, Implemented never Verified, conflicts', () => {
    const out = detectStaleSpecs(specs, git, { now, conflicts: new Set(['specs/004/spec.md']) });
    expect(out.map((s) => [s.path, s.reason])).toEqual([
      ['specs/001/spec.md', 'draft-stale'],
      ['specs/003/spec.md', 'implemented-never-verified'],
      ['specs/004/spec.md', 'implemented-conflict'],
      ['specs/005/spec.md', 'draft-stale'],
      ['specs/006/spec.md', 'draft-no-history'],
    ]);
  });
  it('custom day threshold', () => {
    const out = detectStaleSpecs(specs.slice(0, 2), git, { now, days: 5 });
    expect(out.map((s) => s.path)).toEqual(['specs/001/spec.md', 'specs/002/spec.md']);
  });
});

describe('verifyEntrySources', () => {
  const e = (path: string, origin: 'Code Direct' | 'AI Inferred' = 'Code Direct', heading = 'H'): NewEntry => ({ kind: 'entry', dimension: 'architecture', heading, body: 'b', source: { path, origin } });
  const exists = (p: string) => p.startsWith('src/');
  it('[Code Direct] existing → Verified; missing → Pending in managed, omitted in new/adopted/skeleton', () => {
    const m = verifyEntrySources([e('src/a.ts'), e('gone.ts')], { state: 'managed', exists });
    expect(m.kept.map((k) => k.source.status)).toEqual(['Verified', 'Pending']);
    for (const state of ['new', 'adopted', 'skeleton'] as const) {
      const r = verifyEntrySources([e('src/a.ts'), e('gone.ts')], { state, exists });
      expect(r.kept).toHaveLength(1);
      expect(r.dropped[0]!.reason).toMatch(/Pending/);
    }
  });
  it('Draft-only → Unconfirmed in requirement dimensions, dropped elsewhere', () => {
    const draftOnly = () => true;
    expect(verifyEntrySources([e('specs/1/spec.md', 'AI Inferred')], { state: 'managed', exists, draftOnly, requirementOriented: true }).kept[0]!.source.status).toBe('Unconfirmed');
    expect(verifyEntrySources([e('specs/1/spec.md', 'AI Inferred')], { state: 'managed', exists, draftOnly }).kept).toHaveLength(0);
  });
  it('[AI Inferred] upgrades with evidence or is omitted', () => {
    const r = verifyEntrySources([e('?', 'AI Inferred', 'Found'), e('?', 'AI Inferred', 'Lost')], {
      state: 'new', exists, findEvidence: (x) => (x.heading === 'Found' ? { path: 'src/f.ts', anchor: 'ts://f@1' } : null),
    });
    expect(r.kept).toEqual([{ ...e('?', 'AI Inferred', 'Found'), source: { path: 'src/f.ts', origin: 'Code Direct', anchor: 'ts://f@1', status: 'Verified' } }]);
    expect(r.dropped[0]!.reason).toMatch(/without code evidence/);
  });
});
