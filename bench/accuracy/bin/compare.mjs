// node compare.mjs <before.json> <after.json> [--repos]   (score.mjs --json outputs)
// Prints micro recall (hit/expected) per category with deltas, plus precision proxies:
// not_screen FP, testIDs extracted in repos with no testIDs, API must-not hits; --repos adds a per-repo table.
import fs from 'node:fs';
const [a, b, flag] = process.argv.slice(2);
const A = JSON.parse(fs.readFileSync(a, 'utf8')), B = JSON.parse(fs.readFileSync(b, 'utf8'));
const cats = ['routes', 'deeplinks', 'testids', 'apis'];
const agg = (J) => {
  const o = {};
  for (const c of cats) { o[c] = [0, 0]; for (const r of J.results) { const x = r[c]; if (x && x.expected) { o[c][0] += x.hit; o[c][1] += x.expected; } } }
  o.fp = [0, 0]; o.tidfp = 0; o.mustnot = 0; o.conf = [0, 0];
  for (const r of J.results) {
    const n = r.routes?.not_screens; if (n) { o.fp[0] += n.false_positives; o.fp[1] += n.total; }
    if (r.testids && r.testids.expected === 0) o.tidfp += r.testids.extracted || 0;
    o.mustnot += r.apis?.should_not_extract_hits || r.apis?.must_not_hits || 0;
    const cl = r.claims; if (cl?.conflicts_labelled) { o.conf[0] += Math.round((cl.conflict_recall || 0) * cl.conflicts_labelled); o.conf[1] += cl.conflicts_labelled; }
  }
  return o;
};
const pct = (h, e) => (e ? ((100 * h) / e).toFixed(1) + '%' : 'n/a');
const x = agg(A), y = agg(B);
console.log('| metric | before | after | Δ |\n|---|---|---|---|');
for (const c of cats) console.log(`| ${c} recall | ${pct(...x[c])} (${x[c][0]}/${x[c][1]}) | ${pct(...y[c])} (${y[c][0]}/${y[c][1]}) | ${y[c][0] - x[c][0] >= 0 ? '+' : ''}${y[c][0] - x[c][0]} |`);
console.log(`| not_screen FP | ${pct(...x.fp)} (${x.fp[0]}/${x.fp[1]}) | ${pct(...y.fp)} (${y.fp[0]}/${y.fp[1]}) | ${y.fp[0] - x.fp[0] >= 0 ? '+' : ''}${y.fp[0] - x.fp[0]} |`);
console.log(`| testIDs extracted in no-testID repos | ${x.tidfp} | ${y.tidfp} | ${y.tidfp - x.tidfp} |`);
console.log(`| API must-not hits | ${x.mustnot} | ${y.mustnot} | ${y.mustnot - x.mustnot} |`);
const cs = (J) => J.summary.claims; console.log(`| claims coverage / acc(all) | ${(cs(A).coverage * 100).toFixed(1)}% / ${(cs(A).accuracy_overall * 100).toFixed(1)}% | ${(cs(B).coverage * 100).toFixed(1)}% / ${(cs(B).accuracy_overall * 100).toFixed(1)}% | |`);
console.log(`| conflict recall | ${x.conf[0]}/${x.conf[1]} | ${y.conf[0]}/${y.conf[1]} | |`);
if (flag === '--repos') {
  console.log('\n| repo | routes | not_screen FP | deeplinks | testids | apis |\n|---|---|---|---|---|---|');
  const cell = (r0, r1, c) => { const p = r0?.[c], q = r1?.[c]; if (!q || !q.expected) return 'n/a'; return `${p?.hit ?? 0}→**${q.hit}**/${q.expected}`; };
  for (const r1 of B.results) {
    const r0 = A.results.find((r) => r.repo === r1.repo);
    const f0 = r0?.routes?.not_screens, f1 = r1.routes?.not_screens;
    console.log(`| ${r1.repo} | ${cell(r0, r1, 'routes')} | ${f0?.false_positives ?? 0}→${f1?.false_positives ?? 0}/${f1?.total ?? 0} | ${cell(r0, r1, 'deeplinks')} | ${cell(r0, r1, 'testids')} | ${cell(r0, r1, 'apis')} |`);
  }
}
