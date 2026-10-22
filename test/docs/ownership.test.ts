import { describe, expect, it } from 'vitest';
import { classifyFile, isInstallPointerFile, isKnowledgeLayerFile, isPlaceholderLine, isSkeleton, lineBudget } from '../../src/docs/ownership.js';

describe('classifyFile', () => {
  it('disabled wins over everything', () => {
    expect(classifyFile(null, false)).toBe('disabled');
    expect(classifyFile('---\nlast_compound_scan: 2026-01-01\n---\n# x\n', false)).toBe('disabled');
  });
  it('new when missing', () => expect(classifyFile(null, true)).toBe('new'));
  it('managed with a valid last_compound_scan', () => {
    expect(classifyFile('---\nlast_compound_scan: 2026-10-01\n---\n# A\nhuman\n', true)).toBe('managed');
    expect(classifyFile('---\nlast_compound_scan: "2026-10-01"\ncompound_scan_mode: full\n---\n', true)).toBe('managed');
    expect(classifyFile('---\r\nlast_compound_scan: 2026-10-01T10:00:00Z\r\n---\r\n# A\r\n', true)).toBe('managed');
  });
  it('invalid scan dates are not managed', () => {
    expect(classifyFile('---\nlast_compound_scan: 2026-02-30\n---\n# A\nreal text\n', true)).toBe('adopted');
    expect(classifyFile('---\nlast_compound_scan: yesterday\n---\n# A\n', true)).toBe('skeleton');
    expect(classifyFile('---\nlast_compound_scan:\n---\n# A\nprose here\n', true)).toBe('adopted');
  });
  it('frontmatter not on first line is not frontmatter', () => {
    expect(classifyFile('\n---\nlast_compound_scan: 2026-10-01\n---\n', true)).toBe('adopted');
  });
  it('skeleton: headings and objective placeholders only', () => {
    expect(classifyFile('', true)).toBe('skeleton');
    expect(classifyFile('# Architecture\n\nTODO\n\n## Modules\n\nTBD\n', true)).toBe('skeleton');
    expect(classifyFile('# 架构\n\n待补充\n', true)).toBe('skeleton');
    expect(classifyFile('# [PROJECT NAME]\n\n[DESCRIPTION]\n\n{CONTENT}\n', true)).toBe('skeleton');
    expect(classifyFile('# A\n<!-- describe the architecture here -->\n- TODO\n', true)).toBe('skeleton');
    expect(classifyFile('# A\n<!--\n multi line\n template comment\n-->\n', true)).toBe('skeleton');
    expect(classifyFile('---\ntitle: x\n---\n# A\n\nTODO:\n', true)).toBe('skeleton');
  });
  it('adopted: any real human sentence', () => {
    expect(classifyFile('# A\n\nTODO: describe the payment retry flow\n', true)).toBe('adopted');
    expect(classifyFile('# A\n\nWe use MVVM.\n', true)).toBe('adopted');
    expect(classifyFile('# A\n\n```\nTODO\n```\n', true)).toBe('adopted');
    expect(classifyFile('# A\n\n| a | b |\n|---|---|\n', true)).toBe('adopted');
    expect(classifyFile('# A\n\n这是人写的说明。\n', true)).toBe('adopted');
  });
  it('compound markers make a file non-skeleton', () => {
    expect(classifyFile('# A\n<!-- compound:owned key="index:x" -->\n', true)).toBe('adopted');
  });
  it('unterminated comment is not objective', () => {
    expect(isSkeleton('# A\n<!-- open\n')).toBe(false);
  });
});

describe('placeholders', () => {
  it.each(['', 'TODO', 'todo', 'TBD.', '待补充', '- 待补充', '[DESCRIPTION]', '{CONTENT}', '1. TODO', '**TODO**', '---', '-', '<!-- x -->'])('%s is placeholder', (s) => {
    expect(isPlaceholderLine(s)).toBe(true);
  });
  it.each(['TODO: write it', 'Description', '[link](x)', 'TBD by Alice', '待补充：登录流程'])('%s is content', (s) => {
    expect(isPlaceholderLine(s)).toBe(false);
  });
});

describe('budgets & knowledge layer', () => {
  it('budgets', () => {
    expect(lineBudget('new')).toBe(150);
    expect(lineBudget('skeleton')).toBe(150);
    expect(lineBudget('managed')).toBe(100);
    expect(lineBudget('adopted')).toBe(100);
    expect(lineBudget('disabled')).toBe(0);
  });
  it('knowledge-layer files: <docs_root>/adr/** and <docs_root>/tech-debt.md only', () => {
    const roots = ['docs', 'apps/x/docs'];
    expect(isKnowledgeLayerFile('docs/adr/0001-x.md', roots)).toBe(true);
    expect(isKnowledgeLayerFile('apps/x/docs/adr/sub/0002-y.md', roots)).toBe(true);
    expect(isKnowledgeLayerFile('docs/tech-debt.md', roots)).toBe(true);
    expect(isKnowledgeLayerFile('apps/x/docs/tech-debt.md', roots)).toBe(true);
    expect(isKnowledgeLayerFile('docs/architecture.md', roots)).toBe(false);
    expect(isKnowledgeLayerFile('docs/adr', roots)).toBe(false);
    expect(isKnowledgeLayerFile('apps/y/docs/tech-debt.md', roots)).toBe(false);
    expect(isKnowledgeLayerFile('AGENTS.md', roots)).toBe(false);
    expect(isKnowledgeLayerFile('CLAUDE.md', roots)).toBe(false);
    expect(isKnowledgeLayerFile('.github/copilot-instructions.md', roots)).toBe(false);
  });
  it('install pointer files are excluded unless under a docs root', () => {
    const roots = ['docs', 'apps/x/docs'];
    expect(isInstallPointerFile('AGENTS.md', roots)).toBe(true);
    expect(isInstallPointerFile('apps/x/CLAUDE.md', roots)).toBe(true);
    expect(isInstallPointerFile('.github/copilot-instructions.md', roots)).toBe(true);
    expect(isInstallPointerFile('llms.txt', roots)).toBe(true);
    expect(isInstallPointerFile('.cursor/rules/a.mdc', roots)).toBe(true);
    expect(isInstallPointerFile('docs/AGENTS.md', roots)).toBe(false);
    expect(isInstallPointerFile('docs/architecture.md', roots)).toBe(false);
  });
});
