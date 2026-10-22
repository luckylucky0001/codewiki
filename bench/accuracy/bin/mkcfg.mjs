// usage: node mkcfg.mjs <label.json> <outdir>
// Writes <outdir>/codewiki.yaml (wiki_dir outside the clone) and prints the clone path.
// Clones are looked up in the colon-separated $ACC_REPOS dirs as <dir>/<label-name> or <dir>/<repo-name>.
// Platform mapping (same as the Go baseline run): kmp/desktop/web -> android, macos/modules -> ios;
// server roots and glob roots are skipped.
import fs from 'node:fs';
import path from 'node:path';
const [lab, out] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(lab, 'utf8'));
const name = path.basename(lab, '.json');
const dirs = (process.env.ACC_REPOS || '').split(':').filter(Boolean);
const cands = dirs.flatMap((d) => [path.join(d, name), path.join(d, j.repo.split('/')[1])]);
const repo = cands.find((p) => fs.existsSync(p));
if (!repo) { console.error(`clone for ${name} not found in ACC_REPOS=${process.env.ACC_REPOS}`); process.exit(1); }
const map = { android: 'android', kmp: 'android', desktop: 'android', web: 'android', ios: 'ios', macos: 'ios', modules: 'ios', harmony: 'harmony' };
const seen = new Set();
const plats = [];
for (const [k, roots] of Object.entries(j.platform_roots)) {
  const pn = map[k];
  if (!pn) continue;
  for (const r of roots) {
    if (r.includes('*')) continue;
    const key = pn + ':' + r;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!fs.existsSync(path.join(repo, r))) { console.error('missing root', name, r); continue; }
    plats.push(`  - {name: ${pn}, root: "${r}"}`);
  }
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'codewiki.yaml'), `version: 1\nproject: ${name}\nwiki_dir: ${out}/wiki\nplatforms:\n${plats.join('\n')}\nexclude: ["**/build/**", "**/node_modules/**", "**/.git/**", "**/Pods/**", "**/oh_modules/**", "**/.gradle/**", "**/.kb-work/**"]\n`);
console.log(repo);
