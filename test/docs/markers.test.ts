import { describe, expect, it } from 'vitest';
import { entryKey, humanChunks, normalizeSource, parseDocument, parseSourceLine, renderSourceLine } from '../../src/docs/markers.js';

describe('parseSourceLine', () => {
  it('parses path, origin, status and anchor', () => {
    expect(parseSourceLine('**Source**: `apps/a/Cart.kt#Cart.add` [Code Direct] [Verified] <!-- a=android://x#Cart@298d51bd -->')).toEqual({
      path: 'apps/a/Cart.kt#Cart.add', origin: 'Code Direct', status: 'Verified', anchor: 'android://x#Cart@298d51bd',
    });
    expect(parseSourceLine('**Source**: specs/001/spec.md [AI Inferred] [Unconfirmed]')).toEqual({ path: 'specs/001/spec.md', origin: 'AI Inferred', status: 'Unconfirmed' });
    expect(parseSourceLine('**Source**：`a.ts` [Code Direct]')).toEqual({ path: 'a.ts', origin: 'Code Direct' });
  });
  it('requires an origin tag', () => {
    expect(parseSourceLine('**Source**: `a.ts`')).toBeNull();
    expect(parseSourceLine('**Source**: `a.ts` [Verified]')).toBeNull();
    expect(parseSourceLine('Source: `a.ts` [Code Direct]')).toBeNull();
  });
  it('round-trips', () => {
    const s = { path: 'x/y.ts', origin: 'Code Direct' as const, status: 'Pending' as const };
    expect(parseSourceLine(renderSourceLine(s))).toEqual(s);
  });
});

describe('keys', () => {
  it('normalizes sources and headings', () => {
    expect(normalizeSource('./apps\\a//b.kt#Foo.bar')).toBe('apps/a/b.kt');
    expect(normalizeSource('`src/x.ts:12-30`')).toBe('src/x.ts');
    expect(entryKey('Code Direct', './a.kt#X', 'arch', '  Cart   Flow ')).toBe('src:a.kt::cart flow');
    expect(entryKey('AI Inferred', 'whatever', 'arch', 'Cart Flow')).toBe('dim:arch::cart flow');
  });
});

describe('parseDocument', () => {
  const doc = [
    '---',
    'last_compound_scan: 2026-10-01',
    '---',
    '# Title',
    '',
    'Human intro.',
    '',
    '## Modules',
    '',
    '### Cart',
    '',
    'Cart body.',
    '',
    '**Source**: `apps/a/Cart.kt` [Code Direct] [Verified]',
    '',
    'Human note after the entry.',
    '',
    '### Human section',
    '',
    'No source here.',
    '',
    '<!-- compound:owned:start key="rule:no-network-in-ui" -->',
    '### Rule: no network in UI',
    'UI must not call network.',
    'Evidence: `apps/a/lint.xml`',
    '<!-- compound:owned:end -->',
    '',
    '- [API](api.md) <!-- compound:owned key="index:docs/api.md" -->',
    '- [Human link](h.md)',
    '',
    '```md',
    '### Fake',
    '**Source**: `x` [Code Direct]',
    '<!-- compound:owned key="index:fake" -->',
    '```',
  ].join('\n');
  const p = parseDocument(doc, { dimension: 'architecture' });

  it('finds owned items', () => {
    expect(p.items.map((i) => [i.kind, i.key])).toEqual([
      ['entry', 'src:apps/a/Cart.kt::cart'],
      ['block', 'rule:no-network-in-ui'],
      ['row', 'index:docs/api.md'],
    ]);
    expect(p.items[1]!.evidence).toBe('`apps/a/lint.xml`');
  });
  it('ignores markers inside fences and headings inside owned blocks', () => {
    expect(p.headings.map((h) => h.text)).toEqual(['Title', 'Modules', 'Cart', 'Human section']);
  });
  it('human chunks exclude owned items and frontmatter', () => {
    expect(humanChunks(p)).toEqual([
      '# Title', 'Human intro.', '## Modules', 'Human note after the entry.', '### Human section', 'No source here.',
      '- [Human link](h.md)', '```md\n### Fake\n**Source**: `x` [Code Direct]\n<!-- compound:owned key="index:fake" -->\n```',
    ]);
  });
  it('multiple Source lines in one section are ambiguous → human', () => {
    const d = parseDocument('## A\n**Source**: `a` [Code Direct]\ntext\n**Source**: `b` [Code Direct]\n');
    expect(d.items).toHaveLength(0);
    expect(d.review[0]!.reason).toMatch(/2 \*\*Source\*\* lines/);
  });
  it('duplicate keys are human + review', () => {
    const d = parseDocument('## A\n**Source**: `a` [Code Direct]\n## A\n**Source**: `./a` [Code Direct]\n');
    expect(d.items).toHaveLength(0);
    expect(d.review.some((r) => r.reason.startsWith('duplicate'))).toBe(true);
  });
  it('owned block without Evidence or end is human', () => {
    const d1 = parseDocument('<!-- compound:owned:start key="rule:x" -->\nbody\n<!-- compound:owned:end -->\n');
    expect(d1.items).toHaveLength(0);
    expect(d1.review[0]!.reason).toMatch(/Evidence/);
    const d2 = parseDocument('<!-- compound:owned:start key="rule:x" -->\nEvidence: a\n');
    expect(d2.items).toHaveLength(0);
    expect(d2.review[0]!.reason).toMatch(/without end/);
  });
  it('ADR proposed marker on the first body line', () => {
    const d = parseDocument('<!-- compound:proposed key="adr:specs/001/db" -->\n# 0001. DB\n');
    expect(d.proposedKey).toBe('adr:specs/001/db');
    const d2 = parseDocument('# x\n<!-- compound:proposed key="adr:a" -->\n');
    expect(d2.proposedKey).toBeUndefined();
  });
  it('source line before any heading is human', () => {
    const d = parseDocument('intro\n**Source**: `a` [Code Direct]\n# T\n');
    expect(d.items).toHaveLength(0);
    expect(d.review).toHaveLength(1);
  });
  it('tilde fences and longer backtick fences', () => {
    const d = parseDocument('## A\n~~~\n**Source**: `a` [Code Direct]\n~~~\n````\n```\n## not heading\n````\n');
    expect(d.items).toHaveLength(0);
    expect(d.headings.map((h) => h.text)).toEqual(['A']);
  });
});
