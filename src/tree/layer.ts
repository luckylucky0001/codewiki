// L0–L2 deterministic layering: projects and build modules from detection, files
// mapped to the module with the deepest root (explicit Xcode membership first),
// leftover files grouped by the v1 heuristic, empty levels dropped.
import type { BuildProject, Graph } from './types.js';
import { cmp, dirname, kebab, under } from './util.js';

export interface LayerModule {
  /** stable key independent of collapsing: "<build>:<project root>::<module name>" */
  key: string;
  slug: string;
  name: string;
  roots: string[];
  module_type: string;
  /** dependency module keys */
  deps: string[];
  files: string[];
}

export interface LayerProject {
  slug: string;
  title: string;
  root: string;
  build: string;
  platform: string;
  modules: LayerModule[];
}

export interface Layering {
  projects: LayerProject[];
  /** file → module key */
  fileModule: Map<string, string>;
  warnings: string[];
}

/** v1 fallback: prefix before /src/ (Gradle-ish layout) else the first two directory levels. */
export function heuristicModuleDir(file: string): string {
  const i = file.indexOf('/src/');
  if (i > 0) return file.slice(0, i);
  const parts = dirname(file).split('/').filter(Boolean);
  return parts.slice(0, 2).join('/');
}

function uniqueSlug(base: string, used: Set<string>): string {
  let s = base || 'root';
  if (s === 'overview' || s === 'index') s += '-module';
  let k = 2;
  const b = s;
  while (used.has(s)) s = `${b}-${k++}`;
  used.add(s);
  return s;
}

function moduleSlug(build: string, name: string): string {
  if (build === 'gradle') return kebab(name.split(':').filter(Boolean).join('-'));
  return kebab(name);
}

/** Groups graph files into projects/modules. `projects` comes from detectProjects(). */
export function layer(graph: Graph, projects: BuildProject[]): Layering {
  const warnings: string[] = [];
  for (const p of projects) warnings.push(...p.warnings);
  const files = Object.keys(graph.files).sort(cmp);
  const platformOf = (f: string) => graph.files[f]?.platform ?? '';
  const keyOf = (p: BuildProject, name: string) => `${p.build}:${p.root}::${name}`;

  // explicit membership (Xcode build phases) then deepest root
  const explicit = new Map<string, string>();
  const rootMap = new Map<string, string>();
  for (const p of projects) {
    for (const m of p.modules) {
      const key = keyOf(p, m.name);
      for (const f of m.files ?? []) if (!explicit.has(f)) explicit.set(f, key);
      for (const r of m.roots) {
        // two modules sharing a root: first (sorted) wins; Xcode targets lose to real build modules
        const prev = rootMap.get(r);
        if (prev === undefined || (prev.startsWith('xcode:') && !key.startsWith('xcode:'))) rootMap.set(r, key);
      }
    }
  }
  const projRoots = new Map<string, BuildProject>();
  for (const p of projects) if (!projRoots.has(p.root)) projRoots.set(p.root, p);

  const fileModule = new Map<string, string>();
  const leftovers: string[] = [];
  for (const f of files) {
    let key = explicit.get(f);
    if (!key) {
      let d = dirname(f);
      for (;;) {
        const k = rootMap.get(d);
        if (k) {
          key = k;
          break;
        }
        if (d === '') break;
        d = dirname(d);
      }
    }
    if (!key) {
      // inside a project root but no module: project-level pseudo module
      let d = dirname(f);
      for (;;) {
        const p = projRoots.get(d);
        if (p) {
          key = keyOf(p, '(root)');
          break;
        }
        if (d === '') break;
        d = dirname(d);
      }
    }
    if (key) fileModule.set(f, key);
    else leftovers.push(f);
  }

  // build the project/module lists
  const out: LayerProject[] = [];
  const modFiles = new Map<string, string[]>();
  for (const [f, k] of fileModule) {
    let xs = modFiles.get(k);
    if (!xs) modFiles.set(k, (xs = []));
    xs.push(f);
  }
  const usedProj = new Set<string>();
  const projSlugBase = (p: { root: string; platform: string; build: string }) =>
    p.root === '' ? kebab(p.platform || p.build) : kebab(p.root.split('/').pop()!);
  for (const p of projects) {
    const mods: LayerModule[] = [];
    const usedMod = new Set<string>();
    const names = [...p.modules.map((m) => m.name)];
    if (modFiles.has(keyOf(p, '(root)'))) names.push('(root)');
    for (const name of names) {
      const key = keyOf(p, name);
      const fs = modFiles.get(key);
      if (!fs?.length) continue; // empty module collapses
      if (mods.some((m) => m.key === key)) continue;
      const bm = p.modules.find((m) => m.name === name);
      mods.push({
        key,
        slug: uniqueSlug(name === '(root)' ? '_root' : moduleSlug(p.build, name), usedMod),
        name,
        roots: bm ? bm.roots : [p.root],
        module_type: bm ? bm.module_type : 'project-root',
        deps: (bm?.deps ?? []).map((d) => keyOf(p, d)),
        files: fs.sort(cmp),
      });
    }
    if (!mods.length) continue;
    const platform = majorityPlatform(mods.flatMap((m) => m.files), platformOf) || p.platform || '';
    const lp = { root: p.root, platform, build: p.build };
    out.push({ slug: '', title: p.name || (p.root === '' ? platform || p.build : p.root.split('/').pop()!), root: p.root, build: p.build, platform, modules: mods });
    out[out.length - 1]!.slug = projSlugBase(lp);
  }

  // leftovers: one heuristic project per platform
  if (leftovers.length) {
    const byPlat = new Map<string, string[]>();
    for (const f of leftovers) {
      const pl = platformOf(f) || 'other';
      let xs = byPlat.get(pl);
      if (!xs) byPlat.set(pl, (xs = []));
      xs.push(f);
    }
    for (const [pl, fs] of [...byPlat.entries()].sort((a, b) => cmp(a[0], b[0]))) {
      const byDir = new Map<string, string[]>();
      for (const f of fs) {
        const d = heuristicModuleDir(f);
        let xs = byDir.get(d);
        if (!xs) byDir.set(d, (xs = []));
        xs.push(f);
      }
      const usedMod = new Set<string>();
      const mods: LayerModule[] = [...byDir.entries()]
        .sort((a, b) => cmp(a[0], b[0]))
        .map(([d, xs]) => {
          const key = `heuristic:${pl}::${d}`;
          for (const f of xs) fileModule.set(f, key);
          return { key, slug: uniqueSlug(kebab(d.split('/').join('-')) || '_root', usedMod), name: d || '(root)', roots: [d], module_type: 'heuristic', deps: [], files: xs.sort(cmp) };
        });
      out.push({ slug: kebab(pl) || 'other', title: pl, root: '', build: 'heuristic', platform: pl, modules: mods });
    }
    warnings.push(`${leftovers.length} file(s) outside any detected build module grouped heuristically`);
  }

  // unique project slugs (collisions → full root path)
  const counts = new Map<string, number>();
  for (const p of out) counts.set(p.slug, (counts.get(p.slug) ?? 0) + 1);
  for (const p of out) {
    let base = p.slug;
    if (counts.get(base)! > 1 && p.root) base = kebab(p.root.split('/').join('-'));
    p.slug = uniqueSlug(base, usedProj);
  }
  // keep only dependency keys that survived
  const live = new Set(out.flatMap((p) => p.modules.map((m) => m.key)));
  for (const p of out) for (const m of p.modules) m.deps = m.deps.filter((d) => live.has(d) && d !== m.key).sort(cmp);
  return { projects: out, fileModule, warnings };
}

function majorityPlatform(files: string[], platformOf: (f: string) => string): string {
  const c = new Map<string, number>();
  for (const f of files) {
    const p = platformOf(f);
    if (p) c.set(p, (c.get(p) ?? 0) + 1);
  }
  let best = '';
  let bn = 0;
  for (const [p, n] of [...c.entries()].sort((a, b) => cmp(a[0], b[0]))) if (n > bn) [best, bn] = [p, n];
  return best;
}

export { under };
