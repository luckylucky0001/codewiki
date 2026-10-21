// Deterministic, machine-readable facts (routes, testIDs, APIs, deep-link
// schemes, entry points, navigation) derived from a scan result plus platform
// resource files. Output schema is the e2epilot interchange format (v1).
import fs from 'node:fs';
import path from 'node:path';
import type { Config, Platform } from '../config/config.js';
import { shadowed, uikitEnabled } from '../config/config.js';
import type { Facts, Graph, Route, Symbol, API, Entry } from '../model.js';
import { getSym } from '../model.js';
import type { Arg, Call, Part } from '../extract/extract.js';
import type { ScanResult } from '../scan/scan.js';
import { walkDir } from '../scan/scan.js';
import { cmpStr, cut, trimChars, trimPrefix, trimSuffix, trimSpace } from '../util/go.js';
import { xmlTokens } from './xml.js';

/** A deep link declared by the app (manifest intent-filter, plist URL scheme, applinks entitlement,
 * module.json5 skills.uris, nav-graph deepLink or an in-code URL route table). */
export interface DeepLink {
  platform: string;
  scheme: string;
  host: string;
  path: string;
  file: string;
  source: string;
  route_id?: string;
}

/** Route plus the schema-compatible additions: `name` (bare type / page name) and declared `deeplinks`. */
export type RouteX = Route & { name?: string; deeplinks?: string[] };

/** Facts plus the declared deep links (written to facts/deeplinks.json). */
export type FactsX = Facts & { deeplinks?: DeepLink[] };

export function linkString(d: { scheme: string; host: string; path: string }): string {
  if (!d.scheme) return d.path;
  return d.scheme + '://' + d.host + d.path;
}

/** Supertype names (last segment, generics and constructor args stripped) of a class-like symbol. */
export function supertypes(s: { lang: string; signature: string }): string[] {
  const sig = s.signature;
  // cut the declaration head at the first '{' outside parentheses (annotations may hold braces)
  let depth = 0, end = sig.length;
  for (let i = 0; i < sig.length; i++) {
    const c = sig[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === '{' && depth === 0) {
      end = i;
      break;
    }
  }
  const head = sig.slice(0, end);
  const out: string[] = [];
  const push = (t: string) => {
    t = t.replace(/<[^]*$/, '').replace(/\(.*$/s, '').trim();
    const m = /([A-Za-z_][\w.]*)\s*$/.exec(t);
    if (m) out.push(lastSeg(m[1]!));
  };
  if (s.lang === 'java' || s.lang === 'arkts' || s.lang === 'typescript' || s.lang === 'javascript') {
    const m = /\bextends\s+([\w.]+)/.exec(head);
    if (m) out.push(lastSeg(m[1]!));
    const im = /\bimplements\s+([^]+)$/.exec(head);
    if (im) for (const t of splitTop(im[1]!)) push(t);
    return out;
  }
  // kotlin / swift: types after the first ':' at depth 0 (skipping annotation args / primary constructor)
  depth = 0;
  for (let i = 0; i < head.length; i++) {
    const c = head[i];
    if (c === '(' || c === '<' || c === '[') depth++;
    else if (c === ')' || c === '>' || c === ']') depth--;
    else if (c === ':' && depth === 0) {
      let rest = head.slice(i + 1);
      const w = rest.search(/\bwhere\b/);
      if (w >= 0) rest = rest.slice(0, w);
      for (const t of splitTop(rest)) push(t);
      break;
    }
  }
  return out;
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const c of s) {
    if (c === '(' || c === '<' || c === '[') depth++;
    else if (c === ')' || c === '>' || c === ']') depth--;
    if (c === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

interface StrVal {
  s: string;
  dynamic: boolean;
  prefix: string;
}

const isUpperCh = (c: string | undefined) => !!c && /\p{Lu}/u.test(c);
const isLowerCh = (c: string | undefined) => !!c && /\p{Ll}/u.test(c);

/** CamelCase / UPPER_CASE -> snake_case. */
export function snake(s: string): string {
  if (s.toUpperCase() === s) return s.toLowerCase();
  const rs = [...s];
  let b = '';
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i]!;
    if (isUpperCh(r)) {
      if (i > 0 && (isLowerCh(rs[i - 1]) || (i + 1 < rs.length && isLowerCh(rs[i + 1])))) b += '_';
      b += r.toLowerCase();
    } else b += r;
  }
  return b;
}

/** snake_case -> PascalCase. */
export function pascal(s: string): string {
  let b = '';
  for (const w of s.split('_')) {
    if (!w) continue;
    b += w[0]!.toUpperCase() + w.slice(1);
  }
  return b;
}

export function lastSeg(s: string): string {
  const i = s.lastIndexOf('.');
  return i >= 0 ? s.slice(i + 1) : s;
}

function slugPattern(p: string): string {
  const segs = p.split('/').filter((s) => s !== '' && !s.startsWith('{'));
  if (p.includes('{')) segs.push('detail');
  return segs.join('_');
}

export function isTestPath(p: string): boolean {
  const l = p.toLowerCase();
  return l.includes('/test/') || l.includes('/androidtest/') || l.includes('tests/') || l.includes('/ohostest/') || l.endsWith('test.kt') || l.endsWith('tests.swift');
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

function constLikeRef(ref: string): boolean {
  if (!ref) return false;
  if (ref.includes('.')) return true;
  return ref.toUpperCase() === ref || isUpperCh([...ref][0]);
}

function refRouteID(ref: string): string {
  const segs = ref.split('.');
  let last = segs[segs.length - 1]!;
  switch (last.toLowerCase()) {
    case 'route':
    case 'navroute':
    case 'path':
    case 'routename':
    case 'name':
    case 'destination':
      if (segs.length > 1) last = segs[segs.length - 2]!;
  }
  return snake(last);
}

function lowerFirst(s: string): string {
  if (!s) return s;
  const r = [...s];
  r[0] = r[0]!.toLowerCase();
  return r.join('');
}

const reValParam = /\b(?:val|var)\s+([A-Za-z_]\w*)\s*:/g;
const reCaseParam = /([A-Za-z_]\w*)\s*:/g;
const reRouteTableName = /routes?$|routeTable$|routeMap$/i;
const reRouteTableEntry = /"(\/[\w\-./:{}]*)"\s*(?::|to)\s*(?:::)?([A-Za-z_]\w*)/g;
const reColonParam = /:([A-Za-z_]\w*)/g;

function caseParams(sig: string): string {
  const i = sig.indexOf('(');
  if (i < 0) return '';
  let out = '';
  for (const m of sig.slice(i).matchAll(reCaseParam)) out += '/{' + m[1] + '}';
  return out;
}

const json5Comment = /^[ \t\r\f\v]*\/\/.*$|\/\*[\s\S]*?\*\//gm;
const json5Key = /([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g;
const json5Trail = /,(\s*[}\]])/g;

/** Convert the JSON5 subset used by HarmonyOS configs to JSON. */
export function json5(s: string): string {
  // Go's (?m)^\s* also matches newlines in \s; emulate with a multiline pass
  s = s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  void json5Comment;
  s = s.replace(json5Key, '$1"$2":');
  s = s.replace(json5Trail, '$1');
  return s.replaceAll("'", '"');
}

const nonAppSchemes = new Set(['http', 'https', 'file', 'content', 'mailto', 'tel', 'data', 'geo', 'sms']);

const httpMethods = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']);
const hostRe = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*/;
const leadParamRe = /^\{[A-Za-z_][\w]*\}(\/|$)/;
const clientRecvRe = /(client|http|axios|session|instance|ktor|request|api)\w*(\(\))?$/i;
const httpVarRecvRe = /http\w*$/i;
const swiftCaseRe = /case\s+((?:\.\w+[^:]*?,?\s*)+):\s*(?:return\s+)?(\.\w+|"(?:[^"\\]|\\.)*")/g;
const staticAssetRe = /\.(png|jpe?g|gif|webp|svg|bmp|ico|mp3|mp4|m4a|wav|webm|mov|ttf|otf|woff2?|css|js|zip|apk|hap|pdf)$/i;
const endpointArgRe = /^\.?(?:(\w+)\.)?(\w+)/;
const swiftCaseName = /\.(\w+)/g;
const swiftInterpRe = /\\\((?:[^()]*\.)?(\w+)[^()]*\)/g;
const swiftDefault = /default:\s*return\s+(\.\w+)/;

function normPath(s: string): [string, boolean] {
  s = s.replace(hostRe, '');
  while (leadParamRe.test(s)) s = s.replace(leadParamRe, '/');
  const i = s.search(/[?#]/);
  if (i >= 0) s = s.slice(0, i);
  s = s.replaceAll('//', '/');
  if (!s.startsWith('/') || s.length < 2) return ['', false];
  return [s, true];
}

// UIKit
const vcBases = new Set(['UIViewController', 'UITableViewController', 'UICollectionViewController', 'UIHostingController', 'UIPageViewController', 'NSViewController']);
const vcContainers = new Set([
  'UINavigationController', 'UITabBarController', 'UISplitViewController', 'UIAlertController', 'UISearchController', 'UIActivityViewController',
  'UIImagePickerController', 'UIDocumentPickerViewController', 'SFSafariViewController', 'NSWindowController', 'NSSplitViewController', 'NSTabViewController',
]);
const reIdent = /^[a-z_]\w*$/;
const reLocalAssign = /\b(?:let|var)\s+(\w+)\s*(?::\s*([^=\n]+?))?\s*=\s*([^\n]+)/gm;
const reTypeName = /\b[A-Z]\w*/g;
// child / embedded controllers by name: accessory & cell controllers and context-menu / peek previews
// (name heuristic: a last resort, used only when nothing navigates to the controller)
const reChildName = /(Accessory|Cell|Preview)(View)?Controller$/;

export function superclassOf(sig: string): string {
  let head = sig;
  const b = head.indexOf('{');
  if (b >= 0) head = head.slice(0, b);
  const lt = head.indexOf('<');
  if (lt >= 0 && lt < (head + ':').indexOf(':')) {
    let depth = 0;
    for (let j = lt; j < head.length; j++) {
      if (head[j] === '<') depth++;
      else if (head[j] === '>') {
        depth--;
        if (depth === 0) {
          head = head.slice(0, lt) + head.slice(j + 1);
          break;
        }
      }
    }
  }
  const i = head.indexOf(':');
  if (i < 0) return '';
  const rest = trimSpace(head.slice(i + 1));
  let end = rest.length;
  for (let j = 0; j < rest.length; j++) {
    const r = rest[j];
    if (r === ',' || r === '<' || r === ' ' || r === '\n' || r === '{') {
      end = j;
      break;
    }
  }
  return lastSeg(rest.slice(0, end));
}

function screenID(name: string): string {
  let base = name;
  for (const suf of ['ViewController', 'Controller', 'VC']) {
    if (base.endsWith(suf) && base.length > suf.length) {
      base = base.slice(0, -suf.length);
      break;
    }
  }
  return snake(base);
}

function soleScreen(platform: string, expr: string, screens: Map<string, Symbol>): string {
  let found = '';
  for (const m of expr.matchAll(reTypeName)) {
    const n = m[0];
    if (!screens.has(platform + '|' + n)) continue;
    if (found !== '' && found !== n) return '';
    found = n;
  }
  return found;
}

const skipResDir = (n: string) => n === 'build' || n === 'node_modules' || n === 'oh_modules' || n === 'Pods';

class Ctx {
  consts = new Map<string, Map<string, string>>();
  byName = new Map<string, Symbol[]>();
  f: Facts;
  mainPageIDs = new Map<string, string>();
  declared = new Set<string>();
  lineCache = new Map<string, string[]>();
  noDerive = new WeakSet<Route>();
  classes: Map<string, Symbol> | null = null;
  subs: Map<string, number> | null = null;
  activities: { platform: string; name: string; file: string; links: DeepLink[] }[] = [];
  topByFile: Map<string, Symbol[]> | null = null;
  g: Graph;
  private files: string[] | null = null;
  constructor(public cfg: Config, public res: ScanResult) {
    this.g = res.graph;
    this.f = { routes: [], testids: [], apis: [], schemes: {} };
    for (const s of this.g.symbols) {
      const k = s.platform + '\0' + s.name;
      const a = this.byName.get(k);
      if (a) a.push(s);
      else this.byName.set(k, [s]);
      if (s.value) {
        let m = this.consts.get(s.platform);
        if (!m) {
          m = new Map();
          this.consts.set(s.platform, m);
        }
        m.set(s.name, s.value);
        if (s.parent) {
          const p = getSym(this.g, s.parent);
          if (p) m.set(p.name + '.' + s.name, s.value);
        }
      }
    }
  }

  get schemes(): Record<string, string[]> {
    return this.f.schemes!;
  }

  eval(platform: string, parts: Part[] | undefined): [StrVal, boolean] {
    let b = '';
    const v: StrVal = { s: '', dynamic: false, prefix: '' };
    let any = false;
    for (const p of parts ?? []) {
      if (p.lit) {
        b += p.lit;
        any = true;
      } else if (p.ref) {
        const [val, ok] = this.lookup(platform, p.ref);
        if (ok) {
          b += val;
          any = true;
        } else {
          if (!v.dynamic) v.prefix = b;
          v.dynamic = true;
          b += '{' + lastSeg(p.ref) + '}';
        }
      } else {
        if (!v.dynamic) v.prefix = b;
        v.dynamic = true;
        b += '{' + (p.param || 'param') + '}';
      }
    }
    v.s = b;
    if (!v.dynamic) v.prefix = v.s;
    return [v, any];
  }

  lookup(platform: string, ref: string): [string, boolean] {
    const m = this.consts.get(platform);
    if (!m) return ['', false];
    ref = trimPrefix(ref, 'this.');
    const v = m.get(ref);
    if (v !== undefined) return [v, true];
    const segs = ref.split('.');
    if (segs.length >= 2) {
      const w = m.get(segs[segs.length - 2] + '.' + segs[segs.length - 1]);
      if (w !== undefined) return [w, true];
    }
    return ['', false];
  }

  findSym(platform: string, name: string, ...kinds: string[]): Symbol | undefined {
    let best: Symbol | undefined;
    let bestScore = -1;
    for (const s of this.byName.get(platform + '\0' + name) ?? []) {
      if (kinds.length && !kinds.includes(s.kind)) continue;
      let score = 0;
      if (!isTestPath(s.file)) score += 2;
      if (!s.parent) score++;
      if (score > bestScore) {
        best = s;
        bestScore = score;
      }
    }
    return best;
  }

  findSymNear(platform: string, name: string, near: string, ...kinds: string[]): Symbol | undefined {
    let best = this.findSym(platform, name, ...kinds);
    const cands = this.byName.get(platform + '\0' + name) ?? [];
    if (!best || cands.length < 2) return best;
    let bestScore = -1;
    for (const s of cands) {
      if (kinds.length && !kinds.includes(s.kind)) continue;
      let score = commonPrefix(s.file, near) * 4;
      if (!isTestPath(s.file)) score += 2;
      if (!s.parent) score++;
      if (score > bestScore) {
        best = s;
        bestScore = score;
      }
    }
    return best;
  }

  deeplink(platform: string, pattern: string): string {
    const sc = this.schemes[platform];
    return sc && sc.length ? sc[0] + '://' + pattern : '';
  }

  sortedFiles(): string[] {
    if (!this.files) this.files = Object.keys(this.res.calls).sort(cmpStr);
    return this.files;
  }

  calls(file: string): Call[] {
    return this.res.calls[file] ?? [];
  }

  symbolSource(s: Symbol): string {
    let b: string;
    try {
      b = fs.readFileSync(path.join(this.res.dir, s.file), 'utf8');
    } catch {
      return '';
    }
    const lines = b.split('\n');
    const lo = s.start_line - 1, hi = s.end_line;
    if (lo < 0 || hi > lines.length || lo >= hi) return '';
    return lines.slice(lo, hi).join('\n');
  }

  // ---------- routes ----------

  routes(): void {
    const seen = new Map<string, number>();
    const weak = new Map<number, boolean>();
    const routes = this.f.routes!;
    const addAt = (r: Route, site: string, resolved: boolean) => {
      const k = r.platform + '|' + r.route_id + '|' + r.pattern + '|' + site;
      const i = seen.get(k);
      if (i !== undefined) {
        if (weak.get(i) && resolved) {
          routes[i] = r;
          weak.set(i, false);
        }
        return;
      }
      seen.set(k, routes.length);
      weak.set(routes.length, !resolved);
      routes.push(r);
    };
    const add = (r: Route) => addAt(r, '', true);
    const R = (platform: string, route_id: string, pattern: string, file: string, symbol: string, deeplink = ''): Route => ({ platform, route_id, pattern, deeplink, file, symbol });
    for (const file of this.sortedFiles()) {
      const fi = this.g.files[file]!;
      for (const call of this.calls(file)) {
        if (fi.lang === 'kotlin' && call.type_args?.length === 1 && (call.callee === 'composable' || call.callee === 'entry' || call.callee === 'dialog')) {
          const r = this.typedRoute(fi.platform, file, call);
          addAt(r, file, r.symbol !== call.enclosing);
          continue;
        }
        if (fi.lang !== 'kotlin' || call.callee !== 'composable' || !call.args?.length) continue;
        let a: Arg = call.args[0]!;
        for (const x of call.args) if (x.label === 'route') a = x;
        let ref = '';
        if (a.parts?.length === 1 && a.parts[0]!.ref) ref = a.parts[0]!.ref;
        if (ref !== '' && !constLikeRef(ref)) continue;
        let [v, ok] = this.eval(fi.platform, a.parts);
        if ((!ok || v.dynamic) && ref === '') continue;
        if (!ok || v.dynamic) v = { s: refRouteID(ref), dynamic: false, prefix: '' };
        let rid = slugPattern(v.s);
        if (ref !== '') rid = refRouteID(ref);
        let sym = call.enclosing, sfile = file;
        for (const inn of call.inner ?? []) {
          if (inn.endsWith('Screen')) {
            const s = this.findSymNear(fi.platform, inn, file, 'composable', 'function');
            if (s) {
              sym = s.id;
              sfile = s.file;
              break;
            }
          }
        }
        addAt(R(fi.platform, rid, v.s, sfile, sym, this.deeplink(fi.platform, v.s)), file, sym !== call.enclosing);
      }
    }
    const destEnums = new Set<string>();
    const isEnum = (platform: string, name: string) => this.findSym(platform, name, 'enum') !== undefined;
    for (const file of this.sortedFiles()) {
      const fi = this.g.files[file]!;
      if (fi.lang !== 'swift') continue;
      for (const call of this.calls(file)) {
        if (call.callee === 'navigationDestination') {
          for (const a of call.args ?? []) {
            if (a.label !== 'for' || !a.text.endsWith('.self')) continue;
            const t = trimSuffix(a.text, '.self');
            if (isEnum(fi.platform, lastSeg(t))) {
              destEnums.add(lastSeg(t));
              continue;
            }
            const segs = t.split('.');
            let base = segs[segs.length - 1]!;
            if ((base === 'ID' || base === 'Id') && segs.length > 1) base = segs[segs.length - 2]!;
            if (['', 'String', 'Int', 'UUID', 'AnyHashable', 'Destination', 'Route', 'Routes', 'Path', 'Screen', 'Page'].includes(base)) continue;
            const v = this.swiftView(fi.platform, call.inner ?? []);
            if (!v) continue;
            add(R(fi.platform, snake(base), snake(base) + '/{' + lowerFirst(base) + '}', v.file, v.id));
          }
        } else if (call.callee === 'NavigationLink') {
          for (const a of call.args ?? []) {
            if (a.label === 'value') {
              const segs = trimPrefix(a.text, '.').split('.');
              if (segs.length === 2 && isEnum(fi.platform, segs[0]!)) destEnums.add(segs[0]!);
            } else if (a.label === 'destination') {
              const [name, , ok] = cut(a.text, '(');
              if (!ok || name === '' || !isUpperCh([...name][0]) || /[. ]/.test(name)) continue;
              const v = this.findSym(fi.platform, name, 'struct', 'class');
              if (!v) continue;
              let rid = name;
              for (const suf of ['View', 'Screen', 'ViewController']) {
                if (rid.endsWith(suf) && rid.length > suf.length) {
                  rid = rid.slice(0, -suf.length);
                  break;
                }
              }
              add(R(fi.platform, snake(rid), snake(rid), v.file, v.id));
            }
          }
        }
      }
    }
    for (const s of this.g.symbols) {
      if (s.lang !== 'swift' || s.kind !== 'case' || !s.parent) continue;
      const p = getSym(this.g, s.parent);
      if (!p || p.kind !== 'enum') continue;
      const isRouteEnum = !!s.value && p.name.toLowerCase().includes('route');
      if (!isRouteEnum && !destEnums.has(p.name)) continue;
      const rid = snake(s.name);
      let sym = s.id, file = s.file;
      const v = this.findSym(s.platform, pascal(rid) + 'View', 'struct', 'class');
      if (v) {
        sym = v.id;
        file = v.file;
      }
      if (!s.value) add(R(s.platform, rid, rid + caseParams(s.signature), file, sym));
      else add(R(s.platform, rid, s.value, file, sym, this.deeplink(s.platform, s.value)));
    }
    for (const sym of this.g.symbols) {
      if ((sym.lang !== 'swift' && sym.lang !== 'kotlin') || sym.parent || !reRouteTableName.test(sym.name)) continue;
      if (!['property', 'variable', 'constant', 'val', 'var'].includes(sym.kind)) continue;
      for (const m of this.symbolSource(sym).matchAll(reRouteTableEntry)) {
        const p = trimPrefix(m[1]!, '/'), handler = m[2]!;
        if (!p) continue;
        const pattern = p.replace(reColonParam, '{$1}');
        const r: RouteX = R(sym.platform, snake(handler), pattern, sym.file, sym.id);
        r.deeplinks = ['/' + p];
        this.declare({ platform: sym.platform, scheme: '', host: '', path: '/' + p, file: sym.file, source: 'route-table', route_id: r.route_id });
        const h = this.findSymNear(sym.platform, handler, sym.file, 'function', 'method');
        if (h) {
          r.file = h.file;
          r.symbol = h.id;
        }
        add(r);
      }
    }
    const known = new Set<string>();
    for (const r of routes) known.add(r.platform + '|' + r.route_id);
    for (const file of this.sortedFiles()) {
      const fi = this.g.files[file]!;
      if (fi.lang !== 'arkts' && fi.lang !== 'typescript') continue;
      for (const call of this.calls(file)) {
        if ((call.callee !== 'pushPathByName' && call.callee !== 'replacePathByName' && call.callee !== 'pushDestinationByName') || !call.args?.length) continue;
        const parts = call.args[0]!.parts ?? [];
        if (parts.length === 1 && parts[0]!.ref && !constLikeRef(parts[0]!.ref)) continue;
        const [v, ok] = this.eval(fi.platform, parts);
        if (!ok || v.dynamic || v.s === '' || /["' /]/.test(v.s) || known.has(fi.platform + '|' + v.s)) continue;
        known.add(fi.platform + '|' + v.s);
        const r = R(fi.platform, v.s, v.s, '', '');
        resolve: for (const kinds of [['component'], ['struct', 'class']]) {
          for (const cand of [v.s, v.s + 'Page', v.s + 'View', pascal(v.s), pascal(v.s) + 'Page']) {
            const sym = this.findSym(fi.platform, cand, ...kinds);
            if (sym) {
              r.symbol = sym.id;
              r.file = sym.file;
              break resolve;
            }
          }
        }
        if (r.symbol === '') r.file = file;
        add(r);
      }
    }
    // Appyx: when leaf nodes are declared (@ContributesNode) they are the pages (screenRoutes); the
    // flow-level NavTargets (placeholders, loading states, sub-flows) are then not emitted as routes
    const appyxLeaves = new Set<string>();
    for (const s of this.g.symbols) if (s.lang === 'kotlin' && s.signature.includes('@ContributesNode')) appyxLeaves.add(s.platform);
    for (const sym of this.g.symbols) {
      if (sym.lang !== 'kotlin' || !sym.parent || (sym.kind !== 'class' && sym.kind !== 'object') || appyxLeaves.has(sym.platform)) continue;
      const nt = getSym(this.g, sym.parent);
      if (!nt || nt.name !== 'NavTarget' || nt.kind !== 'interface' || !nt.signature.includes('sealed')) continue;
      let flow = '';
      if (nt.parent) {
        const fl = getSym(this.g, nt.parent);
        if (fl) {
          flow = fl.name;
          for (const suf of ['FlowNode', 'Node']) {
            if (flow.endsWith(suf) && flow.length > suf.length) {
              flow = flow.slice(0, -suf.length);
              break;
            }
          }
        }
      }
      let rid = snake(sym.name);
      if (flow) rid = snake(flow) + '_' + rid;
      let pattern = rid;
      for (const m of sym.signature.matchAll(reValParam)) pattern += '/{' + m[1] + '}';
      add(R(sym.platform, rid, pattern, sym.file, sym.id));
    }
    const covered = new Set<string>();
    for (const r of routes) covered.add(r.file);
    for (const file of this.sortedFiles()) {
      const fi = this.g.files[file]!;
      if (fi.lang !== 'arkts' || covered.has(file)) continue;
      for (const call of this.calls(file)) {
        if (!call.callee.endsWith('NavDestination')) continue;
        let top = getSym(this.g, call.enclosing);
        while (top && top.parent) top = getSym(this.g, top.parent);
        if (!top || top.kind !== 'component' || isTestPath(file)) continue;
        covered.add(file);
        add(R(fi.platform, top.name, top.name, file, top.id));
        break;
      }
    }
  }

  // ---------- class-based screens (activities, fragments, Circuit, Appyx, SwiftUI, AppKit, ArkTS decorators) ----------

  classIndex(): Map<string, Symbol> {
    if (this.classes) return this.classes;
    const m = new Map<string, Symbol>();
    for (const s of this.g.symbols) {
      if (!['class', 'object', 'interface', 'struct', 'protocol', 'enum'].includes(s.kind)) continue;
      const k = s.platform + '|' + s.name;
      const prev = m.get(k);
      if (!prev || (isTestPath(prev.file) && !isTestPath(s.file)) || (prev.parent && !s.parent && !isTestPath(s.file))) m.set(k, s);
    }
    this.classes = m;
    return m;
  }

  /** Does `name` (a class on `platform`) inherit, directly or transitively, from one of `bases`? */
  inherits(platform: string, name: string, bases: Set<string>, depth = 0, seen = new Set<string>()): string {
    if (bases.has(name)) return name;
    if (depth > 12 || seen.has(name)) return '';
    seen.add(name);
    const cl = this.classIndex().get(platform + '|' + name);
    if (!cl) return '';
    for (const sup of supertypes(cl)) {
      const hit = this.inherits(platform, sup, bases, depth + 1, seen);
      if (hit) return hit;
    }
    return '';
  }

  subclassCounts(): Map<string, number> {
    if (this.subs) return this.subs;
    const m = new Map<string, number>();
    for (const s of this.g.symbols) {
      if (!['class', 'object', 'struct'].includes(s.kind) || isTestPath(s.file)) continue;
      for (const sup of supertypes(s)) m.set(s.platform + '|' + sup, (m.get(s.platform + '|' + sup) ?? 0) + 1);
    }
    this.subs = m;
    return m;
  }

  screenRoutes(): void {
    const routes = this.f.routes as RouteX[];
    const have = new Set<string>();
    for (const r of routes) have.add(r.platform + '|' + r.symbol);
    const add = (s: Symbol, rid = s.name, pattern = rid, links: DeepLink[] = []) => {
      if (have.has(s.platform + '|' + s.id)) {
        if (links.length) {
          const r = routes.find((x) => x.platform === s.platform && x.symbol === s.id);
          if (r) r.deeplinks = [...new Set([...(r.deeplinks ?? []), ...links.map(linkString)])];
        }
        return;
      }
      have.add(s.platform + '|' + s.id);
      const r: RouteX = { platform: s.platform, route_id: rid, pattern, deeplink: '', file: s.file, symbol: s.id };
      if (links.length) r.deeplinks = [...new Set(links.map(linkString))];
      this.noDerive.add(r); // class-named screens: no `<scheme>://<ClassName>` guess
      routes.push(r);
    };
    const cls = this.classIndex();
    const subs = this.subclassCounts();
    const concrete = (s: Symbol) => !isTestPath(s.file) && !/\b(abstract|sealed|open)\b/.test(s.signature.split(/[:{(]/)[0]!) && !(subs.get(s.platform + '|' + s.name) ?? 0) && !s.name.startsWith('Base') && !s.name.startsWith('Abstract');

    // Android activities declared in a manifest (deep links of their intent-filters attached)
    for (const a of this.activities) {
      const s = cls.get(a.platform + '|' + a.name);
      if (!s || (s.lang !== 'kotlin' && s.lang !== 'java') || isTestPath(s.file)) continue;
      add(s, s.name, s.name, a.links);
      // the screen composable an activity sets as its content
      for (const call of this.calls(s.file)) {
        if (call.callee !== 'setContent') continue;
        for (const inn of call.inner ?? []) {
          if (!inn.endsWith('Screen')) continue;
          const c = this.findSymNear(s.platform, inn, s.file, 'composable', 'function');
          if (c && !isTestPath(c.file)) {
            add(c);
            break;
          }
        }
      }
    }

    // Kotlin/Java class screens
    const fragmentBases = new Set(['Fragment', 'PreferenceFragmentCompat', 'PreferenceFragment', 'ListFragment']);
    const dialogBases = new Set(['DialogFragment', 'BottomSheetDialogFragment', 'AppCompatDialogFragment']);
    const fragments = new Map<string, Symbol>();
    for (const s of cls.values()) {
      if (s.lang !== 'kotlin' && s.lang !== 'java') continue;
      if (s.kind !== 'class' && s.kind !== 'object') continue;
      // Appyx leaf nodes: @ContributesNode
      if (s.signature.includes('@ContributesNode') && !isTestPath(s.file)) {
        add(s);
        continue;
      }
      if (!concrete(s)) continue;
      // Circuit screens: implement com.slack.circuit Screen (directly or via an app base class)
      if (this.inherits(s.platform, s.name, new Set(['Screen'])) && !cls.has(s.platform + '|Screen') && this.circuitFile(s)) {
        add(s);
        continue;
      }
      if (s.kind === 'class' && !this.inherits(s.platform, s.name, dialogBases) && this.inherits(s.platform, s.name, fragmentBases)) fragments.set(s.name, s);
    }
    // Fragments become routes only when something outside them instantiates them (not a pager adapter page)
    if (fragments.size) {
      const sites = new Map<string, { adapter: number; other: number }>();
      for (const file of this.sortedFiles()) {
        const fi = this.g.files[file]!;
        if (fi.lang !== 'kotlin' && fi.lang !== 'java') continue;
        for (const call of this.calls(file)) {
          let n = '';
          if (fragments.has(call.callee)) n = call.callee;
          else if (call.callee === 'newInstance' && fragments.has(lastSeg(call.receiver ?? ''))) n = lastSeg(call.receiver ?? '');
          if (!n) continue;
          let top = getSym(this.g, call.enclosing);
          let inAdapter = false;
          while (top && top.parent) {
            if (/Adapter\b/.test(top.name) || supertypes(top).some((t) => t.endsWith('Adapter'))) inAdapter = true;
            top = getSym(this.g, top.parent);
          }
          if (top && (/Adapter\b/.test(top.name) || supertypes(top).some((t) => t.endsWith('Adapter')))) inAdapter = true;
          if (!top || top.name === n || isTestPath(file)) continue;
          // embedded child fragments: created where the child fragment manager is used (directly, or in
          // the same-class helper the instance is handed to)
          if (this.childFragmentSite(file, call)) inAdapter = true;
          const c = sites.get(n) ?? { adapter: 0, other: 0 };
          if (inAdapter) c.adapter++;
          else c.other++;
          sites.set(n, c);
        }
      }
      for (const [n, s] of [...fragments].sort((a, b) => cmpStr(a[0], b[0]))) if ((sites.get(n)?.other ?? 0) > 0) add(s);
    }

    // AppKit windows
    for (const s of cls.values()) {
      if (s.lang !== 'swift' || s.kind !== 'class' || !concrete(s)) continue;
      if (s.name !== 'NSWindowController' && this.inherits(s.platform, s.name, new Set(['NSWindowController']))) add(s);
    }

    // HarmonyOS custom route decorators: @AppRouter({ name: "x/Y" }) (any decorator taking a route `name`)
    for (const s of this.g.symbols) {
      if (s.lang !== 'arkts' || (s.kind !== 'component' && s.kind !== 'struct')) continue;
      const m = /@(\w*Rout\w*)\(\s*\{[^}]*?\bname\s*:\s*(['"])([^'"]+)\2/.exec(s.signature);
      if (m) add(s, m[3]!, m[3]!);
    }

    this.swiftUIRoutes(add);
  }

  childFragmentSite(file: string, call: Call): boolean {
    const usesChild = (sym: Symbol | undefined) => !!sym && /childFragmentManager|getChildFragmentManager/.test(this.symbolSource(sym));
    const fn = getSym(this.g, call.enclosing);
    if (usesChild(fn)) return true;
    const pat = new RegExp('\\b' + (call.callee === 'newInstance' ? lastSeg(call.receiver ?? '') : call.callee) + '\\s*[.(]');
    for (const c of this.calls(file)) {
      if (c.line < call.line - 3 || c.line > call.line || c === call) continue;
      if (!(c.args ?? []).some((a) => pat.test(a.text))) continue;
      const helper = this.findSymNear(this.g.files[file]!.platform, c.callee, file, 'method', 'function');
      if (helper && helper.file === file && usesChild(helper)) return true;
    }
    return false;
  }

  circuitFile(s: Symbol): boolean {
    const seen = new Set<string>();
    let cur: Symbol | undefined = s;
    for (let i = 0; cur && i < 8 && !seen.has(cur.name); i++) {
      seen.add(cur.name);
      if ((this.g.files[cur.file]?.imports ?? []).some((x) => x.includes('circuit'))) return true;
      const sup: string | undefined = supertypes(cur)[0];
      cur = sup ? this.classIndex().get(s.platform + '|' + sup) : undefined;
    }
    return false;
  }

  /** SwiftUI destinations: views presented by sheet/fullScreenCover/popover/navigationDestination,
   * passed as a `destination:` argument, hosted by UIHostingController(rootView:) / WindowGroup, or
   * reached through a TCA `Destination` enum case (`case settings(Settings)` -> SettingsView). */
  swiftUIRoutes(add: (s: Symbol) => void): void {
    const views = new Map<string, Symbol>();
    for (const s of this.g.symbols) {
      if (s.lang !== 'swift' || (s.kind !== 'struct' && s.kind !== 'class') || isTestPath(s.file)) continue;
      if (/Previews?$/.test(s.name) || /Preview Content\/|(^|\/)Previews?\//.test(s.file)) continue;
      if (!supertypes(s).includes('View')) continue;
      const k = s.platform + '|' + s.name;
      if (!views.has(k)) views.set(k, s);
    }
    if (!views.size) return;
    const presenters = new Set(['sheet', 'fullScreenCover', 'popover', 'navigationDestination', 'NavigationStack', 'NavigationView', 'Tab']);
    const found: Symbol[] = [];
    for (const file of this.sortedFiles()) {
      const fi = this.g.files[file]!;
      if (fi.lang !== 'swift' || isTestPath(file)) continue;
      for (const call of this.calls(file)) {
        const v = (n: string) => views.get(fi.platform + '|' + n);
        for (const a of call.args ?? []) {
          if (a.label === 'destination' || a.label === 'rootView') {
            let t = a.text.trim();
            // a local: `let addAccountView = AddAccountView(...)`; pushed as rootView: addAccountView
            if (/^[a-z_]\w*$/.test(t)) {
              const fn = getSym(this.g, call.enclosing);
              const lm = fn ? new RegExp('\\b(?:let|var)\\s+' + t + '\\s*(?::[^=]+)?=\\s*([A-Z]\\w*)\\s*[({]').exec(this.symbolSource(fn)) : null;
              if (lm) t = lm[1]! + '(';
            }
            const m = /^([A-Z]\w*)\s*[({]/.exec(t);
            const s = m ? v(m[1]!) : undefined;
            if (s) found.push(s);
          }
        }
        // tab roots: `X().tabItem { … }`
        if (call.callee === 'tabItem' && call.receiver) {
          const m = /^([A-Z]\w*)\s*\(/.exec(call.receiver.trim());
          const s = m ? v(m[1]!) : undefined;
          if (s) found.push(s);
        }
        if (presenters.has(call.callee) || call.callee === 'WindowGroup') {
          const all = call.callee === 'navigationDestination' && (call.args ?? []).some((a) => a.label === 'for');
          for (const n of call.inner ?? []) {
            const s = v(n);
            if (!s) continue;
            found.push(s);
            if (!all) break;
          }
        }
      }
    }
    // destination builders: `-> some View` functions switching over a destination enum
    // (`case .settings: SettingsNavigationView(…)`), at least two cases mapped to app views
    for (const fn of this.g.symbols) {
      if (fn.lang !== 'swift' || (fn.kind !== 'function' && fn.kind !== 'property') || !/some View/.test(fn.signature) || isTestPath(fn.file)) continue;
      const body = this.symbolSource(fn);
      if (!/\bswitch\b/.test(body)) continue;
      const lines = body.split('\n');
      const hits: Symbol[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (!/^\s*case\s+(let\s+)?\./.test(lines[i]!)) continue;
        for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
          if (/^\s*(case|default)\b/.test(lines[j]!)) break;
          const m = /^\s*([A-Z]\w*)\s*\(/.exec(lines[j]!);
          const s = m ? views.get(fn.platform + '|' + m[1]) : undefined;
          if (s) {
            hits.push(s);
            break;
          }
        }
      }
      if (new Set(hits.map((h) => h.id)).size >= 2) found.push(...hits);
    }
    // TCA: enum Destination / Path cases with a reducer payload -> <Feature>View
    for (const s of this.g.symbols) {
      if (s.lang !== 'swift' || s.kind !== 'case' || !s.parent) continue;
      const p = getSym(this.g, s.parent);
      if (!p || p.kind !== 'enum' || !/^(Destination|Path)$/.test(p.name)) continue;
      const m = /\(\s*([A-Z][\w.]*)\s*\)/.exec(s.signature);
      if (!m) continue;
      const t = lastSeg(m[1]!);
      for (const c of [t + 'View', t.replace(/(Reducer|Feature|Core)$/, '') + 'View']) {
        const v = views.get(s.platform + '|' + c);
        if (v) {
          found.push(v);
          break;
        }
      }
    }
    for (const s of found) add(s);
  }

  typedRoute(platform: string, file: string, call: Call): Route {
    const t = lastSeg(call.type_args![0]!);
    let base = t;
    for (const suf of ['NavKey', 'Route', 'Destination', 'Screen', 'Key']) {
      if (base.endsWith(suf) && base.length > suf.length) {
        base = base.slice(0, -suf.length);
        break;
      }
    }
    // route_id = the route type's name (the identifier the app navigates with); pattern keeps the
    // snake_case id plus constructor params as a readable alias
    let pattern = snake(base);
    const ks = this.findSym(platform, t, 'class', 'object');
    if (ks) for (const m of ks.signature.matchAll(reValParam)) pattern += '/{' + m[1] + '}';
    const rid = t;
    let sym = ks ? ks.id : call.enclosing, sfile = ks ? ks.file : file;
    for (const inn of call.inner ?? []) {
      if (inn === t) continue;
      if (inn.endsWith('Screen') || inn.endsWith('Route')) {
        const s = this.findSymNear(platform, inn, file, 'composable', 'function');
        if (s) {
          sym = s.id;
          sfile = s.file;
          break;
        }
      }
    }
    return { platform, route_id: rid, pattern, deeplink: '', file: sfile, symbol: sym };
  }

  swiftView(platform: string, inner: string[]): Symbol | undefined {
    let found: Symbol | undefined;
    for (const inn of inner) {
      if (inn === '' || !isUpperCh([...inn][0])) continue;
      const v = this.findSym(platform, inn, 'struct', 'class');
      if (!v || !(inn.endsWith('View') || inn.endsWith('Screen') || inn.endsWith('Details') || inn.endsWith('Detail'))) continue;
      if (found && found.id !== v.id) return undefined;
      found = v;
    }
    return found;
  }

  // ---------- testIDs ----------

  testIDs(): void {
    const rbf = new Map<string, string>();
    for (const r of this.f.routes!) rbf.set(r.file, r.route_id);
    const seen = new Set<string>();
    const push = (platform: string, tid: string, file: string, line: number) => {
      const k = platform + '|' + tid + '|' + file + '|' + line;
      if (seen.has(k)) return;
      seen.add(k);
      this.f.testids!.push({ platform, tid, route_id: rbf.get(file) ?? '', file, line });
    };
    for (const file of this.sortedFiles()) {
      const fi = this.g.files[file]!;
      for (const call of this.calls(file)) {
        if (!call.args?.length) continue;
        let ok = false;
        switch (fi.lang) {
          case 'kotlin':
          case 'java':
            ok = call.callee === 'testTag';
            break;
          case 'swift':
            ok = call.callee === 'accessibilityIdentifier';
            break;
          case 'arkts':
            ok = call.callee === 'id' && call.callee_text.endsWith('.id');
            break;
          case 'javascript':
          case 'typescript':
          case 'tsx':
            ok = call.callee === 'getByTestId';
        }
        if (!ok) continue;
        let [v, any] = this.eval(fi.platform, call.args[0]!.parts);
        if (!any) {
          // constant objects: `testTag(TestTags.signIn)` with `val signIn = TestTag("sign-in")`
          const parts = call.args[0]!.parts ?? [];
          const w = parts.length === 1 && parts[0]!.ref ? this.wrappedConst(fi.platform, parts[0]!.ref, file) : '';
          if (!w) continue;
          v = { s: w, dynamic: false, prefix: w };
        }
        // dynamic ids are recorded by their literal prefix; with no prefix keep the template (`{tagPrefix}_carousel`)
        const tid = v.dynamic ? v.prefix || (/[A-Za-z0-9]/.test(v.s.replace(/\{[^}]*\}/g, '')) ? v.s : '') : v.s;
        if (tid === '') continue;
        push(fi.platform, tid, file, call.line);
      }
    }
    this.assignedTestIDs(push);
    this.resourceIDsUsedByTests(push);
  }

  /** Value of a constant initialised through a one-string wrapper (`TestTag("x")`, `Tag(id = "x")`). */
  wrappedConst(platform: string, ref: string, near: string): string {
    const name = lastSeg(ref);
    const s = this.findSymNear(platform, name, near, 'property', 'const', 'variable', 'case');
    if (!s) return '';
    const m = /=\s*[A-Z]\w*\(\s*(?:\w+\s*=\s*)?"((?:[^"\\$]|\\.)+)"\s*\)/.exec(this.symbolSource(s));
    return m ? m[1]! : '';
  }

  /** Assignments instead of calls: Swift `x.accessibilityIdentifier = …`, Compose `testTag = …`. */
  assignedTestIDs(push: (platform: string, tid: string, file: string, line: number) => void): void {
    for (const file of this.sortedFiles()) {
      const fi = this.g.files[file]!;
      const re = fi.lang === 'swift' ? /\.accessibilityIdentifier\s*=\s*([^\n;]+)/g : fi.lang === 'kotlin' ? /\btestTag\s*=\s*([^\n;]+)/g : null;
      if (!re) continue;
      const lines = this.fileLines(file);
      if (!lines.some((l) => re.source.startsWith('\\.access') ? l.includes('accessibilityIdentifier') : l.includes('testTag'))) continue;
      lines.forEach((l, i) => {
        for (const m of l.matchAll(re)) {
          const rhs = m[1]!.trim().replace(/\s*(\/\/.*)?$/, '');
          let tid = '';
          const lit = /^"((?:[^"\\]|\\.)*)"$/.exec(rhs);
          if (lit) tid = lit[1]!.includes('\\(') ? '' : lit[1]!;
          else if (/^[A-Za-z_][\w.]*$/.test(rhs) && constLikeRef(rhs)) {
            const [v, ok] = this.lookup(fi.platform, rhs);
            tid = ok ? v : this.wrappedConst(fi.platform, rhs, file);
          }
          if (tid) push(fi.platform, tid, file, i + 1);
        }
      });
    }
  }

  /** Android resource ids that tests look views up by (any `R.id.x` in a call argument inside a test
   * source, e.g. Espresso `withId(R.id.x)`), recorded at their layout declaration. */
  resourceIDsUsedByTests(push: (platform: string, tid: string, file: string, line: number) => void): void {
    const used = new Map<string, Set<string>>();
    for (const file of this.sortedFiles()) {
      const fi = this.g.files[file]!;
      if ((fi.lang !== 'kotlin' && fi.lang !== 'java') || !isTestPath(file)) continue;
      for (const call of this.calls(file)) {
        for (const a of call.args ?? [])
          for (const m of a.text.matchAll(/\bR\.id\.(\w+)/g)) {
            let u = used.get(fi.platform);
            if (!u) used.set(fi.platform, (u = new Set()));
            u.add(m[1]!);
          }
      }
    }
    if (!used.size) return;
    for (const p of this.cfg.platforms) {
      const u = used.get(p.name);
      if (!u) continue;
      const root = path.join(this.res.dir, p.root);
      walkDir(root, (fp, name, isDir) => {
        if (isDir) return !(skipResDir(name) || (name.startsWith('.') && fp !== root));
        if (!name.endsWith('.xml') || !/\/res\/layout[^/]*$/.test(path.dirname(fp).split(path.sep).join('/'))) return;
        const rel = path.relative(this.res.dir, fp).split(path.sep).join('/');
        if (shadowed(this.cfg, p, rel) || isTestPath(rel)) return;
        let b: string;
        try {
          b = fs.readFileSync(fp, 'utf8');
        } catch {
          return;
        }
        b.split('\n').forEach((l, i) => {
          for (const m of l.matchAll(/android:id="@\+id\/(\w+)"/g)) if (u.has(m[1]!)) push(p.name, m[1]!, rel, i + 1);
        });
      });
    }
  }

  // ---------- APIs ----------

  apis(): void {
    const seen = new Set<string>();
    const add = (a: API) => {
      if (staticAssetRe.test(a.path)) return;
      const k = a.platform + '|' + a.method + '|' + a.path + '|' + a.symbol;
      if (!seen.has(k)) {
        seen.add(k);
        this.f.apis!.push(a);
      }
    };
    const evalPath = (platform: string, a: Arg, relativeOK: boolean): [string, boolean] => {
      const [v, ok] = this.eval(platform, a.parts);
      if (!ok) return ['', false];
      let s = v.s;
      if (relativeOK && s !== '' && !s.includes('://') && !s.startsWith('/') && !s.startsWith('{')) s = '/' + s;
      return normPath(s);
    };
    const q3 = '\'"`';
    for (const file of this.sortedFiles()) {
      const fi = this.g.files[file]!;
      const calls = this.calls(file);
      const okhttp = new Map<string, string>();
      for (const call of calls) {
        const lc = call.callee.toLowerCase();
        const M = call.callee.toUpperCase();
        const args = call.args ?? [];
        const recv = call.receiver ?? '';
        const api = (method: string, p: string) => add({ platform: fi.platform, method, path: p, file, symbol: call.enclosing });
        switch (fi.lang) {
          case 'kotlin':
          case 'java':
            if (call.callee.startsWith('@') && httpMethods.has(call.callee.slice(1)) && args.length > 0) {
              const [p, ok] = evalPath(fi.platform, args[0]!, true);
              if (ok) api(call.callee.slice(1), p);
            } else if (httpMethods.has(M) && args.length > 0 && recv.includes('.url(')) {
              okhttp.set(recv, M);
            } else if (httpMethods.has(M) && args.length > 0 && clientRecvRe.test(recv)) {
              // relative paths (`client.get("shows/anticipated")`, resolved against defaultRequest's base URL)
              const rel = /^[A-Za-z][\w\-.]*\/[\w\-./{}]*$/.test((args[0]!.parts ?? []).map((x) => x.lit ?? '{' + (x.ref ?? x.param) + '}').join(''));
              const [p, ok] = evalPath(fi.platform, args[0]!, rel);
              if (ok) api(M, p);
            }
            break;
          case 'swift': {
            let pathArg: Arg | undefined;
            let method = '';
            for (const a of args) {
              switch (a.label ?? '') {
                case 'path':
                  pathArg = a;
                  break;
                case 'method':
                case 'httpMethod':
                  method = trimChars(lastSeg(a.text), '."').toUpperCase();
                  break;
                case '':
                  if (a.text.startsWith('.') && httpMethods.has(a.text.slice(1).toUpperCase())) method = a.text.slice(1).toUpperCase();
              }
            }
            if (!pathArg && call.callee === 'request' && args.length > 0 && !args[0]!.label && (recv === 'AF' || recv.endsWith('Session.default') || clientRecvRe.test(recv))) pathArg = args[0];
            if (!pathArg) continue;
            const [p, ok] = evalPath(fi.platform, pathArg, false);
            if (ok) {
              if (!httpMethods.has(method)) method = 'GET';
              api(method, p);
            }
            break;
          }
          case 'arkts':
          case 'typescript':
          case 'javascript':
          case 'tsx':
            if (call.callee === 'request' && args.length > 0 && !args[0]!.text.startsWith('{') && ((recv + call.callee_text).includes('createHttp') || httpVarRecvRe.test(recv))) {
              const [p, ok] = evalPath(fi.platform, args[0]!, false);
              if (ok) {
                let method = 'GET';
                if (args.length > 1 && args[1]!.props) {
                  const m = lastSeg(args[1]!.props.method ?? '').toUpperCase();
                  if (httpMethods.has(m)) method = m;
                }
                api(method, p);
              }
            } else if ((lc === 'axios' || lc === 'request') && args.length > 0 && args[0]!.props && (args[0]!.props.url ?? '') !== '') {
              let m = trimChars(args[0]!.props.method ?? '', q3).toUpperCase();
              if (!httpMethods.has(m)) m = 'GET';
              const [p, ok] = normPath(trimChars(args[0]!.props.url!, q3));
              if (ok) api(m, p);
            } else if (call.callee === 'Request' && call.callee_text.includes('rcp') && args.length > 0) {
              const [p, ok] = evalPath(fi.platform, args[0]!, false);
              if (ok) {
                let m = 'GET';
                if (args.length > 1) {
                  const mm = trimChars(args[1]!.text, q3).toUpperCase();
                  if (httpMethods.has(mm)) m = mm;
                }
                api(m, p);
              }
            } else if (httpMethods.has(M) && args.length > 0 && clientRecvRe.test(recv)) {
              const [p, ok] = evalPath(fi.platform, args[0]!, false);
              if (ok) api(M, p);
            }
        }
      }
      if (fi.lang === 'kotlin' || fi.lang === 'java') {
        for (const call of calls) {
          if (call.callee !== 'url' || !call.args?.length || !(call.receiver ?? '').includes('Builder')) continue;
          const [p, ok] = evalPath(fi.platform, call.args[0]!, false);
          if (ok) {
            let m = 'GET';
            for (const [recv, mm] of okhttp) if (recv.includes(call.args[0]!.text)) m = mm;
            add({ platform: fi.platform, method: m, path: p, file, symbol: call.enclosing });
          }
        }
      }
    }
    this.endpointEnums(add);
    this.composedAPIs(add);
  }

  fileLines(file: string): string[] {
    let l = this.lineCache.get(file);
    if (!l) {
      try {
        l = fs.readFileSync(path.join(this.res.dir, file), 'utf8').split('\n');
      } catch {
        l = [];
      }
      this.lineCache.set(file, l);
    }
    return l;
  }

  /** URLs composed in code rather than written as one literal: Swift appendingPathComponent chains and
   * additionalPathComponents arrays, route enums returning (method, path) tuples, String.format URL
   * templates, template literals over a base-URL variable, Ktor `client.get { helper("path") }` and
   * absolute-URL constants used where a request is built. Method from the same function (or, for an
   * endpoint helper, from the functions in the file that call it); GET when nothing says otherwise. */
  composedAPIs(add: (a: API) => void): void {
    const pre = /appendingPathComponent|additionalPathComponents|String\.format|\(\s*\.(?:GET|POST|PUT|DELETE|PATCH|HEAD)\s*,|`\$\{[^}]*\}\/|\b(?:get|post|put|delete|patch)\s*\{\s*\w+\(\s*"|https?:\/\/[^"'`\s]+\//;
    const callables = new Set(['function', 'method', 'property', 'constructor', 'composable', 'const', 'variable']);
    // absolute URL constants (value with a path) by platform
    const urlConsts = new Map<string, Map<string, string>>();
    for (const s of this.g.symbols) {
      if (!s.value || !/^https?:\/\/[^/\s]+\/[^\s]*$/.test(s.value) || staticAssetRe.test(s.value.replace(/[?#].*$/, ''))) continue;
      if (/^https?:\/\/(?:www\.w3\.org|purl\.org|ns\.|schemas\.|xmlns\.)/.test(s.value)) continue; // XML namespaces
      let m = urlConsts.get(s.platform);
      if (!m) urlConsts.set(s.platform, (m = new Map()));
      m.set(s.name, s.value);
    }
    const byFile = new Map<string, Symbol[]>();
    for (const s of this.g.symbols) {
      if (!callables.has(s.kind) || s.end_line <= s.start_line && s.kind !== 'const') continue;
      const a = byFile.get(s.file);
      if (a) a.push(s);
      else byFile.set(s.file, [s]);
    }
    for (const file of this.sortedFiles()) {
      const fi = this.g.files[file]!;
      if (!['swift', 'kotlin', 'java', 'arkts', 'typescript', 'javascript', 'tsx'].includes(fi.lang) || isTestPath(file)) continue;
      const syms = byFile.get(file);
      if (!syms) continue;
      const consts = urlConsts.get(fi.platform);
      const lines = this.fileLines(file);
      const text = lines.join('\n');
      const constHit = consts && [...consts.keys()].some((k) => text.includes(k));
      if (!pre.test(text) && !constHit) continue;
      // leaf callables only (a class body would repeat its members)
      const leaves = syms.filter((s) => !syms.some((o) => o !== s && o.start_line >= s.start_line && o.end_line <= s.end_line && (o.start_line > s.start_line || o.end_line < s.end_line)));
      const bodies = new Map<Symbol, string>();
      for (const s of leaves) bodies.set(s, lines.slice(s.start_line - 1, s.end_line).join('\n'));
      const emit = (s: Symbol, raw: string, method: string) => {
        if (!raw.includes('://') && docAssetRe.test(raw.replace(/[?#].*$/, '').replace(/\/$/, ''))) return;
        raw = raw.replace(/\\\((?:[^()]*\.)?(\w+)[^()]*\)/g, '{$1}').replace(/\$\{(?:[^}]*\.)?(\w+)[^}]*\}/g, '{$1}').replace(/%[sd@]/g, '{param}');
        if (!raw.startsWith('/') && !raw.startsWith('{') && !raw.includes('://')) raw = '/' + raw;
        const [p, ok] = normPath(raw);
        if (ok && /[A-Za-z]/.test(p)) add({ platform: fi.platform, method: httpMethods.has(method) ? method : 'GET', path: p, file, symbol: s.id });
      };
      for (const [s, b] of bodies) {
        const found: [string, string][] = []; // [path, method or '']
        // (method, "path") tuples
        for (const m of b.matchAll(/\(\s*\.(GET|POST|PUT|DELETE|PATCH|HEAD)\s*,\s*"((?:[^"\\]|\\.)*)"/g)) found.push([m[2]!, m[1]!]);
        // appendingPathComponent chains
        for (const m of b.matchAll(/(?:\.appendingPathComponent\((?:[^()]|\([^()]*\))*\)\s*)+/g)) {
          const segs: string[] = [];
          let lit = false;
          for (const a of m[0].matchAll(/\.appendingPathComponent\(\s*((?:[^()]|\([^()]*\))*?)\s*\)/g)) {
            const t = a[1]!;
            if (/^"(?:[^"\\]|\\.)*"$/.test(t)) {
              segs.push(trimPrefix(t.slice(1, -1), '/'));
              lit = true;
            } else segs.push('{' + (/(\w+)\W*$/.exec(t)?.[1] ?? 'param') + '}');
          }
          // the chain must extend a URL-ish base (not a file-system directory)
          const before = b.slice(Math.max(0, (m.index ?? 0) - 80), m.index ?? 0);
          const baseOK = /url|endpoint|base|api|host|server/i.test(before) && !/director|folder|cache|document|file|container|bundle|temporary/i.test(before.slice(-50));
          if (lit && baseOK) found.push([segs.join('/'), '']);
        }
        // additionalPathComponents: ["a", "b", expr]
        for (const m of b.matchAll(/(?:additionalPathComponents|pathComponents)\s*:\s*\[([^\]]*)\]/g)) {
          const segs = splitTop(m[1]!).map((x) => x.trim()).filter(Boolean).map((x) => (/^"[^"]*"$/.test(x) ? x.slice(1, -1) : '{' + (/^(\w+)/.exec(x)?.[1] ?? 'param') + '}'));
          if (segs.some((x) => !x.startsWith('{'))) found.push([segs.join('/'), '']);
        }
        // String.format("%s/api/x/%s.json", ...) building a URL
        if (/\b(URI|URL|Request|HttpUrl|url)\b/.test(b))
          for (const m of b.matchAll(/String\.format\(\s*(?:Locale\.\w+\s*,\s*)?"([^"\s]*\/[^"\s]*)"/g)) if (!m[1]!.includes('=')) found.push([m[1]!, '']);
        // template literal over a base-URL variable: `${EhConstants.baseUrl(isEx)}/uconfig.php`
        for (const m of b.matchAll(/`\$\{([^}]+)\}(\/[^`\s?#]*)/g)) if (/base|host|url|domain|server|endpoint|api/i.test(m[1]!) && m[2]!.length > 1) found.push([m[2]!, '']);
        // Ktor: client.get { apiUrl("config") }
        for (const m of b.matchAll(/\b(get|post|put|delete|patch)\s*\{\s*\w+\(\s*"([^"\s]+)"/g)) found.push([m[2]!, m[1]!.toUpperCase()]);
        // absolute URL constants referenced where a request is built
        if (consts && reqContextRe.test(b))
          for (const [k, v] of consts) if (s.name !== k && new RegExp('\\b' + k + '\\b').test(b)) found.push([v, '']);
        if (!found.length) continue;
        let verbs = methodsIn(b);
        if (!verbs.length && /^\w/.test(s.name)) {
          // endpoint helper: take the verbs of the functions in this file that call it
          const callRe = new RegExp('\\b' + s.name + '\\s*\\(');
          for (const [o, ob] of bodies) if (o !== s && callRe.test(ob)) verbs.push(...methodsIn(ob));
          verbs = [...new Set(verbs)];
        }
        for (const [p, m] of found) {
          if (m) emit(s, p, m);
          else if (!verbs.length) emit(s, p, 'GET');
          else for (const v of verbs) emit(s, p, v);
        }
      }
    }
  }

  endpointEnums(add: (a: API) => void): void {
    const callMethod = new Map<string, string>();
    for (const file of this.sortedFiles()) {
      if (this.g.files[file]!.lang !== 'swift') continue;
      for (const call of this.calls(file)) {
        const M = call.callee.toUpperCase();
        if (!httpMethods.has(M)) continue;
        for (const a of call.args ?? []) {
          if (a.label === 'endpoint' || a.label === 'target') {
            const m = endpointArgRe.exec(a.text);
            if (m) {
              callMethod.set((m[1] ?? '') + '.' + m[2], M);
              callMethod.set('.' + m[2], M);
            }
          }
        }
      }
    }
    const byParent = new Map<string, Map<string, Symbol>>();
    for (const s of this.g.symbols) {
      if (s.lang === 'swift' && s.parent && (s.name === 'path' || s.name === 'method')) {
        let m = byParent.get(s.parent);
        if (!m) {
          m = new Map();
          byParent.set(s.parent, m);
        }
        m.set(s.name, s);
      }
    }
    for (const [parent, m] of byParent) {
      const ps = m.get('path');
      const owner = getSym(this.g, parent);
      if (!ps || !owner || !(owner.signature.includes('TargetType') || owner.signature.includes('Endpoint'))) continue;
      const body = this.symbolSource(ps);
      const methods = new Map<string, string>();
      let defMethod = 'GET';
      const ms = m.get('method');
      if (ms) {
        const mb = this.symbolSource(ms);
        for (const mm of mb.matchAll(swiftCaseRe)) {
          for (const cn of mm[1]!.matchAll(swiftCaseName)) methods.set(cn[1]!, trimPrefix(mm[2]!, '.').toUpperCase());
        }
        const d = swiftDefault.exec(mb);
        if (d) defMethod = trimPrefix(d[1]!, '.').toUpperCase();
      }
      const base = trimSuffix(owner.name, '+ext');
      for (const mm of body.matchAll(swiftCaseRe)) {
        if (!mm[2]!.startsWith('"')) continue;
        let raw = trimChars(mm[2]!, '"');
        raw = raw.replace(swiftInterpRe, '{$1}');
        if (!raw.startsWith('/') && !raw.includes('://')) raw = '/' + raw;
        const [p, ok] = normPath(raw);
        if (!ok) continue;
        for (const cn of mm[1]!.matchAll(swiftCaseName)) {
          let method = defMethod;
          const v = methods.get(cn[1]!);
          if (v !== undefined) method = v;
          else {
            const w = callMethod.get(base + '.' + cn[1]);
            if (w !== undefined && !ms) method = w;
          }
          if (!httpMethods.has(method)) method = 'GET';
          let sym = ps.id;
          const cs = this.findSym(owner.platform, cn[1]!, 'case');
          if (cs && cs.qual.startsWith(base + '.')) sym = cs.id;
          add({ platform: owner.platform, method, path: p, file: ps.file, symbol: sym });
        }
      }
    }
  }

  // ---------- UIKit ----------

  uikit(): void {
    if (!uikitEnabled(this.cfg)) return;
    const classes = new Map<string, Symbol>();
    for (const s of this.g.symbols) {
      if (s.lang === 'swift' && s.kind === 'class' && !s.parent) {
        const k = s.platform + '|' + s.name;
        const prev = classes.get(k);
        if (!prev || (isTestPath(prev.file) && !isTestPath(s.file))) classes.set(k, s);
      }
    }
    const memo = new Map<string, number>();
    const isVC = (platform: string, name: string, depth: number): boolean => {
      if (vcContainers.has(name)) return false;
      if (vcBases.has(name)) return true;
      const k = platform + '|' + name;
      const v = memo.get(k);
      if (v !== undefined) return v === 1;
      memo.set(k, 2);
      const cl = classes.get(k);
      if (!cl || depth > 12) return false;
      const ok = isVC(platform, superclassOf(cl.signature), depth + 1);
      if (ok) memo.set(k, 1);
      return ok;
    };
    const subs = new Map<string, number>();
    for (const cl of classes.values()) {
      if (!isTestPath(cl.file)) {
        const k = cl.platform + '|' + superclassOf(cl.signature);
        subs.set(k, (subs.get(k) ?? 0) + 1);
      }
    }
    const screens = new Map<string, Symbol>();
    const keys: string[] = [];
    for (const [k, cl] of classes) {
      if ((subs.get(k) ?? 0) >= 2 || isTestPath(cl.file) || cl.name.startsWith('Base') || cl.name.startsWith('Abstract') || cl.file.endsWith('Previews.swift') || cl.file.includes('Preview Content/')) continue;
      if (isVC(cl.platform, cl.name, 0) && !vcBases.has(cl.name)) {
        screens.set(k, cl);
        keys.push(k);
      }
    }
    keys.sort(cmpStr);
    if (screens.size === 0) return;
    const sb = this.storyboards();
    const top = (id: string) => {
      let s = getSym(this.g, id);
      while (s && s.parent) s = getSym(this.g, s.parent);
      return s;
    };
    const child = new Set(sb.embeds);
    const inbound = new Set(sb.roots);
    interface Pending {
      e: import('../model.js').NavEdge;
      from: string;
      to: string;
    }
    const edges: Pending[] = [];
    for (const file of this.sortedFiles()) {
      const fi = this.g.files[file]!;
      if (fi.lang !== 'swift') continue;
      for (const call of this.calls(file)) {
        for (const a of call.args ?? []) {
          if (a.label === 'rootViewController') {
            const n = soleScreen(fi.platform, a.text, screens);
            if (n) inbound.add(n);
          }
        }
        if (call.callee === 'addChild' || call.callee === 'addChildViewController' || call.callee === 'embed') {
          if (call.args?.length) {
            const n = this.resolveVC(fi.platform, call, screens);
            if (n) child.add(n);
          }
          continue;
        }
        const kind = ({ pushViewController: 'push', present: 'present', show: 'show', showDetailViewController: 'show', performSegue: 'segue', instantiateViewController: 'storyboard' } as Record<string, string>)[call.callee];
        if (!kind || !Object.prototype.hasOwnProperty.call({ pushViewController: 1, present: 1, show: 1, showDetailViewController: 1, performSegue: 1, instantiateViewController: 1 }, call.callee)) continue;
        if (!call.args?.length) continue;
        const src = top(call.enclosing);
        if (!src || !screens.has(fi.platform + '|' + src.name)) continue;
        let to = '';
        if (kind === 'segue' || kind === 'storyboard') {
          const [v, ok] = this.eval(fi.platform, call.args[0]!.parts);
          if (!ok || v.dynamic) continue;
          to = (kind === 'segue' ? sb.segues.get(v.s) : sb.ids.get(v.s)) ?? '';
        } else to = this.resolveVC(fi.platform, call, screens);
        if (!to || !screens.has(fi.platform + '|' + to)) continue;
        inbound.add(to);
        edges.push({ e: { platform: fi.platform, from: screenID(src.name), to: screenID(to), kind, file, line: call.line }, from: src.name, to });
      }
    }
    // panes: a VC held in a stored property of a window / split-view controller is composed, not navigated to
    // (owners: window / split-view controllers; a property on an ordinary VC is often just a reference
    // to a controller it presents)
    const owners = new Set<string>();
    for (const cl of classes.values()) if (this.inherits(cl.platform, cl.name, new Set(['NSWindowController', 'NSSplitViewController', 'UISplitViewController']))) owners.add(cl.platform + '|' + cl.name);
    for (const s of this.g.symbols) {
      if (s.lang !== 'swift' || s.kind !== 'property' || !s.parent) continue;
      const p = getSym(this.g, s.parent);
      if (!p || !owners.has(p.platform + '|' + p.name)) continue;
      const m = /\b(?:var|let)\s+\w+\s*(?::\s*([A-Z]\w*)[?!]?\s*(?:=|$)|=\s*([A-Z]\w*)\s*\()/.exec(s.signature);
      const t = m ? m[1] ?? m[2] : '';
      if (t && t !== p.name && screens.has(s.platform + '|' + t)) child.add(t);
    }
    const drop = new Set<string>();
    for (const k of keys) {
      const cl = screens.get(k)!;
      if (!inbound.has(cl.name) && (child.has(cl.name) || reChildName.test(cl.name))) drop.add(cl.name);
    }
    const have = new Set<string>();
    for (const r of this.f.routes!) have.add(r.file + '|' + r.symbol);
    for (const k of keys) {
      const cl = screens.get(k)!;
      if (have.has(cl.file + '|' + cl.id) || drop.has(cl.name)) continue;
      const rid = screenID(cl.name);
      this.f.routes!.push({ platform: cl.platform, route_id: rid, pattern: rid, deeplink: '', file: cl.file, symbol: cl.id });
    }
    const seen = new Set<string>();
    const nav = (this.f.navigation ??= []);
    for (const { e, from, to } of edges) {
      if (drop.has(from) || drop.has(to)) continue;
      const k = e.platform + '|' + e.from + '|' + e.to + '|' + e.kind;
      if (!e.from || !e.to || e.from === e.to || seen.has(k)) continue;
      seen.add(k);
      nav.push(e);
    }
    nav.sort((a, b) => cmpStr(a.from, b.from) || cmpStr(a.to, b.to) || cmpStr(a.kind, b.kind));
    if (nav.length === 0) delete this.f.navigation;
  }

  resolveVC(platform: string, call: Call, screens: Map<string, Symbol>): string {
    const arg = trimSpace(call.args![0]!.text).replace(/[!?]+$/, '');
    const to = soleScreen(platform, arg, screens);
    if (to) return to;
    if (!reIdent.test(arg)) return '';
    const fn = getSym(this.g, call.enclosing);
    if (!fn) return '';
    for (const m of this.symbolSource(fn).matchAll(reLocalAssign)) {
      if (m[1] === arg) {
        const t = soleScreen(platform, (m[2] ?? '') + ' ' + m[3], screens);
        if (t) return t;
      }
    }
    return '';
  }

  storyboards(): { ids: Map<string, string>; segues: Map<string, string>; embeds: Set<string>; roots: Set<string> } {
    const idx = { ids: new Map<string, string>(), segues: new Map<string, string>(), embeds: new Set<string>(), roots: new Set<string>() };
    const ambiguous = new Set<string>();
    for (const p of this.cfg.platforms) {
      const root = path.join(this.res.dir, p.root);
      walkDir(root, (fp, name, isDir) => {
        if (isDir) return !(name === 'build' || name === 'Pods' || name === 'node_modules' || (name.startsWith('.') && fp !== root));
        if (!name.endsWith('.storyboard')) return;
        let b: string;
        try {
          b = fs.readFileSync(fp, 'utf8');
        } catch {
          return;
        }
        const scene = new Map<string, string>();
        const segs: [string, string][] = [];
        const embedDest: string[] = [], rootDest: string[] = [];
        let initial = '';
        for (const t of xmlTokens(b)) {
          if (t.type !== 'start') continue;
          const at = (n: string) => t.attrs[n] ?? '';
          if (t.name === 'document') initial = at('initialViewController');
          if (t.name === 'segue') {
            if (at('kind') === 'embed') embedDest.push(at('destination'));
            else if (at('kind') === 'relationship' && at('relationship').includes('ootViewController')) rootDest.push(at('destination'));
            if (at('identifier')) segs.push([at('identifier'), at('destination')]);
            continue;
          }
          const cc = at('customClass');
          if (cc && at('id')) {
            scene.set(at('id'), cc);
            if (at('storyboardIdentifier')) idx.ids.set(at('storyboardIdentifier'), cc);
          }
        }
        for (const d of embedDest) {
          const cc = scene.get(d);
          if (cc) idx.embeds.add(cc);
        }
        for (const d of [...rootDest, initial]) {
          const cc = scene.get(d);
          if (cc) idx.roots.add(cc);
        }
        for (const [id, destId] of segs) {
          const dest = scene.get(destId);
          if (!dest) continue;
          const prev = idx.segues.get(id);
          if (prev !== undefined && prev !== dest) ambiguous.add(id);
          idx.segues.set(id, dest);
        }
      });
    }
    for (const id of ambiguous) idx.segues.delete(id);
    return idx;
  }

  // ---------- resources ----------

  resources(p: Platform): void {
    const root = path.join(this.res.dir, p.root);
    walkDir(root, (fp, name, isDir) => {
      if (isDir) return !(skipResDir(name) || (name.startsWith('.') && fp !== root));
      const rel = path.relative(this.res.dir, fp).split(path.sep).join('/');
      if (shadowed(this.cfg, p, rel)) return;
      switch (name) {
        case 'AndroidManifest.xml':
          this.manifest(p.name, fp, rel);
          break;
        case 'Info.plist':
          this.plist(p.name, fp, rel);
          break;
        case 'module.json5':
          this.moduleJSON5(p.name, fp, rel);
          break;
        case 'router_map.json':
          this.routerMap(p, fp);
          break;
        case 'main_pages.json':
          this.mainPages(p.name, fp, rel);
          break;
        default:
          // renamed Info plists (Wikipedia-Info.plist, Info-Debug.plist) and associated-domain entitlements
          if (name.endsWith('.plist') && /(^|[-_.])Info([-_.]|$)/.test(name.slice(0, -6) + '.')) this.plist(p.name, fp, rel);
          else if (name.endsWith('.entitlements')) this.entitlements(p.name, fp, rel);
          else if (name.endsWith('.xml') && path.dirname(fp).split(path.sep).join('/').endsWith('/res/navigation')) this.navGraph(p.name, fp, rel);
      }
    });
  }

  addScheme(platform: string, s: string): void {
    if (nonAppSchemes.has(s.toLowerCase())) return;
    const list = (this.schemes[platform] ??= []);
    if (!list.includes(s)) list.push(s);
  }

  manifest(platform: string, fp: string, rel: string): void {
    let b: string;
    try {
      b = fs.readFileSync(fp, 'utf8');
    } catch {
      return;
    }
    let act: { platform: string; name: string; file: string; links: DeepLink[] } | null = null;
    let filt: { actions: string[]; schemes: string[]; hosts: string[]; paths: string[] } | null = null;
    for (const t of xmlTokens(b)) {
      if (t.type === 'end') {
        if (t.name === 'intent-filter' && filt) {
          // a deep link = an ACTION_VIEW filter with at least one scheme; scheme x host x path combined
          if (filt.actions.includes('android.intent.action.VIEW') && filt.schemes.length) {
            for (const sc of filt.schemes)
              for (const h of filt.hosts.length ? filt.hosts : [''])
                for (const pa of filt.paths.length ? filt.paths : ['']) {
                  const d: DeepLink = { platform, scheme: sc, host: h, path: pa, file: rel, source: 'intent-filter' };
                  if (act) {
                    d.route_id = act.name;
                    act.links.push(d);
                  }
                  this.declare(d);
                }
          }
          filt = null;
        } else if ((t.name === 'activity' || t.name === 'activity-alias') && act) {
          this.activities.push(act);
          act = null;
        }
        continue;
      }
      if (t.type !== 'start') continue;
      if (t.name === 'data') {
        let s = t.attrs.scheme ?? '';
        const raw = s;
        if (s.startsWith('@string/')) s = androidString(fp, s.slice(8));
        if (s && !s.startsWith('@') && !s.startsWith('$')) this.addScheme(platform, s);
        if (filt) {
          const sc = s || raw;
          if (sc && !filt.schemes.includes(sc)) filt.schemes.push(sc);
          const h = t.attrs.host ?? '';
          if (h && !filt.hosts.includes(h)) filt.hosts.push(h);
          for (const k of ['path', 'pathPrefix', 'pathPattern', 'pathAdvancedPattern', 'pathSuffix']) {
            let v = t.attrs[k];
            if (v && (k.startsWith('pathPattern') || k === 'pathAdvancedPattern')) v = v.replace(/\\\\/g, '\\'); // Android unescapes `\\` in patterns
            if (v && !filt.paths.includes(v)) filt.paths.push(v);
          }
        }
      } else if (t.name === 'intent-filter') {
        filt = { actions: [], schemes: [], hosts: [], paths: [] };
      } else if (t.name === 'action' && filt) {
        filt.actions.push(t.attrs.name ?? '');
      } else if (t.name === 'activity' || t.name === 'activity-alias') {
        if (t.name === 'activity') (this.f.entries ??= []).push({ platform, kind: 'activity', name: t.attrs.name ?? '', file: rel });
        const cls = t.name === 'activity' ? t.attrs.name ?? '' : t.attrs.targetActivity ?? '';
        act = { platform, name: lastSeg(cls), file: rel, links: [] };
        if (t.selfClosing) {
          /* end token follows */
        }
      }
    }
  }

  /** Deep links handled in code: Compose `uriPattern = "…"` (navDeepLink / Nav3 deep-link patterns) and
   * Swift URL dispatch on the host (`switch url.host { case "post": … }`, `"theme" == comps.host`). The
   * scheme of a host dispatch comes from a nearby `scheme == "x"` test, else from the platform's only
   * declared custom scheme, else it is left empty. */
  codeDeepLinks(): void {
    for (const file of this.sortedFiles()) {
      const fi = this.g.files[file]!;
      if (isTestPath(file)) continue;
      if (fi.lang === 'kotlin') {
        const lines = this.fileLines(file);
        lines.forEach((l, i) => {
          const m = /\buriPattern\s*=\s*"([^"]+)"/.exec(l);
          if (!m) return;
          let u = m[1]!.replace(/\$\{?(\w+)\}?/g, (all, n: string) => {
            const [v, ok] = this.lookup(fi.platform, n);
            return ok ? v : all;
          });
          const mm = /^([A-Za-z][\w+.-]*):\/\/([^/]*)(.*)$/.exec(u);
          if (mm) this.declare({ platform: fi.platform, scheme: mm[1]!, host: mm[2]!, path: mm[3]!, file, source: 'uriPattern' });
          else if (u.startsWith('/')) this.declare({ platform: fi.platform, scheme: '', host: '', path: u, file, source: 'uriPattern' });
          void i;
        });
      } else if (fi.lang === 'swift') {
        const lines = this.fileLines(file);
        // only code that receives URLs from the system (scene/app delegate, onOpenURL, deep-link handlers)
        if (!lines.some((l) => l.includes('.host')) || !/openURLContexts|open url|onOpenURL|continue userActivity|deep ?link|handle\w*URL/i.test(lines.join('\n'))) continue;
        const custom = (this.schemes[fi.platform] ?? []).filter((x) => !nonAppSchemes.has(x));
        const schemeNear = (i: number) => {
          for (let j = Math.max(0, i - 10); j < Math.min(lines.length, i + 10); j++) {
            const m = /scheme\b[^=\n]*==\s*"([\w+.-]+)"|"([\w+.-]+)"\s*==\s*\w+\.scheme\b/.exec(lines[j]!);
            if (m) return m[1] ?? m[2]!;
          }
          return custom.length === 1 ? custom[0]! : '';
        };
        const emit = (host: string, i: number) => {
          if (!/^[\w.-]+$/.test(host)) return;
          this.declare({ platform: fi.platform, scheme: schemeNear(i), host, path: '', file, source: 'url-host-dispatch' });
        };
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i]!;
          for (const m of l.matchAll(/\.host\s*==\s*"([^"]+)"|"([^"]+)"\s*==\s*[\w.?]+\.host\b/g)) emit(m[1] ?? m[2]!, i);
          if (/\bswitch\s+[\w.?]*\.host\b[^{]*\{/.test(l)) {
            let depth = 0;
            for (let j = i; j < lines.length; j++) {
              const t = lines[j]!;
              if (j > i && depth === 1) for (const m of t.matchAll(/^\s*case\s+((?:"[^"]+"\s*,?\s*)+):/g)) for (const h of m[1]!.matchAll(/"([^"]+)"/g)) emit(h[1]!, i);
              depth += (t.match(/\{/g) ?? []).length - (t.match(/\}/g) ?? []).length;
              if (depth <= 0 && j > i) break;
            }
          }
        }
      }
    }
  }

  /** Record a declared deep link (deduplicated). */
  declare(d: DeepLink): void {
    const list = ((this.f as FactsX).deeplinks ??= []);
    const k = [d.platform, d.scheme, d.host, d.path, d.file, d.route_id ?? ''].join('|');
    if (this.declared.has(k)) return;
    this.declared.add(k);
    list.push(d);
  }

  plist(platform: string, fp: string, rel = ''): void {
    let b: string;
    try {
      b = fs.readFileSync(fp, 'utf8');
    } catch {
      return;
    }
    let lastKey = '', cur = '';
    let inSchemes = false, depth = 0;
    for (const t of xmlTokens(b)) {
      if (t.type === 'start') {
        cur = t.name;
        if (cur === 'array' && lastKey === 'CFBundleURLSchemes') {
          inSchemes = true;
          depth = 0;
        } else if (inSchemes && cur === 'array') depth++;
      } else if (t.type === 'end') {
        if (t.name === 'array' && inSchemes) {
          if (depth === 0) inSchemes = false;
          else depth--;
        }
        cur = '';
      } else {
        const s = trimSpace(t.text);
        if (!s) continue;
        if (cur === 'key') lastKey = s;
        else if (cur === 'string' && inSchemes) {
          this.addScheme(platform, s);
          this.declare({ platform, scheme: s, host: '', path: '', file: rel, source: 'CFBundleURLSchemes' });
        }
      }
    }
  }

  /** Associated domains: `applinks:host` in *.entitlements -> https://host (universal links). */
  entitlements(platform: string, fp: string, rel: string): void {
    let b: string;
    try {
      b = fs.readFileSync(fp, 'utf8');
    } catch {
      return;
    }
    let lastKey = '', cur = '';
    for (const t of xmlTokens(b)) {
      if (t.type === 'start') cur = t.name;
      else if (t.type === 'end') cur = '';
      else {
        const s = trimSpace(t.text);
        if (!s) continue;
        if (cur === 'key') lastKey = s;
        else if (cur === 'string' && lastKey === 'com.apple.developer.associated-domains' && s.startsWith('applinks:')) {
          const host = s.slice(9).replace(/\?.*$/, '');
          if (host) this.declare({ platform, scheme: 'https', host, path: '', file: rel, source: 'applinks' });
        }
      }
    }
  }

  moduleJSON5(platform: string, fp: string, rel: string): void {
    let b: string;
    try {
      b = fs.readFileSync(fp, 'utf8');
    } catch {
      return;
    }
    let m: { module?: { name?: string; routerMap?: string; abilities?: { name?: string; skills?: { uris?: { scheme?: string; host?: string; path?: string; pathStartWith?: string; pathRegex?: string }[] }[] }[] } };
    try {
      m = JSON.parse(json5(b));
    } catch (e) {
      (this.f.warnings ??= []).push(rel + ': ' + (e as Error).message);
      return;
    }
    const mod = m?.module ?? {};
    const rm = typeof mod.routerMap === 'string' ? mod.routerMap : '';
    if (rm.startsWith('$profile:') && rm.slice(9) !== 'router_map') {
      const f = path.join(path.dirname(fp), 'resources', 'base', 'profile', rm.slice(9) + '.json');
      if (fs.existsSync(f)) {
        const p = this.cfg.platforms.find((x) => x.name === platform);
        if (p) this.routerMap(p, f);
      }
    }
    for (const a of mod.abilities ?? []) {
      (this.f.entries ??= []).push({ platform, kind: 'ability', name: a.name ?? '', file: rel });
      for (const sk of a.skills ?? [])
        for (const u of sk.uris ?? []) {
          if (u.scheme && u.scheme !== 'http' && u.scheme !== 'https') this.addScheme(platform, u.scheme);
          if (!u.scheme) continue;
          let pa = u.path || u.pathStartWith || u.pathRegex || '';
          if (pa && !pa.startsWith('/')) pa = '/' + pa;
          this.declare({ platform, scheme: u.scheme, host: u.host ?? '', path: pa, file: rel, source: 'skills.uris' });
        }
    }
  }

  routerMap(p: Platform, fp: string): void {
    let b: string;
    try {
      b = fs.readFileSync(fp, 'utf8');
    } catch {
      return;
    }
    let m: { routerMap?: { name?: string; pageSourceFile?: string; buildFunction?: string; data?: Record<string, string> }[] };
    try {
      m = JSON.parse(json5(b));
    } catch (e) {
      (this.f.warnings ??= []).push(fp + ': ' + (e as Error).message);
      return;
    }
    const mod = moduleDir(fp);
    const proot = path.join(this.res.dir, p.root).split(path.sep).join('/');
    const modRel = trimPrefix(trimPrefix(mod, proot), '/');
    for (const r of m?.routerMap ?? []) {
      const name = r.name ?? '';
      const pattern = r.data?.pattern || name;
      const srcRel = trimPrefix(r.pageSourceFile ?? '', './');
      const pfile = modRel ? modRel + '/' + srcRel : srcRel;
      const file = trimPrefix(p.root + '/' + pfile, './');
      let sym = p.name + '://' + pfile + '#' + (r.buildFunction ?? '');
      if (!getSym(this.g, sym)) {
        (this.f.warnings ??= []).push(`${trimPrefix(fp.split(path.sep).join('/'), this.res.dir + '/')}: route ${JSON.stringify(name)} buildFunction ${r.buildFunction ?? ''} not found in ${file}`);
        sym = '';
      }
      this.f.routes!.push({ platform: p.name, route_id: name, pattern, deeplink: '', file, symbol: sym });
    }
  }

  mainPages(platform: string, fp: string, rel: string): void {
    let b: string;
    try {
      b = fs.readFileSync(fp, 'utf8');
    } catch {
      return;
    }
    let m: { src?: string[] };
    try {
      m = JSON.parse(json5(b));
    } catch {
      return;
    }
    const srcMain = path.posix.dirname(path.posix.dirname(path.posix.dirname(path.posix.dirname(rel))));
    const mod = moduleDir(rel);
    for (const s of m?.src ?? []) {
      (this.f.entries ??= []).push({ platform, kind: 'main_page', name: s, file: rel });
      const file = trimPrefix(srcMain + '/ets/' + s + '.ets', './');
      let rid = trimPrefix(s, 'pages/').split('/').map(snake).join('_');
      const prev = this.mainPageIDs.get(rid);
      if (prev && prev !== mod) rid = mod.split('/').map((seg) => snake(seg.replace(/[-.]/g, '_'))).join('_') + '_' + rid;
      this.mainPageIDs.set(rid, mod);
      let sym = '';
      if (!this.topByFile) {
        this.topByFile = new Map();
        for (const x of this.g.symbols) {
          if (!x.parent) {
            const a = this.topByFile.get(x.file);
            if (a) a.push(x);
            else this.topByFile.set(x.file, [x]);
          }
        }
      }
      for (const x of this.topByFile.get(file) ?? []) {
        if (x.kind === 'component' || x.kind === 'struct') {
          sym = x.id;
          if (x.signature.includes('@Entry')) break;
        }
      }
      if (!sym || this.calls(file).some((c) => c.callee === 'Navigation')) continue;
      this.f.routes!.push({ platform, route_id: rid, pattern: s, deeplink: '', file, symbol: sym });
    }
  }

  navGraph(platform: string, fp: string, rel: string): void {
    let b: string;
    try {
      b = fs.readFileSync(fp, 'utf8');
    } catch {
      return;
    }
    const stack: ({ r: Route; args: string[] } | null)[] = [];
    const destTags = new Set(['fragment', 'dialog', 'activity', 'composable']);
    for (const t of xmlTokens(b)) {
      if (t.type === 'start') {
        const at = (n: string) => t.attrs[n] ?? '';
        if (destTags.has(t.name)) {
          let id = at('id');
          id = id.slice(id.lastIndexOf('/') + 1);
          if (!id) {
            stack.push(null);
            continue;
          }
          const d = { r: { platform, route_id: snake(id), pattern: '', deeplink: '', file: rel, symbol: '' } as Route, args: [] as string[] };
          const cls = at('name');
          if (cls) {
            const s = this.findSym(platform, lastSeg(cls), 'class', 'object', 'function', 'composable');
            if (s) {
              d.r.symbol = s.id;
              d.r.file = s.file;
            }
          }
          stack.push(d);
        } else if (t.name === 'argument') {
          const top = stack[stack.length - 1];
          if (top) top.args.push(at('name'));
        } else if (t.name === 'deepLink') {
          const top = stack[stack.length - 1];
          const u = at('uri');
          if (top && u) {
            top.r.deeplink = u;
            const m = /^([^:/]+):\/\/([^/]*)(.*)$/.exec(u);
            this.declare(m ? { platform, scheme: m[1]!, host: m[2]!, path: m[3]!, file: rel, source: 'nav-graph', route_id: top.r.route_id } : { platform, scheme: '', host: '', path: u, file: rel, source: 'nav-graph', route_id: top.r.route_id });
            const i = u.indexOf('://');
            if (i > 0) this.addScheme(platform, u.slice(0, i));
          }
        }
      } else if (t.type === 'end' && destTags.has(t.name)) {
        if (stack.length === 0) continue;
        const d = stack.pop();
        if (!d) continue;
        d.r.pattern = d.r.route_id + d.args.map((a) => '/{' + a + '}').join('');
        this.f.routes!.push(d.r);
      }
    }
  }

  sortAll(): void {
    for (const r of this.f.routes as RouteX[]) {
      // prefer a declared link; derive `<scheme>://<pattern>` only when the platform declares exactly
      // one app scheme (with several, e.g. an app scheme plus an OAuth callback, the guess is unreliable)
      if (!r.deeplink && r.deeplinks?.length && r.deeplinks[0]!.includes('://')) r.deeplink = r.deeplinks[0]!;
      if (!r.deeplink && !this.noDerive.has(r) && (this.schemes[r.platform]?.length ?? 0) === 1) r.deeplink = this.deeplink(r.platform, r.pattern);
      const i = r.symbol.lastIndexOf('#');
      r.name = i >= 0 ? lastSeg(r.symbol.slice(i + 1)) || r.route_id : r.route_id;
      if (r.deeplinks) {
        const d = r.deeplinks;
        delete r.deeplinks;
        r.deeplinks = d; // keep `deeplinks` after `name` in the JSON
      }
    }
    (this.f as FactsX).deeplinks?.sort((a, b) => cmpStr(a.platform, b.platform) || cmpStr(a.file, b.file) || cmpStr(linkString(a), linkString(b)));
    this.f.routes!.sort((a, b) => cmpStr(a.platform, b.platform) || cmpStr(a.route_id, b.route_id));
    this.f.testids!.sort((a, b) => cmpStr(a.platform, b.platform) || cmpStr(a.tid, b.tid) || cmpStr(a.file, b.file) || a.line - b.line);
    this.f.apis!.sort((a, b) => cmpStr(a.platform, b.platform) || cmpStr(a.path, b.path) || cmpStr(a.method, b.method));
    this.f.entries?.sort((a: Entry, b: Entry) => cmpStr(a.platform + a.kind + a.name, b.platform + b.kind + b.name));
    for (const k of Object.keys(this.schemes)) this.schemes[k]!.sort(cmpStr);
  }
}

/** HTTP verbs a function body uses (builder calls, method labels, HTTPMethod enums, post* helpers). */
// a body that actually issues an HTTP request (not a web view / namespace / file use of a URL)
const reqContextRe = /\b(?:request|newCall|execute|fetch|createHttp|HttpRequest|dataTask|URLRequest|AF\.request|httpClient|client\.(?:get|post|put|delete|patch)|Request\.Builder|Request\(|getJson|getString|download)\b/;
// local files / documents / web pages are not API endpoints
const docAssetRe = /\.(?:db|sqlite3?|plist|html?|md|txt|xml|xhtml)$|\/(?:README|LICENSE)[^/]*$/i;

function methodsIn(b: string): string[] {
  const out = new Set<string>();
  for (const m of b.matchAll(/\.(get|post|put|patch|delete|head)\s*\(/gi)) out.add(m[1]!.toUpperCase());
  for (const m of b.matchAll(/\b(?:method|httpMethod)\s*[:=]\s*(?:[\w.]*\.)?["'.]?(GET|POST|PUT|PATCH|DELETE|HEAD)\b/gi)) out.add(m[1]!.toUpperCase());
  for (const m of b.matchAll(/\bHTTPMethod\.(get|post|put|patch|delete|head)\b/gi)) out.add(m[1]!.toUpperCase());
  if (/\bpost[A-Z]\w*\s*\(/.test(b)) out.add('POST');
  const nonGet = [...out].filter((v) => v !== 'GET');
  if (nonGet.length) return nonGet;
  return [...out];
}

function moduleDir(p: string): string {
  const s = p.split(path.sep).join('/');
  const i = s.indexOf('/src/main/');
  if (i >= 0) return s.slice(0, i);
  return path.posix.dirname(s);
}

function androidString(manifest: string, name: string): string {
  let b: string;
  try {
    b = fs.readFileSync(path.join(path.dirname(manifest), 'res', 'values', 'strings.xml'), 'utf8');
  } catch {
    return '';
  }
  let capture = false;
  let text = '';
  for (const t of xmlTokens(b)) {
    if (t.type === 'start' && t.name === 'string' && t.attrs.name === name) {
      capture = true;
      continue;
    }
    if (capture) {
      if (t.type === 'text') text += t.text;
      else if (t.type === 'end' && t.name === 'string') return trimSpace(text);
    }
  }
  return '';
}

/** Compute all facts for a scan result. */
export function extractFacts(cfg: Config, res: ScanResult): Facts {
  const c = new Ctx(cfg, res);
  for (const p of cfg.platforms) c.resources(p);
  c.codeDeepLinks();
  c.routes();
  c.screenRoutes();
  c.uikit();
  c.testIDs();
  c.apis();
  c.sortAll();
  return c.f;
}

export { json5 as JSON5 };
