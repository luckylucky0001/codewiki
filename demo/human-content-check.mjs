// Independent human-content check: <before-dir> (snapshot of .md files) vs <repo> after kb docs compound.
// Every pre-existing file must still exist; if changed, every non-blank original line (placeholders
// excepted for skeleton files) must still appear in order. Also runs kb's own guard.
import fs from 'node:fs'; import path from 'node:path';
const [before, repo, dist] = process.argv.slice(2);
const { checkHumanContentPreserved, classifyFile } = await import(path.join(dist, 'docs/index.js'));
const PH = /^\s*(TODO|TBD|待补充|\[[A-Z _-]+\]|\{[A-Z _-]+\}|<!--.*-->|[-*]\s*|---+)?\s*$/;
const walk = (d, r = '') => fs.readdirSync(path.join(d, r), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(d, path.join(r, e.name)) : [path.join(r, e.name)]);
const out = { files: 0, unchanged: 0, changed: 0, deleted: [], independentViolations: [], guardViolations: [], states: {} };
for (const f of walk(before)) {
  out.files++;
  const b = fs.readFileSync(path.join(before, f), 'utf8');
  const st = classifyFile(b, true); out.states[st] = (out.states[st] ?? 0) + 1;
  const p = path.join(repo, f);
  if (!fs.existsSync(p)) { out.deleted.push(f); continue; }
  const a = fs.readFileSync(p, 'utf8');
  if (a === b) { out.unchanged++; continue; }
  out.changed++;
  const al = a.split('\n'); let i = 0; const missing = [];
  for (const line of b.split('\n')) {
    if (st === 'skeleton' && PH.test(line)) continue;
    if (line.trim() === '' ) continue;
    let j = i; while (j < al.length && al[j] !== line) j++;
    if (j === al.length) missing.push(line); else i = j + 1;
  }
  if (missing.length) out.independentViolations.push({ file: f, state: st, missing: missing.slice(0, 5) });
  const added = al.filter((l) => /^#{2,6} /.test(l) && !b.split('\n').includes(l));
  const v = checkHumanContentPreserved(b, a, { allowPlaceholderRemoval: st === 'skeleton', addedChunks: added });
  if (v) out.guardViolations.push({ file: f, state: st, message: v.message });
}
console.log(JSON.stringify(out, null, 1));
