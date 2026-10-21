// SwiftPM: Package.swift .target / .executableTarget / .testTarget → L2 modules.
import type { BuildModule, BuildProject, FileSource } from '../types.js';
import { stripComments } from './parse.js';
import { dirname, joinRel, cmp } from '../util.js';

export interface SwiftTarget {
  kind: string;
  name: string;
  path?: string;
  deps: string[];
}

/** Returns the text between the paren at `open` and its matching close paren. */
function balanced(src: string, open: number): string {
  return src.slice(open + 1, matchEnd(src, open));
}

/** Index of the paren/bracket closing the one at `open`. */
function matchEnd(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"') {
      i++;
      while (i < src.length && src[i] !== '"') i += src[i] === '\\' ? 2 : 1;
    } else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return src.length;
}

export function parsePackageSwift(text: string): { name?: string; targets: SwiftTarget[] } {
  const src = stripComments(text);
  const pk = /Package\s*\(\s*name\s*:\s*"([^"]+)"/.exec(src);
  const targets: SwiftTarget[] = [];
  let end = -1;
  for (const m of src.matchAll(/\.(target|executableTarget|testTarget|macro|plugin|systemLibrary|binaryTarget)\s*\(/g)) {
    if (m.index! < end) continue; // `.target(name:)` inside another target's dependencies
    const open = m.index! + m[0].length - 1;
    end = matchEnd(src, open);
    const body = src.slice(open + 1, end);
    const name = /^\s*name\s*:\s*"([^"]+)"/.exec(body);
    if (!name) continue;
    const path = /(?:^|,)\s*path\s*:\s*"([^"]+)"/.exec(body);
    const deps: string[] = [];
    const di = /dependencies\s*:\s*\[/.exec(body);
    if (di) {
      const list = balanced(body, di.index + di[0].length - 1);
      for (const d of list.matchAll(/(\.product\s*\([^)]*\))|\.(?:target|byName)\s*\(\s*name\s*:\s*"([^"]+)"|"([^"]+)"/g)) {
        if (d[1]) continue; // external product
        deps.push(d[2] ?? d[3]!);
      }
    }
    targets.push({ kind: m[1]!, name: name[1]!, path: path?.[1], deps });
  }
  return { name: pk?.[1], targets };
}

export function detectSwiftPM(src: FileSource, packageRel: string): BuildProject {
  const root = dirname(packageRel);
  const p = parsePackageSwift(src.read(packageRel) ?? '');
  const names = new Set(p.targets.map((t) => t.name));
  const modules: BuildModule[] = p.targets
    .filter((t) => t.kind !== 'binaryTarget')
    .map((t) => ({
      name: t.name,
      roots: [joinRel(root, t.path ?? (t.kind === 'testTarget' ? 'Tests/' : t.kind === 'plugin' ? 'Plugins/' : 'Sources/') + t.name)],
      module_type: t.kind === 'testTarget' ? 'swift-test' : t.kind === 'executableTarget' ? 'swift-executable' : 'swift-target',
      deps: [...new Set(t.deps.filter((d) => names.has(d) && d !== t.name))].sort(cmp),
    }))
    .sort((a, b) => cmp(a.name, b.name));
  const warnings = modules.length ? [] : [`${packageRel}: no targets parsed`];
  return { root, build: 'swiftpm', name: p.name ?? '', platform: 'ios', marker: packageRel, modules, warnings };
}
