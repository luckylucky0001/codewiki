// Document claims: extraction (spec-kit / Kiro / EARS / MUST / statements) and
// deterministic verification against facts and symbols (code wins).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { API, Facts, Graph, Symbol } from '../model.js';
import { getSym } from '../model.js';
import { cmpStr, fields, regexQuoteMeta } from '../util/go.js';
import { scanInjection } from './safety.js';
import { containerKinds, sortedKeys } from './graphutil.js';
import { valueRules } from './valuecheck.js';

export const ClaimVerified = 'verified';
export const ClaimConflict = 'conflict';
export const ClaimUnverifiable = 'unverifiable';

export interface Claim {
  id: string;
  source: string;
  raw: string;
  line: number;
  text: string;
  style: string;
  status?: string;
  anchors?: string[];
  route_ids?: string[];
  evidence?: string[];
  suspicious?: string;
}

/** Go field order + omitempty. */
export function claimJSON(c: Claim): Record<string, unknown> {
  const o: Record<string, unknown> = { id: c.id, source: c.source, raw: c.raw, line: c.line, text: c.text, style: c.style };
  if (c.status) o.status = c.status;
  if (c.anchors?.length) o.anchors = c.anchors;
  if (c.route_ids?.length) o.route_ids = c.route_ids;
  if (c.evidence?.length) o.evidence = c.evidence;
  if (c.suspicious) o.suspicious = c.suspicious;
  return o;
}

export const reFR = /\b((?:FR|NFR|SC|REQ)-\d{1,4})\b/;
const reKiroReq = /^#{2,4}\s*Requirement\s+(\d+)/i;
const reNumItem = /^\s*(\d+)\.\s+(.+)$/;
const reBullet = /^\s*(?:[-*+]|\d+\.)\s+(.+)$/;
const reEARS = /\b(WHEN|WHILE|IF|WHERE)\b.*\b(SHALL|MUST)\b|\bTHE SYSTEM SHALL\b/i;
const reMust = /\b(MUST|SHALL|SHOULD|MUST NOT|SHALL NOT)\b|必须|应当|不得/;
export const reCodeG = /`([^`]+)`/g;
export const reAPIG = /\b(GET|POST|PUT|DELETE|PATCH)\s+`?(\/[A-Za-z0-9_/{}:\-.]+)/g;
export const reAPIPathG = /(\/api\/[A-Za-z0-9_/{}:\-.]+)/g;
const reDeeplinkG = /\b([a-z][a-z0-9+.-]{1,20}):\/\/([A-Za-z0-9_/{}<>.-]*)/g;
export const reNumberG = /\b\d+\b/g;
export const reIdentLike = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*(?:\(\))?$/;
const reMdStripG = /\*\*|__/g;
const reAPI = /\b(GET|POST|PUT|DELETE|PATCH)\s+`?(\/[A-Za-z0-9_/{}:\-.]+)/;
const reAPIPath = /(\/api\/[A-Za-z0-9_/{}:\-.]+)/;

const shortHash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 6);

function docSlug(p: string): string {
  const ext = path.posix.extname(p);
  const base = path.posix.basename(p).slice(0, path.posix.basename(p).length - ext.length);
  const dir = path.posix.basename(path.posix.dirname(p));
  let s = base;
  if (['spec', 'requirements', 'design', 'tasks', 'README', 'readme'].includes(base)) s = dir + '-' + base;
  s = s.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase();
  return s.replace(/^-+|-+$/g, '');
}

export function extractClaims(source: string, raw: string, content: string): Claim[] {
  const out: Claim[] = [];
  const seen = new Set<string>();
  const slug = docSlug(source);
  const feature = path.posix.basename(path.posix.dirname(source)).toUpperCase();
  let kiroReq = '';
  let inCode = false;
  content.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('```')) {
      inCode = !inCode;
      return;
    }
    if (inCode || t === '' || t.startsWith('|---')) return;
    const km = reKiroReq.exec(t);
    if (km) {
      kiroReq = km[1]!;
      return;
    }
    if (t.startsWith('#') || t.startsWith('>')) return;
    let text = t.replace(reMdStripG, '').trim();
    const bm = reBullet.exec(text);
    if (bm) text = bm[1]!;
    let c: Claim;
    const fr = reFR.exec(text);
    if (fr && text.indexOf(fr[0]) < 4) {
      const id = fr[0];
      const body = (text.startsWith(id) ? text.slice(id.length) : text).replace(/^[:： ]+/, '').trim();
      c = { id, text: body, style: 'spec-kit' } as Claim;
    } else if (kiroReq && reNumItem.test(t) && reEARS.test(t)) {
      const m = reNumItem.exec(t)!;
      c = { id: `${feature}-R${kiroReq}.${m[1]}`, text: m[2]!.replace(reMdStripG, '').trim(), style: 'kiro' } as Claim;
    } else if (reEARS.test(text)) c = { id: '', text, style: 'ears' } as Claim;
    else if (reMust.test(text)) c = { id: '', text, style: 'must' } as Claim;
    else if (reBullet.test(t) && (text.includes('`') || reAPIPath.test(text) || reAPI.test(text))) c = { id: '', text, style: 'statement' } as Claim;
    else return;
    if (!c.id) c.id = slug + '-' + shortHash(fields(c.text).join(' '));
    if (seen.has(c.id)) c.id = `${c.id}-${i + 1}`;
    seen.add(c.id);
    c.source = source;
    c.raw = raw;
    c.line = i + 1;
    const f = scanInjection(c.text);
    if (f.length) c.suspicious = f[0]!.pattern;
    out.push({ id: c.id, source: c.source, raw: c.raw, line: c.line, text: c.text, style: c.style, ...(c.suspicious ? { suspicious: c.suspicious } : {}) });
  });
  return out;
}

export function normAPIPath(p: string): string {
  p = p.replace(/[.,;:)]+$/, '');
  p = p.replace(/\{[^}]*\}|:[A-Za-z_]+/g, '{}');
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

/** Drop all whitespace and turn double quotes into single quotes. */
export function normLit(s: string): string {
  return s.replace(/[ \t\n\r\v\f]/g, '').replaceAll('"', "'");
}

const reFileName = /^[\w./-]+\.(json5?|ets|kt|kts|java|swift|xml|plist|md|ya?ml|js|ts|gradle|m|mm|h|xctestplan|xcconfig|storyboard|xib|entitlements|strings|sh|rb|py|toml|properties)$/;
const rePlaceholderPath = /[<{]|\bv?X\.Y\.Z\b|\bYYYY|\bxxx\b/;
const reCreate = /(\bcreate( a| an| the)?( new)?( file)?|新建|创建)\s*$/i;
const reExample = /(e\.g\.?,?|for example,?|such as|例如|比如)\s*\(?$/i;
const reDocImportES = /import\s+(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+(\w+))?\s*from\s+['"]([^'"]+)['"]/g;
const reDocRequire = /(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
const reIdentTok = /[A-Za-z0-9_$]+/;

export function historicalDoc(src: string): boolean {
  return src.toLowerCase().split('/').some((s) => ['plans', 'plan', 'proposals', 'rfcs', 'archive', 'archived', 'completed', 'deprecated', 'history', 'research'].includes(s));
}

export const builtinTypes = new Set(
  'Object Function Array Promise JSON Math String Number Boolean Error Symbol Map Set WeakMap URL URLSearchParams ClientRequest IncomingMessage Buffer Date RegExp Reflect Proxy AbortController AbortSignal XMLHttpRequest FormData Blob Headers Request Response ReadableStream TextEncoder TextDecoder Intl Kotlin Swift Foundation UIKit SwiftUI NSObject Bundle Context Intent Activity'.split(' '),
);

export function isPascal(s: string): boolean {
  return s.length > 1 && s[0]! >= 'A' && s[0]! <= 'Z' && s.toUpperCase() !== s;
}

function looksLikeCodeIdent(s: string): boolean {
  if (s.includes('_') || s.includes('.') || s.endsWith('()')) return true;
  let lower = false, upper = false;
  for (let i = 0; i < s.length; i++) {
    const r = s[i]!;
    if (r >= 'a' && r <= 'z') lower = true;
    if (r >= 'A' && r <= 'Z' && i > 0) upper = true;
  }
  return lower && upper;
}

const isTokChar = (c: string) => c === '_' || c === '$' || (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isInt = (s: string) => /^[+-]?\d+$/.test(s);

export class Checker {
  norms = new Map<string, string>();
  codeHits = new Map<string, boolean>();
  files = new Map<string, string[] | null>();
  tokIdx: Map<string, number[]> | null = null;
  buildCfg: Map<string, { file: string; value: string }[]> | null = null;
  parts: Set<string> | null = null;
  nameIdx: Map<string, number[]> | null = null;
  fileSyms: Map<string, Symbol[]> | null = null;
  fileNorms = new Map<string, string>();
  fileList: string[] | null = null;
  routeRes = new Map<string, RegExp>();
  ignore: string[] | null = null;
  docImp = new Map<string, Map<string, string>>();
  constructor(public G: Graph, public F: Facts, public Dir: string) {}

  symbolText(s: Symbol): string {
    const v = this.norms.get(s.id);
    if (v !== undefined) return v;
    let lines = this.files.get(s.file);
    if (lines === undefined) {
      try {
        lines = fs.readFileSync(path.join(this.Dir, s.file), 'utf8').split('\n');
      } catch {
        lines = null;
      }
      this.files.set(s.file, lines);
    }
    if (!lines) {
      this.norms.set(s.id, '');
      return '';
    }
    const lo = Math.max(0, s.start_line - 1), hi = Math.min(lines.length, s.end_line);
    const t = normLit(lines.slice(lo, hi).join('\n'));
    this.norms.set(s.id, t);
    return t;
  }

  docImports(src: string): Map<string, string> {
    let m = this.docImp.get(src);
    if (m) return m;
    m = new Map();
    this.docImp.set(src, m);
    let text: string;
    try {
      text = fs.readFileSync(path.join(this.Dir, src), 'utf8');
    } catch {
      return m;
    }
    let self = '';
    try {
      self = String(JSON.parse(fs.readFileSync(path.join(this.Dir, 'package.json'), 'utf8')).name ?? '');
    } catch {
      self = '';
    }
    const external = (pkg: string) => !pkg.startsWith('.') && !pkg.startsWith('/') && (self === '' || (pkg !== self && !pkg.startsWith(self + '/')));
    for (const mm of text.matchAll(reDocImportES)) {
      if (!external(mm[4]!)) continue;
      const names = [mm[1] ?? '', mm[3] ?? ''];
      for (let n of (mm[2] ?? '').split(',')) {
        n = n.trim();
        const i = n.indexOf(' as ');
        if (i >= 0) n = n.slice(i + 4).trim();
        names.push(n);
      }
      for (const n of names) if (n) m.set(n, mm[4]!);
    }
    for (const mm of text.matchAll(reDocRequire)) if (external(mm[2]!)) m.set(mm[1]!, mm[2]!);
    return m;
  }

  gitignored(p: string): boolean {
    if (!this.ignore) {
      this.ignore = [];
      try {
        for (let l of fs.readFileSync(path.join(this.Dir, '.gitignore'), 'utf8').split('\n')) {
          l = l.trim();
          if (l && !l.startsWith('#') && !l.startsWith('!')) this.ignore.push(l.replace(/^\/+|\/+$/g, ''));
        }
      } catch {
        /* none */
      }
    }
    if (p.startsWith('./')) p = p.slice(2);
    const base = path.posix.basename(p);
    for (const pat of this.ignore) {
      if (pat === p || p.startsWith(pat + '/') || base === pat) return true;
      if (globMatch(pat, base)) return true;
      if (pat.endsWith('/' + base) && path.posix.basename(pat) === base) return true;
    }
    return false;
  }

  findFile(name: string): string {
    if (name.startsWith('./')) name = name.slice(2);
    const base = path.posix.basename(name);
    let found = '';
    const rec = (dir: string): boolean => {
      let ents: fs.Dirent[];
      try {
        ents = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return false;
      }
      ents.sort((a, b) => cmpStr(a.name, b.name));
      for (const e of ents) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (['.git', 'node_modules', 'wiki', '.kb-work'].includes(e.name)) continue;
          if (rec(p)) return true;
        } else if (e.name === base) {
          const rel = path.relative(this.Dir, p).split(path.sep).join('/');
          if (rel.endsWith(name)) {
            found = rel;
            return true;
          }
        }
      }
      return false;
    };
    rec(this.Dir);
    return found;
  }

  symsInFile(file: string): Symbol[] {
    if (!this.fileSyms) {
      this.fileSyms = new Map();
      for (const s of this.G.symbols) {
        const a = this.fileSyms.get(s.file);
        if (a) a.push(s);
        else this.fileSyms.set(s.file, [s]);
      }
    }
    return this.fileSyms.get(file) ?? [];
  }

  symFiles(): string[] {
    if (!this.fileList) this.fileList = [...new Set(this.G.symbols.map((s) => s.file))];
    return this.fileList;
  }

  fileNorm(file: string): string {
    let v = this.fileNorms.get(file);
    if (v === undefined) {
      try {
        v = normLit(fs.readFileSync(path.join(this.Dir, file), 'utf8'));
      } catch {
        v = '';
      }
      this.fileNorms.set(file, v);
    }
    return v;
  }

  routeRe(rid: string): RegExp {
    let re = this.routeRes.get(rid);
    if (!re) {
      re = new RegExp('\\b' + regexQuoteMeta(rid) + '\\b');
      this.routeRes.set(rid, re);
    }
    return re;
  }

  symAtLine(file: string, line: number): string {
    let best = '', span = 1 << 30;
    for (const s of this.symsInFile(file)) {
      if (s.start_line <= line && line <= s.end_line && s.end_line - s.start_line < span) {
        best = s.id;
        span = s.end_line - s.start_line;
      }
    }
    return best;
  }

  findSymbols(name: string): Symbol[] {
    if (name.endsWith('()')) name = name.slice(0, -2);
    if (!this.nameIdx) {
      this.nameIdx = new Map();
      this.G.symbols.forEach((s, i) => {
        const keys = new Set([s.name, s.qual]);
        for (let j = 0; j < s.qual.length; j++) if (s.qual[j] === '.') keys.add(s.qual.slice(j + 1));
        for (const k of keys) {
          const a = this.nameIdx!.get(k);
          if (a) a.push(i);
          else this.nameIdx!.set(k, [i]);
        }
      });
    }
    return (this.nameIdx.get(name) ?? []).map((i) => this.G.symbols[i]!);
  }

  tokenIndex(): Map<string, number[]> {
    if (this.tokIdx) return this.tokIdx;
    const idx = (this.tokIdx = new Map<string, number[]>());
    const byFile = new Map<string, number[]>();
    this.G.symbols.forEach((s, i) => {
      const a = byFile.get(s.file);
      if (a) a.push(i);
      else byFile.set(s.file, [i]);
    });
    for (const f of [...byFile.keys()].sort(cmpStr)) {
      const ids = byFile.get(f)!;
      this.symbolText(this.G.symbols[ids[0]!]!);
      const lines = this.files.get(f) ?? [];
      const owner = new Int32Array(lines.length + 1).fill(-1);
      const span = new Array<number>(lines.length + 1).fill(1 << 30);
      for (const i of ids) {
        const s = this.G.symbols[i]!;
        const sp = s.end_line - s.start_line;
        for (let l = Math.max(s.start_line, 1); l <= s.end_line && l <= lines.length; l++) {
          if (sp < span[l]!) {
            owner[l] = i;
            span[l] = sp;
          }
        }
      }
      for (let l = 1; l <= lines.length; l++) {
        const i = owner[l]!;
        if (i < 0) continue;
        const text = lines[l - 1]!;
        for (let p = 0; p < text.length; ) {
          if (!isTokChar(text[p]!)) {
            p++;
            continue;
          }
          let q = p;
          while (q < text.length && isTokChar(text[q]!)) q++;
          const t = text.slice(p, q);
          const lst = idx.get(t);
          if (!lst) idx.set(t, [i]);
          else if (lst[lst.length - 1] !== i) lst.push(i);
          p = q;
        }
      }
    }
    return idx;
  }

  tokenSearch(name: string): string {
    if (Buffer.byteLength(name) < 3) return '';
    const fm = reIdentTok.exec(name);
    if (!fm) return '';
    const first = fm[0];
    const cands = this.tokenIndex().get(first) ?? [];
    let re: RegExp | null = null;
    if (first !== name) re = new RegExp('(^|[^A-Za-z0-9_$])' + regexQuoteMeta(name) + '([^A-Za-z0-9_$]|$)');
    let best = '', span = 1 << 30;
    for (const i of cands) {
      const s = this.G.symbols[i]!;
      if (s.end_line - s.start_line >= span) continue;
      if (!re || re.test(this.symbolText(s))) {
        best = s.id;
        span = s.end_line - s.start_line;
      }
    }
    return best;
  }

  appScheme(scheme: string): boolean {
    if ((this.F.routes ?? []).some((r) => r.deeplink.startsWith(scheme + '://'))) return true;
    return Object.values(this.F.schemes ?? {}).some((ss) => ss.includes(scheme));
  }

  checkAPI(method: string, p: string, anchors: Set<string>, evidence: string[], st: { conflict: boolean; verified: boolean }): void {
    const np = normAPIPath(p);
    const apis = this.F.apis ?? [];
    if (apis.length === 0 || /\.(html?|md|json|js|png|svg)$/.test(np)) {
      evidence.push(`\`${(method + ' ' + p).trim()}\` 无法与接口事实比对（未抽取到 HTTP 接口或不是接口路径）`);
      return;
    }
    const same: API[] = [], other: API[] = [];
    for (const a of apis) {
      if (normAPIPath(a.path) === np) {
        if (method === '' || a.method === method) same.push(a);
        else other.push(a);
      }
    }
    const label = (method + ' ' + p).trim();
    if (same.length) {
      st.verified = true;
      const plats = new Set<string>();
      for (const a of same) {
        anchors.add(a.symbol);
        plats.add(a.platform);
      }
      evidence.push(`接口 \`${label}\` 存在（${sortedKeys(plats).join(', ')}）`);
    } else if (other.length) {
      st.conflict = true;
      evidence.push(`接口 \`${p}\` 在代码中的方法是 ${other[0]!.method}`);
    } else {
      st.conflict = true;
      evidence.push(`接口 \`${label}\` 在代码中不存在`);
    }
  }

  check(c: Claim): void {
    if (c.suspicious) {
      c.status = ClaimUnverifiable;
      delete c.anchors;
      delete c.route_ids;
      c.evidence = ['疑似 prompt injection（' + c.suspicious + '），不核对、不提升为知识'];
      return;
    }
    const anchors = new Set<string>();
    const routes = new Set<string>();
    const evidence: string[] = [];
    const st = { conflict: false, verified: false };
    let numericChecked = false;
    const text = c.text;
    const addRouteForSym = (id: string) => {
      const s = getSym(this.G, id);
      if (!s) return;
      for (const r of this.F.routes ?? []) if (r.file === s.file) routes.add(r.route_id);
    };
    const apiSeen = new Set<string>();
    for (const m of text.matchAll(reAPIG)) {
      apiSeen.add(normAPIPath(m[2]!));
      this.checkAPI(m[1]!, m[2]!, anchors, evidence, st);
    }
    for (const m of text.matchAll(reAPIPathG)) {
      if (!apiSeen.has(normAPIPath(m[1]!))) {
        apiSeen.add(normAPIPath(m[1]!));
        this.checkAPI('', m[1]!, anchors, evidence, st);
      }
    }
    for (const m of text.matchAll(reDeeplinkG)) {
      if (m[1] === 'http' || m[1] === 'https' || !this.appScheme(m[1]!)) continue;
      const pat = m[2]!.split('?')[0]!;
      if (/[<>]/.test(pat)) continue;
      let found = false;
      for (const r of this.F.routes ?? []) {
        if (r.deeplink.startsWith(m[1] + '://') && (normAPIPath(r.pattern) === normAPIPath(pat) || (pat === '' && r.pattern !== ''))) {
          found = true;
          anchors.add(r.symbol);
          routes.add(r.route_id);
        }
      }
      if (found) {
        st.verified = true;
        evidence.push(`deeplink \`${m[1]}://${pat}\` 存在`);
      } else {
        st.conflict = true;
        evidence.push(`代码中没有 deeplink \`${m[1]}://${pat}\``);
      }
    }
    const nums: string[] = text.replace(reCodeG, '').match(reNumberG) ?? [];
    for (const mm of text.matchAll(reCodeG)) {
      const start = mm.index!;
      const span = mm[1]!.trim();
      const before = text.slice(0, start).replace(/ +$/, '');
      const example = reExample.test(before);
      if (span === '' || reAPIPath.test(span) || span.includes('://') || apiSeen.has(normAPIPath(span))) continue;
      if (span.startsWith('GET ') || span.startsWith('POST ')) continue;
      let matchedTid = false;
      for (const t of this.F.testids ?? []) {
        if (t.tid === span || (t.tid.endsWith('_') && span.startsWith(t.tid))) {
          matchedTid = true;
          const id = this.symAtLine(t.file, t.line);
          if (id) anchors.add(id);
          if (t.route_id) routes.add(t.route_id);
        }
      }
      if (matchedTid) {
        st.verified = true;
        evidence.push(`testID \`${span}\` 存在`);
        continue;
      }
      let matchedRoute = false;
      for (const r of this.F.routes ?? []) {
        if (r.route_id === span || r.pattern === span) {
          matchedRoute = true;
          anchors.add(r.symbol);
          routes.add(r.route_id);
        }
      }
      if (matchedRoute) {
        st.verified = true;
        evidence.push(`路由 \`${span}\` 存在`);
        continue;
      }
      if (reFileName.test(span)) {
        const f = this.findFile(span);
        if (f) {
          st.verified = true;
          evidence.push(`文件 \`${span}\` 存在（${f}）`);
        } else if (rePlaceholderPath.test(span)) evidence.push(`\`${span}\` 是带占位符的路径模板，不核对`);
        else if (reCreate.test(before)) evidence.push(`文件 \`${span}\` 由读者新建（文档要求创建），不算冲突`);
        else if (this.gitignored(span)) evidence.push(`文件 \`${span}\` 不在仓库中，但被 .gitignore 忽略（密钥/生成文件），不算冲突`);
        else {
          st.conflict = true;
          evidence.push(`文件 \`${span}\` 在仓库中不存在`);
        }
        continue;
      }
      if (reIdentLike.test(span)) {
        const syms = this.findSymbols(span);
        if (syms.length === 0) {
          const name = span.endsWith('()') ? span.slice(0, -2) : span;
          const generic = name.length < 5 && name.toLowerCase() === name && !/[_.]/.test(name);
          const hit = this.tokenSearch(name);
          if (hit && !generic) {
            st.verified = true;
            anchors.add(hit);
            addRouteForSym(hit);
            evidence.push(`\`${span}\` 出现在代码中（${hit}）`);
            continue;
          }
          if (example) {
            evidence.push(`\`${span}\` 是文档举的示例名，不要求存在`);
            continue;
          }
          const first = name.split('.')[0]!;
          const pkg = this.docImports(c.source).get(first);
          if (pkg) {
            evidence.push(`\`${span}\` 由文档示例代码从外部包 \`${pkg}\` 导入，不在本仓库中`);
            continue;
          }
          if (name.includes('.') && isPascal(first) && !builtinTypes.has(first) && this.tokenSearch(first) === '' && this.findSymbols(first).length === 0) {
            st.conflict = true;
            evidence.push(`符号 \`${span}\` 在代码中不存在（类型 \`${first}\` 也不存在）`);
          } else if (this.missingProjectType(text, span)) {
            st.conflict = true;
            evidence.push(`\`${span}\` 在代码中不存在（项目里同类命名的类型/函数都找得到，这个找不到）`);
          } else if (this.missingTestID(text, span)) {
            st.conflict = true;
            evidence.push(`文档称 \`${span}\` 是 testID，但三端代码中都没有它`);
          } else if (looksLikeCodeIdent(span)) evidence.push(`\`${span}\` 在代码中找不到（无法确定性判断）`);
          continue;
        }
        let valueChecked = false;
        for (const s of syms) {
          anchors.add(s.id);
          addRouteForSym(s.id);
          if (s.value && nums.length > 0 && isInt(s.value)) {
            valueChecked = numericChecked = true;
            if (nums.includes(s.value)) evidence.push(`\`${s.qual}\` = ${s.value}（${s.platform}）与文档一致`);
            else {
              st.conflict = true;
              evidence.push(`代码中 \`${s.qual}\` = ${s.value}（${s.platform}），文档写的是 ${nums.join('/')}`);
            }
          }
        }
        if (!valueChecked) evidence.push(`符号 \`${span}\` 存在（${syms.length} 处）`);
        st.verified = true;
        continue;
      }
      const lit = normLit(span);
      if (Buffer.byteLength(lit) < 4) continue;
      let hits: string[] = [];
      for (const file of this.symFiles()) {
        if (!this.fileNorm(file).includes(lit)) continue;
        for (const s of this.symsInFile(file)) if (!containerKinds.has(s.kind) && this.symbolText(s).includes(lit)) hits.push(s.id);
      }
      hits.sort(cmpStr);
      if (hits.length) {
        if (hits.length > 3) hits = hits.slice(0, 3);
        for (const h of hits) {
          anchors.add(h);
          addRouteForSym(h);
        }
        st.verified = true;
        evidence.push(`字面量 \`${span}\` 出现在 ${hits.join(', ')}`);
      }
    }
    for (const r of this.F.routes ?? []) if (r.route_id.length > 3 && text.includes(r.route_id) && this.routeRe(r.route_id).test(text)) routes.add(r.route_id);
    const vr = valueRules(this, c, numericChecked);
    if (vr.conflict || vr.verified) {
      st.conflict ||= vr.conflict;
      st.verified ||= vr.verified;
      evidence.push(...vr.evidence);
      for (const a of vr.anchors) anchors.add(a);
    }
    if (st.conflict && historicalDoc(c.source)) {
      st.conflict = false;
      evidence.push('计划/归档文档描述的是将来或过去的状态，不判为冲突');
    }
    if (st.conflict) c.status = ClaimConflict;
    else if (st.verified) c.status = ClaimVerified;
    else {
      c.status = ClaimUnverifiable;
      evidence.push('没有可确定性校验的锚点（需要 LLM 语义核对）');
    }
    c.anchors = sortedKeys(anchors);
    c.route_ids = sortedKeys(routes);
    c.evidence = evidence;
  }

  missingTestID(text: string, span: string): boolean {
    return (this.F.testids?.length ?? 0) > 0 && /test ?id|testTag|accessibilityIdentifier/i.test(text) && /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(span) && this.tokenSearch(span) === '';
  }

  missingProjectType(text: string, span: string): boolean {
    if (text.includes('/' + span + ')') || text.includes('/' + span + '/') || text.includes('(' + span + ')')) return false;
    if (/[.()]/.test(span) || !isPascal(span) || builtinTypes.has(span)) return false;
    let humps = 0;
    for (const r of span) if (r >= 'A' && r <= 'Z') humps++;
    const sm = /(Builder|ViewModel|View|Screen|Page|Store|Manager|Service|Repository|Activity|Fragment|Controller|Ability|Client|Adapter|Presenter|Router|Provider|Handler|Helper)$/.exec(span);
    const suf = sm ? sm[0] : '';
    if (humps < 2 || suf === '' || suf === span) return false;
    if (this.pathParts().has(span)) return false;
    for (const s of this.G.symbols) {
      if (s.name !== span && s.name.endsWith(suf) && isPascal(s.name)) return this.tokenSearch(span) === '' && this.findSymbols(span).length === 0;
    }
    return false;
  }

  pathParts(): Set<string> {
    if (this.parts) return this.parts;
    const parts = (this.parts = new Set<string>());
    const add = (f: string) => {
      for (const p of f.split('/')) parts.add(p.slice(0, p.length - path.posix.extname(p).length));
    };
    for (const f of Object.keys(this.G.files)) add(f);
    for (const s of this.G.symbols) add(s.file);
    return parts;
  }
}

/** path.Match for simple shell globs (* ? [..]). */
export function globMatch(pat: string, name: string): boolean {
  let re = '^';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i]!;
    if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '[') {
      const j = pat.indexOf(']', i + 1);
      if (j < 0) return false;
      let cls = pat.slice(i + 1, j);
      if (cls.startsWith('^')) cls = '^' + cls.slice(1).replace(/\\/g, '\\\\');
      re += '[' + cls.replace(/\\(?!\\)/g, '\\\\') + ']';
      i = j;
    } else if (c === '\\' && i + 1 < pat.length) re += regexQuoteMeta(pat[++i]!);
    else re += regexQuoteMeta(c);
  }
  try {
    return new RegExp(re + '$').test(name);
  } catch {
    return false;
  }
}
