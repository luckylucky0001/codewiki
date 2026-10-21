// L1/L2 build-system detection over a read-only FileSource.
import fs from 'node:fs';
import path from 'node:path';
import type { BuildProject, FileSource } from '../types.js';
import { detectGradle } from './gradle.js';
import { detectSwiftPM } from './swiftpm.js';
import { detectXcode } from './xcode.js';
import { detectHvigor, isHvigorProject } from './hvigor.js';
import { basename, cmp, dirname } from '../util.js';

export const DefaultSkipDirs = ['.git', 'node_modules', 'build', '.gradle', 'Pods', 'oh_modules', '.build', 'DerivedData', '.idea', '.hvigor', '.kb-work', '.swiftpm', 'Carthage'];

/** Walks a directory (read-only), skipping build output dirs. Files are listed lexically. */
export function fsSource(root: string, skipDirs: string[] = DefaultSkipDirs): FileSource {
  const skip = new Set(skipDirs);
  let cache: string[] | undefined;
  const sizes = new Map<string, number>();
  const walk = (dir: string, rel: string, out: string[]) => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    ents.sort((a, b) => cmp(a.name, b.name));
    for (const e of ents) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) {
        // .xcodeproj dirs are kept (project.pbxproj lives inside)
        if (skip.has(e.name)) continue;
        walk(path.join(dir, e.name), r, out);
      } else if (e.isFile()) out.push(r);
    }
  };
  return {
    list() {
      if (!cache) {
        cache = [];
        walk(root, '', cache);
      }
      return cache;
    },
    read(rel) {
      try {
        return fs.readFileSync(path.join(root, rel), 'utf8');
      } catch {
        return undefined;
      }
    },
    size(rel) {
      if (sizes.has(rel)) return sizes.get(rel);
      try {
        const n = fs.statSync(path.join(root, rel)).size;
        sizes.set(rel, n);
        return n;
      } catch {
        return undefined;
      }
    },
  };
}

/** In-memory FileSource for tests: { "settings.gradle.kts": "include(\":app\")", ... }. */
export function memorySource(files: Record<string, string>): FileSource {
  const keys = Object.keys(files).sort(cmp);
  return {
    list: () => keys,
    read: (rel) => (Object.prototype.hasOwnProperty.call(files, rel) ? files[rel] : undefined),
    size: (rel) => (Object.prototype.hasOwnProperty.call(files, rel) ? Buffer.byteLength(files[rel]!) : undefined),
  };
}

/** Finds every project marker and parses its modules. Deterministic order (by root, then build). */
export function detectProjects(src: FileSource): BuildProject[] {
  const all = src.list();
  const out: BuildProject[] = [];
  for (const f of all) {
    const b = basename(f);
    if (b === 'settings.gradle' || b === 'settings.gradle.kts') {
      // prefer .kts when both exist
      if (b === 'settings.gradle' && all.includes(f + '.kts')) continue;
      out.push(detectGradle(src, f, all));
    } else if (b === 'Package.swift') out.push(detectSwiftPM(src, f));
    else if (b === 'project.pbxproj' && dirname(f).endsWith('.xcodeproj')) {
      // skip projects embedded in Pods / nested workspaces of dependencies
      out.push(detectXcode(src, f));
    } else if (b === 'build-profile.json5') {
      const t = src.read(f);
      if (t && isHvigorProject(t)) out.push(detectHvigor(src, f));
    }
  }
  return out.sort((a, b) => cmp(a.root, b.root) || cmp(a.build, b.build) || cmp(a.marker, b.marker));
}
