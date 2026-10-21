// LLM-assisted fallback extraction of routes / APIs (`kb facts suggest`, `kb compound --llm-facts`).
//
// Rules stay the source of truth: the agent only sees navigation / networking-looking files where the
// rules found little, its file contents are wrapped as untrusted data, and EVERY suggestion is verified
// deterministically against the scanned source before it is accepted:
//   - the file is part of the scan, `line` is inside the file;
//   - `evidence` is a verbatim substring of the source within ±5 lines of `line`;
//   - routes: the route id or screen identifier appears in that window;
//   - APIs: every literal path segment appears in the window, or in the value of a constant whose name
//     appears in the window; the window holds an HTTP client call or an endpoint definition (not just a
//     string constant); static-asset paths, foreign hosts and URLs built on a function parameter are dropped;
//   - routes: only registration / declaration sites with a named screen; ids are normalised (qualifier
//     stripped, enum/const resolved to its value) before de-duplication against rules and the batch; routes
//     are also de-duplicated by screen symbol name / declaring file + class; string-list literal elements
//     without a navigation call and system framework screens (UI*/AV*/SF*... controllers, android.*,
//     Intent ACTION_*) are rejected.
// Rejected suggestions are reported, never written. Accepted items carry source "llm" and confidence
// "verified-call" (API next to an HTTP call / route screen resolved to its declaration) or "evidence-token"
// (only the token checks passed); rule results win on conflict. Raw agent answers are cached per
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

/** verified-call: API evidence window holds an HTTP client call / route screen resolved to its declaration;
 * evidence-token: only the verbatim-evidence + identifier checks passed (endpoint definition / unresolved screen). */
export type Confidence = 'verified-call' | 'evidence-token';
export type LLMRoute = Route & { line: number; source: 'llm'; confidence: Confidence };
export type LLMAPI = API & { line: number; source: 'llm'; confidence: Confidence };

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
  /** functions / methods per file (to find the enclosing function's parameters) */
  funcsByFile?: Map<string, Symbol[]>;
  /** hosts of the app's own API base URLs (rule APIs, base-URL constants); empty = unknown */
  apiHosts?: Set<string>;
}

// Route registration / declaration sites (vs. use sites such as navigate(X), backStack.add(X), startDestination = X).
const RouteDeclRe = /\b(composable|entry|navigation|dialog|bottomSheet|activity|fragment)\s*[<(]|\bentry\s*<|NavigationLink\b|\.navigationDestination\b|\.sheet\b|\.fullScreenCover\b|@Entry\b|@Route\b|@Destination\b|\brouteName\b|\b(data\s+)?object\s+\w+|\b(data\s+)?class\s+\w+|\bstruct\s+\w+|\bcase\s+\w+|\benum\s+\w+|\bstatic\s+(readonly\s+)?\w+\s*[:=]|\bconst\s+(val\s+)?\w+\s*[:=]|\bregister\w*\s*\(|\b(path|name|url|route|pageUrl|page)\s*[:=]\s*["'`]|\bbuilder\s*[:=(]|\bTab\s*\(|\bWrappedBuilder\b|\bNavDestination\b|\bNavEntry\b|\bentryProvider\b|\bcase\s+\.\w+|^\s*(is\s+)?[A-Z][\w.]*\s*->/m;
const RouteUseRe = /\b(navigate|navigateTo|push\w*|replace\w*|popTo\w*|backStack\.(add|push)|startDestination|listOf|mutableStateListOf|rememberNavBackStack|pushUrl|pushPath|pushPathByName|replaceUrl|router\.back)\b/;

// String array / list literals: `[ 'A', ...`, `@[@"A", ...`, `listOf("a", ...`, or a line that is only a quoted list element.
const StringListRe = /(^|[=:(,\s@])\[\s*@?(["'`][^"'`]*["'`]|[A-Za-z_][\w.]*)\s*,|\b(listOf|mutableListOf|arrayListOf|arrayOf|setOf|mutableSetOf|List\.of|Set\.of|Arrays\.asList)\s*\(\s*(["'`]|[A-Za-z_][\w.]*\s*,)|^\s*@?["'`][^"'`]*["'`]\s*[,\])]/;
// Navigation / registration calls that make a line with a list literal still a route site.
const NavCallRe = /\b(navigate\w*|push\w*|replace\w*|present\w*|show\w*|startActivity\w*|register\w*|addRoute\w*|composable|entry|navigation|dialog|bottomSheet|activity|fragment|NavigationLink|navigationDestination|sheet|fullScreenCover|NavEntry|NavDestination|WrappedBuilder|setRoot\w*)\s*[<({]|\bIntent\s*\(/;
// System framework view controllers (Apple) and Android framework intent actions.
const SystemScreenRe = /^(AV|UI|NS|SF|MF|PH)[A-Z]\w*Controller$/;
const ActionRe = /(^|\.)ACTION_[A-Z0-9_]+$/;

// HTTP client calls and endpoint definitions (vs. bare string constants).
const HttpCallRe = /\.(get|post|put|delete|patch|head|request|fetch|execute|enqueue|newCall|dataTask|submitForm|submitFormWithBinaryData)\s*(<[^>]*>)?\s*[({]|\b(fetch|axios|request|httpRequest|ajax)\s*\(|@(GET|POST|PUT|DELETE|PATCH|HEAD|HTTP|Multipart|FormUrlEncoded)\b|\bURLRequest\s*\(|\bRequest\.Builder\b|\bAF\.(request|upload|download)\b|\bURLSession\b|\bcreateHttp\b|\bHttpMethod\.|\bhttpMethod\b|\bmethod\s*[:=]\s*["'`.]?\w|\bRequestMethod\.|\.url\s*\(|\burl\s*\{|\b(GET|POST|PUT|DELETE|PATCH)\s*\(/;
const EndpointDefRe = /\b(var|val|let|static|case)\s+path\b|\bpath\s*[:=]\s*["'`]|\bpath\s*\(\s*\)|\bendpoint\b|\bEndpoint\b|\bapiPath\b|\bpathFor\b/i;

const AssetExtRe = /\.(png|jpe?g|gif|webp|ico|svg|bmp|css|js|mjs|map|woff2?|ttf|otf|eot|mp3|mp4|m4a|wav|webm|pdf)$/i;
const AssetPrefixRe = /(^|\/)(static|assets?|images?|img|imgs|fonts?|css|js|media|icons?|favicons?)(\/|$)|^\/?t\/p(\/|$)/i;

/** Route id with `Qualifier.` prefixes removed and enum / const names resolved to their string value. */
export function normalizeRouteId(c: VerifyCtx, rid: string): string {
  const m = /^((?:[A-Za-z_]\w*\.)+)([A-Za-z_]\w*)$/.exec(rid);
  if (!m) return rid;
  const quals = m[1]!.slice(0, -1);
  const name = m[2]!;
  const owner = quals.split('.').pop()!;
  const vals = (c.symbolsByName.get(name) ?? []).filter((s) => s.value && (s.qual === `${owner}.${name}` || s.qual.endsWith(`.${owner}.${name}`) || s.parent?.endsWith('#' + owner) || s.parent?.endsWith('.' + owner)));
  const v = vals.length ? vals[0]!.value!.trim().replace(/^["'`]|["'`]$/g, '') : '';
  if (v && /^[\w/.:{}-]+$/.test(v) && new Set(vals.map((x) => x.value)).size === 1) return v;
  return name;
}

function evidenceOK(c: VerifyCtx, it: RawItem): { ok: true; file: string; lines: string[]; line: number; win: string } | { ok: false; reason: string } {
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
  return { ok: true, file, lines, line, win };
}

export function verifyRoute(c: VerifyCtx, it: RawItem): { ok: true; r: LLMRoute } | { ok: false; reason: string } {
  const e = evidenceOK(c, it);
  if (!e.ok) return e;
  const { file, lines, line, win } = e;
  const rid = str(it.route_id).trim();
  const screen = str(it.screen).trim().replace(/\(\)$/, '');
  if (!rid) return { ok: false, reason: 'route_id missing' };
  const ids = [rid, screen, rid.split(/[./]/).filter(Boolean).pop() ?? '', screen.split('.').pop() ?? ''].filter((s) => s.length >= 2);
  if (!ids.some((s) => win.includes(s))) return { ok: false, reason: 'route/screen identifier not in window' };
  // rule 5: registration / declaration sites only, never bare use sites; the target screen must be named
  if (!screen) return { ok: false, reason: 'empty screen symbol' };
  const near = lines.slice(Math.max(0, line - 3), Math.min(lines.length, line + 2)).join('\n');
  const cited = lines[line - 1] ?? '';
  if (!RouteDeclRe.test(near) || (RouteUseRe.test(cited) && !RouteDeclRe.test(cited))) return { ok: false, reason: 'use site, not a registration/declaration site' };
  // a string array / list literal element (e.g. `['MusicPlayerPage', ...]`, `listOf("a", "b")`) is not a route
  if (StringListRe.test(cited) && !NavCallRe.test(cited)) return { ok: false, reason: 'list literal element, not a registration' };
  // system framework screens (AVPlayerViewController, SFSafariViewController, android.* / Intent.ACTION_*) are not app routes
  const sname0 = screen.split('.').pop() ?? '';
  if (!(c.symbolsByName.get(sname0) ?? []).length && (SystemScreenRe.test(sname0) || /^(android|androidx)\./.test(screen) || ActionRe.test(screen) || ActionRe.test(rid))) return { ok: false, reason: 'system framework screen' };
  // file + line anchor the evidence; symbol is the screen's declaration when it is a unique known symbol
  let symbol = screen;
  const sname = screen.split('.').pop() ?? '';
  const cands = (c.symbolsByName.get(sname) ?? []).filter((s) => s.kind !== 'property' && s.kind !== 'variable' && s.kind !== 'field');
  const resolved = cands.length === 1;
  if (resolved) symbol = cands[0]!.id;
  const nid = normalizeRouteId(c, rid);
  return { ok: true, r: { platform: c.platformOf(file), route_id: nid, pattern: nid, deeplink: '', file, symbol, line, source: 'llm', confidence: resolved ? 'verified-call' : 'evidence-token' } };
}

/** Parameter names of the function enclosing `line` in `file`. */
function enclosingParams(c: VerifyCtx, file: string, line: number): string[] {
  let best: Symbol | undefined;
  for (const s of c.funcsByFile?.get(file) ?? []) if (s.start_line <= line && line <= s.end_line && (!best || s.start_line >= best.start_line)) best = s;
  if (!best) return [];
  const a = best.signature.indexOf('(');
  if (a < 0) return [];
  const inner = best.signature.slice(a + 1, best.signature.lastIndexOf(')') > a ? best.signature.lastIndexOf(')') : undefined);
  const out: string[] = [];
  for (const part of inner.split(',')) {
    const m = /(?:^|\s)(?:val\s+|var\s+|_\s+)?([A-Za-z_]\w*)\s*(?:\??\s*:)/.exec(part.trim()) ?? /([A-Za-z_]\w*)\s*$/.exec(part.trim());
    if (m) out.push(m[1]!);
  }
  return out;
}

export function verifyAPI(c: VerifyCtx, it: RawItem): { ok: true; a: LLMAPI } | { ok: false; reason: string } {
  const e = evidenceOK(c, it);
  if (!e.ok) return e;
  const { file, lines, line, win } = e;
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
  // rule 2: static assets are not API endpoints
  const bare = p.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '').replace(/[?#].*$/, '');
  if (AssetExtRe.test(bare) || AssetPrefixRe.test(bare)) return { ok: false, reason: 'static asset path' };
  // rule 3: absolute URLs must point at the app's own API host(s)
  const hosts = new Set<string>();
  for (const m of (p + '\n' + (lines[line - 1] ?? '')).matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) hosts.add(m[1]!.toLowerCase());
  if (hosts.size && c.apiHosts?.size && ![...hosts].some((h) => c.apiHosts!.has(h))) return { ok: false, reason: `foreign host ${[...hosts].join(',')}` };
  const cited = lines[line - 1] ?? '';
  const params = enclosingParams(c, file, line);
  if (params.length && !hosts.size) {
    const baseIdent = /\bURL\s*\(\s*([A-Za-z_]\w*)\s*,/.exec(cited)?.[1] ?? /([A-Za-z_]\w*)\s*\+\s*["'`]\//.exec(cited)?.[1] ?? /["'`]\$\{?([A-Za-z_]\w*)\}?\//.exec(cited)?.[1] ?? /\\\(([A-Za-z_]\w*)\)\//.exec(cited)?.[1];
    if (baseIdent && params.includes(baseIdent) && !/(api|base|server|host|endpoint)/i.test(baseIdent)) return { ok: false, reason: `URL built on function parameter ${baseIdent}` };
  }
  // rule 1: an HTTP client call or an endpoint definition must be in the window (not just a string constant)
  const call = HttpCallRe.test(win);
  if (!call && !EndpointDefRe.test(win)) return { ok: false, reason: 'no HTTP call or endpoint definition near line' };
  p = bare;
  if (!p.startsWith('/')) p = '/' + p;
  return { ok: true, a: { platform: c.platformOf(file), method, path: p, file, symbol: '', line, source: 'llm', confidence: call ? 'verified-call' : 'evidence-token' } };
}

const BaseNameRe = /(base|api|host|server|endpoint|domain|root)/i;
const HostRe = /https?:\/\/([A-Za-z0-9.-]+)/g;

function verifyCtx(cfg: Config, res: ScanResult, files: Map<string, string>, facts?: Facts): VerifyCtx {
  const consts = new Map<string, string[]>();
  const byName = new Map<string, Symbol[]>();
  const funcsByFile = new Map<string, Symbol[]>();
  const apiHosts = new Set<string>();
  for (const a of facts?.apis ?? []) for (const m of a.path.matchAll(HostRe)) apiHosts.add(m[1]!.toLowerCase());
  for (const t of files.values())
    for (const m of t.matchAll(/(base[_-]?ur[li]|api[_-]?ur[li]|base[_-]?host|api[_-]?host|server[_-]?ur[li]|host[_-]?ur[li]|baseURL|BASE_URL|API_URL)\w*["'\s\]]*[:=(][^\n]{0,40}?https?:\/\/([A-Za-z0-9.-]+)/gi)) apiHosts.add(m[2]!.toLowerCase());
  for (const s of res.graph.symbols) {
    if ((s.kind === 'function' || s.kind === 'method' || s.kind === 'init') && s.end_line > s.start_line) {
      const l = funcsByFile.get(s.file) ?? [];
      l.push(s);
      funcsByFile.set(s.file, l);
    }
    if (s.value && BaseNameRe.test(s.name)) for (const m of s.value.matchAll(HostRe)) apiHosts.add(m[1]!.toLowerCase());
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
    funcsByFile,
    apiHosts,
    consts,
    symbolsByName: byName,
  };
}

const normApi = (p: string) => p.toLowerCase().replace(/\{[^}]*\}|:[a-z_]\w*|\$\{[^}]*\}/g, '{}').replace(/\/+$/, '');

// Member names too generic to identify a screen on their own.
const GenericMember = new Set(['body', 'build', 'content', 'view', 'screen', 'page', 'render', 'oncreate', 'oncreateview', 'viewdidload', 'aboutToAppear'.toLowerCase(), 'invoke', 'init', 'main']);

/** Dedupe keys of a route's screen symbol: names (full fragment, non-generic simple name), the declaration
 *  (file#fragment) and its declaring file + outer class (file#Class). */
function screenKeys(symbol: string): { names: string[]; decl: string; cls: string } {
  const s = symbol.toLowerCase();
  const hash = s.indexOf('#');
  const file = hash >= 0 ? s.slice(0, hash) : '';
  const frag = hash >= 0 ? s.slice(hash + 1) : s;
  const parts = frag.split('.').filter(Boolean);
  const simple = parts[parts.length - 1] ?? '';
  const names = frag ? [frag, ...(simple && simple !== frag && !GenericMember.has(simple) ? [simple] : [])] : [];
  return { names, decl: file && frag ? `${file}#${frag}` : '', cls: file && parts[0] ? `${file}#${parts[0]}` : '' };
}

/** Merge accepted items; rule results win (same route id / screen, or same method + path). */
export function mergeInto(facts: Facts, routes: LLMRoute[], apis: LLMAPI[]): { facts: Facts; conflicts: number } {
  let conflicts = 0;
  const rr = [...(facts.routes ?? [])];
  const seenR = new Set(rr.map((r) => r.route_id.toLowerCase()));
  // same screen: same symbol name, same declaration, or one is a member of the other's class in the same file
  const seenN = new Set<string>();
  const seenD = new Set<string>();
  const seenC = new Set<string>();
  const add = (k: ReturnType<typeof screenKeys>) => {
    for (const n of k.names) seenN.add(n);
    if (k.decl) seenD.add(k.decl);
    if (k.cls) seenC.add(k.cls);
  };
  for (const r of rr) add(screenKeys(r.symbol));
  for (const r of routes) {
    const k = screenKeys(r.symbol);
    const dup = k.names.some((n) => seenN.has(n)) || (k.decl && (seenD.has(k.decl) || seenC.has(k.decl))) || (k.cls && seenD.has(k.cls));
    if (seenR.has(r.route_id.toLowerCase()) || dup) {
      conflicts++;
      continue;
    }
    seenR.add(r.route_id.toLowerCase());
    add(k);
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
  const vc = verifyCtx(cfg, res, files, facts);
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
