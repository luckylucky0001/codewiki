// Extractor fingerprint: changes whenever the extractor code, node tables or
// grammar wasm change, so caches can never serve stale parse results.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { specs, grammarsDir } from './lang.js';

let fp = '';
export function fingerprint(): string {
  if (fp) return fp;
  const h = createHash('sha256');
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const f of fs.readdirSync(here).sort()) {
    if (!/\.(js|ts)$/.test(f) || f.endsWith('.d.ts')) continue;
    const b = fs.readFileSync(path.join(here, f));
    h.update(`file ${f} ${b.length}\n`);
    h.update(b);
  }
  for (const l of Object.keys(specs).sort()) {
    const s = specs[l]!;
    h.update(`lang ${l}\n`);
    for (const tbl of [s.comments, s.containers, s.transparent, s.bodies, s.idents, s.calls, s.strings]) h.update(JSON.stringify([...tbl].sort()) + '\n');
    h.update(JSON.stringify(Object.entries(s.decls).map(([k, v]) => k + '=' + v).sort()) + '\n');
    try {
      const st = fs.statSync(path.join(grammarsDir(), s.wasm));
      h.update(`wasm ${s.wasm} ${st.size}\n`);
    } catch {
      /* grammar missing: parse will fail and be recorded */
    }
  }
  fp = h.digest('hex');
  return fp;
}
