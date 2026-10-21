// Fast iteration on claims: re-extract and template-check document claims for runs created by run.sh,
// without a full ingest (reads the docs listed in <run>/docs.json from the clone).
//   node bench/accuracy/bin/claims.mjs <out-dir> [label-name ...]
// Rewrites <out>/<name>/wiki/facts/requirements.json. Requires `npm run build` first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(process.env.KB_DIST || path.resolve(here, '../../../dist'));
const { loadConfig } = await import(path.join(dist, 'config/config.js'));
const { scanRepo } = await import(path.join(dist, 'scan/scan.js'));
const { extractFacts } = await import(path.join(dist, 'facts/facts.js'));
const { requirementsJSON } = await import(path.join(dist, 'facts/render.js'));
const { extractClaims, Checker } = await import(path.join(dist, 'engine/claims.js'));
const [out, ...names0] = process.argv.slice(2);
const names = names0.length ? names0 : fs.readdirSync(out).filter((n) => fs.existsSync(path.join(out, n, 'codewiki.yaml')));
for (const n of names) {
  const d = path.join(out, n);
  const root = /^repo=(.*)$/m.exec(fs.readFileSync(path.join(d, 'run.log'), 'utf8'))[1];
  const cfg = loadConfig(root, path.join(d, 'codewiki.yaml'));
  const res = await scanRepo(cfg);
  const f = extractFacts(cfg, res);
  const ck = new Checker(res.graph, f, res.dir);
  const docs = JSON.parse(fs.readFileSync(path.join(d, 'docs.json'), 'utf8')).docs;
  const claims = [];
  const t0 = Date.now();
  for (const doc of docs) {
    let b;
    try { b = fs.readFileSync(path.join(root, doc.path), 'utf8'); } catch { continue; }
    for (const c of extractClaims(doc.path, 'raw/docs/' + doc.path, b)) { ck.check(c); claims.push(c); }
  }
  fs.mkdirSync(path.join(d, 'wiki', 'facts'), { recursive: true });
  fs.writeFileSync(path.join(d, 'wiki', 'facts', 'requirements.json'), requirementsJSON(claims));
  const by = {};
  for (const c of claims) by[c.status] = (by[c.status] ?? 0) + 1;
  console.log(`${n}: ${claims.length} claims ${JSON.stringify(by)} check ${Date.now() - t0}ms`);
}
