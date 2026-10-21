#!/usr/bin/env node
// codewiki `kb` accuracy scorer — implementation-independent, zero dependencies.
//
// Usage:
//   node score.mjs --labels labels/<repo>.json --facts <dir>      # dir holding routes.json/testids.json/apis.json/requirements.json
//                                                                  #   (or a repo root containing wiki/facts/)
//   node score.mjs --labels-dir labels --runs <dir>               # batch: <dir>/<label-basename>/[wiki/facts/]*.json
//   options: --json            machine-readable output
//            --verbose         list every miss / false positive
//            --strict-platform require exact platform family (ignore platform_aliases / kmp leniency)
//            --claim-threshold 0.35   min text similarity for claim matching
//            --no-synthetic    drop labeller-synthesised claims
//            --selftest        build "perfect" and "empty" fake outputs from each label file and score them
//
// See README.md for the matching rules.

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const opt = { claimThreshold: 0.35 };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  if (a === '--labels') opt.labels = next();
  else if (a === '--facts') opt.facts = next();
  else if (a === '--labels-dir') opt.labelsDir = next();
  else if (a === '--runs') opt.runs = next();
  else if (a === '--json') opt.json = true;
  else if (a === '--verbose' || a === '-v') opt.verbose = true;
  else if (a === '--strict-platform') opt.strictPlatform = true;
  else if (a === '--claim-threshold') opt.claimThreshold = parseFloat(next());
  else if (a === '--no-synthetic') opt.noSynthetic = true;
  else if (a === '--selftest') opt.selftest = true;
  else if (a === '--routes') opt.routesFile = next();
  else if (a === '--deeplinks') opt.deeplinksFile = next();
  else if (a === '--testids') opt.testidsFile = next();
  else if (a === '--apis') opt.apisFile = next();
  else if (a === '--requirements') opt.requirementsFile = next();
  else if (a === '-h' || a === '--help') { usage(); process.exit(0); }
  else { console.error(`unknown arg ${a}`); usage(); process.exit(2); }
}
function usage() {
  console.log(`usage:
  node score.mjs --labels labels/<repo>.json --facts <facts-dir|repo-root> [--json] [--verbose]
  node score.mjs --labels-dir labels --runs <runs-dir> [--json]
  node score.mjs --labels-dir labels --selftest
  (individual files may be given with --routes/--testids/--apis/--requirements)`);
}

// ---------------------------------------------------------------- io helpers
function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return undefined; }
}
function resolveFactsDir(dir) {
  if (!dir) return undefined;
  for (const c of [dir, path.join(dir, 'wiki', 'facts'), path.join(dir, 'facts')]) {
    if (['routes.json', 'testids.json', 'apis.json', 'requirements.json'].some(f => fs.existsSync(path.join(c, f)))) return c;
  }
  return dir;
}
function arr(x, key) {
  // accept {version, <key>:[...]}, a bare array, or {items:[...]}
  if (!x) return undefined;
  if (Array.isArray(x)) return x;
  if (Array.isArray(x[key])) return x[key];
  if (Array.isArray(x.items)) return x.items;
  return [];
}
function loadFacts(dir, files = {}) {
  const d = resolveFactsDir(dir);
  const get = (name, key, override) => {
    const p = override || (d ? path.join(d, name) : undefined);
    if (!p || !fs.existsSync(p)) return undefined;
    return arr(readJSON(p), key);
  };
  return {
    dir: d,
    routes: get('routes.json', 'routes', files.routes),
    testids: get('testids.json', 'testids', files.testids),
    apis: get('apis.json', 'apis', files.apis),
    requirements: get('requirements.json', 'requirements', files.requirements),
    deeplinks: get('deeplinks.json', 'deeplinks', files.deeplinks),
  };
}

// ---------------------------------------------------------------- normalisation
const str = v => (v === undefined || v === null) ? '' : String(v);

const FAMILY = {
  android: 'android', kotlin: 'android', java: 'android', aosp: 'android',
  ios: 'ios', swift: 'ios', swiftui: 'ios', uikit: 'ios', macos: 'ios', mac: 'ios', osx: 'ios', apple: 'ios', appkit: 'ios', ipados: 'ios',
  harmony: 'harmony', harmonyos: 'harmony', ohos: 'harmony', arkts: 'harmony', arkui: 'harmony', openharmony: 'harmony', hmos: 'harmony',
  kmp: 'kmp', common: 'kmp', commonmain: 'kmp', multiplatform: 'kmp', shared: 'kmp',
  desktop: 'desktop', jvm: 'desktop', web: 'web', wasm: 'web', js: 'web', server: 'server', backend: 'server',
};
function fam(p) { const k = str(p).toLowerCase().replace(/[^a-z]/g, ''); return FAMILY[k] || k; }

function platformOk(labelPlat, factPlat, labelsDoc) {
  if (!factPlat) return true;                       // extractor did not say -> do not penalise
  const lf = fam(labelPlat), ff = fam(factPlat);
  if (lf === ff) return true;
  if (opt.strictPlatform) return false;
  const aliases = (labelsDoc.platform_aliases || {})[labelPlat] || (labelsDoc.platform_aliases || {})[lf];
  if (aliases && aliases.map(fam).includes(ff)) return true;
  // KMP code is legitimately attributed to any of its targets
  if (lf === 'kmp' && ['android', 'ios', 'desktop', 'web'].includes(ff)) return true;
  if (ff === 'kmp' && ['android', 'ios', 'desktop', 'web'].includes(lf)) return true;
  return false;
}

function normPath(p) {
  return str(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase();
}
function baseName(p) { const n = normPath(p); return n.slice(n.lastIndexOf('/') + 1); }
function stem(p) { return baseName(p).replace(/\.[a-z0-9]+$/, ''); }
// a.endsWith(b) on path-segment boundary (either direction)
function pathCompat(a, b) {
  const x = normPath(a), y = normPath(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.endsWith('/' + y) || y.endsWith('/' + x);
}

// identifiers: "Screen.Home" -> ["screen.home","home"], "ForYouScreen()" -> "foryouscreen"
function idKeys(v) {
  const s = str(v).trim();
  if (!s) return [];
  const out = new Set();
  const clean = s.replace(/\(.*?\)\s*$/, '').replace(/\(\)/g, '').trim();
  const lower = clean.toLowerCase();
  out.add(lower);
  out.add(normRoute(clean));
  const last = lower.split(/[.#:]/).filter(Boolean).pop();
  if (last && !lower.includes('/')) out.add(last);
  // Symbol ids of the form `platform://path/to/File.kt#Name` (or `#Outer.Name`): also key on the bare
  // symbol name (and its last `.` segment). Fix for the original scorer, which skipped any string that
  // contains `/` and so never matched kb's symbol ids by name.
  const sym = /^[a-z][a-z0-9+.-]*:\/\/[^#\s]*#([^#\s/]+)$/.exec(lower);
  if (sym) { out.add(sym[1]); const tail = sym[1].split('.').filter(Boolean).pop(); if (tail) out.add(tail); }
  return [...out].filter(Boolean);
}
// route strings: "plantDetail/{plantId}" == "plantdetail/:plantId" == "/plantDetail/{id}"
function normRoute(v) {
  return str(v).trim().toLowerCase()
    .replace(/\$\{[^}]*\}|\\\([^)]*\)|\{[^}]*\}|<[^>]*>|:[a-z_][a-z0-9_]*|%[sd@]/gi, '{}')
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/, '')   // drop scheme://host
    .replace(/[?#].*$/, '')
    .replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}

// ---------------------------------------------------------------- routes
function labelRouteKeys(l) {
  const keys = new Set();
  for (const v of [l.route_id, l.symbol, l.serial_name, l.screen_fn, l.struct, l.builder, l.pattern, ...(l.aliases || [])]) idKeys(v).forEach(k => keys.add(k));
  return keys;
}
function factRouteKeys(r) {
  const keys = new Set();
  for (const v of [r.route_id, r.symbol, r.pattern, r.name, r.id]) idKeys(v).forEach(k => keys.add(k));
  return keys;
}

function scoreRoutes(doc, routes) {
  const labels = doc.screens || [];
  if (!routes) return { status: 'missing-output', expected: countExpected(labels) };
  // file uniqueness among labelled screens (file-only matches are allowed only for unique files)
  const fileCount = {};
  for (const l of labels) fileCount[normPath(l.file)] = (fileCount[normPath(l.file)] || 0) + 1;
  const baseCount = {};
  for (const l of labels) baseCount[baseName(l.file)] = (baseCount[baseName(l.file)] || 0) + 1;

  // not_screens: false positives
  const neg = (doc.not_screens || []).filter(n => !n.borderline && !n.skip);
  const fps = [], negFacts = new Set();
  for (const n of neg) {
    const sym = str(n.symbol).replace(/\s*\(.*$/, '').trim();
    const nk = new Set(idKeys(sym));
    const badIdx = routes.findIndex(r => {
      if (!platformOk(n.platform, r.platform, doc)) return false;
      const fk = factRouteKeys(r);
      const idHit = [...fk].some(k => nk.has(k));
      if (!idHit) return false;
      // same identifier: if both sides have files they must agree (avoid colliding with a real screen of the same name)
      if (n.file && r.file && !n.file.startsWith('(')) return pathCompat(r.file, n.file);
      return true;
    });
    if (badIdx >= 0) { const bad = routes[badIdx]; negFacts.add(badIdx); fps.push({ symbol: n.symbol, matched: bad.route_id || bad.symbol, file: bad.file }); }
  }
  const factKeys = routes.map(factRouteKeys);
  const ridCount = {}; for (const l of labels) ridCount[l.route_id] = (ridCount[l.route_id] || 0) + 1;
  const dupIds = new Set(Object.keys(ridCount).filter(k => ridCount[k] > 1));
  const matchLabel = (l) => {
    const lk = labelRouteKeys(l);
    const hits = [];
    routes.forEach((r, i) => {
      if (!platformOk(l.platform, r.platform, doc)) return;
      let how = null;
      for (const k of factKeys[i]) if (lk.has(k)) { how = 'id'; break; }
      // ambiguous ids (same route_id labelled in several files/apps): the fact's file must agree on the app/module dir
      if (how === 'id' && dupIds.has(l.route_id) && r.file && l.file) {
        const top = normPath(l.file).split('/')[0];
        const rf = normPath(r.file);
        if (!(pathCompat(r.file, l.file) || rf.startsWith(top + '/') || rf.includes('/' + top + '/'))) how = null;
      }
      if (!how && !negFacts.has(i) && r.file && l.file && fileCount[normPath(l.file)] === 1 && pathCompat(r.file, l.file)) how = 'file';
      if (!how && !negFacts.has(i) && r.file && l.file && baseCount[baseName(l.file)] === 1 && fileCount[normPath(l.file)] === 1
          && baseName(r.file) === baseName(l.file) && !['index.ets', 'index.kt', 'index.swift', 'featurecomponent.ets'].includes(baseName(l.file))) how = 'basename';
      if (how) hits.push({ i, how });
    });
    return hits;
  };

  // group alt_of aliases into one logical route (key = route_id@file so equal ids in different apps stay distinct)
  const keyOf = l => `${l.route_id}@${normPath(l.file)}`;
  const firstByRid = new Map();
  for (const l of labels) if (!l.alt_of && !firstByRid.has(l.route_id)) firstByRid.set(l.route_id, keyOf(l));
  const groups = new Map();
  for (const l of labels) {
    const g = l.alt_of ? (firstByRid.get(l.alt_of) || l.alt_of) : keyOf(l);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(l);
  }
  let exp = 0, hit = 0, optHit = 0, optTot = 0;
  const misses = [], usedFacts = new Set(), byHow = { id: 0, file: 0, basename: 0 };
  for (const [g, ls] of groups) {
    const optional = ls.every(l => l.optional);
    const hits = ls.flatMap(matchLabel);
    if (optional) { optTot++; if (hits.length) optHit++; }
    else { exp++; if (hits.length) hit++; else misses.push(g.replace(/@.*$/, '') + (dupIds.has(g.replace(/@.*$/, '')) ? ` (${baseName(ls[0].file)})` : '')); }
    for (const h of hits) { usedFacts.add(h.i); }
    if (hits.length) byHow[hits[0].how]++;
  }
  return {
    expected: exp, hit, recall: ratio(hit, exp), optional: { total: optTot, hit: optHit }, matched_by: byHow,
    extracted: routes.length, extracted_unlabelled: routes.length - usedFacts.size,
    not_screens: { total: neg.length, false_positives: fps.length, fp_rate: ratio(fps.length, neg.length), list: fps },
    misses,
  };
}
function countExpected(ls) { return (ls || []).filter(l => !l.optional && l.expect !== false).length; }

// ---------------------------------------------------------------- deeplinks
function parseLink(s) {
  // returns {scheme, host, path}
  const t = str(s).trim();
  const m = t.match(/^([a-z${}][a-z0-9+.\-_${}]*):\/\/([^/?#]*)([^?#]*)/i) || t.match(/^([a-z][a-z0-9+.\-]*):([^/].*)?$/i);
  if (m && t.includes('://')) return { scheme: m[1].toLowerCase(), host: m[2].toLowerCase(), path: m[3] || '' };
  if (t.startsWith('/')) return { scheme: '', host: '', path: t };
  if (/^[a-z][a-z0-9+.\-]*:\/?\/?$/i.test(t)) return { scheme: t.replace(/:.*$/, '').toLowerCase(), host: '', path: '' };
  return { scheme: '', host: '', path: t };
}
function collectFactLinks(routes) {
  const out = [];
  for (const r of routes || []) {
    const push = (v) => {
      if (!v || typeof v === 'boolean' || typeof v === 'number') return;
      if (Array.isArray(v)) return v.forEach(push);
      if (typeof v === 'object') {
        if (v.scheme || v.host || v.path || v.pathPrefix || v.pathPattern || v.pathStartWith) {
          out.push({ scheme: str(v.scheme).toLowerCase(), host: str(v.host).toLowerCase(), path: str(v.path || v.pathPrefix || v.pathPattern || v.pathStartWith), platform: r.platform, file: r.file });
        } else if (v.uri || v.url) push(v.uri || v.url);
        return;
      }
      const p = parseLink(v); out.push({ ...p, platform: r.platform, file: r.file });
    };
    push(r.deeplink); push(r.deeplinks); push(r.uri);
    if (r.pattern && (/:\/\//.test(str(r.pattern)) || str(r.pattern).startsWith('/'))) push(r.pattern);
  }
  return out;
}
function normLinkPath(p) { return normRoute(p).replace(/\.\*/g, '{}').replace(/\*/g, '{}'); }
function scoreDeeplinks(doc, routes, declared) {
  const labels = doc.deeplinks || [];
  if (!routes && !declared) return { status: 'missing-output', expected: countExpected(labels) };
  // deep links come from routes.json (per-route `deeplink`/`deeplinks`/`uri`/URL-ish `pattern`) and, when
  // present, from a standalone deeplinks.json (one entry per declaration: {platform, scheme, host, path, file})
  const facts = collectFactLinks([...(routes || []), ...(declared || []).map(d => ({ platform: d.platform, file: d.file, deeplink: d.uri && !d.scheme ? d.uri : d }))]);
  let exp = 0, hit = 0, optTot = 0, optHit = 0; const misses = [];
  for (const l of labels) {
    const schemes = new Set([str(l.scheme).toLowerCase(), str(l.resolved_scheme).toLowerCase()].filter(Boolean));
    const placeholder = /\$\{|@string\//.test(str(l.scheme));
    const lp = normLinkPath(l.path);
    const ok = facts.some(f => {
      if (!platformOk(l.platform, f.platform, doc)) return false;
      const routeOnly = l.kind === 'route-pattern' || l.kind === 'in-app-url';
      const schemeOk = !f.scheme ? routeOnly || (!l.scheme) : (schemes.has(f.scheme) || placeholder || /\$\{|@string/.test(f.scheme));
      if (!schemeOk) return false;
      const hostOk = !l.host || (!f.host && routeOnly) || f.host === str(l.host).toLowerCase() || f.host === '*';
      if (!hostOk) return false;
      if (!lp) return true;
      const fp = normLinkPath(f.path);
      return fp === lp || fp.startsWith(lp + '/') || (lp.endsWith('{}') && fp.startsWith(lp.slice(0, -2)));
    });
    const optional = l.optional || l.expect === false;
    if (optional) { optTot++; if (ok) optHit++; }
    else { exp++; if (ok) hit++; else misses.push(`${l.scheme}://${l.host}${l.path}`); }
  }
  return { expected: exp, hit, recall: ratio(hit, exp), optional: { total: optTot, hit: optHit }, extracted: facts.length, misses };
}

// ---------------------------------------------------------------- testids
function tidNorm(t) { return str(t).trim().replace(/\$\{[^}]*\}|\\\([^)]*\)|\{[^}]*\}|%[sd@]/g, '*'); }
function tidEq(a, b) {
  const x = tidNorm(a), y = tidNorm(b);
  if (x === y) return true;
  if (x.includes('*') || y.includes('*')) {
    const re = s => new RegExp('^' + s.split('*').map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return re(x).test(y.replace(/\*/g, '')) || re(y).test(x.replace(/\*/g, ''));
  }
  return false;
}
function scoreTestids(doc, tids) {
  const labels = doc.testids || [];
  if (!tids) return { status: 'missing-output', expected: countExpected(labels) };
  let exp = 0, hit = 0, tidOnly = 0, lineOk = 0, notExpectedHits = 0; const misses = [];
  for (const l of labels) {
    const files = [l.file, ...(l.alt_files || [])].filter(Boolean);
    const cands = tids.filter(t => platformOk(l.platform, t.platform, doc) && tidEq(t.tid, l.tid));
    const full = cands.find(t => !t.file || files.some(f => pathCompat(t.file, f)));
    if (l.expect === false) { if (cands.length) notExpectedHits++; continue; }
    exp++;
    if (full) { hit++; if (full.line && (full.line === l.line || full.line === l.use_line)) lineOk++; }
    else { misses.push(`${l.tid} @ ${baseName(l.file)}`); if (cands.length) tidOnly++; }
  }
  const res = { expected: exp, hit, recall: ratio(hit, exp), tid_only_matches: tidOnly, line_exact: lineOk, extracted: tids.length, should_not_extract_hits: notExpectedHits, misses };
  if (labels.length === 0) res.note = `label has no testIDs for this repo (none exist in source): ${tids.length} extracted testid(s) are likely false positives`;
  return res;
}

// ---------------------------------------------------------------- apis
const STRIP_SEG = /^(api|rest|w|rest\.php|rest_v\d+|v\d+(\.\d+)?|\d+|\{\})$/;
function normApiPath(p) {
  let s = str(p).trim();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');   // drop scheme+host
  s = normRoute(s);
  let segs = s.split('/').filter(Boolean);
  while (segs.length > 1 && STRIP_SEG.test(segs[0])) segs.shift();
  return segs.join('/');
}
function scoreApis(doc, apis) {
  const labels = doc.apis || [];
  if (!apis) return { status: 'missing-output', expected: countExpected(labels.filter(a => a.side !== 'server')) };
  let exp = 0, hit = 0, methodWild = 0, optTot = 0, optHit = 0, notExpectedHits = 0; const misses = [];
  const fx = apis.map(a => ({ m: str(a.method).toUpperCase(), p: normApiPath(a.path || a.url || a.route), raw: a }));
  for (const l of labels) {
    const lp = normApiPath(l.path), lm = str(l.method).toUpperCase();
    const m = fx.find(f => f.p === lp && (f.m === lm || ['', 'ANY', '*', 'ALL'].includes(f.m)));
    if (l.expect === false) { if (m) notExpectedHits++; continue; }
    if (l.optional || l.side === 'server') { optTot++; if (m) optHit++; continue; }
    exp++;
    if (m) { hit++; if (m.m !== lm) methodWild++; }
    else misses.push(`${lm} ${l.path}`);
  }
  return { expected: exp, hit, recall: ratio(hit, exp), method_wildcard_hits: methodWild, optional: { total: optTot, hit: optHit }, should_not_extract_hits: notExpectedHits, extracted: apis.length, misses };
}

// ---------------------------------------------------------------- claims
function tokens(s) {
  const t = str(s).toLowerCase();
  const out = [];
  for (const w of t.match(/[a-z0-9_.$/-]{2,}/g) || []) out.push(w.replace(/[.,;:]+$/, ''));
  const cjk = (t.match(/[㐀-鿿豈-﫿]+/g) || []).join('|');
  for (let i = 0; i + 1 < cjk.length; i++) if (cjk[i] !== '|' && cjk[i + 1] !== '|') out.push(cjk.slice(i, i + 2));
  return out;
}
const STOP = new Set(['the', 'to', 'of', 'and', 'in', 'is', 'a', 'an', 'for', 'on', 'by', 'it', 'be', 'we', 'as', 'or', 'are', 'this', 'that', 'with', 'use', 'uses', 'used', 'using']);
function sim(a, b) {
  const A = new Set(tokens(a).filter(w => !STOP.has(w))), B = new Set(tokens(b).filter(w => !STOP.has(w)));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  const dice = 2 * inter / (A.size + B.size);
  const contain = inter / Math.min(A.size, B.size);     // label claims are often paraphrased excerpts
  return Math.max(dice, 0.85 * contain * Math.min(1, Math.min(A.size, B.size) / 4));
}
function mapStatus(s) {
  const t = str(s).toLowerCase();
  if (/conflict|contradict|mismatch|outdated|stale|wrong|fail|violat|drift|incorrect|false/.test(t)) return 'conflict';
  if (/unverif|unknown|no.?evidence|unclear|undetermined|skip|n\/a|^na$|untestable|not.?checkable|pending/.test(t)) return 'unverifiable';
  if (/verif|pass|ok|match|consistent|implemented|true|confirmed|satisfied|holds|valid/.test(t)) return 'verified';
  return t || 'unverifiable';
}
function scoreClaims(doc, reqs) {
  let labels = doc.claims || [];
  if (opt.noSynthetic) labels = labels.filter(c => !c.synthetic);
  if (!reqs) return { status: 'missing-output', expected: labels.length };
  const pairs = [];
  labels.forEach((c, i) => reqs.forEach((r, j) => {
    let s = sim(c.text, r.text || r.statement || r.claim || '');
    if (s > 0 && c.source && r.source && baseName(r.source) === baseName(c.source)) s += 0.05;
    if (s >= opt.claimThreshold) pairs.push({ i, j, s });
  }));
  pairs.sort((a, b) => b.s - a.s);
  const li = new Set(), rj = new Set(), match = new Map();
  for (const p of pairs) if (!li.has(p.i) && !rj.has(p.j)) { li.add(p.i); rj.add(p.j); match.set(p.i, p); }
  const confusion = {}; let correct = 0; const wrong = [], unmatched = [];
  labels.forEach((c, i) => {
    const m = match.get(i);
    if (!m) { unmatched.push(c.id); return; }
    const pred = mapStatus(reqs[m.j].status);
    const key = `${c.label}->${pred}`; confusion[key] = (confusion[key] || 0) + 1;
    if (pred === c.label) correct++; else wrong.push({ id: c.id, label: c.label, predicted: pred, raw_status: reqs[m.j].status, req_id: reqs[m.j].id, sim: +m.s.toFixed(2) });
  });
  const conflicts = labels.filter(c => c.label === 'conflict');
  const conflictFound = conflicts.filter(c => { const m = match.get(labels.indexOf(c)); return m && mapStatus(reqs[m.j].status) === 'conflict'; }).length;
  return {
    expected: labels.length, matched: match.size, coverage: ratio(match.size, labels.length),
    accuracy_on_matched: ratio(correct, match.size), accuracy_overall: ratio(correct, labels.length),
    conflict_recall: ratio(conflictFound, conflicts.length), conflicts_labelled: conflicts.length,
    confusion, wrong, unmatched, extracted: reqs.length,
  };
}

// ---------------------------------------------------------------- driver
function ratio(a, b) { return b ? +(a / b).toFixed(3) : null; }
function scoreOne(labelsPath, facts) {
  const doc = readJSON(labelsPath);
  if (!doc) throw new Error(`cannot read ${labelsPath}`);
  return {
    repo: doc.repo, commit: doc.commit, labels: labelsPath, facts_dir: facts.dir,
    routes: scoreRoutes(doc, facts.routes),
    deeplinks: scoreDeeplinks(doc, facts.routes, facts.deeplinks),
    testids: scoreTestids(doc, facts.testids),
    apis: scoreApis(doc, facts.apis),
    claims: scoreClaims(doc, facts.requirements),
  };
}
const pct = v => v === null || v === undefined ? '  n/a' : (100 * v).toFixed(1).padStart(5) + '%';
function printOne(r) {
  const line = (name, x, extra = '') => {
    if (x.status) return console.log(`  ${name.padEnd(10)} (no output file) expected=${x.expected}`);
    console.log(`  ${name.padEnd(10)} recall ${pct(x.recall)}  ${String(x.hit).padStart(3)}/${String(x.expected).padEnd(3)} extracted=${x.extracted}${extra}`);
    if (opt.verbose && x.misses && x.misses.length) console.log(`             misses: ${x.misses.join(' | ')}`);
  };
  console.log(`\n== ${r.repo} @ ${String(r.commit).slice(0, 10)}  (facts: ${r.facts_dir || '-'})`);
  const R = r.routes;
  line('routes', R, R.status ? '' : `  [optional ${R.optional.hit}/${R.optional.total}; by id/file/basename ${R.matched_by.id}/${R.matched_by.file}/${R.matched_by.basename}]`);
  if (!R.status) {
    console.log(`  ${'not_screen'.padEnd(10)} FP-rate ${pct(R.not_screens.fp_rate)}  ${R.not_screens.false_positives}/${R.not_screens.total}`);
    if (opt.verbose && R.not_screens.list.length) console.log(`             FPs: ${R.not_screens.list.map(f => f.symbol).join(' | ')}`);
  }
  line('deeplinks', r.deeplinks, r.deeplinks.status ? '' : `  [optional ${r.deeplinks.optional.hit}/${r.deeplinks.optional.total}]`);
  line('testids', r.testids, r.testids.status ? '' : `  [tid-only ${r.testids.tid_only_matches}, line-exact ${r.testids.line_exact}]`);
  if (r.testids.note) console.log(`             note: ${r.testids.note}`);
  line('apis', r.apis, r.apis.status ? '' : `  [optional ${r.apis.optional.hit}/${r.apis.optional.total}, must-not ${r.apis.should_not_extract_hits}]`);
  const C = r.claims;
  if (C.status) console.log(`  ${'claims'.padEnd(10)} (no output file) expected=${C.expected}`);
  else {
    console.log(`  ${'claims'.padEnd(10)} matched ${pct(C.coverage)} ${C.matched}/${C.expected}  acc(matched) ${pct(C.accuracy_on_matched)}  acc(all) ${pct(C.accuracy_overall)}  conflict-recall ${pct(C.conflict_recall)} (${C.conflicts_labelled} labelled)`);
    if (opt.verbose && C.wrong.length) console.log(`             wrong: ${C.wrong.map(w => `${w.id}:${w.label}->${w.predicted}`).join(' ')}`);
    if (opt.verbose && C.unmatched.length) console.log(`             unmatched: ${C.unmatched.join(' ')}`);
  }
}
function macro(results) {
  const keys = { routes: 'recall', deeplinks: 'recall', testids: 'recall', apis: 'recall' };
  const out = {};
  for (const [k, f] of Object.entries(keys)) {
    const xs = results.map(r => r[k]).filter(x => !x.status && x.expected > 0);
    const hit = xs.reduce((a, x) => a + x.hit, 0), exp = xs.reduce((a, x) => a + x.expected, 0);
    out[k] = { repos: xs.length, micro_recall: ratio(hit, exp), macro_recall: xs.length ? +(xs.reduce((a, x) => a + x[f], 0) / xs.length).toFixed(3) : null };
  }
  const ns = results.map(r => r.routes).filter(x => !x.status);
  out.not_screens = { fp: ns.reduce((a, x) => a + x.not_screens.false_positives, 0), total: ns.reduce((a, x) => a + x.not_screens.total, 0) };
  out.not_screens.fp_rate = ratio(out.not_screens.fp, out.not_screens.total);
  const cs = results.map(r => r.claims).filter(x => !x.status);
  const cm = cs.reduce((a, x) => a + x.matched, 0), ce = cs.reduce((a, x) => a + x.expected, 0);
  const cc = cs.reduce((a, x) => a + Math.round((x.accuracy_on_matched || 0) * x.matched), 0);
  out.claims = { coverage: ratio(cm, ce), accuracy_on_matched: ratio(cc, cm), accuracy_overall: ratio(cc, ce) };
  return out;
}

// --- selftest: fabricate outputs from labels and make sure perfect -> 100%, empty -> 0%
function fakeFacts(doc) {
  const routes = (doc.screens || []).map(s => ({ platform: s.platform, route_id: s.route_id, pattern: s.pattern || '', deeplink: null, file: s.file, symbol: s.symbol }));
  for (const d of doc.deeplinks || []) routes.push({ platform: d.platform, route_id: 'dl', pattern: '', deeplink: `${d.resolved_scheme || d.scheme}://${d.host}${d.path}`, file: d.file, symbol: '' });
  return {
    dir: '(selftest)', routes,
    testids: (doc.testids || []).filter(t => t.expect !== false).map(t => ({ platform: t.platform, tid: t.tid, route_id: '', file: t.file, line: t.line })),
    apis: (doc.apis || []).filter(a => a.expect !== false).map(a => ({ platform: '', method: a.method, path: a.path, file: a.file, symbol: '' })),
    requirements: (doc.claims || []).map((c, i) => ({ id: 'R' + i, source: c.source, text: c.text, status: c.label, anchors: [] })),
  };
}

function listLabelFiles(dir) { return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => path.join(dir, f)); }

function main() {
  const results = [];
  if (opt.selftest) {
    const files = opt.labels ? [opt.labels] : listLabelFiles(opt.labelsDir || path.join(path.dirname(new URL(import.meta.url).pathname), 'labels'));
    let ok = true;
    for (const f of files) {
      const doc = readJSON(f);
      const p = scoreOne(f, fakeFacts(doc));
      const e = scoreOne(f, { dir: '(empty)', routes: [], testids: [], apis: [], requirements: [] });
      const full = ['routes', 'deeplinks', 'testids', 'apis'].every(k => p[k].recall === null || p[k].recall === 1) && (p.claims.accuracy_overall === null || p.claims.accuracy_overall === 1);
      const zero = ['routes', 'deeplinks', 'testids', 'apis'].every(k => !e[k].recall) && !e.claims.matched;
      // perfect output must not trip negatives unless a not_screen shares id+file with a screen (label bug)
      const fpClean = p.routes.not_screens.false_positives === 0;
      console.log(`${full && zero && fpClean ? 'PASS' : 'FAIL'} ${path.basename(f)}  perfect=${JSON.stringify(['routes', 'deeplinks', 'testids', 'apis'].map(k => p[k].recall))} claims=${p.claims.accuracy_overall} fp=${p.routes.not_screens.false_positives}`);
      if (!(full && zero && fpClean)) { ok = false; if (opt.verbose) printOne(p); }
    }
    process.exit(ok ? 0 : 1);
  }
  if (opt.labelsDir && opt.runs) {
    for (const f of listLabelFiles(opt.labelsDir)) {
      const name = path.basename(f, '.json');
      const d = path.join(opt.runs, name);
      if (!fs.existsSync(d)) { results.push({ repo: name, skipped: `no run dir ${d}` }); continue; }
      results.push(scoreOne(f, loadFacts(d)));
    }
  } else if (opt.labels) {
    results.push(scoreOne(opt.labels, loadFacts(opt.facts, { routes: opt.routesFile, testids: opt.testidsFile, apis: opt.apisFile, requirements: opt.requirementsFile, deeplinks: opt.deeplinksFile })));
  } else { usage(); process.exit(2); }
  const scored = results.filter(r => !r.skipped);
  const summary = scored.length > 1 ? macro(scored) : undefined;
  if (opt.json) { console.log(JSON.stringify({ results, summary }, null, 2)); return; }
  for (const r of results) r.skipped ? console.log(`\n== ${r.repo}: skipped (${r.skipped})`) : printOne(r);
  if (summary) {
    console.log('\n== SUMMARY');
    for (const k of ['routes', 'deeplinks', 'testids', 'apis']) console.log(`  ${k.padEnd(10)} micro ${pct(summary[k].micro_recall)}  macro ${pct(summary[k].macro_recall)}  (${summary[k].repos} repos)`);
    console.log(`  not_screen FP-rate ${pct(summary.not_screens.fp_rate)} (${summary.not_screens.fp}/${summary.not_screens.total})`);
    console.log(`  claims     coverage ${pct(summary.claims.coverage)}  acc(matched) ${pct(summary.claims.accuracy_on_matched)}  acc(all) ${pct(summary.claims.accuracy_overall)}`);
  }
}
main();
