import { describe, expect, it } from 'vitest';
import { itemsFromMarkdown, parseAgentResult, parseMeta, routeAgentResult } from '../../src/docs/contract.js';
import { mergeDocument } from '../../src/docs/merge.js';
import { routeByEvidence, xrefRow, type Evidence } from '../../src/docs/route.js';
import { discoverScopes } from '../../src/docs/scope.js';
import { memFs } from './memfs.js';

const FS = memFs(['apps/shop-android/build.gradle', 'apps/shop-ios/Package.swift', 'apps/shop-harmony/build-profile.json5', 'packages/shared/package.json']);
const plan = discoverScopes(FS);
const planNoRoot = discoverScopes(FS, { noRootWrite: true });

const RESULT = `
=== apps/shop-android/docs/architecture.md [architecture] ===
## Modules

### Cart

Cart is in :feature:cart.

**Source**: \`apps/shop-android/feature/cart/Cart.kt\` [Code Direct]

### Secret

**Source**: \`apps/shop-ios/Sources/Pay.swift\` [Code Direct]

stray human-looking text

=== docs/architecture.md ===
### Repo thing

**Source**: \`apps/shop-android/x.kt\` [Code Direct]

=== apps/shop-android/docs/constitution.md [constitution] ===
<!-- compound:owned:start key="rule:no-network-in-ui" -->
UI never calls network.
Evidence: \`apps/shop-android/lint.xml\`
<!-- compound:owned:end -->

## Index

- [API](api.md) <!-- compound:owned key="index:apps/shop-android/docs/api.md" -->

=== specs/001/spec.md ===
### Nope

**Source**: \`apps/shop-android/x.kt\` [Code Direct]

COMPOUND_META {"status":"continuation","remaining_scope":["apps/shop-android/feature/pay"]}
`;

describe('parseAgentResult', () => {
  const r = parseAgentResult(RESULT);
  it('parses meta and groups by destination', () => {
    expect(r.meta).toEqual({ status: 'continuation', remaining_scope: ['apps/shop-android/feature/pay'] });
    expect(r.errors).toEqual([]);
    expect(r.groups.map((g) => [g.dest, g.dimension, g.items.length])).toEqual([
      ['apps/shop-android/docs/architecture.md', 'architecture', 2],
      ['docs/architecture.md', 'architecture', 1],
      ['apps/shop-android/docs/constitution.md', 'constitution', 2],
      ['specs/001/spec.md', 'spec', 1],
    ]);
    expect(r.groups[0]!.ignoredLines).toBe(1);
    expect(r.groups[0]!.items[0]).toEqual({
      kind: 'entry', dimension: 'architecture', heading: 'Cart', body: '\nCart is in :feature:cart.\n\n', section: 'Modules', level: 3,
      source: { path: 'apps/shop-android/feature/cart/Cart.kt', origin: 'Code Direct' },
    });
    expect(r.groups[2]!.items).toEqual([
      { kind: 'block', key: 'rule:no-network-in-ui', body: 'UI never calls network.', evidence: '`apps/shop-android/lint.xml`' },
      { kind: 'row', key: 'index:apps/shop-android/docs/api.md', line: '- [API](api.md)', section: 'Index' },
    ]);
  });
  it('meta validation', () => {
    expect(parseMeta('COMPOUND_META {"status":"done","remaining_scope":[]}')).toEqual({ status: 'done', remaining_scope: [] });
    expect(parseMeta('COMPOUND_META {"status":"continuation","remaining_scope":[]}')).toBeNull();
    expect(parseMeta('COMPOUND_META {"status":"weird"}')).toBeNull();
    expect(parseMeta('COMPOUND_META not json')).toBeNull();
    expect(parseAgentResult('=== docs/a.md ===\n').errors).toEqual(['missing COMPOUND_META line']);
    expect(parseAgentResult('junk\n=== docs/a.md ===\nCOMPOUND_META {"status":"done"}').errors).toEqual(['content before the first "=== <dest> ===" line ignored']);
  });
  it('dest markers inside code fences are content', () => {
    const r2 = parseAgentResult('=== docs/a.md ===\n### E\n\n```\n=== docs/b.md ===\n```\n\n**Source**: `x` [Code Direct]\nCOMPOUND_META {"status":"done","remaining_scope":[]}');
    expect(r2.groups).toHaveLength(1);
  });
  it('parsed items merge cleanly into a new file', () => {
    const items = itemsFromMarkdown('## Modules\n\n### Cart\n\nBody.\n\n**Source**: `a.kt` [Code Direct] [Verified]\n', 'architecture').items;
    const m = mergeDocument({ path: 'x.md', text: null, state: 'new', dimension: 'architecture', items, scanDate: '2026-10-21', scanMode: 'full', title: 'Arch' });
    expect(m.text).toContain('## Modules\n\n### Cart\n\nBody.\n\n**Source**: `a.kt` [Code Direct] [Verified]\n');
  });
});

describe('routeAgentResult', () => {
  const r = parseAgentResult(RESULT);
  it('project results → own docs only; out-of-allowlist sources rejected; specs never written', () => {
    const out = routeAgentResult(r.groups, { plan, agent: { kind: 'project', projectId: 'shop-android' }, allowlist: ['apps/shop-android', 'specs'] });
    expect(out.accepted.map((a) => [a.dest, a.items.length])).toEqual([
      ['apps/shop-android/docs/architecture.md', 1],
      ['apps/shop-android/docs/constitution.md', 2],
    ]);
    expect(out.rejected.map((x) => [x.dest, x.reason.replace(/ .*/, '')])).toEqual([
      ['apps/shop-android/docs/architecture.md', 'source'],
      ['docs/architecture.md', 'project'],
      ['specs/001/spec.md', 'destination'],
    ]);
  });
  it('repo results → root docs only', () => {
    const out = routeAgentResult(r.groups, { plan, agent: { kind: 'repo' }, allowlist: [''] });
    expect(out.accepted.map((a) => a.dest)).toEqual(['docs/architecture.md']);
    const blocked = routeAgentResult(r.groups, { plan: planNoRoot, agent: { kind: 'repo' }, allowlist: [''] });
    expect(blocked.accepted).toEqual([]);
  });
  it('line budgets truncate at entry boundaries', () => {
    const big = (h: string) => `### ${h}\n\n${Array.from({ length: 40 }, (_, i) => `l${i}`).join('\n')}\n\n**Source**: \`apps/shop-android/${h}.kt\` [Code Direct]\n`;
    const res = parseAgentResult(`=== apps/shop-android/docs/a.md ===\n${big('A')}${big('B')}${big('C')}${big('D')}COMPOUND_META {"status":"done","remaining_scope":[]}`);
    const out = routeAgentResult(res.groups, { plan, agent: { kind: 'project', projectId: 'shop-android' }, allowlist: ['apps/shop-android'], budgetFor: () => 100 });
    expect(out.accepted[0]!.items.map((i) => (i.kind === 'entry' ? i.heading : ''))).toEqual(['A', 'B']);
    const out150 = routeAgentResult(res.groups, { plan, agent: { kind: 'project', projectId: 'shop-android' }, allowlist: ['apps/shop-android'], budgetFor: () => 150 });
    expect(out150.accepted[0]!.items).toHaveLength(3);
  });
});

describe('routeByEvidence (repo-level evidence rule)', () => {
  const ev = (scope: string, extra: Partial<Evidence> = {}): Evidence => ({ scope, kind: 'code', path: `${scope}/x`, ...extra });
  it('root-owned evidence → repo', () => {
    expect(routeByEvidence([ev('repo')], plan)).toMatchObject({ dest: 'repo', reason: 'root-owned evidence' });
  });
  it('single project → that project', () => {
    expect(routeByEvidence([ev('shop-ios'), ev('shop-ios')], plan)).toMatchObject({ dest: 'shop-ios' });
  });
  it('≥2 selected projects with matching parity values → repo + xrefs', () => {
    const d = routeByEvidence([ev('shop-ios', { parityKey: 'MAX_CART', value: '99' }), ev('shop-android', { parityKey: 'MAX_CART', value: '99' })], plan);
    expect(d).toMatchObject({ dest: 'repo', xrefProjects: ['shop-android', 'shop-ios'] });
    expect(d.parityDiff).toBeUndefined();
  });
  it('≥2 projects disagreeing → repo with parityDiff', () => {
    expect(routeByEvidence([ev('shop-ios', { parityKey: 'MAX_CART', value: '99' }), ev('shop-android', { parityKey: 'MAX_CART', value: '50' })], plan)).toMatchObject({ dest: 'repo', parityDiff: true });
  });
  it('evidence from unselected projects does not count', () => {
    const only = discoverScopes(FS, { projectIds: ['shop-ios'] });
    expect(routeByEvidence([ev('shop-ios'), ev('shop-android')], only)).toMatchObject({ dest: 'shop-ios' });
  });
  it('root write disabled → null with reason', () => {
    expect(routeByEvidence([ev('repo')], planNoRoot)).toMatchObject({ dest: null, reason: expect.stringMatching(/no-root-write/) });
  });
  it('no evidence → null', () => {
    expect(routeByEvidence([], plan).dest).toBeNull();
  });
  it('xref rows link project docs to the canonical root entry', () => {
    expect(xrefRow('apps/shop-ios/docs/contracts.md', 'docs/contracts.md', 'src:a::login', '共享登录契约', 'login')).toEqual({
      kind: 'row', key: 'xref:src:a::login', line: '- 参见 [共享登录契约](../../../docs/contracts.md#login)',
    });
  });
});
