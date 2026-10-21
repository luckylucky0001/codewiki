// Whole-result cache for facts extraction (warm `kb scan` / `kb compound` / queries).
// Facts are cross-file (routes resolve across the graph), so they are cached as one result, keyed by
//   - the scan's inputsKey: content hash of every parsed source file + extractor/facts fingerprint,
//   - treeStamp: (path, size, mtime) of every non-excluded file under the platform roots — this covers the
//     non-source inputs facts read (manifests, Info.plist, router_map.json, module.json5, strings.xml),
//   - the configuration.
// Any change misses and recomputes from scratch, so results are identical to an uncached run.
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import type { Config } from '../config/config.js';
import { wikiPath } from '../config/config.js';
import type { Facts } from '../model.js';
import type { ScanResult } from '../scan/scan.js';
import { treeStamp } from '../scan/scan.js';
import { extractFacts } from '../facts/facts.js';

export const FactsCacheFile = '.kb/cache/facts.v8.gz';

export function factsKey(cfg: Config, res: ScanResult): string | null {
  if (!res.inputsKey) return null;
  const { llm: _llm, ...rest } = cfg as Config & { llm?: unknown };
  return createHash('sha256').update(`${res.inputsKey}\n${treeStamp(cfg)}\n${JSON.stringify(rest)}\n`).digest('hex');
}

export function extractFactsCached(cfg: Config, res: ScanResult): Facts {
  if (process.env.KB_NO_CACHE) return extractFacts(cfg, res);
  const key = factsKey(cfg, res);
  const wiki = wikiPath(cfg);
  const p = path.join(wiki, FactsCacheFile);
  if (key) {
    try {
      const snap = v8.deserialize(zlib.gunzipSync(fs.readFileSync(p))) as { key: string; facts: Facts };
      if (snap.key === key) return snap.facts;
    } catch {
      /* miss */
    }
  }
  const facts = extractFacts(cfg, res);
  if (key) {
    try {
      if (fs.statSync(wiki).isDirectory()) {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        const tmp = p + '.tmp~';
        fs.writeFileSync(tmp, zlib.gzipSync(v8.serialize({ key, facts }), { level: 1 }));
        fs.renameSync(tmp, p);
      }
    } catch {
      /* no wiki: do not persist */
    }
  }
  return facts;
}
