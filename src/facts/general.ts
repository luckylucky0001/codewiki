// Generic recognisers added for held-out generalisation (bench/accuracy/GENERALIZATION.md):
// Decompose configs, minimal Objective-C (no grammar: line regexes over .h/.m), Swift String-enum
// testIDs, ViewBinding ids in tests, and string-concatenation / wrapper-call HTTP endpoints.
// Each function takes the facts context; pure text helpers are exported for unit tests.
import fs from 'node:fs';
import path from 'node:path';
import type { Symbol, Route } from '../model.js';
import { getSym } from '../model.js';
import { walkDir } from '../scan/scan.js';
import { shadowed } from '../config/config.js';
import type { Ctx } from './facts.js';
import { isTestPath, lastSeg, snake, supertypes } from './facts.js';

const httpVerbs = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);

// ---------------------------------------------------------------- Decompose (KMP)

/** Config type names a Decompose navigation host uses: `StackNavigation<Config>`, `ChildStack<Config, Child>`,
 * `childStack(serializer = Config.serializer(), …)`, `childSlot<Config, …>`. */
export function decomposeConfigNames(text: string): string[] {
  if (!/\b(?:childStack|childSlot|childPages|StackNavigation|SlotNavigation|PagesNavigation|ChildStack|ChildSlot)\b/.test(text)) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(?:StackNavigation|SlotNavigation|PagesNavigation|ChildStack|ChildSlot|childStack|childSlot|childPages)\s*<\s*([\w.]+)/g)) out.add(lastSeg(m[1]!));
  if (/\b(?:childStack|childSlot|childPages)\s*[(<]/.test(text)) for (const m of text.matchAll(/\bserializer\s*=\s*([\w.]+)\.serializer\(\)/g)) out.add(lastSeg(m[1]!));
  for (const n of ['Any', 'Nothing', 'Unit']) out.delete(n);
  return [...out].sort();
}

/** The component / content a `when (config)` branch maps a config subclass to:
 * `is Config.Details -> Child.Details(DefaultDetailsComponent(ctx, config.id))` → DefaultDetailsComponent. */
export function decomposeMapping(text: string, cfgName: string, sub: string): string {
  const re = new RegExp('(?:\\bis\\s+)?\\b(?:' + cfgName + '\\.)?' + sub + '\\b\\s*->\\s*([^\\n]*(?:\\n[^\\n]*){0,2})', 'g');
  for (const m of text.matchAll(re)) {
    const rhs = m[1]!;
    const names = [...rhs.matchAll(/(?<![.\w])([A-Z]\w*)\s*[({]/g)].map((x) => x[1]!).filter((n) => n !== 'Child' && n !== sub && n !== cfgName);
    const pref = names.find((n) => /(?:Component|Content|Screen|Page|View|Ui|UI)$/.test(n));
    if (pref) return pref;
    // `Child.Details(…)` wrappers only: no mapped component
  }
  return '';
}

export function decomposeRoutes(c: Ctx, add: (r: Route) => void, known: Set<string>): void {
  const hosts = new Map<string, string[]>(); // platform|config -> host files
  for (const file of c.sortedFiles()) {
    const fi = c.g.files[file]!;
    if (fi.lang !== 'kotlin' || isTestPath(file)) continue;
    const text = c.fileLines(file).join('\n');
    for (const n of decomposeConfigNames(text)) {
      const k = fi.platform + '|' + n;
      const a = hosts.get(k);
      if (a) a.push(file);
      else hosts.set(k, [file]);
    }
  }
  if (!hosts.size) return;
  const subsOf = new Map<string, Symbol[]>();
  for (const s of c.g.symbols) {
    if (s.lang !== 'kotlin' || (s.kind !== 'class' && s.kind !== 'object') || isTestPath(s.file)) continue;
    const head = s.signature.split(/[:{(]/)[0]!;
    if (/\b(sealed|abstract)\b/.test(head)) continue;
    for (const sup of supertypes(s)) {
      const k = s.platform + '|' + sup;
      if (!hosts.has(k)) continue;
      const a = subsOf.get(k);
      if (a) a.push(s);
      else subsOf.set(k, [s]);
    }
  }
  for (const [k, files] of [...hosts].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const [platform, cfgName] = k.split('|') as [string, string];
    const decl = c.findSym(platform, cfgName, 'class', 'interface');
    if (!decl || !/\bsealed\b/.test(decl.signature)) continue;
    const texts = files.map((f) => c.fileLines(f).join('\n'));
    for (const s of subsOf.get(k) ?? []) {
      if (known.has(platform + '|' + s.name)) continue;
      let sym = s;
      for (const t of texts) {
        const comp = decomposeMapping(t, cfgName, s.name);
        if (!comp) continue;
        const cs = c.findSymNear(platform, comp, files[0]!, 'class', 'object', 'function', 'composable');
        if (cs) {
          sym = cs;
          break;
        }
      }
      known.add(platform + '|' + s.name);
      add({ platform, route_id: s.name, pattern: s.name, deeplink: '', file: sym.file, symbol: sym.id });
    }
  }
}

// ---------------------------------------------------------------- Objective-C (no grammar)

const objcSkipDir = (n: string) => /^(build|Pods|Carthage|node_modules|DerivedData|vendor|Vendor|Third[ _-]?Party(?: Code)?|ThirdParty|External|Externals)$/i.test(n);

export interface ObjCFile {
  rel: string;
  text: string;
}

/** `@interface Name : Super` declarations (class extensions / categories `@interface X ()` skipped). */
export function objcInterfaces(text: string): { name: string; sup: string; line: number }[] {
  const out: { name: string; sup: string; line: number }[] = [];
  text.split('\n').forEach((l, i) => {
    const m = /^\s*@interface\s+([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*)/.exec(l);
    if (m) out.push({ name: m[1]!, sup: m[2]!, line: i + 1 });
  });
  return out;
}

/** Accessibility identifiers set in Objective-C: `x.accessibilityIdentifier = @"id"`, `[x setAccessibilityIdentifier:@"id"]`. */
export function objcTestIDs(text: string): { tid: string; line: number }[] {
  const out: { tid: string; line: number }[] = [];
  text.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/\.accessibilityIdentifier\s*=\s*@"([^"\\]+)"|setAccessibilityIdentifier:\s*@"([^"\\]+)"/g)) out.push({ tid: m[1] ?? m[2]!, line: i + 1 });
  });
  return out;
}

/** HTTP endpoints in Objective-C: `@"https://host/x/%@"` literals (stringWithFormat / URLWithString) in a
 * method that issues a request (NSURLSession / NSURLRequest / AFNetworking …); method from HTTPMethod. */
export function objcAPIs(text: string): { method: string; path: string; line: number }[] {
  const out: { method: string; path: string; line: number }[] = [];
  const lines = text.split('\n');
  // method bodies: from a line starting with `-`/`+` to the next such line
  const starts: number[] = [];
  lines.forEach((l, i) => {
    if (/^[-+]\s*\(/.test(l)) starts.push(i);
  });
  starts.push(lines.length);
  for (let k = 0; k + 1 < starts.length; k++) {
    const body = lines.slice(starts[k], starts[k + 1]).join('\n');
    if (!/\b(?:NSURLSession|NSURLRequest|NSMutableURLRequest|dataTaskWithRequest|dataTaskWithURL|AFHTTPSessionManager|GET:|POST:|PUT:|DELETE:|sendAsynchronousRequest)\b/.test(body)) continue;
    let method = '';
    const hm = /HTTPMethod\s*[:=]\s*@"(\w+)"|setHTTPMethod:\s*@"(\w+)"/.exec(body);
    if (hm) method = (hm[1] ?? hm[2]!).toUpperCase();
    else {
      const af = /\b(GET|POST|PUT|DELETE|PATCH):\s*@?/.exec(body);
      if (af) method = af[1]!;
    }
    if (!httpVerbs.has(method)) method = 'GET';
    for (const m of body.matchAll(/@"(https?:\/\/[^"\s/]+\/[^"\s]*)"/g)) {
      const raw = m[1]!.replace(/%(?:@|d|ld|lu|i|s)/g, '{param}');
      const p = raw.replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '');
      if (!p || p === '/' || /\.(?:png|jpe?g|gif|svg|html?|css|js)$/i.test(p)) continue;
      const line = starts[k]! + body.slice(0, m.index).split('\n').length;
      out.push({ method, path: p, line });
    }
  }
  return out;
}

const vcBasesObjC = new Set(['UIViewController', 'UITableViewController', 'UICollectionViewController', 'UIPageViewController', 'NSViewController']);
const vcContainersObjC = new Set(['UINavigationController', 'UITabBarController', 'UISplitViewController', 'UIAlertController', 'UISearchController', 'UIActivityViewController', 'UIImagePickerController']);

/** Objective-C screens, testIDs and APIs on iOS platforms (files the scanner does not parse). */
export function objc(c: Ctx): void {
  const files: ObjCFile[] = [];
  for (const p of c.cfg.platforms) {
    if (p.name !== 'ios') continue;
    const root = path.join(c.res.dir, p.root);
    walkDir(root, (fp, name, isDir) => {
      if (isDir) return !(objcSkipDir(name) || (name.startsWith('.') && fp !== root));
      if (!/\.(?:h|m|mm)$/.test(name)) return;
      const rel = path.relative(c.res.dir, fp).split(path.sep).join('/');
      if (shadowed(c.cfg, p, rel)) return;
      try {
        files.push({ rel, text: fs.readFileSync(fp, 'utf8') });
      } catch {
        /* unreadable */
      }
    });
  }
  if (!files.length) return;
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const plat = 'ios';
  const prefix = (rel: string) => {
    const p = c.cfg.platforms.find((x) => x.name === plat && (rel === x.root || rel.startsWith(x.root.replace(/\/$/, '') + '/') || x.root === '.' || x.root === ''));
    if (!p || p.root === '.' || p.root === '') return rel;
    return rel.slice(p.root.replace(/\/$/, '').length + 1);
  };
  // class -> super (Objective-C plus Swift classes)
  const sup = new Map<string, string>();
  const decl = new Map<string, { rel: string; line: number }>();
  for (const f of files)
    for (const d of objcInterfaces(f.text)) {
      sup.set(d.name, d.sup);
      const prev = decl.get(d.name);
      if (!prev || (prev.rel.endsWith('.m') && f.rel.endsWith('.h')) || (isTestPath(prev.rel) && !isTestPath(f.rel))) decl.set(d.name, { rel: f.rel, line: d.line });
    }
  const isVC = (n: string, depth = 0): boolean => {
    if (vcContainersObjC.has(n)) return false;
    if (vcBasesObjC.has(n)) return true;
    const s = sup.get(n);
    return !!s && depth < 12 && isVC(s, depth + 1);
  };
  const subCount = new Map<string, number>();
  for (const [n, s] of sup) if (!isTestPath(decl.get(n)?.rel ?? '')) subCount.set(s, (subCount.get(s) ?? 0) + 1);
  const all = files.map((f) => f.text).join('\n');
  const have = new Set(c.f.routes!.map((r) => r.platform + '|' + r.route_id));
  for (const [n, d] of [...decl].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (vcBasesObjC.has(n) || !isVC(n) || isTestPath(d.rel) || (subCount.get(n) ?? 0) >= 2) continue;
    if (/^(?:Base|Abstract)/.test(n) || /(Accessory|Cell|Preview|Child|Embedded|Container)(View)?Controller$/.test(n)) continue;
    // embedded children (`[self addChildViewController:x]` where x is created from this class) without presentation
    const created = new RegExp('\\[\\s*\\[?\\s*' + n + '\\s+(?:alloc|new)\\b').test(all) || new RegExp('\\b' + n + '\\(').test(all);
    const childOnly = new RegExp('addChildViewController:\\s*(?:\\[\\s*' + n + '\\b|\\w+\\s*\\]).*').test(all) && !/presentViewController|pushViewController/.test(all);
    if (childOnly && !created) continue;
    const rid = screenIDObjC(n);
    if (have.has(plat + '|' + rid)) continue;
    have.add(plat + '|' + rid);
    c.f.routes!.push({ platform: plat, route_id: rid, pattern: rid, deeplink: '', file: d.rel, symbol: plat + '://' + prefix(d.rel) + '#' + n });
    c.noDerive.add(c.f.routes![c.f.routes!.length - 1]!);
  }
  for (const f of files) {
    if (f.rel.endsWith('.h')) continue;
    for (const t of objcTestIDs(f.text)) c.f.testids!.push({ platform: plat, tid: t.tid, route_id: '', file: f.rel, line: t.line });
    if (isTestPath(f.rel)) continue;
    for (const a of objcAPIs(f.text)) {
      const k = plat + '|' + a.method + '|' + a.path;
      if (c.f.apis!.some((x) => x.platform + '|' + x.method + '|' + x.path === k)) continue;
      c.f.apis!.push({ platform: plat, method: a.method, path: a.path, file: f.rel, symbol: '' });
    }
  }
}

function screenIDObjC(name: string): string {
  let base = name;
  for (const suf of ['ViewController', 'Controller', 'VC']) {
    if (base.endsWith(suf) && base.length > suf.length) {
      base = base.slice(0, -suf.length);
      break;
    }
  }
  return snake(base);
}

// ---------------------------------------------------------------- Swift String-enum testIDs

/** Raw value of a Swift String enum case referenced as `X.foo.rawValue`, `X.foo`, `.foo.rawValue` or `.foo`
 * (implicit raw value = case name). Implicit members resolve only when one String enum declares the case. */
export function swiftEnumRaw(c: Ctx, platform: string, ref: string, near: string): string {
  let r = ref.trim().replace(/\.rawValue$/, '').replace(/^Self\./, '');
  const implicit = r.startsWith('.');
  r = r.replace(/^\./, '');
  const segs = r.split('.');
  if (!segs.every((s) => /^[A-Za-z_]\w*$/.test(s)) || segs.length === 0) return '';
  const caseName = segs[segs.length - 1]!;
  const owner = segs.length >= 2 ? segs[segs.length - 2]! : '';
  if (!owner && !implicit && !ref.endsWith('.rawValue')) return '';
  const cands: Symbol[] = [];
  for (const s of c.byName.get(platform + '\0' + caseName) ?? []) {
    if (s.lang !== 'swift' || s.kind !== 'case' || !s.parent) continue;
    const p = getSym(c.g, s.parent);
    if (!p || p.kind !== 'enum' || !/:\s*(?:[\w.]+\s*,\s*)*String\b/.test(p.signature)) continue;
    if (owner && p.name !== owner) continue;
    cands.push(s);
  }
  if (!cands.length) return '';
  let s = cands[0]!;
  if (cands.length > 1) {
    const vals = new Set(cands.map((x) => rawOf(c, x)));
    if (vals.size > 1) {
      // nearest declaration
      const best = c.findSymNear(platform, caseName, near, 'case');
      if (!best || !cands.includes(best)) return '';
      s = best;
    }
  }
  return rawOf(c, s);
}

function rawOf(c: Ctx, s: Symbol): string {
  if (s.value !== undefined && s.value !== '') return s.value;
  // `case a, b` share one symbol per name in some grammars; parse the declaration line
  const src = c.symbolSource(s);
  const m = new RegExp('\\b' + s.name + '\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"').exec(src);
  if (m) return m[1]!;
  if (/=/.test(src.split('\n')[0] ?? '') && !/,/.test(src)) return '';
  return s.name;
}

/** Swift accessibility ids passed as String-enum cases: `.accessibilityIdentifier(X.foo.rawValue)`,
 * `x.accessibilityIdentifier = X.foo.rawValue` and custom modifiers taking the enum (`.testID(.foo)`). */
export function swiftEnumTestIDs(c: Ctx, push: (platform: string, tid: string, file: string, line: number) => void): void {
  for (const file of c.sortedFiles()) {
    const fi = c.g.files[file]!;
    if (fi.lang !== 'swift') continue;
    for (const call of c.calls(file)) {
      if (!call.args?.length) continue;
      const custom = /^(?:accessibilityID|accessibilityId|accessibilityIdentifier|a11yID|a11yId|a11yIdentifier|testID|testId|testIdentifier|testTag|identifier)$/.test(call.callee);
      if (!custom) continue;
      const a = call.args[0]!;
      const t = a.text.trim();
      if (!/^\.?[A-Za-z_][\w.]*$/.test(t)) continue;
      if (call.callee === 'accessibilityIdentifier' && !/\.rawValue$/.test(t) && !t.startsWith('.')) {
        // plain constants are handled by the generic rule; enum cases need the enum
      }
      const v = swiftEnumRaw(c, fi.platform, t, file);
      if (v) push(fi.platform, v, file, call.line);
    }
    const lines = c.fileLines(file);
    if (!lines.some((l) => l.includes('accessibilityIdentifier'))) continue;
    lines.forEach((l, i) => {
      const m = /\.accessibilityIdentifier\s*=\s*(\.?[A-Za-z_][\w.]*)\s*(?:\/\/.*)?$/.exec(l);
      if (!m) return;
      const v = swiftEnumRaw(c, fi.platform, m[1]!, file);
      if (v) push(fi.platform, v, file, i + 1);
    });
  }
}

// ---------------------------------------------------------------- ViewBinding ids in tests

/** `binding.fooBar` in a test source ↔ `android:id="@+id/foo_bar"` (ViewBinding property names). */
export function bindingIDsUsedByTests(c: Ctx): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>();
  for (const file of c.sortedFiles()) {
    const fi = c.g.files[file]!;
    if ((fi.lang !== 'kotlin' && fi.lang !== 'java') || !isTestPath(file)) continue;
    const text = c.fileLines(file).join('\n');
    if (!/\b\w*[bB]inding\b/.test(text)) continue;
    for (const m of text.matchAll(/\b\w*[bB]inding[!?]*\.([a-z]\w*)/g)) {
      const prop = m[1]!;
      if (['root', 'let', 'apply', 'also', 'run', 'executePendingBindings', 'lifecycleOwner', 'unbind', 'getRoot'].includes(prop)) continue;
      let u = used.get(fi.platform);
      if (!u) used.set(fi.platform, (u = new Set()));
      u.add(prop);
    }
  }
  return used;
}

/** snake_case layout id → ViewBinding property name. */
export function bindingName(id: string): string {
  return id.replace(/_+([a-zA-Z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

// ---------------------------------------------------------------- HTTP: concatenation and wrappers

/** String-concatenated URL paths in a body: `baseUrl + "api/v1/x"`, `BASE + "/x"`, Kotlin `"$BASE/x"` /
 * `"${BASE}/x"`, Swift `"\(base)/x"`. The base must look like a URL/host variable. */
export function concatPaths(body: string): string[] {
  const out: string[] = [];
  const baseRe = /(?:base|host|server|domain|endpoint|api|url|root)\w*$/i;
  for (const m of body.matchAll(/\b([A-Za-z_][\w.]*?)(?:\(\))?\s*\+\s*"([^"\s]*)"/g)) {
    const base = lastSeg(m[1]!.replace(/\(\)$/, ''));
    const lit = m[2]!;
    if (!baseRe.test(base) || !/^\/?[A-Za-z{]/.test(lit) || /^https?:/.test(lit) || lit.includes('=') && !lit.includes('?')) continue;
    out.push(lit);
  }
  for (const m of body.matchAll(/"\$\{?([A-Za-z_][\w.]*?)\}?(\/[^"\s]*)"/g)) if (baseRe.test(lastSeg(m[1]!))) out.push(m[2]!);
  for (const m of body.matchAll(/"\\\(([A-Za-z_][\w.]*?)(?:\(\))?\)(\/[^"\s]*)"/g)) if (baseRe.test(lastSeg(m[1]!))) out.push(m[2]!);
  return out.map((x) => x.replace(/\$\{?([A-Za-z_]\w*)\}?/g, '{$1}'));
}

/** Parameter names of a function signature (`function get(url: string, data?: object)` → [url, data]). */
export function paramNames(sig: string): string[] {
  const i = sig.indexOf('(');
  if (i < 0) return [];
  let depth = 0, j = i;
  for (; j < sig.length; j++) {
    if (sig[j] === '(') depth++;
    else if (sig[j] === ')' && --depth === 0) break;
  }
  const inner = sig.slice(i + 1, j);
  const out: string[] = [];
  let d = 0, cur = '';
  for (const ch of inner) {
    if ('([{<'.includes(ch)) d++;
    else if (')]}>'.includes(ch)) d--;
    if (ch === ',' && d === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((p) => (/^\s*(?:(?:public|private|protected|readonly)\s+)*\.{0,3}([A-Za-z_$][\w$]*)/.exec(p)?.[1] ?? '')).filter((x) => x !== '');
}

/** Object-literal constant tables: `const API = { LOGIN: '/user/login', … }` → {API.LOGIN: '/user/login'}. */
export function objectConsts(name: string, src: string): Map<string, string> {
  const m = new Map<string, string>();
  const body = src.slice(src.indexOf('{') + 1);
  for (const x of body.matchAll(/(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:\s*(['"`])((?:(?!\2)[^\\\n])*)\2/g)) if (!x[3]!.includes('${')) m.set(name + '.' + x[1]!, x[3]!);
  return m;
}

const netBodyRe = /\bcreateHttp\s*\(|\.request\s*\(|\baxios\b|\brcp\.|\bsession\.(?:get|post|put|delete|fetch)\b|\bcreateSession\s*\(|\binstance\.(?:get|post|put|delete|patch|request)\s*\(|\bhttpRequest\.request\b|\bfetch\s*\(/;

interface Wrapper {
  name: string;
  owner: string;
  urlIdx: number;
  methodIdx: number;
  method: string; // from the name or a literal passed inward
  base: string; // base URL path prepended in the body (`BASE_URL + url`)
  file: string;
}

/** ArkTS / TS HTTP wrappers: functions or methods that issue a request (http.createHttp().request,
 * @ohos/axios, rcp, fetch) with a url/path parameter, followed to call sites passing literals or
 * constants (static fields, `const API = {…}` tables); unresolved arguments are skipped. */
export function arktsWrapperAPIs(c: Ctx, add: (a: { platform: string; method: string; path: string; file: string; symbol: string }) => void): void {
  const langs = new Set(['arkts', 'typescript', 'javascript', 'tsx']);
  const fns: Symbol[] = [];
  const objConsts = new Map<string, Map<string, string>>();
  for (const s of c.g.symbols) {
    if (!langs.has(s.lang) || isTestPath(s.file)) continue;
    if (s.kind === 'function' || s.kind === 'method') fns.push(s);
    else if ((s.kind === 'const' || s.kind === 'property') && /^[A-Z_$][\w$]*$/i.test(s.name) && !s.value && s.end_line > s.start_line) {
      const src = c.symbolSource(s);
      if (!/^[^=]*=\s*\{/.test(src.replace(/\n/g, ' ')) && !/^\s*(?:static\s+)?(?:readonly\s+)?\w+\s*(?::[^=]*)?=\s*\{/.test(src)) continue;
      let m = objConsts.get(s.platform);
      if (!m) objConsts.set(s.platform, (m = new Map()));
      for (const [k, v] of objectConsts(s.name, src)) m.set(k, v);
    }
  }
  const resolve = (platform: string, text: string): string => {
    const t = text.trim();
    const lit = /^(['"`])((?:(?!\1)[^\\])*)\1$/.exec(t);
    if (lit) return lit[2]!.includes('${') ? '' : lit[2]!;
    if (!/^[A-Za-z_$][\w$.]*$/.test(t)) {
      // `API.BASE + '/x'` / `Api.LIST + id`
      const parts = t.split(/\s*\+\s*/);
      if (parts.length < 2) return '';
      let out = '';
      for (const p of parts) {
        const v = resolve(platform, p);
        if (v) out += v;
        else if (/^[A-Za-z_$][\w$.]*$/.test(p) && out) out += '{' + lastSeg(p) + '}';
        else return '';
      }
      return out;
    }
    const oc = objConsts.get(platform);
    const segs = t.replace(/^this\./, '').split('.');
    const k2 = segs.slice(-2).join('.');
    if (oc?.has(k2)) return oc.get(k2)!;
    const [v, ok] = c.lookup(platform, t);
    return ok ? v : '';
  };
  const wrappers = new Map<string, Wrapper[]>();
  const addW = (w: Wrapper) => {
    const a = wrappers.get(w.name);
    if (a) {
      if (!a.some((x) => x.owner === w.owner && x.file === w.file)) a.push(w);
    } else wrappers.set(w.name, [w]);
  };
  const methodFromName = (n: string) => {
    const m = /^(get|post|put|delete|patch|head)(?:[A-Z_]|$)/i.exec(n);
    return m ? m[1]!.toUpperCase() : '';
  };
  const bodyOf = new Map<Symbol, string>();
  for (const s of fns) bodyOf.set(s, c.symbolSource(s));
  const ownerOf = (s: Symbol) => (s.parent ? getSym(c.g, s.parent)?.name ?? '' : '');
  // level 0: functions issuing the request themselves
  for (const s of fns) {
    const b = bodyOf.get(s)!;
    if (!netBodyRe.test(b)) continue;
    const ps = paramNames(s.signature);
    const urlIdx = ps.findIndex((p) => /^(?:url|path|api|apiPath|endpoint|uri|urlPath|relativeUrl|subUrl|action)$/i.test(p));
    if (urlIdx < 0) continue;
    const urlP = ps[urlIdx]!;
    // the url parameter must flow into the request
    if (!new RegExp('\\b' + urlP + '\\b').test(b.slice(b.indexOf('{')))) continue;
    const methodIdx = ps.findIndex((p) => /^(?:method|httpMethod|requestMethod|type)$/i.test(p));
    let method = methodFromName(s.name);
    if (!method) {
      const mm = /\bmethod\s*:\s*(?:[\w.]*\.)?['"]?(GET|POST|PUT|DELETE|PATCH|HEAD)\b/i.exec(b) ?? /\b(?:axios|instance|\w*[hH]ttp\w*|request|session)\.(get|post|put|delete|patch)\s*(?:<[^>]*>)?\s*\(/.exec(b);
      if (mm && methodIdx < 0) method = mm[1]!.toUpperCase();
    }
    let base = '';
    const bm = new RegExp('([A-Za-z_$][\\w$.]*)\\s*\\+\\s*' + urlP + '\\b|`\\$\\{([A-Za-z_$][\\w$.]*)\\}\\$\\{' + urlP + '\\}`').exec(b);
    if (bm) {
      const v = resolve(s.platform, bm[1] ?? bm[2]!);
      if (v) base = v.replace(/^[a-z][\w+.-]*:\/\/[^/]*/i, '').replace(/\/$/, '');
    }
    addW({ name: s.name, owner: ownerOf(s), urlIdx, methodIdx, method, base, file: s.file });
  }
  // levels 1-2: functions forwarding their url parameter to a known wrapper
  for (let lvl = 0; lvl < 2; lvl++) {
    for (const s of fns) {
      if (wrappers.get(s.name)?.some((w) => w.file === s.file && w.owner === ownerOf(s))) continue;
      const ps = paramNames(s.signature);
      const urlIdx = ps.findIndex((p) => /^(?:url|path|api|apiPath|endpoint|uri|urlPath|relativeUrl|subUrl|action)$/i.test(p));
      if (urlIdx < 0) continue;
      const b = bodyOf.get(s)!;
      for (const call of c.calls(s.file)) {
        if (call.enclosing !== s.id || !call.args?.length) continue;
        const ws = wrappers.get(call.callee);
        if (!ws) continue;
        const w = ws[0]!;
        const a = call.args[w.urlIdx];
        if (!a || !new RegExp('\\b' + ps[urlIdx] + '\\b').test(a.text)) continue;
        let method = methodFromName(s.name) || w.method;
        if (!method && w.methodIdx >= 0 && call.args[w.methodIdx]) {
          const mm = /(GET|POST|PUT|DELETE|PATCH|HEAD)['"]?\s*$/i.exec(call.args[w.methodIdx]!.text);
          if (mm) method = mm[1]!.toUpperCase();
        }
        void b;
        addW({ name: s.name, owner: ownerOf(s), urlIdx, methodIdx: ps.findIndex((p) => /^(?:method|httpMethod|requestMethod)$/i.test(p)), method, base: w.base, file: s.file });
        break;
      }
    }
  }
  if (!wrappers.size) return;
  const recvOK = (recv: string, w: Wrapper, file: string) => {
    if (recv === '' || recv === 'this') return true; // imported function / same class
    const r = lastSeg(recv.replace(/\(\)$/, ''));
    if (w.owner && r.toLowerCase().replace(/^_/, '') === w.owner.toLowerCase()) return true;
    if (w.owner && r === w.owner) return true;
    void file;
    return /(?:http|request|api|net|service|client|axios|instance|util|manager|repo)\w*$/i.test(r);
  };
  for (const file of c.sortedFiles()) {
    const fi = c.g.files[file]!;
    if (!langs.has(fi.lang) || isTestPath(file)) continue;
    for (const call of c.calls(file)) {
      const ws = wrappers.get(call.callee);
      if (!ws || !call.args?.length) continue;
      const w = ws.find((x) => recvOK(call.receiver ?? '', x, file));
      if (!w) continue;
      // the wrapper itself is not a call site
      const enc = getSym(c.g, call.enclosing);
      if (enc && enc.name === w.name && enc.file === w.file) continue;
      const a = call.args[w.urlIdx];
      if (!a) continue;
      const v = resolve(fi.platform, a.text);
      if (!v || /\s/.test(v)) continue;
      let p = v.replace(/^[a-z][\w+.-]*:\/\/[^/]*/i, '');
      const abs = v !== p;
      if (!abs && !p.includes('/')) continue; // keys / names, not paths
      if (!abs && w.base) p = w.base + (p.startsWith('/') ? '' : '/') + p;
      if (!p.startsWith('/')) p = '/' + p;
      p = p.replace(/[?#].*$/, '');
      if (p === '/' || !/[A-Za-z]/.test(p)) continue;
      let method = w.method;
      if (w.methodIdx >= 0 && call.args[w.methodIdx]) {
        const mm = /(GET|POST|PUT|DELETE|PATCH|HEAD)['"]?\s*$/i.exec(call.args[w.methodIdx]!.text);
        if (mm) method = mm[1]!.toUpperCase();
      }
      if (!method) {
        const mm = /\bmethod\s*:\s*(?:[\w.]*\.)?['"]?(GET|POST|PUT|DELETE|PATCH|HEAD)\b/i.exec(call.args.map((x) => x.text).join(','));
        if (mm) method = mm[1]!.toUpperCase();
      }
      add({ platform: fi.platform, method: httpVerbs.has(method) ? method : 'GET', path: p, file, symbol: call.enclosing });
    }
  }
}
