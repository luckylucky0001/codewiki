// LLM-assisted fallback extraction of routes / APIs (`kb facts suggest`, `kb compound --llm-facts`).
//
// Rules stay the source of truth: the agent only sees navigation / networking-looking files where the
// rules found little, its file contents are wrapped as untrusted data, and EVERY suggestion is verified
// deterministically against the scanned source before it is accepted:
//   - the file is part of the scan, `line` is inside the file;
//   - `evidence` is a verbatim substring of the source within ±5 lines of `line`;
//   - routes: the route id or screen identifier appears in that window;
//   - APIs: every literal path segment appears in the window, or in the value of a constant whose name
//     appears in the window.
// Rejected suggestions are reported, never written. Accepted items carry source "llm" and
// confidence "verified-evidence"; rule results win on conflict. Raw agent answers are cached per
// (file content hash, model, prompt version, kinds), so reruns cost nothing; the accepted overlay is
// stored in <wiki>/.kb/llm-facts.json and re-applied deterministically (kb verify, later compounds)
// for files whose content hash is unchanged.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Config } from '../config/config.js';
import { wikiPath } from '../config/config.js';
import type { API, Facts, Route, Symbol } from '../model.js';
import type { ScanResult } from '../scan/scan.js';
import { SafetyPreamble, dataBlock } from '../engine/safety.js';
import { type Usage, shellQuote, usageAdd, usageParsers } from '../agents/agents.js';
import { cmpStr } from '../util/go.js';
import { isTestPath } from './facts.js';

export const PromptVersion = 'llm-facts-v1';
export const OverlayFile = '.kb/llm-facts.json';
export const CacheDir = '.kb/cache/llm-facts';
const Window = 5;

export type LLMRoute = Route & { line: number; source: 'llm'; confidence: 'verified-evidence' };
export type LLMAPI = API & { line: number; source: 'llm'; confidence: 'verified-evidence' };

export interface SuggestOptions {
  agent?: string; // claude (default)
  model?: string;
  llmCmd?: string; // overrides the agent command (prompt on stdin, JSON/text answer on stdout)
  maxFiles?: number;
  maxBytes?: number; // total source bytes sent
  batchBytes?: number;
  kinds?: string[]; // routes, apis
  log?: (s: string) => void;
}

export interface Rejected {
  kind: string;
  file: string;
  line: number;
  item: string;
  reason: string;
}

export interface SuggestResult {
  candidates: string[];
  batches: number;
  cached_files: number;
  agent_calls: number;
  accepted: { routes: LLMRoute[]; apis: LLMAPI[] };
  rejected: Rejected[];
  skipped_conflict: number;
  usage: Usage;
  errors: string[];
}

const NavRe = /\b(NavHost|NavKey|NavDisplay|NavDestination|NavController|NavigationStack|NavigationLink|NavigationPath|navigation\s*\(|composable\s*[<(]|entry\s*<|router|Router|main_pages|pushUrl|pushPath|NavPathStack|Navigation\b|@Entry|Destination|Screen\b|sealed\s+(class|interface)\s+\w*(Route|Screen|Destination|Key))/;
const NetRe = /\b(Ktor|HttpClient|OkHttp|okhttp3|Retrofit|@GET|@POST|URLSession|URLRequest|Alamofire|Moya|axios|createHttp|http\.request|fetch\s*\(|Endpoint|baseUrl|BASE_URL|baseURL|apiPath|\.get\s*\(\s*["'`/]|\.post\s*\(\s*["'`/]|HttpMethod|httpMethod|Request\.Builder)/;
const SrcExt = /\.(kt|kts|java|swift|ets|ts|m|mm)$/;

function sha(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function readSrc(cfg: Config, rel: string): string | null {
  try {
    return fs.readFileSync(path.join(cfg.root, rel), 'utf8');
  } catch {
    return null;
  }
}

/** Candidate files: navigation / networking looking, not tests, where the rules found ≤1 item of that kind. */
export function candidates(cfg: Config, res: ScanResult, facts: Facts, o: SuggestOptions): { file: string; text: string; hash: string }[] {
  const kinds = new Set(o.kinds?.length ? o.kinds : ['routes', 'apis']);
  const rCount = new Map<string, number>();
  const aCount = new Map<string, number>();
  for (const r of facts.routes ?? []) rCount.set(r.file, (rCount.get(r.file) ?? 0) + 1);
  for (const a of facts.apis ?? []) aCount.set(a.file, (aCount.get(a.file) ?? 0) + 1);
  const scored: { file: string; text: string; hash: string; score: number }[] = [];
  for (const rel of Object.keys(res.graph.files).sort(cmpStr)) {
    if (!SrcExt.test(rel) || isTestPath(rel)) continue;
    const text = readSrc(cfg, rel);
    if (text === null || text.length > 60000 || text.length < 40) continue;
    let score = 0;
    if (kinds.has('routes') && NavRe.test(text) && (rCount.get(rel) ?? 0) <= 1) score += countMatches(text, NavRe);
    if (kinds.has('apis') && NetRe.test(text) && (aCount.get(rel) ?? 0) <= 1) score += countMatches(text, NetRe);
    if (score > 0) scored.push({ file: rel, text, hash: sha(text), score });
  }
  scored.sort((a, b) => b.score - a.score || cmpStr(a.file, b.file));
  const maxFiles = o.maxFiles ?? 40;
  const maxBytes = o.maxBytes ?? 400000;
  const out: { file: string; text: string; hash: string }[] = [];
  let bytes = 0;
  for (const s of scored) {
    if (out.length >= maxFiles) break;
    if (bytes + s.text.length > maxBytes) continue;
    bytes += s.text.length;
    out.push({ file: s.file, text: s.text, hash: s.hash });
  }
  return out.sort((a, b) => cmpStr(a.file, b.file));
}

function countMatches(text: string, re: RegExp): number {
  const g = new RegExp(re.source, 'g');
  return Math.min(20, (text.match(g) ?? []).length);
}

const numbered = (text: string) =>
  text
    .split('\n')
    .map((l, i) => `${String(i + 1).padStart(4)}| ${l}`)
    .join('\n');

export function buildPrompt(files: { file: string; text: string }[], kinds: string[]): string {
  let p = SafetyPreamble;
  p += `## Task: extract navigation routes and HTTP API calls

You are given source files of a mobile app (Android Kotlin/Java, iOS Swift, HarmonyOS ArkTS, Kotlin Multiplatform).
Each line is prefixed with its 1-based line number and "| " (the prefix is NOT part of the source).
Find${kinds.includes('routes') ? ' (a) navigation routes / screens: every destination the app can navigate to (route ids, NavKey / sealed route objects, composable("x") destinations, main_pages / router pages, NavigationLink / navigationDestination targets) with the screen (UI component / page struct / composable function) it shows;' : ''}${kinds.includes('apis') ? ' (b) HTTP API calls: method and URL path (relative to the base URL; keep path parameters as {name}) of each endpoint the app calls;' : ''}
Only report items that are clearly present in the given code. Do not guess. Do not invent names.

For every item give \`file\` (exactly the id of the data block), \`line\` (line number where it is declared/used) and
\`evidence\`: a short VERBATIM substring (10–120 chars) copied from that line or a line within ±3 of it, without the line-number prefix.

Answer with ONLY one JSON object, no prose, no markdown fence:
{"routes":[{"route_id":"...","screen":"...","file":"...","line":0,"evidence":"..."}],"apis":[{"method":"GET","path":"/...","file":"...","line":0,"evidence":"..."}]}

`;
  for (const f of files) p += dataBlock('source', f.file, numbered(f.text)) + '\n';
  return p;
}

interface RawItem {
  [k: string]: unknown;
}
interface RawAnswer {
  routes: RawItem[];
  apis: RawItem[];
}

/** Extract the JSON answer from agent stdout (claude --output-format json wraps it in .result). */
export function parseAnswer(out: string): RawAnswer {
  let text = out;
  for (const l of out.split('\n')) {
    const t = l.trim();
    if (!t.startsWith('{')) continue;
    try {
      const m = JSON.parse(t) as Record<string, unknown>;
      if (m.type === 'result' && typeof m.result === 'string') text = m.result;
    } catch {
      /* not a json line */
    }
  }
  try {
    const m = JSON.parse(out.trim()) as Record<string, unknown>;
    if (typeof m.result === 'string') text = m.result;
  } catch {
    /* fine */
  }
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return { routes: [], apis: [] };
  try {
    const j = JSON.parse(text.slice(a, b + 1)) as Partial<RawAnswer>;
    return { routes: Array.isArray(j.routes) ? j.routes : [], apis: Array.isArray(j.apis) ? j.apis : [] };
  } catch {
    return { routes: [], apis: [] };
  }
}

function agentArgv(o: SuggestOptions): string {
  if (o.llmCmd) return o.llmCmd;
  const agent = o.agent || 'claude';
  if (agent !== 'claude') throw new Error(`kb facts suggest: unsupported agent ${JSON.stringify(agent)} (use claude or --llm-cmd)`);
  return ['claude', '-p', '--output-format', 'json', '--tools', '', ...(o.model ? ['--model', o.model] : [])].map(shellQuote).join(' ');
}

function runAgent(cmd: string, prompt: string): { out: string; err?: string } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-llmfacts-'));
  try {
    const r = spawnSync('/bin/sh', ['-c', cmd], { cwd, input: prompt, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 600000 });
    if (r.status !== 0) return { out: r.stdout ?? '', err: `agent exit ${r.status}: ${(r.stderr || '').trim().slice(0, 200)}` };
    return { out: r.stdout ?? '' };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const Methods = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);
const stripPrefix = (e: string) => e.replace(/^\s*\d+\|\s?/, '').trim();
const ws = (s: string) => s.replace(/\s+/g, ' ').trim();

function windowText(lines: string[], line: number): string {
  return lines.slice(Math.max(0, line - 1 - Window), Math.min(lines.length, line + Window)).join('\n');
}

/** Literal (non-parameter) segments of an API path. */
export function literalSegments(p: string): string[] {
  const q = p.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '').replace(/[?#].*$/, '');
  return q
    .split('/')
    .filter((s) => s && !/^(\{.*\}|:.+|\$.*|<.*>|%[sd@].*|\\\(.*\)|\*+)$/.test(s) && !s.includes('{') && !s.includes('$'));
}

export interface VerifyCtx {
  files: Map<string, string>; // rel -> text (scan)
  platformOf: (rel: string) => string;
  consts: Map<string, string[]>; // constant name -> string values
  symbolsByName: Map<string, Symbol[]>;
}

export function verifyRoute(c: VerifyCtx, it: RawItem): { ok: true; r: LLMRoute } | { ok: false; reason: string } {
  const file = str(it.file);
  const text = c.files.get(file);
  if (text === undefined) return { ok: false, reason: 'file not in scan' };
  const lines = text.split('\n');
  const line = Math.trunc(Number(it.line));
  if (!(line >= 1 && line <= lines.length)) return { ok: false, reason: 'line out of range' };
  const ev = stripPrefix(str(it.evidence));
  if (ev.length < 4) return { ok: false, reason: 'evidence missing' };
  const win = windowText(lines, line);
  if (!win.includes(ev) && !ws(win).includes(ws(ev))) return { ok: false, reason: 'evidence not found near line' };
  const rid = str(it.route_id).trim();
  const screen = str(it.screen).trim().replace(/\(\)$/, '');
  if (!rid) return { ok: false, reason: 'route_id missing' };
  const ids = [rid, screen, rid.split(/[./]/).filter(Boolean).pop() ?? '', screen.split('.').pop() ?? ''].filter((s) => s.length >= 2);
  if (!ids.some((s) => win.includes(s))) return { ok: false, reason: 'route/screen identifier not in window' };
  // anchor the screen to its declaration when it is a known symbol
  // (file + line anchor the evidence; symbol is the screen's declaration when it is a unique known symbol)
  let symbol = screen;
  const cands = c.symbolsByName.get(screen.split('.').pop() ?? '') ?? [];
  if (cands.length === 1) symbol = cands[0]!.id;
  return { ok: true, r: { platform: c.platformOf(file), route_id: rid, pattern: rid, deeplink: '', file, symbol, line, source: 'llm', confidence: 'verified-evidence' } };
}

export function verifyAPI(c: VerifyCtx, it: RawItem): { ok: true; a: LLMAPI } | { ok: false; reason: string } {
  const file = str(it.file);
  const text = c.files.get(file);
  if (text === undefined) return { ok: false, reason: 'file not in scan' };
  const lines = text.split('\n');
  const line = Math.trunc(Number(it.line));
  if (!(line >= 1 && line <= lines.length)) return { ok: false, reason: 'line out of range' };
  const ev = stripPrefix(str(it.evidence));
  if (ev.length < 4) return { ok: false, reason: 'evidence missing' };
  const win = windowText(lines, line);
  if (!win.includes(ev) && !ws(win).includes(ws(ev))) return { ok: false, reason: 'evidence not found near line' };
  const method = str(it.method).trim().toUpperCase() || 'GET';
  if (!Methods.has(method)) return { ok: false, reason: 'unknown method ' + method };
  let p = str(it.path).trim();
  if (!p) return { ok: false, reason: 'path missing' };
  const segs = literalSegments(p);
  if (!segs.length) return { ok: false, reason: 'no literal path segment' };
  // constants named in the window
  const idents = new Set(win.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  const constVals: string[] = [];
  for (const id of idents) for (const v of c.consts.get(id) ?? []) constVals.push(v);
  for (const s of segs) if (!win.includes(s) && !constVals.some((v) => v.includes(s))) return { ok: false, reason: `path segment ${JSON.stringify(s)} not in window or named constant` };
  p = p.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  if (!p.startsWith('/')) p = '/' + p;
  return { ok: true, a: { platform: c.platformOf(file), method, path: p, file, symbol: '', line, source: 'llm', confidence: 'verified-evidence' } };
}

function verifyCtx(cfg: Config, res: ScanResult, files: Map<string, string>): VerifyCtx {
  const consts = new Map<string, string[]>();
  const byName = new Map<string, Symbol[]>();
  for (const s of res.graph.symbols) {
    if (s.value) {
      const v = s.value.replace(/^["'`]|["'`]$/g, '');
      const l = consts.get(s.name) ?? [];
      l.push(v);
      consts.set(s.name, l);
    }
    const l = byName.get(s.name) ?? [];
    l.push(s);
    byName.set(s.name, l);
  }
  const lazy = (rel: string) => {
    if (!files.has(rel) && res.graph.files[rel]) {
      const t = readSrc(cfg, rel);
      if (t !== null) files.set(rel, t);
    }
  };
  return {
    files: new Proxy(files, {
      get(target, prop) {
        if (prop === 'get') return (k: string) => (lazy(k), target.get(k));
        const v = Reflect.get(target, prop) as unknown;
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      },
    }),
    platformOf: (rel) => res.graph.files[rel]?.platform ?? '',
    consts,
    symbolsByName: byName,
  };
}

const normApi = (p: string) => p.toLowerCase().replace(/\{[^}]*\}|:[a-z_]\w*|\$\{[^}]*\}/g, '{}').replace(/\/+$/, '');

/** Merge accepted items; rule results win (same route id / screen, or same method + path). */
export function mergeInto(facts: Facts, routes: LLMRoute[], apis: LLMAPI[]): { facts: Facts; conflicts: number } {
  let conflicts = 0;
  const rr = [...(facts.routes ?? [])];
  const seenR = new Set(rr.map((r) => r.route_id.toLowerCase()));
  const seenS = new Set(rr.map((r) => (r.symbol.split('#').pop() ?? '').toLowerCase()).filter(Boolean));
  for (const r of routes) {
    const sn = (r.symbol.split('#').pop() ?? '').toLowerCase();
    if (seenR.has(r.route_id.toLowerCase()) || (sn && seenS.has(sn))) {
      conflicts++;
      continue;
    }
    seenR.add(r.route_id.toLowerCase());
    if (sn) seenS.add(sn);
    rr.push(r);
  }
  const aa = [...(facts.apis ?? [])];
  const seenA = new Set(aa.map((a) => a.method + ' ' + normApi(a.path)));
  for (const a of apis) {
    const k = a.method + ' ' + normApi(a.path);
    if (seenA.has(k)) {
      conflicts++;
      continue;
    }
    seenA.add(k);
    aa.push(a);
  }
  return { facts: { ...facts, routes: rr, apis: aa }, conflicts };
}

interface Overlay {
  version: 1;
  prompt_version: string;
  model: string;
  files: Record<string, string>; // rel -> content hash
  routes: LLMRoute[];
  apis: LLMAPI[];
}

/** Run the agent on candidate files (cached), verify every suggestion, return accepted / rejected. */
export function suggest(cfg: Config, res: ScanResult, facts: Facts, o: SuggestOptions): SuggestResult {
  const kinds = o.kinds?.length ? o.kinds : ['routes', 'apis'];
  const cands = candidates(cfg, res, facts, o);
  const wiki = wikiPath(cfg);
  const cdir = path.join(wiki, CacheDir);
  const model = o.model || '';
  const keyOf = (h: string) => sha(`${h}\n${model}\n${o.llmCmd ?? o.agent ?? 'claude'}\n${PromptVersion}\n${[...kinds].sort().join(',')}`);
  const r: SuggestResult = { candidates: cands.map((c) => c.file), batches: 0, cached_files: 0, agent_calls: 0, accepted: { routes: [], apis: [] }, rejected: [], skipped_conflict: 0, usage: {}, errors: [] };
  const raw = new Map<string, RawAnswer>();
  const todo: typeof cands = [];
  for (const c of cands) {
    try {
      raw.set(c.file, JSON.parse(fs.readFileSync(path.join(cdir, keyOf(c.hash) + '.json'), 'utf8')) as RawAnswer);
      r.cached_files++;
    } catch {
      todo.push(c);
    }
  }
  const batchBytes = o.batchBytes ?? 60000;
  const batches: (typeof cands)[] = [];
  let cur: typeof cands = [];
  let cb = 0;
  for (const c of todo) {
    if (cur.length && (cb + c.text.length > batchBytes || cur.length >= 8)) {
      batches.push(cur);
      cur = [];
      cb = 0;
    }
    cur.push(c);
    cb += c.text.length;
  }
  if (cur.length) batches.push(cur);
  r.batches = batches.length;
  const cmd = batches.length ? agentArgv(o) : '';
  for (const b of batches) {
    o.log?.(`llm-facts: batch of ${b.length} file(s): ${b.map((x) => x.file).join(', ')}\n`);
    const res1 = runAgent(cmd, buildPrompt(b, kinds));
    r.agent_calls++;
    const u = (usageParsers[o.agent || 'claude'] ?? usageParsers.claude!)(res1.out);
    usageAdd(r.usage, u);
    if (res1.err || u.error) {
      r.errors.push(res1.err || u.error || 'agent error');
      continue;
    }
    const ans = parseAnswer(res1.out);
    for (const c of b) {
      const mine: RawAnswer = { routes: ans.routes.filter((x) => str(x.file) === c.file), apis: ans.apis.filter((x) => str(x.file) === c.file) };
      raw.set(c.file, mine);
      try {
        fs.mkdirSync(cdir, { recursive: true });
        fs.writeFileSync(path.join(cdir, keyOf(c.hash) + '.json'), JSON.stringify(mine));
      } catch {
        /* no wiki: not cached */
      }
    }
    // items naming files outside the batch are hallucinated / misattributed
    const inBatch = new Set(b.map((x) => x.file));
    for (const x of ans.routes) if (!inBatch.has(str(x.file))) r.rejected.push({ kind: 'route', file: str(x.file), line: Number(x.line) || 0, item: str(x.route_id), reason: 'file not in batch' });
    for (const x of ans.apis) if (!inBatch.has(str(x.file))) r.rejected.push({ kind: 'api', file: str(x.file), line: Number(x.line) || 0, item: `${str(x.method)} ${str(x.path)}`, reason: 'file not in batch' });
  }
  const files = new Map(cands.map((c) => [c.file, c.text]));
  const vc = verifyCtx(cfg, res, files);
  for (const c of cands) {
    const a = raw.get(c.file);
    if (!a) continue;
    if (kinds.includes('routes'))
      for (const it of a.routes) {
        const v = verifyRoute(vc, it);
        if (v.ok) r.accepted.routes.push(v.r);
        else r.rejected.push({ kind: 'route', file: str(it.file), line: Number(it.line) || 0, item: `${str(it.route_id)} -> ${str(it.screen)}`, reason: v.reason });
      }
    if (kinds.includes('apis'))
      for (const it of a.apis) {
        const v = verifyAPI(vc, it);
        if (v.ok) r.accepted.apis.push(v.a);
        else r.rejected.push({ kind: 'api', file: str(it.file), line: Number(it.line) || 0, item: `${str(it.method)} ${str(it.path)}`, reason: v.reason });
      }
  }
  const sortR = (a: LLMRoute, b: LLMRoute) => cmpStr(a.platform, b.platform) || cmpStr(a.route_id, b.route_id) || cmpStr(a.file, b.file) || a.line - b.line;
  const sortA = (a: LLMAPI, b: LLMAPI) => cmpStr(a.platform, b.platform) || cmpStr(a.path, b.path) || cmpStr(a.method, b.method) || cmpStr(a.file, b.file) || a.line - b.line;
  r.accepted.routes.sort(sortR);
  r.accepted.apis.sort(sortA);
  const m = mergeInto(facts, r.accepted.routes, r.accepted.apis);
  r.skipped_conflict = m.conflicts;
  // persist the overlay (only what survives the merge, so rule results keep winning)
  const keptR = new Set(m.facts.routes ?? []);
  const keptA = new Set(m.facts.apis ?? []);
  const ov: Overlay = {
    version: 1,
    prompt_version: PromptVersion,
    model,
    files: Object.fromEntries(cands.map((c) => [c.file, c.hash])),
    routes: r.accepted.routes.filter((x) => keptR.has(x)),
    apis: r.accepted.apis.filter((x) => keptA.has(x)),
  };
  try {
    if (fs.statSync(wiki).isDirectory()) {
      fs.mkdirSync(path.dirname(path.join(wiki, OverlayFile)), { recursive: true });
      fs.writeFileSync(path.join(wiki, OverlayFile), JSON.stringify(ov, null, 2) + '\n');
    }
  } catch {
    /* no wiki */
  }
  return r;
}

/** Re-apply the stored overlay deterministically (no agent call): items whose evidence file changed are dropped. */
export function applyOverlay(cfg: Config, facts: Facts): Facts {
  let ov: Overlay;
  try {
    ov = JSON.parse(fs.readFileSync(path.join(wikiPath(cfg), OverlayFile), 'utf8')) as Overlay;
  } catch {
    return facts;
  }
  const fresh = new Map<string, boolean>();
  const ok = (rel: string) => {
    if (!fresh.has(rel)) {
      const t = readSrc(cfg, rel);
      fresh.set(rel, t !== null && ov.files[rel] === sha(t));
    }
    return fresh.get(rel)!;
  };
  const routes = (ov.routes ?? []).filter((r) => ok(r.file));
  const apis = (ov.apis ?? []).filter((a) => ok(a.file));
  if (!routes.length && !apis.length) return facts;
  return mergeInto(facts, routes, apis).facts;
}
