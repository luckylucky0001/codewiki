import { describe, expect, it } from 'vitest';
import { parseExistingAdrs, planAdrs, type AdrProposal } from '../../src/docs/adr.js';
import { applyDebt, debtKey, debtTemplate, extractDebtComments, parseDebtTable, splitRow } from '../../src/docs/debt.js';
import { parseDocument } from '../../src/docs/markers.js';
import { assertHumanContentPreserved } from '../../src/docs/merge.js';

const prop = (key: string, title: string, extra: Partial<AdrProposal> = {}): AdrProposal => ({
  key, title, context: 'Ctx.', decision: 'Dec.', consequences: 'Cons.', evidence: ['`specs/001/plan.md`'], relatedSpec: 'specs/001/spec.md', specTrusted: true, ...extra,
});

describe('ADR proposals', () => {
  const existing = parseExistingAdrs('docs/adr', [
    { name: '0001-use-room.md', text: '# 1. Use Room for persistence\n\n**Status**: Accepted\n\nSee specs/001/spec.md.\n' },
    { name: '0007-proposed.md', text: '<!-- compound:proposed key="adr:specs/002/cache" -->\n# 0007. Cache policy\n' },
    { name: 'README.md', text: '# ADRs' },
  ]);
  it('parses existing ADRs', () => {
    expect(existing.map((a) => [a.number, a.title, a.key ?? '-', a.specs.join(',')])).toEqual([
      [1, 'Use Room for persistence', '-', 'specs/001/spec.md'],
      [7, 'Cache policy', 'adr:specs/002/cache', ''],
    ]);
  });
  it('numbers after the max, dedupes by key / title / related spec', () => {
    const plan = planAdrs('docs/adr', existing, [
      prop('adr:specs/002/cache', 'Something else'),
      prop('adr:specs/003/x', 'cache   POLICY'),
      prop('adr:specs/001/room', 'Use Room persistence', { relatedSpec: 'specs/001/spec.md' }),
      prop('adr:specs/004/grpc', 'Adopt gRPC for sync', { relatedSpec: 'specs/004/spec.md' }),
      prop('adr:specs/005/draft', 'Draft thing', { specTrusted: false }),
      prop('adr:specs/004/grpc2', 'Adopt gRPC for sync'),
      prop('adr:specs/006/中文', '采用统一错误码'),
    ], '2026-10-21');
    expect(plan.create.map((c) => c.path)).toEqual(['docs/adr/0008-adopt-grpc-for-sync.md', 'docs/adr/0009-decision-' + plan.create[1]!.path.slice(-11, -3) + '.md']);
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      'duplicate of existing ADR', 'duplicate of existing ADR', 'duplicate of existing ADR',
      'source spec is not trusted (Draft/missing status)', 'duplicate of existing ADR',
    ]);
    const t = plan.create[0]!.text;
    expect(t.split('\n')[0]).toBe('<!-- compound:proposed key="adr:specs/004/grpc" -->');
    expect(t).toContain('# 0008. Adopt gRPC for sync');
    expect(t).toContain('**Status**: Proposed');
    expect(parseDocument(t).proposedKey).toBe('adr:specs/004/grpc');
  });
  it('is idempotent when re-run against its own output', () => {
    const p1 = planAdrs('docs/adr', [], [prop('adr:a/b', 'Use X')], '2026-10-21');
    const ex = parseExistingAdrs('docs/adr', p1.create.map((c) => ({ name: c.path.split('/').pop()!, text: c.text })));
    expect(planAdrs('docs/adr', ex, [prop('adr:a/b', 'Use X')], '2026-10-22').create).toEqual([]);
  });
});

describe('tech-debt register', () => {
  const item = (k: string, d = 'desc ' + k) => ({ key: `debt:${k}`, description: d, source: 'tasks.md', location: `src/${k}.ts` });
  it('creates from template only with ≥1 item', () => {
    expect(applyDebt(null, []).action).toBe('skip');
    const r = applyDebt(null, [item('a'), item('b')]);
    expect(r.action).toBe('write');
    expect(r.added.map((a) => a.id)).toEqual(['TD-001', 'TD-002']);
    expect(r.text).toContain('| TD-001 | desc a | tasks.md | src/a.ts | Open | <!-- compound:owned key="debt:a" --> |');
    expect(parseDebtTable(r.text!)!.rows).toHaveLength(2);
  });
  it('appends after human rows, continues numbering, never touches human rows', () => {
    const t = debtTemplate().replace(/\n$/, '') + '\n| TD-004 | human row | review | x | Open | |\n\n## Notes\n\nhuman notes\n';
    const r = applyDebt(t, [item('a')]);
    expect(r.added).toEqual([{ id: 'TD-005', key: 'debt:a' }]);
    expect(r.text).toContain('| TD-004 | human row | review | x | Open | |\n| TD-005 |');
    expect(r.text).toContain('<!-- compound:owned key="debt:a" --> |\n\n## Notes');
    assertHumanContentPreserved(t, r.text!);
  });
  it('refreshes allowed columns only while Open; human status edits win', () => {
    const r1 = applyDebt(null, [item('a'), item('b')]);
    const edited = r1.text!.replace('| TD-002 | desc b | tasks.md | src/b.ts | Open |', '| TD-002 | desc b | tasks.md | src/b.ts | Resolved |');
    const r2 = applyDebt(edited, [item('a', 'new a | piped'), item('b', 'new b')]);
    expect(r2.refreshed).toEqual(['debt:a']);
    expect(r2.text).toContain('| TD-001 | new a \\| piped | tasks.md | src/a.ts | Open |');
    expect(r2.text).toContain('| TD-002 | desc b | tasks.md | src/b.ts | Resolved |');
    expect(applyDebt(r2.text!, [item('a', 'new a | piped')]).action).toBe('noop');
  });
  it('resolved evidence → [Pending], never deleted', () => {
    const r1 = applyDebt(null, [item('a')]);
    const r2 = applyDebt(r1.text!, [], new Set(['debt:a']));
    expect(r2.markedPending).toEqual(['debt:a']);
    expect(r2.text).toContain('| Open [Pending] |');
    expect(applyDebt(r2.text!, [], new Set(['debt:a'])).action).toBe('noop');
  });
  it('tables without a Key column get the marker in an extra cell; CRLF kept', () => {
    const t = '# Debt\r\n\r\n| ID | Description | Status |\r\n|---|---|---|\r\n| TD-001 | h | Open |\r\n';
    const r = applyDebt(t, [item('z')]);
    expect(r.text).toContain('| TD-002 | desc z | Open | <!-- compound:owned key="debt:z" --> |\r\n');
  });
  it('no table → review', () => {
    expect(applyDebt('# Debt\n\nnothing\n', [item('a')]).action).toBe('review');
  });
  it('helpers', () => {
    expect(splitRow('| a | b \\| c | d |')).toEqual(['a', 'b \\| c', 'd']);
    expect(debtKey('src/a.ts', 'A.run', 'TODO  fix   it')).toBe(debtKey('src/a.ts', 'A.run', 'todo fix it'));
    expect(debtKey('src/a.ts', '', 'x')).toMatch(/^debt:src\/a\.ts:[0-9a-f]{8}$/);
    expect(extractDebtComments('a.ts', [
      '// TODO: remove after the v2 migration lands',
      '// TODO fix',
      '# FIXME(alice): handle retries for flaky network calls',
      '/* HACK: 临时绕过鉴权以便联调测试环境 */',
      'const todo = 1;',
    ].join('\n')).map((x) => [x.line, x.tag])).toEqual([[1, 'TODO'], [3, 'FIXME'], [4, 'HACK']]);
  });
});
