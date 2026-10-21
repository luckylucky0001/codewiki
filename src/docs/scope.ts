// Scope model: one repository scope + project targets discovered from
// explicit paths, container directories and mobile layouts. Pure given a
// ScopeFs (a node:fs implementation is provided for the CLI).
import fs from 'node:fs';
import path from 'node:path';
import { basename, dirname, isUnder, joinPath, normalizeRepoPath, slugify } from './text.js';

export type ScanMode = 'full' | 'incremental';
export type Platform = 'android' | 'ios' | 'harmony' | 'web' | 'kmp';
export type BuildSystem = 'gradle' | 'swiftpm' | 'xcode' | 'cocoapods' | 'hvigor' | 'npm' | 'go' | 'cargo' | 'maven' | 'python';

export interface RepositoryScope {
  id: 'repo';
  root: '.';
  specsRoots: string[];
  docsRoot: string;
  docsReadEnabled: boolean;
  writeEnabled: boolean;
  scanMode: ScanMode;
}

export interface ProjectTarget {
  id: string;
  root: string;
  platform?: Platform;
  buildSystem?: BuildSystem;
  /** root specs first (always an input), then the project's own */
  specsRoots: string[];
  docsRoot: string;
  scanMode: ScanMode;
  /** how the project was found */
  origin: 'explicit' | 'container' | 'mobile' | 'config';
}

export interface ScopePlan {
  repository: RepositoryScope;
  projects: ProjectTarget[];
  singleRoot: boolean;
  /** explicit paths / ids that could not be resolved */
  unresolved: string[];
}

/** Minimal read-only file system view (paths relative to the repo root, '' = root). */
export interface ScopeFs {
  isDir(p: string): boolean;
  isFile(p: string): boolean;
  isSymlink(p: string): boolean;
  readdir(p: string): string[];
}

export function nodeScopeFs(root: string): ScopeFs {
  const abs = (p: string) => path.join(root, p);
  const lst = (p: string) => { try { return fs.lstatSync(abs(p)); } catch { return null; } };
  return {
    isDir: (p) => lst(p)?.isDirectory() ?? false,
    isFile: (p) => lst(p)?.isFile() ?? false,
    isSymlink: (p) => lst(p)?.isSymbolicLink() ?? false,
    readdir: (p) => { try { return fs.readdirSync(abs(p)).sort(); } catch { return []; } },
  };
}

export const ContainerDirs = ['apps', 'services', 'packages', 'libs', 'modules'];
export const MobileDirs: Record<string, Platform> = { android: 'android', ios: 'ios', harmony: 'harmony', harmonyos: 'harmony', ohos: 'harmony' };
export const IgnoredDirs = new Set([
  'node_modules', 'build', 'dist', 'out', 'target', 'vendor', 'Pods', 'Carthage', 'oh_modules', 'DerivedData',
  'generated', 'gen', '__generated__', 'coverage', 'bower_components', 'jspm_packages', 'venv', '__pycache__',
]);

const MARKER_FILES: [string, BuildSystem][] = [
  ['settings.gradle', 'gradle'], ['settings.gradle.kts', 'gradle'], ['build.gradle', 'gradle'], ['build.gradle.kts', 'gradle'],
  ['Package.swift', 'swiftpm'], ['Podfile', 'cocoapods'],
  ['build-profile.json5', 'hvigor'], ['oh-package.json5', 'hvigor'], ['hvigorfile.ts', 'hvigor'],
  ['package.json', 'npm'], ['go.mod', 'go'], ['Cargo.toml', 'cargo'], ['pom.xml', 'maven'], ['pyproject.toml', 'python'],
];

export function isIgnoredName(name: string, extra: Set<string> = new Set()): boolean {
  return name.startsWith('.') || IgnoredDirs.has(name) || extra.has(name);
}

/** Build system detected in a directory, or null. `src/` counts as a weak marker (no build system). */
export function detectBuildMarker(fsv: ScopeFs, dir: string): { buildSystem?: BuildSystem } | null {
  for (const [f, bs] of MARKER_FILES) if (fsv.isFile(joinPath(dir, f))) return { buildSystem: bs };
  for (const name of fsv.readdir(dir)) {
    if (/\.(xcodeproj|xcworkspace)$/.test(name) && fsv.isDir(joinPath(dir, name))) return { buildSystem: 'xcode' };
  }
  if (fsv.isDir(joinPath(dir, 'src'))) return {};
  return null;
}

function detectPlatform(fsv: ScopeFs, dir: string, bs?: BuildSystem): Platform | undefined {
  const top = dir.split('/')[0]!;
  const segs = dir.split('/');
  for (const s of segs) if (MobileDirs[s.toLowerCase()]) return MobileDirs[s.toLowerCase()];
  if (bs === 'hvigor') return 'harmony';
  if (bs === 'swiftpm' || bs === 'xcode' || bs === 'cocoapods') return 'ios';
  if (bs === 'gradle') {
    const name = basename(dir).toLowerCase();
    if (/kmp|multiplatform|shared/.test(name)) return 'kmp';
    if (fsv.isFile(joinPath(dir, 'src/main/AndroidManifest.xml')) || fsv.isFile(joinPath(dir, 'app/src/main/AndroidManifest.xml')) || /android/.test(name)) return 'android';
    return undefined;
  }
  if (bs === 'npm' && top !== 'android' && /web|site|frontend/.test(basename(dir).toLowerCase())) return 'web';
  return undefined;
}

export interface DiscoverOptions {
  /** explicit paths (CLI positional args), repo-relative */
  paths?: string[];
  /** keep only these project ids (--project) */
  projectIds?: string[];
  /** --no-root-write */
  noRootWrite?: boolean;
  docsReadEnabled?: boolean;
  specsRoots?: string[];
  docsRoot?: string;
  /** extra ignored directory names / repo-relative path prefixes */
  exclude?: string[];
  /** pinned ids from codewiki.yaml: root → id */
  pinnedIds?: Record<string, string>;
  /** configured projects (codewiki.yaml scopes.projects) used when no explicit paths */
  configured?: { id?: string; root: string; platform?: Platform }[];
  scanMode?: ScanMode;
}

function excluded(p: string, ex: string[]): boolean {
  return ex.some((e) => {
    const n = normalizeRepoPath(e);
    return n !== '' && (isUnder(p, n) || basename(p) === n);
  });
}

/** Nearest ancestor (inclusive) of `p` strictly below the repo root that carries a build marker. */
export function nearestProjectRoot(fsv: ScopeFs, p: string, ex: string[] = []): string | null {
  let cur = normalizeRepoPath(p);
  if (cur.startsWith('..')) return null;
  if (cur !== '' && !fsv.isDir(cur)) cur = dirname(cur);
  const chain: string[] = [];
  while (cur !== '') { chain.push(cur); cur = dirname(cur); }
  for (const d of chain) {
    if (d.split('/').some((s) => isIgnoredName(s)) || excluded(d, ex)) continue;
    if (fsv.isSymlink(d)) continue;
    if (detectBuildMarker(fsv, d)) return d;
  }
  // fallback: direct child of a container dir
  for (const d of chain) {
    const segs = d.split('/');
    if (segs.length === 2 && ContainerDirs.includes(segs[0]!) && !isIgnoredName(segs[1]!) && !fsv.isSymlink(d) && !excluded(d, ex)) return d;
  }
  return null;
}

function childDirs(fsv: ScopeFs, dir: string, ex: string[]): string[] {
  return fsv
    .readdir(dir)
    .filter((n) => !isIgnoredName(n))
    .map((n) => joinPath(dir, n))
    .filter((p) => !fsv.isSymlink(p) && fsv.isDir(p) && !excluded(p, ex))
    .sort();
}

/** Stable ids: basename slug, `-2`, `-3`… on collision in sorted root order; pinned ids win. */
export function assignIds(roots: string[], pinned: Record<string, string> = {}): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>(['repo']);
  const sorted = [...roots].sort();
  for (const r of sorted) {
    const pin = pinned[r];
    if (pin && !used.has(pin)) { out.set(r, pin); used.add(pin); }
  }
  for (const r of sorted) {
    if (out.has(r)) continue;
    const base = slugify(basename(r)) || slugify(r) || 'project';
    let id = base;
    for (let k = 2; used.has(id); k++) id = `${base}-${k}`;
    out.set(r, id);
    used.add(id);
  }
  return out;
}

export function discoverScopes(fsv: ScopeFs, opts: DiscoverOptions = {}): ScopePlan {
  const ex = opts.exclude ?? [];
  const specsRoots = (opts.specsRoots ?? ['specs']).map(normalizeRepoPath);
  const docsRoot = normalizeRepoPath(opts.docsRoot ?? 'docs');
  const scanMode = opts.scanMode ?? 'incremental';
  const unresolved: string[] = [];
  const found = new Map<string, ProjectTarget['origin']>();
  const platformHint = new Map<string, Platform>();

  const add = (root: string, origin: ProjectTarget['origin']) => {
    if (!found.has(root)) found.set(root, origin);
  };

  if (opts.paths?.length) {
    for (const raw of opts.paths) {
      const p = normalizeRepoPath(raw);
      if (p.startsWith('..')) { unresolved.push(raw); continue; }
      if (ContainerDirs.includes(p) && fsv.isDir(p)) {
        for (const c of childDirs(fsv, p, ex)) add(c, 'explicit');
        continue;
      }
      if (p === '') { continue; } // repo root: repository scope only
      const r = nearestProjectRoot(fsv, p, ex);
      if (r) add(r, 'explicit');
      else if (fsv.isDir(p) && !p.split('/').some((s) => isIgnoredName(s))) add(p, 'explicit');
      else if (!fsv.isDir(p) && !fsv.isFile(p)) unresolved.push(raw);
    }
  } else if (opts.configured?.length) {
    for (const c of opts.configured) {
      const r = normalizeRepoPath(c.root);
      if (fsv.isDir(r)) { add(r, 'config'); if (c.platform) platformHint.set(r, c.platform); }
      else unresolved.push(c.root);
    }
  } else {
    for (const c of ContainerDirs) {
      if (!fsv.isDir(c) || fsv.isSymlink(c) || excluded(c, ex)) continue;
      for (const d of childDirs(fsv, c, ex)) add(d, 'container');
    }
    for (const name of fsv.readdir('')) {
      const plat = MobileDirs[name.toLowerCase()];
      if (!plat || fsv.isSymlink(name) || !fsv.isDir(name) || excluded(name, ex)) continue;
      if (detectBuildMarker(fsv, name)) { add(name, 'mobile'); platformHint.set(name, plat); }
    }
  }

  const pinned: Record<string, string> = { ...(opts.pinnedIds ?? {}) };
  for (const c of opts.configured ?? []) if (c.id) pinned[normalizeRepoPath(c.root)] = c.id;
  const ids = assignIds([...found.keys()], pinned);
  let projects: ProjectTarget[] = [...found.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([root, origin]) => {
      const m = detectBuildMarker(fsv, root);
      const platform = platformHint.get(root) ?? detectPlatform(fsv, root, m?.buildSystem);
      return {
        id: ids.get(root)!,
        root,
        ...(platform ? { platform } : {}),
        ...(m?.buildSystem ? { buildSystem: m.buildSystem } : {}),
        specsRoots: [...specsRoots, joinPath(root, 'specs')],
        docsRoot: joinPath(root, 'docs'),
        scanMode,
        origin,
      };
    });
  if (opts.projectIds?.length) {
    const want = new Set(opts.projectIds);
    for (const id of want) if (!projects.some((p) => p.id === id)) unresolved.push(id);
    projects = projects.filter((p) => want.has(p.id));
  }
  return {
    repository: {
      id: 'repo',
      root: '.',
      specsRoots,
      docsRoot,
      docsReadEnabled: opts.docsReadEnabled ?? true,
      writeEnabled: !opts.noRootWrite,
      scanMode,
    },
    projects,
    singleRoot: projects.length === 0,
    unresolved,
  };
}

/** Scope owning a repo path: the deepest project root containing it, else 'repo'. */
export function scopeOf(plan: ScopePlan, p: string): string {
  let best: ProjectTarget | null = null;
  for (const pr of plan.projects) {
    if (isUnder(p, pr.root) && (!best || pr.root.length > best.root.length)) best = pr;
  }
  return best ? best.id : 'repo';
}

/** Docs roots the planned run may write to (write-set guard input). specs/ is never writable. */
export function writableDocsRoots(plan: ScopePlan): string[] {
  const out: string[] = [];
  if (plan.repository.writeEnabled) out.push(plan.repository.docsRoot);
  for (const p of plan.projects) out.push(p.docsRoot);
  return out;
}

export function isWritableDocPath(plan: ScopePlan, p: string): boolean {
  const n = normalizeRepoPath(p);
  const allSpecs = [...plan.repository.specsRoots, ...plan.projects.flatMap((x) => x.specsRoots)];
  if (allSpecs.some((s) => isUnder(n, s))) return false;
  if (!n.endsWith('.md')) return false;
  const owner = scopeOf(plan, n);
  if (owner === 'repo') return plan.repository.writeEnabled && isUnder(n, plan.repository.docsRoot);
  const pr = plan.projects.find((x) => x.id === owner)!;
  return isUnder(n, pr.docsRoot);
}
