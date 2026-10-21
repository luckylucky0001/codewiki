// Gradle (Android / KMP): settings.gradle(.kts) include(...) → L2 modules.
import type { BuildModule, BuildProject, FileSource } from '../types.js';
import { stripComments } from './parse.js';
import { dirname, joinRel, normRel, cmp, uniqSorted } from '../util.js';

export interface GradleSettings {
  rootName?: string;
  includes: string[];
  projectDirs: Record<string, string>;
  includeBuilds: string[];
  dynamic: boolean;
}

const quoted = /["']([^"'\n]+)["']/g;

/** Parses include(":a", ":b:c") / include ':a', ':b' / projectDir overrides. Gradle DSL is never executed. */
export function parseGradleSettings(text: string): GradleSettings {
  const src = stripComments(text);
  const out: GradleSettings = { includes: [], projectDirs: {}, includeBuilds: [], dynamic: false };
  const rn = /rootProject\.name\s*=\s*["']([^"']+)["']/.exec(src);
  if (rn) out.rootName = rn[1];
  const add = (args: string) => {
    for (const m of args.matchAll(quoted)) {
      const p = m[1]!.trim();
      if (p.includes('$')) {
        out.dynamic = true;
        continue;
      }
      out.includes.push(p.startsWith(':') ? p : ':' + p);
    }
    if (!/["']/.test(args) && args.trim()) out.dynamic = true;
  };
  for (const m of src.matchAll(/(?<![\w.])include\s*\(([^)]*)\)/g)) add(m[1]!);
  // Groovy: include ':a', ':b' (a trailing comma continues on the next line)
  for (const m of src.matchAll(/(?<![\w.])include[ \t]+(["'](?:[^\n]*,[ \t]*\r?\n)*[^\n]*)/g)) add(m[1]!);
  for (const m of src.matchAll(/(?<![\w.])includeBuild\s*\(?\s*["']([^"']+)["']/g)) out.includeBuilds.push(normRel(m[1]!));
  const pd =
    /project\(\s*["'](:?[^"']+)["']\s*\)\.projectDir\s*=\s*(?:file\(\s*["']([^"']+)["']\s*\)|(?:new\s+)?File\(\s*(?:settingsDir|rootDir|rootProject\.projectDir)\s*,\s*["']([^"']+)["']\s*\))/g;
  for (const m of src.matchAll(pd)) {
    const p = m[1]!.startsWith(':') ? m[1]! : ':' + m[1]!;
    out.projectDirs[p] = normRel(m[2] ?? m[3] ?? '');
  }
  if (/\b(fun|def)\s+\w+[^{]*\{[\s\S]*?\binclude\s*\(/.test(src) || /forEach[\s\S]{0,400}\binclude\s*\(/.test(src)) out.dynamic = true;
  out.includes = uniqSorted(out.includes);
  return out;
}

/** ":feature:cart" → "feature/cart" (default projectDir). */
export function gradlePathToDir(p: string): string {
  return p.split(':').filter(Boolean).join('/');
}

function norm(s: string): string {
  return s.replace(/[-_.]/g, '').toLowerCase();
}

/** project(":x") / projects.core.net references in a build script. */
export function parseGradleDeps(text: string, known: string[]): string[] {
  const src = stripComments(text);
  const out = new Set<string>();
  for (const m of src.matchAll(/project\(\s*(?:path\s*[:=]\s*)?["'](:[^"']+)["']/g)) out.add(m[1]!);
  const byNorm = new Map<string, string>();
  for (const k of known) byNorm.set(k.split(':').filter(Boolean).map(norm).join('.'), k);
  for (const m of src.matchAll(/\bprojects\.([A-Za-z_][\w.]*)/g)) {
    const segs = m[1]!.split('.').map(norm);
    // longest prefix that names a module (accessors may be followed by e.g. .dependencyProject)
    for (let k = segs.length; k > 0; k--) {
      const hit = byNorm.get(segs.slice(0, k).join('.'));
      if (hit) {
        out.add(hit);
        break;
      }
    }
  }
  return [...out].sort(cmp);
}

function moduleType(script: string | undefined): string {
  if (!script) return 'gradle-module';
  if (/com\.android\.application|android\.application|androidApplication|\.application\)|"application"/.test(script)) return 'android-app';
  if (/com\.android\.library|android\.library|androidLibrary|\.library\)/.test(script)) return 'android-library';
  if (/multiplatform/i.test(script)) return 'kmp-module';
  if (/kotlin\(\s*"jvm"|jvm\b|java-library|\bjava\b/.test(script)) return 'jvm-library';
  return 'gradle-module';
}

/** Detects one Gradle project from its settings file. */
export function detectGradle(src: FileSource, settingsRel: string, all: string[]): BuildProject {
  const root = dirname(settingsRel);
  const s = parseGradleSettings(src.read(settingsRel) ?? '');
  const warnings: string[] = [];
  const dirs = new Map<string, string>(); // gradle path -> repo-relative dir
  for (const p of s.includes) dirs.set(p, joinRel(root, s.projectDirs[p] ?? gradlePathToDir(p)));
  const buildFiles = all.filter((f) => /(^|\/)build\.gradle(\.kts)?$/.test(f));
  if (s.dynamic || !s.includes.length) {
    // dynamic includes (e.g. includeProjects(File(rootDir, "features"))): every dir with a build script is a module
    const skip = s.includeBuilds.map((b) => joinRel(root, b));
    let added = 0;
    for (const bf of buildFiles) {
      const d = dirname(bf);
      if (d === root || !(root === '' || d.startsWith(root + '/'))) continue;
      if (skip.some((x) => d === x || d.startsWith(x + '/'))) continue;
      // nested gradle builds (their own settings file) are separate projects
      if (all.some((f) => /(^|\/)settings\.gradle(\.kts)?$/.test(f) && dirname(f) !== root && (d === dirname(f) || d.startsWith(dirname(f) + '/')))) continue;
      const rel = root === '' ? d : d.slice(root.length + 1);
      const p = ':' + rel.split('/').join(':');
      if (!dirs.has(p)) {
        dirs.set(p, d);
        added++;
      }
    }
    if (added) warnings.push(`${settingsRel}: dynamic include() detected; ${added} module(s) inferred from build.gradle(.kts) locations`);
  }
  const known = [...dirs.keys()];
  const modules: BuildModule[] = [];
  for (const [p, d] of [...dirs.entries()].sort((a, b) => cmp(a[0], b[0]))) {
    const script = src.read(joinRel(d, 'build.gradle.kts')) ?? src.read(joinRel(d, 'build.gradle'));
    modules.push({ name: p, roots: [d], module_type: moduleType(script), deps: script ? parseGradleDeps(script, known).filter((x) => x !== p && dirs.has(x)) : [] });
  }
  return { root, build: 'gradle', name: s.rootName ?? '', platform: 'android', marker: settingsRel, modules, warnings };
}
