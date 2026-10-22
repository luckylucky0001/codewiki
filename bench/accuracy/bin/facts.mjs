// Fast iteration: re-extract facts only (scan cache + extractFacts) for runs created by run.sh.
//   node bench/accuracy/bin/facts.mjs <out-dir> [label-name ...]
// Rewrites <out>/<name>/wiki/facts/{routes,testids,apis,deeplinks}.json; requirements.json (from the
// last full run) is left alone. Requires `npm run build` first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../../../dist');
const { loadConfig } = await import(path.join(dist, 'config/config.js'));
const { scanRepo } = await import(path.join(dist, 'scan/scan.js'));
const { extractFacts } = await import(path.join(dist, 'facts/facts.js'));
const { renderFacts } = await import(path.join(dist, 'facts/render.js'));
const [out, ...names0] = process.argv.slice(2);
const names = names0.length ? names0 : fs.readdirSync(out).filter((n) => fs.existsSync(path.join(out, n, 'codewiki.yaml')));
for (const n of names) {
  const d = path.join(out, n);
  const log = fs.readFileSync(path.join(d, 'run.log'), 'utf8');
  const root = /^repo=(.*)$/m.exec(log)[1];
  const cfg = loadConfig(root, path.join(d, 'codewiki.yaml'));
  const t0 = Date.now();
  const res = await scanRepo(cfg);
  const t1 = Date.now();
  const f = extractFacts(cfg, res);
  const t2 = Date.now();
  const fd = path.join(d, 'wiki', 'facts');
  fs.mkdirSync(fd, { recursive: true });
  for (const [k, v] of renderFacts(f, res.graph, cfg.platforms.map((p) => p.name))) if (k.endsWith('.json')) fs.writeFileSync(path.join(d, 'wiki', k), v);
  console.log(`${n}: scan ${t1 - t0}ms facts ${t2 - t1}ms routes=${f.routes?.length ?? 0} testids=${f.testids?.length ?? 0} apis=${f.apis?.length ?? 0}`);
}
