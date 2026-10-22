// Incremental change sets per docs scope. Base = earliest managed file scan
// (compound_source_commit preferred, else last_compound_scan date). Files =
// git log --since / diff base..HEAD ∪ diff ∪ diff --cached ∪ status (renames
// contribute both paths). Non-git or shallow without the base → full.
import { isUnder, normalizeRepoPath } from './text.js';
import { isValidScanDate } from './text.js';

export interface GitResult {
  code: number;
  stdout: string;
}

/** Runs `git <args>` in the repo root. Injected so tests need no repository. */
export type GitRunner = (args: string[]) => GitResult;

export interface ScanBase {
  commit?: string;
  date?: string;
}

export interface ManagedFileInfo {
  path: string;
  frontmatter: Record<string, string> | null;
}

/** Earliest base across a scope's managed files; null when no file is managed (→ full). */
export function earliestScanBase(files: ManagedFileInfo[]): ScanBase | null {
  let best: { date: string; commit?: string } | null = null;
  for (const f of files) {
    const d = f.frontmatter?.['last_compound_scan'];
    if (!isValidScanDate(d)) continue;
    const commit = f.frontmatter?.['compound_source_commit'];
    if (!best || d! < best.date) best = { date: d!, ...(commit ? { commit } : {}) };
    else if (d === best.date && !commit) delete best.commit; // same day, one without commit: be conservative
  }
  if (!best) return null;
  return { date: best.date, ...(best.commit ? { commit: best.commit } : {}) };
}

export interface ScopeChangeSet {
  scopeId: string;
  mode: 'full' | 'incremental';
  reason?: string;
  base?: ScanBase;
  files: string[];
  renamed: [string, string][];
  /** spec directories (…/specs/<x>) touched */
  specDirs: string[];
}

export interface ScopeRef {
  id: string;
  /** '.' or '' for the repository */
  root: string;
  base: ScanBase | null;
}

export function parseNameStatus(out: string): { files: string[]; renamed: [string, string][] } {
  const files: string[] = [];
  const renamed: [string, string][] = [];
  for (const raw of out.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 2 || !/^[ACDMRTUXB]/.test(parts[0]!)) continue;
    const st = parts[0]!;
    if ((st.startsWith('R') || st.startsWith('C')) && parts.length >= 3) {
      files.push(unquotePath(parts[1]!), unquotePath(parts[2]!));
      if (st.startsWith('R')) renamed.push([unquotePath(parts[1]!), unquotePath(parts[2]!)]);
    } else files.push(unquotePath(parts[1]!));
  }
  return { files, renamed };
}

function unquotePath(p: string): string {
  if (p.startsWith('"') && p.endsWith('"')) {
    try { return JSON.parse(p) as string; } catch { return p.slice(1, -1); }
  }
  return p;
}

/** `git status --porcelain` (v1) parsing incl. renames `R  old -> new` and untracked. */
export function parsePorcelain(out: string): { files: string[]; renamed: [string, string][] } {
  const files: string[] = [];
  const renamed: [string, string][] = [];
  for (const raw of out.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.length < 4) continue;
    const xy = line.slice(0, 2);
    const rest = line.slice(3);
    const arrow = rest.indexOf(' -> ');
    if ((xy.includes('R') || xy.includes('C')) && arrow >= 0) {
      const a = unquotePath(rest.slice(0, arrow));
      const b = unquotePath(rest.slice(arrow + 4));
      files.push(a, b);
      if (xy.includes('R')) renamed.push([a, b]);
    } else files.push(unquotePath(rest));
  }
  return { files, renamed };
}

function specDirOf(p: string): string | null {
  const m = /^(.*?(?:^|\/)specs\/[^/]+)\//.exec(p);
  return m ? m[1]! : null;
}

/** Repo-wide change list since a base. Returns null when the base cannot be used (→ full). */
export function changedSince(git: GitRunner, base: ScanBase): { files: string[]; renamed: [string, string][]; reason?: string } | null {
  const inside = git(['rev-parse', '--is-inside-work-tree']);
  if (inside.code !== 0 || inside.stdout.trim() !== 'true') return null;
  const shallow = git(['rev-parse', '--is-shallow-repository']).stdout.trim() === 'true';
  const files: string[] = [];
  const renamed: [string, string][] = [];
  const merge = (r: { files: string[]; renamed: [string, string][] }) => { files.push(...r.files); renamed.push(...r.renamed); };
  let usedCommit = false;
  if (base.commit) {
    const ok = git(['cat-file', '-e', `${base.commit}^{commit}`]).code === 0;
    if (ok) {
      const d = git(['diff', '--name-status', '-M', base.commit, 'HEAD']);
      if (d.code !== 0) return null;
      merge(parseNameStatus(d.stdout));
      usedCommit = true;
    } else if (shallow) return null;
  }
  if (!usedCommit) {
    if (shallow) return null;
    if (!base.date) return null;
    const l = git(['log', `--since=${base.date}`, '--name-status', '-M', '--format=']);
    if (l.code !== 0) return null;
    merge(parseNameStatus(l.stdout));
  }
  const wt = git(['diff', '--name-status', '-M']);
  if (wt.code === 0) merge(parseNameStatus(wt.stdout));
  const idx = git(['diff', '--cached', '--name-status', '-M']);
  if (idx.code === 0) merge(parseNameStatus(idx.stdout));
  const st = git(['status', '--porcelain', '--untracked-files=all']);
  if (st.code === 0) merge(parsePorcelain(st.stdout));
  return { files, renamed };
}

/**
 * Change sets for every scope. A file belongs to the deepest project root that
 * contains it, else to the repository scope. Each scope uses its own base.
 */
export function computeScopeChanges(git: GitRunner, scopes: ScopeRef[]): ScopeChangeSet[] {
  const projectRoots = scopes.filter((s) => s.root !== '.' && s.root !== '').map((s) => ({ id: s.id, root: normalizeRepoPath(s.root) }));
  const owner = (p: string): string => {
    let best: { id: string; root: string } | null = null;
    for (const r of projectRoots) if (isUnder(p, r.root) && (!best || r.root.length > best.root.length)) best = r;
    return best ? best.id : (scopes.find((s) => s.root === '.' || s.root === '')?.id ?? 'repo');
  };
  const cache = new Map<string, ReturnType<typeof changedSince>>();
  const out: ScopeChangeSet[] = [];
  for (const s of scopes) {
    if (!s.base) { out.push({ scopeId: s.id, mode: 'full', reason: 'no managed docs file', files: [], renamed: [], specDirs: [] }); continue; }
    const ck = `${s.base.commit ?? ''}|${s.base.date ?? ''}`;
    if (!cache.has(ck)) cache.set(ck, changedSince(git, s.base));
    const all = cache.get(ck)!;
    if (!all) { out.push({ scopeId: s.id, mode: 'full', reason: 'not a git work tree, shallow clone or unknown base', base: s.base, files: [], renamed: [], specDirs: [] }); continue; }
    const files = [...new Set(all.files.map(normalizeRepoPath))].filter((p) => owner(p) === s.id).sort();
    const renamed = all.renamed.filter(([a, b]) => owner(normalizeRepoPath(a)) === s.id || owner(normalizeRepoPath(b)) === s.id);
    // spec dirs: root specs changes concern every scope (root specs are always input)
    const specDirs = [...new Set(all.files.map(normalizeRepoPath).filter((p) => owner(p) === s.id || /^specs\//.test(p)).map(specDirOf).filter((x): x is string => !!x))].sort();
    out.push({ scopeId: s.id, mode: 'incremental', base: s.base, files, renamed, specDirs });
  }
  return out;
}
