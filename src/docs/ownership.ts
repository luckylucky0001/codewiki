// File ownership state machine: disabled / new / managed / skeleton / adopted.
import { parseHeadingLine } from './markers.js';
import { findFrontmatter, isValidScanDate, splitLines, joinLines } from './text.js';

export type FileState = 'disabled' | 'new' | 'managed' | 'skeleton' | 'adopted';

const PLACEHOLDER_TOKEN = String.raw`(?:TODO|TBD|待补充|待完善|\[[A-Z][A-Z0-9 _-]*\]|\{[A-Z][A-Z0-9 _-]*\})`;
const PLACEHOLDER_LINE = new RegExp(
  String.raw`^(?:(?:[-*+]|\d+[.)])\s*)?(?:>\s*)?(?:\*\*|_)?${PLACEHOLDER_TOKEN}(?:\*\*|_)?\s*[:：.。]?\s*$`,
  'i',
);
const BULLET_ONLY = /^(?:[-*+]|\d+[.)])\s*$/;
const HR = /^(?:-{3,}|\*{3,}|_{3,})$/;

/** Removes HTML comments that are template-only (anything except compound markers). */
function stripTemplateComments(body: string): { text: string; hasCompoundMarker: boolean } {
  let hasCompoundMarker = false;
  const text = body.replace(/<!--([\s\S]*?)-->/g, (m, inner: string) => {
    if (/compound:/.test(inner)) {
      hasCompoundMarker = true;
      return m;
    }
    return '';
  });
  return { text, hasCompoundMarker };
}

/** A single line that is an objective placeholder (or blank / bare bullet / rule). Headings are NOT placeholders. */
export function isPlaceholderLine(t: string): boolean {
  const s = t.replace(/<!--([\s\S]*?)-->/g, (m, inner: string) => (/compound:/.test(inner) ? m : '')).trim();
  if (s === '') return true;
  if (BULLET_ONLY.test(s) || HR.test(s)) return true;
  return PLACEHOLDER_LINE.test(s);
}

/** True if the body (frontmatter stripped) holds only headings and objective placeholders. */
export function isSkeleton(body: string): boolean {
  const { text, hasCompoundMarker } = stripTemplateComments(body.replace(/^\uFEFF/, ''));
  if (hasCompoundMarker) return false;
  if (/<!--/.test(text)) return false; // unterminated comment: not objective
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (t === '') continue;
    const h = parseHeadingLine(t);
    if (h) continue;
    if (!isPlaceholderLine(t)) return false;
  }
  return true;
}

export function bodyOf(text: string): string {
  const lines = splitLines(text);
  const fm = findFrontmatter(lines);
  return fm ? joinLines(lines.slice(fm.end + 1)) : text;
}

/**
 * Classifies a docs file. `text === null` means the file does not exist.
 * A file is managed only with a valid `last_compound_scan` date in its frontmatter.
 */
export function classifyFile(text: string | null, dimensionEnabled: boolean): FileState {
  if (!dimensionEnabled) return 'disabled';
  if (text === null) return 'new';
  const lines = splitLines(text);
  const fm = findFrontmatter(lines);
  if (fm && isValidScanDate(fm.values['last_compound_scan'])) return 'managed';
  if (isSkeleton(bodyOf(text))) return 'skeleton';
  return 'adopted';
}

/** Line budget for appended Compound content per file state (SFK: first write 150, append 100). */
export function lineBudget(state: FileState): number {
  return state === 'new' || state === 'skeleton' ? 150 : state === 'disabled' ? 0 : 100;
}

/** Knowledge-layer files (agent instruction files) never receive frontmatter. */
export function isKnowledgeLayerFile(path: string): boolean {
  const p = path.replace(/\\/g, '/');
  const b = p.slice(p.lastIndexOf('/') + 1);
  return (
    /^(AGENTS|CLAUDE|GEMINI|CODEX)\.md$/i.test(b) ||
    /^llms(-full)?\.txt$/i.test(b) ||
    /(^|\/)\.github\/copilot-instructions\.md$/.test(p) ||
    /(^|\/)\.cursor\/rules\//.test(p) ||
    /^\.cursorrules$/.test(b)
  );
}
