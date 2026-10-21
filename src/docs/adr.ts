// ADR proposals: new files only (docs/adr/NNNN-<kebab>.md, Status Proposed);
// existing ADRs are never edited. Dedupe by key, title, or related spec + title overlap.
import { parseDocument, parseHeadingLine } from './markers.js';
import { asciiSlug, joinPath, normalizeRepoPath, sha8, splitLines } from './text.js';

export interface ExistingAdr {
  file: string;
  number: number;
  title: string;
  key?: string;
  /** spec paths mentioned in the ADR */
  specs: string[];
}

export interface AdrProposal {
  /** `adr:<spec-dir>/<decision-slug>` */
  key: string;
  title: string;
  context: string;
  decision: string;
  consequences: string;
  evidence: string[];
  relatedSpec?: string;
  /** spec status of the source; Draft proposals are rejected */
  specTrusted: boolean;
}

export interface PlannedAdr {
  path: string;
  number: number;
  text: string;
  key: string;
}

export interface AdrPlan {
  create: PlannedAdr[];
  skipped: { key: string; reason: string; existing?: string }[];
}

const NUM_RE = /^(\d{4})-(.+)\.md$/;

export function parseExistingAdrs(adrDir: string, files: { name: string; text: string }[]): ExistingAdr[] {
  const out: ExistingAdr[] = [];
  for (const f of files) {
    const m = NUM_RE.exec(f.name);
    if (!m) continue;
    const doc = parseDocument(f.text);
    let title = m[2]!.replace(/-/g, ' ');
    for (const l of splitLines(f.text)) {
      const h = parseHeadingLine(l.text);
      if (h && h.level === 1) { title = h.text.replace(/^(?:ADR[- ]?)?\d+[.:]?\s*/i, ''); break; }
    }
    const specs = [...f.text.matchAll(/(?:^|[\s(`])((?:[\w.-]+\/)*specs\/[\w./-]+)/gm)].map((x) => normalizeRepoPath(x[1]!.replace(/[`).,]+$/, '')));
    out.push({ file: joinPath(adrDir, f.name), number: +m[1]!, title, ...(doc.proposedKey ? { key: doc.proposedKey } : {}), specs });
  }
  return out.sort((a, b) => a.number - b.number);
}

function normTitle(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function tokens(s: string): Set<string> {
  const t = normTitle(s);
  const words = t.split(' ').filter(Boolean);
  // CJK: use character bigrams so Chinese titles compare meaningfully
  const cjk = [...t.replace(/[^\p{Script=Han}]/gu, '')];
  for (let i = 0; i + 1 < cjk.length; i++) words.push(cjk[i]! + cjk[i + 1]!);
  return new Set(words);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function renderAdr(n: number, p: AdrProposal, date: string): string {
  const num = String(n).padStart(4, '0');
  const lines = [
    `<!-- compound:proposed key="${p.key}" -->`,
    `# ${num}. ${p.title.trim()}`,
    '',
    `**Status**: Proposed`,
    `**Date**: ${date}`,
    ...(p.relatedSpec ? [`**Related Spec**: \`${p.relatedSpec}\``] : []),
    '',
    '## Context',
    '',
    p.context.trim(),
    '',
    '## Decision',
    '',
    p.decision.trim(),
    '',
    '## Consequences',
    '',
    p.consequences.trim(),
    '',
    '## Evidence',
    '',
    ...p.evidence.map((e) => `- ${e}`),
    '',
  ];
  return lines.join('\n');
}

/** Plans new ADR files. `adrDir` e.g. `docs/adr`; numbering continues per directory. */
export function planAdrs(adrDir: string, existing: ExistingAdr[], proposals: AdrProposal[], date: string): AdrPlan {
  const plan: AdrPlan = { create: [], skipped: [] };
  let next = existing.reduce((m, a) => Math.max(m, a.number), 0) + 1;
  const known = [...existing];
  for (const p of proposals) {
    if (!p.specTrusted) { plan.skipped.push({ key: p.key, reason: 'source spec is not trusted (Draft/missing status)' }); continue; }
    if (!p.key.startsWith('adr:')) { plan.skipped.push({ key: p.key, reason: 'key must start with adr:' }); continue; }
    const tt = tokens(p.title);
    const dup = known.find((a) =>
      (a.key && a.key === p.key) ||
      normTitle(a.title) === normTitle(p.title) ||
      (p.relatedSpec && a.specs.includes(normalizeRepoPath(p.relatedSpec)) && jaccard(tokens(a.title), tt) >= 0.5),
    );
    if (dup) { plan.skipped.push({ key: p.key, reason: 'duplicate of existing ADR', existing: dup.file }); continue; }
    const slug = asciiSlug(p.title) || asciiSlug(p.key.slice(4).split('/').pop() ?? '') || `decision-${sha8(p.key)}`;
    const num = String(next).padStart(4, '0');
    const file = joinPath(adrDir, `${num}-${slug}.md`);
    plan.create.push({ path: file, number: next, key: p.key, text: renderAdr(next, p, date) });
    known.push({ file, number: next, title: p.title, key: p.key, specs: p.relatedSpec ? [normalizeRepoPath(p.relatedSpec)] : [] });
    next++;
  }
  return plan;
}
