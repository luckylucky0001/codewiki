import { describe, expect, it } from 'vitest';
import {
  assertHumanContentPreserved,
  checkHumanContentPreserved,
  HumanContentViolation,
  mergeDocument,
  type CompoundItem,
  type MergeInput,
  type NewEntry,
} from '../../src/docs/merge.js';
import { classifyFile } from '../../src/docs/ownership.js';
import { parseDocument } from '../../src/docs/markers.js';
import { parseFrontmatter } from '../../src/docs/text.js';

const entry = (heading: string, src: string, body = `${heading} body.`, extra: Partial<NewEntry> = {}): NewEntry => ({
  kind: 'entry', dimension: 'architecture', heading, body, source: { path: src, origin: 'Code Direct', status: 'Verified' }, ...extra,
});

function run(text: string | null, items: CompoundItem[], extra: Partial<MergeInput> = {}) {
  const state = extra.state ?? classifyFile(text, true);
  return mergeDocument({ path: 'docs/architecture.md', text, state, dimension: 'architecture', items, scanDate: '2026-10-21', scanMode: 'incremental', ...extra });
}

const MANAGED = `---
title: Architecture
last_compound_scan: 2026-10-01
compound_scan_mode: full
---
# Architecture

Human intro paragraph.

## Modules

### Cart

Old cart body.

**Source**: \`apps/a/Cart.kt\` [Code Direct] [Verified]

### Human notes

Keep me exactly.
`;

describe('new files', () => {
  it('creates with title, sections and frontmatter', () => {
    const r = run(null, [entry('Cart', 'apps/a/Cart.kt', 'Cart.', { section: 'Modules' })], { title: 'Architecture' });
    expect(r.action).toBe('write');
    expect(r.text).toBe(
      '---\nlast_compound_scan: 2026-10-21\ncompound_scan_mode: incremental\n---\n# Architecture\n\n## Modules\n\n### Cart\n\nCart.\n\n**Source**: `apps/a/Cart.kt` [Code Direct] [Verified]\n',
    );
    expect(classifyFile(r.text!, true)).toBe('managed');
  });
  it('null passthrough: no items → no file', () => {
    expect(run(null, []).action).toBe('skip');
  });
  it('drops Pending and unverified entries; skips when nothing remains', () => {
    const r = run(null, [
      entry('A', 'a.kt', 'x', { source: { path: 'a.kt', origin: 'Code Direct', status: 'Pending' } }),
      entry('B', 'b.kt', 'x', { source: { path: 'b.kt', origin: 'Code Direct' } }),
    ]);
    expect(r.action).toBe('skip');
    expect(r.dropped.map((d) => d.reason)).toEqual([
      '[Pending] entries are not inserted into new files',
      'new files are created only with verified content',
    ]);
  });
  it('writes compound_source_commit when given', () => {
    const r = run(null, [entry('A', 'a.kt')], { sourceCommit: '8c1d2e4' });
    expect(parseFrontmatter(r.text!)).toMatchObject({ compound_source_commit: '8c1d2e4' });
  });
  it('knowledge-layer files never get frontmatter', () => {
    const r = run(null, [entry('A', 'a.kt')], { knowledgeLayer: true, title: 'Agents', path: 'docs/tech-debt.md' });
    expect(r.text!.startsWith('# Agents\n')).toBe(true);
  });
});

describe('disabled', () => {
  it('never writes', () => {
    const r = run('# x\n', [entry('A', 'a.kt')], { state: 'disabled' });
    expect(r.action).toBe('skip');
    expect(r.text).toBeUndefined();
  });
});

describe('managed files', () => {
  it('replaces owned entries in place, keeps human content and order', () => {
    const r = run(MANAGED, [entry('Cart', 'apps/a/Cart.kt', 'New cart body.\n\nSecond paragraph.')]);
    expect(r.action).toBe('write');
    expect(r.replaced).toEqual(['src:apps/a/Cart.kt::cart']);
    expect(r.text).toContain('New cart body.\n\nSecond paragraph.\n\n**Source**');
    expect(r.text).not.toContain('Old cart body');
    expect(r.text).toContain('title: Architecture');
    expect(parseFrontmatter(r.text!)!['last_compound_scan']).toBe('2026-10-21');
    assertHumanContentPreserved(MANAGED, r.text!, { dimension: 'architecture' });
    expect(r.text!.indexOf('Human intro')).toBeLessThan(r.text!.indexOf('### Cart'));
    expect(r.text!.indexOf('### Cart')).toBeLessThan(r.text!.indexOf('Keep me exactly.'));
  });
  it('is idempotent: same entry → noop, frontmatter untouched', () => {
    const r1 = run(MANAGED, [entry('Cart', 'apps/a/Cart.kt', 'Old cart body.')]);
    expect(r1.action).toBe('noop');
    expect(r1.unchanged).toEqual(['src:apps/a/Cart.kt::cart']);
    const r2 = run(MANAGED, [entry('Cart', 'apps/a/Cart.kt', 'Changed.')]);
    const r3 = run(r2.text!, [entry('Cart', 'apps/a/Cart.kt', 'Changed.')], { scanDate: '2026-10-22' });
    expect(r3.action).toBe('noop');
  });
  it('appends new entries after the last owned item of the section', () => {
    const r = run(MANAGED, [entry('Checkout', 'apps/a/Checkout.kt', 'Checkout.', { section: 'Modules' })]);
    expect(r.action).toBe('write');
    const t = r.text!;
    expect(t.indexOf('### Checkout')).toBeGreaterThan(t.indexOf('### Cart'));
    expect(t.indexOf('### Checkout')).toBeLessThan(t.indexOf('### Human notes'));
    assertHumanContentPreserved(MANAGED, t);
  });
  it('creates a missing section at EOF', () => {
    const r = run(MANAGED, [entry('Login', 'apps/a/Login.kt', 'L.', { section: 'Flows' })]);
    expect(r.text!.endsWith('Keep me exactly.\n\n## Flows\n\n### Login\n\nL.\n\n**Source**: `apps/a/Login.kt` [Code Direct] [Verified]\n')).toBe(true);
    assertHumanContentPreserved(MANAGED, r.text!, { addedChunks: ['## Flows'] });
    expect(checkHumanContentPreserved(MANAGED, r.text!)).toBeInstanceOf(HumanContentViolation);
  });
  it('ambiguous section → review, no text', () => {
    const t = MANAGED + '\n## Modules\n\nsecond modules section\n';
    const r = run(t, [entry('X', 'x.kt', 'x', { section: 'Modules' })]);
    expect(r.action).toBe('review');
    expect(r.text).toBeUndefined();
    expect(r.review.some((n) => /ambiguous insertion/.test(n.reason))).toBe(true);
  });
  it('duplicate key in file → review', () => {
    const t = MANAGED + '\n### Cart\n\n**Source**: `./apps/a/Cart.kt` [Code Direct]\n';
    const r = run(t, [entry('Cart', 'apps/a/Cart.kt')]);
    expect(r.action).toBe('review');
  });
  it('upgrades an [AI Inferred] entry with the same heading in place', () => {
    const t = MANAGED.replace('### Human notes', '### Payment\n\nGuess.\n\n**Source**: `apps/a` [AI Inferred]\n\n### Human notes');
    const r = run(t, [entry('Payment', 'apps/a/Pay.kt', 'Confirmed.')]);
    expect(r.replaced).toEqual(['src:apps/a/Pay.kt::payment']);
    expect(r.text).not.toContain('Guess.');
    expect(r.text).not.toContain('[AI Inferred]');
    assertHumanContentPreserved(t, r.text!);
  });
  it('retags owned entries whose source disappeared as [Pending] (never deletes)', () => {
    const r = run(MANAGED, [], { sourceExists: () => false });
    expect(r.markedPending).toEqual(['src:apps/a/Cart.kt::cart']);
    expect(r.text).toContain('Old cart body.');
    expect(r.text).toContain('**Source**: `apps/a/Cart.kt` [Code Direct] [Pending]');
  });
  it('keeps the heading level of the existing entry', () => {
    const t = MANAGED.replace('### Cart', '#### Cart');
    const r = run(t, [entry('Cart', 'apps/a/Cart.kt', 'New.')]);
    expect(r.text).toContain('#### Cart\n\nNew.');
  });
  it('enforces the line budget at entry boundaries', () => {
    const big = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n');
    const r = run(MANAGED, [entry('A', 'a.kt', big, { section: 'Modules' }), entry('B', 'b.kt', big, { section: 'Modules' }), entry('C', 'c.kt', 'small', { section: 'Modules' })]);
    expect(r.inserted).toEqual(['src:a.kt::a']);
    expect(r.truncated).toEqual(['src:b.kt::b', 'src:c.kt::c']);
    expect(r.linesAdded).toBeLessThanOrEqual(100);
  });
  it('rejects bodies that would change the parse', () => {
    const r = run(MANAGED, [
      entry('A', 'a.kt', '## sneaky heading'),
      entry('B', 'b.kt', '**Source**: `z` [Code Direct]'),
      entry('C', 'c.kt', '```\nunterminated'),
      entry('D', 'd.kt', '<!-- compound:owned key="index:x" -->'),
    ]);
    expect(r.dropped).toHaveLength(4);
    expect(r.action).toBe('noop');
  });
  it('owned blocks and rows are replaced by key', () => {
    const t = `---\nlast_compound_scan: 2026-10-01\n---\n# Constitution\n\nHuman preface.\n\n<!-- compound:owned:start key="rule:a" -->\nOld rule.\nEvidence: \`AGENTS.md\`\n<!-- compound:owned:end -->\n\nHuman rule written by hand.\n\n## Index\n\n- [A](a.md) <!-- compound:owned key="index:docs/a.md" -->\n- [Human](h.md)\n`;
    const r = run(t, [
      { kind: 'block', key: 'rule:a', body: 'New rule.', evidence: '`AGENTS.md#L3`' },
      { kind: 'row', key: 'index:docs/a.md', line: '- [A (renamed)](a.md)' },
      { kind: 'row', key: 'index:docs/b.md', line: '- [B](b.md)', section: 'Index' },
    ], { dimension: 'constitution' });
    expect(r.action).toBe('write');
    expect(r.replaced.sort()).toEqual(['index:docs/a.md', 'rule:a']);
    expect(r.inserted).toEqual(['index:docs/b.md']);
    expect(r.text).toContain('New rule.\nEvidence: `AGENTS.md#L3`');
    expect(r.text).toContain('- [A (renamed)](a.md) <!-- compound:owned key="index:docs/a.md" -->\n- [B](b.md) <!-- compound:owned key="index:docs/b.md" -->\n- [Human](h.md)');
    assertHumanContentPreserved(t, r.text!);
  });
});

describe('adopted files', () => {
  const ADOPTED = '# Architecture\n\nWe use MVVM everywhere.\n\n## Modules\n\n- app\n- core\n';
  it('appends only; never replaces; adds frontmatter after the write', () => {
    const r = run(ADOPTED, [entry('Cart', 'apps/a/Cart.kt', 'C.', { section: 'Modules' })]);
    expect(r.state).toBe('adopted');
    expect(r.action).toBe('write');
    expect(r.text).toBe(
      '---\nlast_compound_scan: 2026-10-21\ncompound_scan_mode: incremental\n---\n# Architecture\n\nWe use MVVM everywhere.\n\n## Modules\n\n- app\n- core\n\n### Cart\n\nC.\n\n**Source**: `apps/a/Cart.kt` [Code Direct] [Verified]\n',
    );
    expect(classifyFile(r.text!, true)).toBe('managed');
  });
  it('existing keyed entries are not replaced', () => {
    const t = ADOPTED + '\n### Cart\n\nHuman copy.\n\n**Source**: `apps/a/Cart.kt` [Code Direct]\n';
    const r = run(t, [entry('Cart', 'apps/a/Cart.kt', 'New.')]);
    expect(r.action).toBe('noop');
    expect(r.unchanged).toHaveLength(1);
  });
  it('drops [Pending] entries', () => {
    const r = run(ADOPTED, [entry('A', 'a.kt', 'x', { source: { path: 'a.kt', origin: 'Code Direct', status: 'Pending' } })]);
    expect(r.action).toBe('noop');
    expect(r.dropped).toHaveLength(1);
  });
  it('append-only TOC links go after the last list item', () => {
    const t = '# Docs\n\n## Index\n\n- [Human A](a.md)\n- [Human B](b.md)\n\n## Other\n\ntext\n';
    const r = run(t, [{ kind: 'row', key: 'index:docs/c.md', line: '- [C](c.md)', section: 'Index' }]);
    expect(r.text).toContain('- [Human B](b.md)\n- [C](c.md) <!-- compound:owned key="index:docs/c.md" -->\n\n## Other');
    assertHumanContentPreserved(t, r.text!);
  });
  it('preserves existing frontmatter keys when adding ours', () => {
    const t = '---\ntitle: "Arch"\ntags: [a, b]\n---\n# A\n\nprose\n';
    const r = run(t, [entry('X', 'x.kt')]);
    expect(r.text!.startsWith('---\ntitle: "Arch"\ntags: [a, b]\nlast_compound_scan: 2026-10-21\ncompound_scan_mode: incremental\n---\n')).toBe(true);
  });
});

describe('skeleton files', () => {
  it('replaces placeholders, keeps title and headings', () => {
    const t = '# Architecture\n\nTODO\n\n## Modules\n\n<!-- list modules -->\n待补充\n\n## Flows\n\nTBD\n';
    expect(classifyFile(t, true)).toBe('skeleton');
    const r = run(t, [entry('Cart', 'a/Cart.kt', 'C.', { section: 'Modules' })]);
    expect(r.action).toBe('write');
    expect(r.text).toBe(
      '---\nlast_compound_scan: 2026-10-21\ncompound_scan_mode: incremental\n---\n# Architecture\n\n## Modules\n\n### Cart\n\nC.\n\n**Source**: `a/Cart.kt` [Code Direct] [Verified]\n\n## Flows\n\n',
    );
  });
  it('skeleton with no entries stays untouched', () => {
    expect(run('# A\n\nTODO\n', []).action).toBe('noop');
  });
  it('multi-line template comments are removed', () => {
    const t = '# A\n<!--\nFill this in\n-->\n## S\n';
    const r = run(t, [entry('X', 'x.kt', 'x', { section: 'S' })]);
    expect(r.text).not.toContain('Fill this in');
    expect(r.text).toContain('# A\n## S\n\n### X');
  });
});

describe('adversarial human content preservation', () => {
  const cases: [string, string][] = [
    ['heading collides with entry heading', '# A\n\n## Modules\n\n### Cart\n\nHuman cart text, no source.\n'],
    ['tables', '# A\n\n## Modules\n\n| a | b |\n|---|---|\n| 1 | 2 |\n'],
    ['code block with fake markers', '# A\n\n## Modules\n\n```md\n### Cart\n**Source**: `apps/a/Cart.kt` [Code Direct]\n<!-- compound:owned:start key="rule:x" -->\n```\n'],
    ['CRLF', '# A\r\n\r\n## Modules\r\n\r\nLine one\r\nLine two\r\n'],
    ['CJK', '# 架构\n\n## Modules\n\n这是人工编写的说明，包含“引号”与 emoji 🚀。\n'],
    ['no trailing newline', '# A\n\n## Modules\n\nlast line'],
    ['trailing spaces and tabs', '# A  \n\n## Modules\t\n\ntext   \n\t\tindented\n'],
    ['setext heading and html', 'Title\n=====\n\n## Modules\n\n<details><summary>x</summary>\n\nhidden\n\n</details>\n'],
    ['BOM', '﻿# A\n\n## Modules\n\nx\n'],
    ['source line inside blockquote', '# A\n\n## Modules\n\n> **Source**: quoted\n'],
  ];
  for (const [name, text] of cases) {
    it(name, () => {
      const r = run(text, [entry('Cart', 'apps/a/Cart.kt', 'Cart.', { section: 'Modules' }), entry('Login', 'apps/a/Login.kt', 'L.', { section: 'Modules' })]);
      expect(r.action).toBe('write');
      assertHumanContentPreserved(text, r.text!, { dimension: 'architecture' });
      // second pass on the result (now managed) updates bodies only
      const r2 = run(r.text!, [entry('Cart', 'apps/a/Cart.kt', 'Cart v2.', { section: 'Modules' })]);
      expect(r2.action).toBe('write');
      assertHumanContentPreserved(text, r2.text!, { dimension: 'architecture' });
      assertHumanContentPreserved(r.text!, r2.text!, { dimension: 'architecture' });
    });
  }
  it('CRLF files keep CRLF for inserted lines', () => {
    const t = '# A\r\n\r\n## Modules\r\n\r\ntext\r\n';
    const r = run(t, [entry('X', 'x.kt', 'x', { section: 'Modules' })]);
    expect(r.text!.replace(/\r\n/g, '')).not.toContain('\n');
  });
  it('detects a modified human line', () => {
    expect(() => assertHumanContentPreserved('# A\n\nhello\n', '# A\n\nhello!\n')).toThrow(HumanContentViolation);
  });
  it('detects reordered human blocks', () => {
    expect(() => assertHumanContentPreserved('# A\n\none\n\ntwo\n', '# A\n\ntwo\n\none\n')).toThrow(/chunk 1/);
  });
  it('detects CRLF → LF conversion inside a human block', () => {
    expect(checkHumanContentPreserved('a\r\nb\r\n', 'a\nb\n')).not.toBeNull();
  });
  it('detects removed human block and changed human frontmatter', () => {
    expect(checkHumanContentPreserved('# A\n\nx\n', '# A\n')).not.toBeNull();
    expect(checkHumanContentPreserved('---\ntitle: a\n---\n# A\n', '---\ntitle: b\n---\n# A\n')).not.toBeNull();
  });
  it('allows blank-line changes and owned content changes', () => {
    expect(checkHumanContentPreserved('# A\n\nx\n', '# A\n\n\nx\n\n### E\n**Source**: `a` [Code Direct]\n')).toBeNull();
    // a blank line inserted *inside* a human block splits it: violation
    expect(checkHumanContentPreserved('# A\nx\n', '# A\n\nx\n')).not.toBeNull();
  });
  it('randomized: inserting entries never alters human chunks', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pieces = ['## Modules', '## Flows', 'para text', '| a | b |\n|---|---|', '```\ncode\n\n# not heading\n```', '- item\n- item2', '中文段落', '### Cart', '> quote', '<!-- note -->'];
    for (let k = 0; k < 150; k++) {
      const parts: string[] = ['# Doc'];
      const n = 2 + Math.floor(rnd() * 8);
      for (let i = 0; i < n; i++) parts.push(pieces[Math.floor(rnd() * pieces.length)]!);
      const eol = rnd() < 0.3 ? '\r\n' : '\n';
      const text = parts.join('\n\n').replace(/\n/g, eol) + (rnd() < 0.5 ? eol : '');
      const items = [entry('Cart', 'a/Cart.kt', 'c', { section: rnd() < 0.5 ? 'Modules' : 'Flows' }), entry('Pay', 'a/Pay.kt', 'p', { section: 'Modules' })];
      const r = run(text, items, { state: 'adopted' });
      if (r.action === 'write') assertHumanContentPreserved(text, r.text!, { addedChunks: ['## Modules', '## Flows'] });
      else expect(['review', 'noop']).toContain(r.action);
      if (r.action === 'write') {
        const doc = parseDocument(r.text!, { dimension: 'architecture' });
        expect(doc.items.filter((i) => i.kind === 'entry').length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('input validation and idempotency edge cases', () => {
  it('rejects headings/sections that would not round-trip', () => {
    const r = run(MANAGED, [
      entry('Foo #', 'a.kt'),
      entry('two\nlines', 'b.kt'),
      entry('ok', 'c.kt', 'x', { section: 'Bad ##' }),
      entry('ok2', 'd.kt', 'x', { section: '' }),
    ]);
    expect(r.dropped.map((d) => d.reason)).toEqual([
      'entry heading is not a single-line heading text',
      'entry heading is not a single-line heading text',
      'section is not a single-line heading text',
      'section is not a single-line heading text',
    ]);
  });
  it('CJK / punctuation headings are idempotent', () => {
    const items = [entry('购物车 (Cart) — 上限 99', 'apps/a/购物车.kt', '中文正文。', { section: '模块' }), entry('C# interop', 'x.cs', 'x', { section: '模块' })];
    const r1 = run('# 架构\n\n人工说明。\n', items);
    expect(r1.action).toBe('write');
    const r2 = run(r1.text!, items, { scanDate: '2026-10-22' });
    expect(r2.action).toBe('noop');
    expect(r2.unchanged).toHaveLength(2);
  });
  it('input duplicates are dropped', () => {
    const r = run(null, [entry('A', 'a.kt'), entry('A', './a.kt')]);
    expect(r.dropped).toEqual([{ key: 'src:a.kt::a', reason: 'duplicate key in input' }]);
  });
  it('human edits inside an owned entry are overwritten only by a changed regeneration, never deleted otherwise', () => {
    const t = MANAGED.replace('Old cart body.', 'Old cart body. (human tweak)');
    expect(run(t, []).action).toBe('noop');
    const r = run(t, [], { sourceExists: () => true });
    expect(r.action).toBe('noop');
  });
  it('skeleton with frontmatter (not managed) keeps foreign keys', () => {
    const t = '---\nowner: team-a\n---\n# A\n\nTBD\n';
    expect(classifyFile(t, true)).toBe('skeleton');
    const r = run(t, [entry('X', 'x.kt')]);
    expect(r.text!.startsWith('---\nowner: team-a\nlast_compound_scan: 2026-10-21\n')).toBe(true);
    expect(r.text).not.toContain('TBD');
  });
  it('skeleton placeholder lines inside code fences are kept', () => {
    const t = '# A\n\nTODO\n';
    expect(classifyFile(t + '\n```\nTODO\n```\n', true)).toBe('adopted');
  });
  it('adopted file with only a title line + one sentence stays adopted and gets entries appended at EOF', () => {
    const t = '# A\nOne human sentence.';
    const r = run(t, [entry('X', 'x.kt')]);
    expect(r.text).toContain('# A\nOne human sentence.\n\n### X\n\nX body.\n\n**Source**: `x.kt` [Code Direct] [Verified]\n');
  });
});
