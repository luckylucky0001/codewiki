// usage: node tablen.mjs <prefix e.g. h3-scoreH-> A C [D]
import fs from 'node:fs';
const [pre, ...vs] = process.argv.slice(2);
const R = Object.fromEntries(vs.map(v => [v, JSON.parse(fs.readFileSync(`${pre}${v}.json`, 'utf8'))]));
const f = x => x.status ? 'n/o' : x.expected ? `${x.hit}/${x.expected}` : `-(${x.extracted})`;
const cats = ['routes', 'fp', 'deeplinks', 'testids', 'apis'];
console.log('| repo | ' + cats.map(c => `${c} ${vs.join(' / ')}`).join(' | ') + ' |');
console.log('|---|' + cats.map(() => '---').join('|') + '|');
R[vs[0]].results.forEach((_, i) => {
  const cell = c => vs.map(v => { const r = R[v].results[i]; return c === 'fp' ? `${r.routes.not_screens.false_positives}/${r.routes.not_screens.total}` : f(r[c]); }).join(' / ');
  console.log(`| ${R[vs[0]].results[i].repo} | ${cats.map(cell).join(' | ')} |`);
});
