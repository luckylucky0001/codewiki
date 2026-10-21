import { describe, expect, it } from 'vitest';
import { checkLinks, extractLinks } from '../../src/docs/links.js';
import { memFs } from './memfs.js';

const FS = memFs([
  'docs/architecture.md',
  'docs/contracts.md',
  'docs/adr/0001-x.md',
  'services/x/docs/arch/y.md',
  'services/x/docs/api.md',
  'services/x/src/main.go',
  'apps/a/src/Cart.kt',
  'README.md',
]);
const texts: Record<string, string> = {
  'docs/contracts.md': '# Contracts\n\n## Login API\n\n## 登录 契约\n\n## Dup\n\n## Dup\n',
};
const fsv = { ...FS, read: (p: string) => texts[p] ?? null };
const top = ['docs', 'services', 'apps', 'specs'];

describe('extractLinks', () => {
  it('markdown, backtick relative, backtick repo, source; skips code and external', () => {
    const t = [
      '# T',
      '[a](../../../../docs/architecture.md) and ![img](./img.png) and [ext](https://x.y) [mail](mailto:a@b)',
      'See `./api.md`, `../api.md:12`, `services/x/src/main.go`, `not/a/top/path`, `npm run build`, `docs/*.md`',
      '`[not a link](nope.md)`',
      '```',
      '[in code](nope.md)',
      '```',
      '**Source**: `apps/a/src/Cart.kt#Cart.add` [Code Direct] [Verified]',
      '[ref]: ../api.md "title"',
      '[frag](#login)',
    ].join('\n');
    const refs = extractLinks('services/x/docs/arch/y.md', t, { topLevelDirs: top });
    expect(refs.map((r) => [r.line, r.kind, r.target, r.fragment ?? ''])).toEqual([
      [2, 'markdown', '../../../../docs/architecture.md', ''],
      [2, 'markdown', './img.png', ''],
      [3, 'backtick-relative', './api.md', ''],
      [3, 'backtick-relative', '../api.md', ''],
      [3, 'backtick-repo', 'services/x/src/main.go', ''],
      [8, 'source', 'apps/a/src/Cart.kt', ''],
      [9, 'markdown', '../api.md', ''],
      [10, 'markdown', '', 'login'],
    ]);
  });
});

describe('checkLinks', () => {
  it('resolves relative links from nested dirs (services/x/docs/arch/y.md → ../../../../docs/)', () => {
    const t = '# Y\n\n[root arch](../../../../docs/architecture.md)\n[api](../api.md)\n`../api.md`\n`services/x/src/main.go`\n';
    expect(checkLinks([{ path: 'services/x/docs/arch/y.md', text: t }], fsv, { topLevelDirs: top })).toEqual([]);
  });
  it('reports wrong ../ depth with a corrected suggestion', () => {
    const t = '[root arch](../../../docs/architecture.md)\n';
    const b = checkLinks([{ path: 'services/x/docs/arch/y.md', text: t }], fsv, { topLevelDirs: top });
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ line: 1, reason: 'missing', target: '../../../docs/architecture.md' });
    expect(b[0]!.suggestions[0]).toBe('../../../../docs/architecture.md');
  });
  it('links escaping the repo', () => {
    const b = checkLinks([{ path: 'docs/a.md', text: '[x](../../outside.md)\n' }], fsv);
    expect(b[0]!.reason).toBe('escapes-repo');
  });
  it('backticked repo paths resolve against file dir and ancestors', () => {
    // `src/main.go` from services/x/docs/api.md → services/x/src/main.go via ancestor services/x
    const ok = checkLinks([{ path: 'services/x/docs/api.md', text: '`services/x/src/main.go` and `apps/a/src/Cart.kt`\n' }], fsv, { topLevelDirs: top });
    expect(ok).toEqual([]);
    const bad = checkLinks([{ path: 'services/x/docs/api.md', text: '`apps/a/src/Gone.kt`\n' }], fsv, { topLevelDirs: top });
    expect(bad[0]).toMatchObject({ kind: 'backtick-repo', reason: 'missing' });
  });
  it('**Source** paths are checked', () => {
    const b = checkLinks([{ path: 'docs/a.md', text: '## E\n**Source**: `apps/a/src/Gone.kt` [Code Direct]\n' }], fsv);
    expect(b[0]).toMatchObject({ kind: 'source', target: 'apps/a/src/Gone.kt' });
  });
  it('anchors use GitHub slugs incl. CJK and duplicates', () => {
    const t = '[a](contracts.md#login-api) [b](contracts.md#登录-契约) [c](contracts.md#dup-1) [d](contracts.md#nope) [e](architecture.md#L10)\n';
    const b = checkLinks([{ path: 'docs/x.md', text: t }], fsv);
    expect(b.map((x) => x.fragment)).toEqual(['nope']);
    expect(b[0]!.reason).toBe('anchor');
  });
  it('same-file anchors', () => {
    const b = checkLinks([{ path: 'docs/x.md', text: '# Top\n\n[ok](#top) [bad](#bottom)\n' }], fsv);
    expect(b.map((x) => x.fragment)).toEqual(['bottom']);
  });
  it('suggests files with the same basename', () => {
    const b = checkLinks([{ path: 'docs/x.md', text: '[y](arch/y.md)\n' }], fsv);
    expect(b[0]!.suggestions).toContain('../services/x/docs/arch/y.md');
  });
  it('never modifies the text (report only)', () => {
    const files = [{ path: 'docs/x.md', text: '[gone](gone.md)\n' }];
    checkLinks(files, fsv);
    expect(files[0]!.text).toBe('[gone](gone.md)\n');
  });
  it('percent-encoded and angle-bracket targets', () => {
    const b = checkLinks([{ path: 'docs/x.md', text: '[a](<architecture.md>) [b](architecture%2Emd)\n' }], fsv);
    expect(b).toEqual([]);
  });
});
