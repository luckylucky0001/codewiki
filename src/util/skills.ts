// Locates the shipped skills/ directory (next to the kb package) and reads bundled contracts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cached = '';

/** Absolute path of the package's skills/ directory (contains codewiki/SKILL.md). */
export function skillsRoot(): string {
  if (cached) return cached;
  let d = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(d, 'skills', 'codewiki', 'SKILL.md'))) return (cached = path.join(d, 'skills'));
    d = path.dirname(d);
  }
  throw new Error('skills/ directory not found next to the kb package');
}

/** A bundled instruction contract (path relative to skills/). A missing contract is a packaging bug. */
export function skillText(rel: string): string {
  return fs.readFileSync(path.join(skillsRoot(), rel), 'utf8');
}
