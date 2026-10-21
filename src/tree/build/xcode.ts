// Xcode: *.xcodeproj/project.pbxproj PBXNativeTarget → L2 modules. Membership comes
// from each target's Sources build phase (file refs resolved through the PBXGroup
// tree) plus fileSystemSynchronizedGroups (Xcode 16 folders); roots are the
// common directory of the members.
import type { BuildModule, BuildProject, FileSource } from '../types.js';
import { parseOpenStep, type Plist } from './parse.js';
import { commonDir, dirname, joinRel, cmp, uniqSorted } from '../util.js';

type Obj = { [k: string]: Plist };

function obj(v: Plist | undefined): Obj | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined;
}
function arr(v: Plist | undefined): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as string[]) : [];
}
function str(v: Plist | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export interface XcodeTarget {
  name: string;
  productType: string;
  files: string[];
  syncRoots: string[];
  deps: string[];
}

/** Parses project.pbxproj text; paths are relative to the directory containing the .xcodeproj. */
export function parsePbxproj(text: string): XcodeTarget[] | undefined {
  const root = obj(parseOpenStep(text));
  const objects = obj(root?.objects);
  if (!objects) return undefined;
  const parent = new Map<string, string>();
  for (const [id, v] of Object.entries(objects)) {
    const o = obj(v);
    if (!o) continue;
    for (const c of arr(o.children)) parent.set(c, id);
  }
  const memo = new Map<string, string | null>();
  const pathOf = (id: string, depth = 0): string | null => {
    if (memo.has(id)) return memo.get(id)!;
    const o = obj(objects[id]);
    if (!o || depth > 64) return null;
    const tree = str(o.sourceTree) ?? '<group>';
    const p = str(o.path) ?? '';
    let out: string | null;
    if (tree === 'SOURCE_ROOT') out = joinRel(p);
    else if (tree === '<group>') {
      const par = parent.get(id);
      const base = par ? pathOf(par, depth + 1) : '';
      out = base === null ? null : joinRel(base, p);
    } else if (tree === '<absolute>') out = null;
    else out = null; // SDKROOT / BUILT_PRODUCTS_DIR / DEVELOPER_DIR
    memo.set(id, out);
    return out;
  };
  const targets: XcodeTarget[] = [];
  for (const [, v] of Object.entries(objects)) {
    const o = obj(v);
    if (!o || o.isa !== 'PBXNativeTarget') continue;
    const files: string[] = [];
    for (const ph of arr(o.buildPhases)) {
      const phase = obj(objects[ph]);
      if (!phase || phase.isa !== 'PBXSourcesBuildPhase') continue;
      for (const bf of arr(phase.files)) {
        const ref = str(obj(objects[bf])?.fileRef);
        if (!ref) continue;
        const p = pathOf(ref);
        if (p) files.push(p);
      }
    }
    const syncRoots: string[] = [];
    for (const g of arr(o.fileSystemSynchronizedGroups)) {
      const p = pathOf(g);
      if (p !== null) syncRoots.push(p);
    }
    const deps: string[] = [];
    for (const d of arr(o.dependencies)) {
      const t = str(obj(objects[d])?.target);
      const tn = t ? str(obj(objects[t])?.name) : undefined;
      if (tn) deps.push(tn);
    }
    targets.push({ name: str(o.name) ?? '', productType: str(o.productType) ?? '', files: uniqSorted(files), syncRoots: uniqSorted(syncRoots), deps: uniqSorted(deps) });
  }
  return targets.sort((a, b) => cmp(a.name, b.name));
}

function moduleType(pt: string): string {
  if (/application$/.test(pt) && !/watchapp|messages/.test(pt)) return 'xcode-app';
  if (/test/.test(pt)) return 'xcode-test';
  if (/extension/.test(pt)) return 'xcode-extension';
  if (/framework|library/.test(pt)) return 'xcode-framework';
  return 'xcode-target';
}

export function detectXcode(src: FileSource, pbxRel: string): BuildProject {
  const projDir = dirname(dirname(pbxRel)); // dir containing Foo.xcodeproj
  const name = dirname(pbxRel).split('/').pop()!.replace(/\.xcodeproj$/, '');
  const targets = parsePbxproj(src.read(pbxRel) ?? '');
  const warnings: string[] = [];
  if (!targets) warnings.push(`${pbxRel}: unparseable project.pbxproj`);
  const modules: BuildModule[] = [];
  for (const t of targets ?? []) {
    const files = t.files.map((f) => joinRel(projDir, f));
    const syncRoots = t.syncRoots.map((f) => joinRel(projDir, f));
    const roots = uniqSorted([...syncRoots, ...(files.length ? [commonDir(files)] : [])]);
    if (!roots.length) continue;
    modules.push({ name: t.name, roots, files: files.length ? files : undefined, module_type: moduleType(t.productType), deps: t.deps.filter((d) => d !== t.name) });
  }
  return { root: projDir, build: 'xcode', name, platform: 'ios', marker: pbxRel, modules, warnings };
}
