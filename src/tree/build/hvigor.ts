// HarmonyOS (hvigor): build-profile.json5 modules[] → L2 modules; module type from
// <srcPath>/src/main/module.json5 `module.type` (entry/feature → HAP, har → HAR, shared → HSP);
// deps from <srcPath>/oh-package.json5 "file:../x" dependencies.
import type { BuildModule, BuildProject, FileSource } from '../types.js';
import { parseJSON5 } from './parse.js';
import { dirname, joinRel, cmp } from '../util.js';

export function harmonyModuleType(t: string | undefined): string {
  switch (t) {
    case 'entry':
    case 'feature':
      return 'HAP';
    case 'har':
      return 'HAR';
    case 'shared':
      return 'HSP';
    default:
      return 'harmony-module';
  }
}

/** True if the json5 text is a project-level build-profile (has modules[]). */
export function isHvigorProject(text: string): boolean {
  const o = parseJSON5(text) as { modules?: unknown } | undefined;
  return !!o && Array.isArray(o.modules);
}

export function detectHvigor(src: FileSource, profileRel: string): BuildProject {
  const root = dirname(profileRel);
  const warnings: string[] = [];
  const o = parseJSON5(src.read(profileRel) ?? '') as { modules?: { name?: string; srcPath?: string }[] } | undefined;
  if (!o) warnings.push(`${profileRel}: unparseable json5`);
  const mods = (o?.modules ?? []).filter((m) => m && typeof m.name === 'string');
  const dirOf = new Map<string, string>();
  for (const m of mods) dirOf.set(m.name!, joinRel(root, m.srcPath ?? './' + m.name));
  const byDir = new Map([...dirOf.entries()].map(([n, d]) => [d, n]));
  const modules: BuildModule[] = [];
  for (const m of mods) {
    const d = dirOf.get(m.name!)!;
    const mj = parseJSON5(src.read(joinRel(d, 'src/main/module.json5')) ?? '') as { module?: { type?: string } } | undefined;
    if (!mj) warnings.push(`${joinRel(d, 'src/main/module.json5')}: missing or unparseable`);
    const deps: string[] = [];
    const pkg = parseJSON5(src.read(joinRel(d, 'oh-package.json5')) ?? '') as { dependencies?: Record<string, unknown> } | undefined;
    for (const v of Object.values(pkg?.dependencies ?? {})) {
      if (typeof v !== 'string' || !v.startsWith('file:')) continue;
      const target = byDir.get(joinRel(d, v.slice(5)));
      if (target && target !== m.name) deps.push(target);
    }
    modules.push({ name: m.name!, roots: [d], module_type: harmonyModuleType(mj?.module?.type), deps: [...new Set(deps)].sort(cmp) });
  }
  modules.sort((a, b) => cmp(a.name, b.name));
  return { root, build: 'hvigor', name: '', platform: 'harmony', marker: profileRel, modules, warnings };
}
