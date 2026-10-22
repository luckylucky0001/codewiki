// Link checker for docs: markdown links, backticked ./ ../ paths, backticked
// repo paths and **Source** paths. Reports only; human links are never removed.
import { parseDocument, parseSourceLine } from './markers.js';
import { basename, dirname, githubSlug, joinPath, normalizeRepoPath, relativePath } from './text.js';

export type LinkKind = 'markdown' | 'backtick-relative' | 'backtick-repo' | 'source';

export interface LinkRef {
  file: string;
  line: number; // 1-based
  target: string;
  kind: LinkKind;
  fragment?: string;
}

export interface BrokenLink extends LinkRef {
  reason: 'missing' | 'anchor' | 'escapes-repo';
  suggestions: string[];
}

export interface LinkFs {
  /** repo-relative file or directory exists */
  exists(p: string): boolean;
  /** text of a markdown file for #anchor checks (optional) */
  read?(p: string): string | null;
  /** all repo files, for suggestions (optional) */
  files?: string[];
}

export interface LinkOptions {
  /** top-level directory names that make a backticked path a repo path */
  topLevelDirs?: string[];
  /** repo-relative existence check: a backticked repo path counts only when its first segment exists at the
   * repo root or in one of the file's ancestor directories (falls back to topLevelDirs) */
  exists?: (p: string) => boolean;
  checkAnchors?: boolean;
}

const MD_LINK_RE = /!?\[(?:[^\]\\]|\\.)*\]\(\s*<?((?:[^()\s>]|\([^()\s]*\))+)>?(?:\s+"[^"]*")?\s*\)/g;
const REF_DEF_RE = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+["'(].*)?$/;
const BACKTICK_RE = /`([^`\n]+)`/g;

function isExternal(t: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('//');
}

/** template paths in prose (`changelog/vX.Y.Z.md`, `docs/YYYY-MM-DD.md`, `src/xxx/…`, `<module>/src`) are not links */
const PLACEHOLDER = /X\.Y\.Z|YYYY|\bxxx\b|\bXXX\b|\bfoo\b|\.\.\.|…|\[[^\]]*\]|<[^>]*>|\{[^}]*\}|%[sd]/;
/** code rather than a path: calls, assignments, operators, member access, regexes, shell options */
const CODEISH = /[()=,;'"|\\^$!]|::|->|=>|\s|^-|^@|^\$|^#/;
const GLOB = /[*?]/;
/** extensions that make `a/b.ext` a file reference */
const KNOWN_EXT = /\.(md|mdx|txt|kt|kts|java|swift|m|mm|h|c|cc|cpp|ets|ts|tsx|js|jsx|mjs|cjs|json|json5|ya?ml|xml|toml|gradle|properties|plist|pbxproj|strings|sh|bash|py|rb|go|rs|html|css|scss|png|jpe?g|gif|svg|webp|pdf|lock|cfg|ini|env|sql|proto|graphql)$/i;

function looksLikePath(s: string): boolean {
  return /^[\w.@~-]+(?:\/[\w.@~-]+)+\/?$/.test(s);
}

/** the SFK rule for backticked paths (see docs/ownership.md §links) */
export function backtickPathKind(s: string): 'backtick-relative' | 'backtick-repo' | null {
  if (!s || isExternal(s) || CODEISH.test(s) || GLOB.test(s) || PLACEHOLDER.test(s)) return null;
  if (s.startsWith('./') || s.startsWith('../')) return 'backtick-relative';
  if (!s.includes('/') || !looksLikePath(s)) return null;
  const bare = s.replace(/#.*$/, '').replace(/:\d+(?:-\d+)?$/, '');
  if (!KNOWN_EXT.test(bare) && !bare.endsWith('/')) return null;
  return 'backtick-repo';
}

export function extractLinks(file: string, text: string, opts: LinkOptions = {}): LinkRef[] {
  const doc = parseDocument(text);
  const out: LinkRef[] = [];
  const top = new Set(opts.topLevelDirs ?? []);
  const fmEnd = doc.frontmatter ? doc.frontmatter.end : -1;
  doc.lines.forEach((l, i) => {
    if (i <= fmEnd || doc.inFence[i]) return;
    const t = l.text;
    const src = parseSourceLine(t);
    if (src && src.path) {
      out.push({ file, line: i + 1, target: src.path.replace(/#.*$/, ''), kind: 'source' });
      return;
    }
    // remove inline code before scanning markdown links
    const noCode = t.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
    const pushTarget = (raw: string) => {
      if (isExternal(raw)) return;
      const hash = raw.indexOf('#');
      const target = hash >= 0 ? raw.slice(0, hash) : raw;
      const fragment = hash >= 0 ? raw.slice(hash + 1) : undefined;
      let dec = target;
      try { dec = decodeURI(target); } catch { /* keep raw */ }
      out.push({ file, line: i + 1, target: dec, kind: 'markdown', ...(fragment ? { fragment } : {}) });
    };
    for (const m of noCode.matchAll(MD_LINK_RE)) pushTarget(m[1]!);
    const rd = REF_DEF_RE.exec(noCode);
    if (rd) pushTarget(rd[1]!);
    for (const m of t.matchAll(BACKTICK_RE)) {
      const s = m[1]!.trim().replace(/:\d+(?:-\d+)?$/, '');
      const kind = backtickPathKind(s);
      if (!kind) continue;
      const target = s.replace(/#.*$/, '');
      {
        // repo paths: first segment must exist; ../ paths whose first named segment exists nowhere up the
        // tree point at a sibling repository (`../other_app/lib/x.dart`) and are not checked
        const seg = (kind === 'backtick-repo' ? target : target.replace(/^(?:\.\.?\/)+/, '')).split('/')[0]!;
        if (kind === 'backtick-relative' && (!opts.exists || !target.startsWith('../'))) { out.push({ file, line: i + 1, target, kind }); continue; }
        let ok = top.has(seg);
        if (opts.exists) {
          ok = false;
          let d = dirname(file);
          for (;;) {
            if (opts.exists(joinPath(d, seg))) { ok = true; break; }
            if (d === '') break;
            d = dirname(d);
          }
        }
        if (!ok) continue;
      }
      out.push({ file, line: i + 1, target, kind });
    }
  });
  return out;
}

function anchorsOf(text: string): Set<string> {
  const doc = parseDocument(text);
  const out = new Set<string>();
  const counts = new Map<string, number>();
  for (const h of doc.headings) {
    const base = githubSlug(h.text);
    const c = counts.get(base) ?? 0;
    out.add(c ? `${base}-${c}` : base);
    counts.set(base, c + 1);
  }
  for (const it of doc.items) if (it.kind === 'entry' && it.heading) out.add(githubSlug(it.heading));
  for (const m of text.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) out.add(m[1]!);
  return out;
}

/** Candidate resolutions for a link in `file`. */
function candidates(ref: LinkRef): string[] {
  const dir = dirname(ref.file);
  const t = ref.target;
  if (ref.kind === 'markdown') {
    if (t === '') return [ref.file];
    if (t.startsWith('/')) return [normalizeRepoPath(t.slice(1))];
    return [joinPath(dir, t)];
  }
  if (ref.kind === 'backtick-relative') return [joinPath(dir, t)];
  // repo paths and **Source** paths: the file dir and each ancestor, then the repo root
  const out: string[] = [];
  let d = dir;
  for (;;) {
    out.push(joinPath(d, t));
    if (d === '') break;
    d = dirname(d);
  }
  return [...new Set(out)];
}

function suggest(ref: LinkRef, fsv: LinkFs): string[] {
  const dir = dirname(ref.file);
  const out: string[] = [];
  const t = normalizeRepoPath(ref.target.replace(/^(\.\.\/)+/, '').replace(/^\.\//, ''));
  // 1. the same path resolved from the repo root / any ancestor (wrong ../ depth)
  let d = dir;
  for (;;) {
    const c = joinPath(d, t);
    if (c && fsv.exists(c)) out.push(ref.kind === 'markdown' || ref.kind === 'backtick-relative' ? relativePath(dir, c) : c);
    if (d === '') break;
    d = dirname(d);
  }
  // 2. same basename anywhere
  if (fsv.files && t) {
    const b = basename(t);
    for (const f of fsv.files) {
      if (basename(f) === b) {
        const s = ref.kind === 'markdown' || ref.kind === 'backtick-relative' ? relativePath(dir, f) : f;
        if (!out.includes(s)) out.push(s);
      }
      if (out.length >= 5) break;
    }
  }
  return out.slice(0, 5);
}

export function checkLinks(files: { path: string; text: string }[], fsv: LinkFs, opts: LinkOptions = {}): BrokenLink[] {
  const broken: BrokenLink[] = [];
  for (const f of files) {
    for (const ref of extractLinks(normalizeRepoPath(f.path), f.text, opts)) {
      const cands = candidates(ref);
      if (cands.every((c) => c.startsWith('..'))) {
        broken.push({ ...ref, reason: 'escapes-repo', suggestions: suggest(ref, fsv) });
        continue;
      }
      const self = normalizeRepoPath(f.path);
      const hit = cands.find((c) => !c.startsWith('..') && (c === '' || c === self || fsv.exists(c)));
      if (hit === undefined) {
        broken.push({ ...ref, reason: 'missing', suggestions: suggest(ref, fsv) });
        continue;
      }
      if (opts.checkAnchors !== false && ref.fragment && /\.md$/i.test(hit) && fsv.read) {
        const txt = hit === normalizeRepoPath(f.path) ? f.text : fsv.read(hit);
        if (txt !== null && txt !== undefined) {
          let frag = ref.fragment;
          try { frag = decodeURIComponent(frag); } catch { /* keep */ }
          if (!/^L\d+(-L\d+)?$/.test(frag) && !anchorsOf(txt).has(frag.toLowerCase())) {
            const sugg = [...anchorsOf(txt)].filter((a) => a.includes(frag.toLowerCase().slice(0, 4))).slice(0, 3).map((a) => `#${a}`);
            broken.push({ ...ref, reason: 'anchor', suggestions: sugg });
          }
        }
      }
    }
  }
  return broken;
}

