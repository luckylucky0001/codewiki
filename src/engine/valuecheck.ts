// Conservative, deterministic value and behaviour rules for claim checking
// (quantities, API parameters, build config, shared constants, behaviours).
import fs from 'node:fs';
import path from 'node:path';
import type { Symbol } from '../model.js';
import { getSym } from '../model.js';
import { cmpStr, regexQuoteMeta } from '../util/go.js';
import { containerKinds, sortedKeys } from './graphutil.js';
import type { Checker, Claim } from './claims.js';
import { normAPIPath, reAPIPathG, reCodeG, reIdentLike, reNumberG } from './claims.js';

export interface RuleOut {
  conflict: boolean;
  verified: boolean;
  evidence: string[];
  anchors: string[];
}
const conflictf = (r: RuleOut, s: string) => {
  r.conflict = true;
  r.evidence.push(s);
};
const verifiedf = (r: RuleOut, s: string) => {
  r.verified = true;
  r.evidence.push(s);
};

const reNegation = /\b(not|never|no|without|removed|deprecated)\b|不|没有|无需|禁止|移除|废弃|取消/i;

interface QuantityRule {
  kind: string;
  re: RegExp;
  names: RegExp;
}
const quantityRules: QuantityRule[] = [
  { kind: 'limit', re: /(?:最多|至多|上限(?:为|是)?|不超过|不能超过|at most|up to|no more than|maximum of|max(?:imum)?(?: is| of)?)[^0-9，。,.;；:：\n]{0,6}?(?<n>\d+)/gi, names: /max|limit|cap(?:acity)?\b/i },
  { kind: 'min', re: /(?:至少|最少|不少于|不能少于|少于|短于|at least|minimum of|min(?:imum)?(?: is| of)?|shorter than|fewer than|less than)[^0-9，。,.;；:：\n]{0,6}?(?<n>\d+)/gi, names: /min/i },
  { kind: 'timeout', re: /(?:超时(?:时间)?|time ?out)\D{0,8}?(?<n>\d+)\s*(?<unit>ms|毫秒|秒|s\b|sec(?:ond)?s?|分钟|min(?:ute)?s?)/gi, names: /time_?out/i },
  { kind: 'retry', re: /(?:重试|retry|retries)\D{0,6}?(?<n>\d+)/gi, names: /retr(y|ies)/i },
];

const zhDomain: [string, string[]][] = [
  ['购物车', ['cart']], ['商品', ['product', 'item']], ['订单', ['order']], ['密码', ['password', 'pwd']], ['用户名', ['username', 'user']],
  ['登录', ['login']], ['图片', ['image', 'img']], ['请求', ['request']], ['上传', ['upload']], ['下载', ['download']], ['缓存', ['cache']],
  ['验证码', ['code']], ['地址', ['address']],
];
const domainStop = new Set(
  'the and that when then with shall must should system user users app all from into have has are for not than least most more less items item characters character seconds second minutes minute times time max maximum min minimum limit hold calling call without before after only each per can will may this its'.split(' '),
);

function domainWords(text: string): string[] {
  const set = new Set<string>();
  for (const w of text.replace(reCodeG, ' ').match(/[A-Za-z][A-Za-z]{2,}/g) ?? []) {
    const l = w.toLowerCase();
    if (!domainStop.has(l)) set.add(l);
  }
  for (const [zh, en] of zhDomain) if (text.includes(zh)) en.forEach((e) => set.add(e));
  return sortedKeys(set);
}

function toMillis(n: number, unit: string): number {
  switch (unit.toLowerCase()) {
    case 'ms':
    case '毫秒':
      return n;
    case '分钟':
    case 'min':
    case 'mins':
    case 'minute':
    case 'minutes':
      return n * 60000;
    default:
      return n * 1000;
  }
}

const atoi = (s: string): number | null => (/^[+-]?\d+$/.test(s) ? parseInt(s, 10) : null);

function constMatches(kind: string, s: Symbol, n: number, unit: string): boolean {
  const v = atoi(s.value ?? '');
  if (v === null) return false;
  if (kind !== 'timeout') return v === n;
  const want = toMillis(n, unit);
  return v === want || v * 1000 === want || (s.name.toLowerCase().includes('sec') && v * 1000 === want);
}

const reSizeUnit = /^\s*(?:[kmgt]i?b\b|bytes?\b|b\b|ms\b|s\b|sec|秒|毫秒|分钟|小时|天|px|dp|pt\b|%|x\d|×)/i;
const reCompare = /(?:length|count|size|count\(\)|length\(\))(<=|>=|<|>|===|==)(\d+)/g;

function quantity(k: Checker, text: string, out: RuleOut): void {
  const words = domainWords(text);
  for (const q of quantityRules) {
    for (const m of text.matchAll(q.re)) {
      const end = m.index! + m[0].length;
      if ((q.kind === 'limit' || q.kind === 'min') && reSizeUnit.test(text.slice(end))) continue;
      const n = parseInt(m.groups!.n!, 10);
      const unit = m.groups!.unit ?? '';
      const all: Symbol[] = [], scoped: Symbol[] = [];
      for (const s of k.G.symbols) {
        if (!s.value || !q.names.test(s.name) || atoi(s.value) === null) continue;
        all.push(s);
        const ln = s.name.toLowerCase();
        if (words.some((w) => ln.includes(w))) scoped.push(s);
      }
      let cands = scoped;
      if (cands.length === 0 && all.length === 1 && words.length === 0) cands = all;
      if (cands.length) {
        const same: string[] = [], diff: string[] = [];
        for (const s of cands) {
          out.anchors.push(s.id);
          (constMatches(q.kind, s, n, unit) ? same : diff).push(`${s.name}=${s.value}（${s.platform}）`);
        }
        const label = m[0].trim();
        if (diff.length === 0) verifiedf(out, `「${label}」与常量一致：${same.join(', ')}`);
        else if (same.length === 0) conflictf(out, `文档写「${label}」，代码常量为 ${diff.join(', ')}`);
        else conflictf(out, `「${label}」只在部分平台成立：一致 ${same.join(', ')}；不一致 ${diff.join(', ')}`);
        continue;
      }
      if (q.kind !== 'limit' && q.kind !== 'min') continue;
      for (const s of k.G.symbols) {
        if (containerKinds.has(s.kind)) continue;
        const body = k.symbolText(s).toLowerCase();
        if (!words.some((w) => w.length >= 4 && body.includes(w))) continue;
        for (const cm of body.matchAll(reCompare)) {
          if (cm[2] === String(n)) {
            out.anchors.push(s.id);
            verifiedf(out, `「${m[0].trim()}」对应代码中的比较 \`${cm[0]}\`（${s.id}）`);
            break;
          }
        }
      }
    }
  }
}

const reParamMention = /参数|字段|\bparam(?:eter)?s?\b|\bquery\b/i;
const reParamName = /^[a-z][A-Za-z0-9_]{1,30}$/;

function apiParams(k: Checker, text: string, out: RuleOut): void {
  if (!reParamMention.test(text) || text.includes('返回') || /\breturn/i.test(text)) return;
  const paths = [...text.matchAll(reAPIPathG)].map((m) => normAPIPath(m[1]!));
  if (paths.length !== 1) return;
  const sites: Symbol[] = [];
  for (const a of k.F.apis ?? []) {
    if (normAPIPath(a.path) === paths[0]) {
      const s = getSym(k.G, a.symbol);
      if (s) sites.push(s);
    }
  }
  if (!sites.length) return;
  for (const m of text.matchAll(reCodeG)) {
    const p = m[1]!.trim();
    if (!reParamName.test(p)) continue;
    const re = new RegExp('(^|[^A-Za-z0-9_$])' + regexQuoteMeta(p) + '([^A-Za-z0-9_$]|$)');
    let found = sites.some((s) => re.test(k.symbolText(s)));
    if (!found && quotedKeyAnywhere(k, p)) found = true;
    if (!found) {
      const plats = new Set<string>();
      for (const s of sites) {
        plats.add(s.platform);
        out.anchors.push(s.id);
      }
      conflictf(out, `接口 \`${paths[0]}\` 的调用处（${sortedKeys(plats).join(', ')}）没有参数 \`${p}\``);
    }
  }
}

function quotedKeyAnywhere(k: Checker, p: string): boolean {
  const needles = ["'" + p + "'", "'" + p + '=', '&' + p + '=', '?' + p + '='];
  return k.G.symbols.some((s) => {
    const t = k.symbolText(s);
    return needles.some((n) => t.includes(n));
  });
}

const reSharedConst = /(三端|多端|跨端|跨平台|各端|各平台|all platforms|across platforms|cross-platform)[^。.;；]{0,10}(共享|共用|统一使用同一|shared?)[^。.;；]{0,10}(常量|constant)|(共享|shared)[^。.;；]{0,4}(常量|constant)/i;
const reMaxWord = /上限|最大|最多|\b(max|limit)/i;
const reMinWord = /下限|最小|最少|\bmin/i;
const reTimeoutWord = /超时|time ?out/i;
const constKey = (name: string) => name.replaceAll('_', '').toLowerCase();

function sharedConst(k: Checker, text: string, out: RuleOut): void {
  if (!reSharedConst.test(text)) return;
  let nameRe: RegExp | null = null;
  const named = new Set<string>();
  for (const m of text.matchAll(reCodeG)) {
    const span = m[1]!.trim();
    if (reIdentLike.test(span)) named.add(constKey(span));
  }
  if (named.size > 0) {
    /* named constants */
  } else if (reMaxWord.test(text)) nameRe = /max|limit/i;
  else if (reMinWord.test(text)) nameRe = /min/i;
  else if (reTimeoutWord.test(text)) nameRe = /time_?out/i;
  else return;
  const groups = new Map<string, Symbol[]>();
  for (const s of k.G.symbols) {
    if (!s.value) continue;
    const key = constKey(s.name);
    if ((nameRe && nameRe.test(s.name)) || named.has(key)) {
      const a = groups.get(key);
      if (a) a.push(s);
      else groups.set(key, [s]);
    }
  }
  for (const key of [...groups.keys()].sort(cmpStr)) {
    const syms = groups.get(key)!;
    const plats = new Set<string>();
    const desc: string[] = [];
    for (const s of syms) {
      plats.add(s.platform);
      desc.push(`${s.name}=${s.value}（${s.platform}）`);
      out.anchors.push(s.id);
    }
    if (plats.size >= 2) conflictf(out, `文档说常量是共享的，但各平台分别定义：${desc.sort(cmpStr).join(', ')}`);
  }
}

const behaviourConcepts: { name: string; doc: RegExp; code: RegExp }[] = [
  { name: '短信 / 验证码', doc: /\bSMS\b|短信|验证码|\bOTP\b|verification code/i, code: /sms|otp|verif\w*code|captcha|验证码|短信/i },
  { name: '优惠券', doc: /\bcoupons?\b|优惠券|折扣码|promo code/i, code: /coupon|promo|voucher|discount|优惠/i },
  { name: '分享', doc: /\bshare\b|分享/i, code: /share|ACTION_SEND|UIActivityViewController|分享/i },
  { name: '生物识别', doc: /biometric|face ?id|touch ?id|指纹|面容/i, code: /biometric|LAContext|userAuth|fingerprint|faceid|touchid/i },
  { name: '扫码', doc: /\bQR\b|二维码|扫码|barcode/i, code: /qr|barcode|scan/i },
  { name: '推送通知', doc: /push notifications?|推送通知|消息推送/i, code: /notification|push/i },
  { name: '支付', doc: /\bpayments?\b|支付/i, code: /pay/i },
  { name: '第三方登录', doc: /\boauth\b|微信登录|wechat login|sign in with apple|google sign-?in/i, code: /oauth|wechat|ASAuthorization|GoogleSignIn/i },
];

function behaviours(k: Checker, text: string, out: RuleOut): void {
  if (reNegation.test(text)) return;
  const plain = text.replace(reCodeG, ' ');
  for (const bc of behaviourConcepts) {
    if (!bc.doc.test(plain) || codeHas(k, bc.code)) continue;
    conflictf(out, `文档要求「${bc.name}」相关行为，但代码中没有任何相关实现（符号、接口、testID、路由均未出现）`);
  }
}

function codeHas(k: Checker, re: RegExp): boolean {
  const key = re.source;
  const v = k.codeHits.get(key);
  if (v !== undefined) return v;
  const hit =
    (k.F.apis ?? []).some((a) => re.test(a.path)) ||
    (k.F.testids ?? []).some((t) => re.test(t.tid)) ||
    (k.F.routes ?? []).some((r) => re.test(r.route_id) || re.test(r.pattern)) ||
    k.G.symbols.some((s) => re.test(s.name) || re.test(k.symbolText(s)));
  k.codeHits.set(key, hit);
  return hit;
}

const reBuildCfgLine = /^\s*"?([A-Za-z_][A-Za-z0-9_.]*)"?\s*(?:=|:)?\s*["']?(\d+)["']?\s*,?\s*(?:\/\/.*)?$/;
const buildCfgFile = /(^|\/)(build\.gradle(\.kts)?|[A-Za-z0-9_-]+\.json5|[A-Za-z0-9_-]+\.xcconfig)$/;

function buildConfig(k: Checker): Map<string, { file: string; value: string }[]> {
  if (k.buildCfg) return k.buildCfg;
  const cfg = (k.buildCfg = new Map<string, { file: string; value: string }[]>());
  const rec = (dir: string) => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    ents.sort((a, b) => cmpStr(a.name, b.name));
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!['.git', 'node_modules', 'oh_modules', 'build', 'wiki', '.kb-work', 'Pods'].includes(e.name)) rec(p);
        continue;
      }
      const rel = path.relative(k.Dir, p).split(path.sep).join('/');
      if (!buildCfgFile.test(rel)) continue;
      let b: string;
      try {
        if (fs.statSync(p).size > 1 << 20) continue;
        b = fs.readFileSync(p, 'utf8');
      } catch {
        continue;
      }
      for (const line of b.split(/[\n;{}]/)) {
        if (!line) continue;
        const m = reBuildCfgLine.exec(line);
        if (m) {
          const a = cfg.get(m[1]!) ?? [];
          a.push({ file: rel, value: m[2]! });
          cfg.set(m[1]!, a);
        }
      }
    }
  };
  rec(k.Dir);
  return cfg;
}

function buildConfigRules(k: Checker, text: string, out: RuleOut): void {
  const nums: string[] = text.replace(reCodeG, ' ').match(reNumberG) ?? [];
  if (!nums.length) return;
  for (const m of text.matchAll(reCodeG)) {
    const key = m[1]!.trim();
    if (!reIdentLike.test(key) || k.findSymbols(key).length > 0) continue;
    const vals = buildConfig(k).get(key);
    if (!vals?.length) continue;
    const same: string[] = [], desc: string[] = [];
    for (const v of vals) {
      desc.push(`${key}=${v.value}（${v.file}）`);
      if (nums.includes(v.value)) same.push(v.file);
    }
    if (same.length) verifiedf(out, `构建配置与文档一致：${desc.join(', ')}`);
    else conflictf(out, `文档写 \`${key}\` 为 ${nums.join('/')}，构建配置为 ${desc.join(', ')}`);
  }
}

export function valueRules(k: Checker, c: Claim, numericChecked: boolean): RuleOut {
  const text = c.text;
  const out: RuleOut = { conflict: false, verified: false, evidence: [], anchors: [] };
  if (!numericChecked) quantity(k, text, out);
  apiParams(k, text, out);
  buildConfigRules(k, text, out);
  sharedConst(k, text, out);
  if (c.style !== 'statement' && (k.F.routes?.length ?? 0) + (k.F.testids?.length ?? 0) > 0) behaviours(k, text, out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Prose rules: paths, counts, dependencies, commands and identifiers in ordinary README/docs prose.
// Conflicts only on deterministic evidence: a repo path that does not exist (markdown links into
// the repo, own-repo GitHub blob/tree links on a moving branch, multi-segment paths whose first
// directory exists), a count of modules/targets/screenshots or an enumerated set that is clearly
// off, and a named dependency that appears nowhere in build files, imports or code.

interface RepoIndex {
  files: string[];
  dirs: string[];
  byBase: Map<string, string[]>;
  top: Set<string>;
  build: string; // normalised (lower-case alnum) text of build / lock files
  buildFiles: string[];
}
const repoIndexes = new WeakMap<Checker, RepoIndex>();
const skipDirs = new Set(['.git', 'node_modules', 'oh_modules', 'build', 'wiki', '.kb-work', 'Pods', '.gradle', 'DerivedData', '.build', '.idea', 'dist']);
const buildFileRe = /(^|\/)(Package\.swift|Package\.resolved|Podfile(\.lock)?|Cartfile(\.resolved)?|[^/]*\.gradle(\.kts)?|libs\.versions\.toml|oh-package(-lock)?\.json5|package\.json|project\.pbxproj|Gemfile|Makefile)$/;
const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function repoIndex(k: Checker): RepoIndex {
  let ix = repoIndexes.get(k);
  if (ix) return ix;
  ix = { files: [], dirs: [], byBase: new Map(), top: new Set(), build: '', buildFiles: [] };
  const builds: string[] = [];
  const add = (rel: string) => {
    const b = path.posix.basename(rel);
    const a = ix!.byBase.get(b);
    if (a) a.push(rel);
    else ix!.byBase.set(b, [rel]);
  };
  let budget = 300000;
  const rec = (dir: string, rel: string) => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (--budget < 0) return;
      const r = rel ? rel + '/' + e.name : e.name;
      if (!rel) ix!.top.add(e.name);
      if (e.isDirectory()) {
        if (skipDirs.has(e.name)) continue;
        ix!.dirs.push(r);
        add(r);
        rec(path.join(dir, e.name), r);
      } else {
        ix!.files.push(r);
        add(r);
        if (buildFileRe.test(r)) {
          try {
            if (fs.statSync(path.join(dir, e.name)).size < 4 << 20) builds.push(fs.readFileSync(path.join(dir, e.name), 'utf8'));
            ix!.buildFiles.push(r);
          } catch {
            /* unreadable */
          }
        }
      }
    }
  };
  rec(k.Dir, '');
  ix.build = alnum(builds.join('\n'));
  repoIndexes.set(k, ix);
  return ix;
}

function pathExists(ix: RepoIndex, p: string, anywhere: boolean): string {
  p = p.replace(/^\.\//, '').replace(/\/+$/, '');
  if (!p) return '.';
  const b = path.posix.basename(p);
  for (const c of ix.byBase.get(b) ?? []) if (c === p || (anywhere && c.endsWith('/' + p))) return c;
  return '';
}

const placeholderRe = /[<>{}*$~%]|\bv?X\.Y(\.Z)?\b|YYYY|\bxxx\b|\.\.\.|(^|\/)(foo|bar|baz|my-?app|your[\w-]*|path\/to)(\/|\.|$)|(^|\/)(path|file|name|something|module|feature|component)\.[\w.]+$/i;
const fileExtRe = /\.[A-Za-z0-9]{1,10}$/;

interface PathCand {
  p: string;
  strong: boolean; // a link into this repo: a missing target is a stale path
  rel?: string; // the document directory for relative links
  breadcrumb?: boolean;
  quoted?: boolean;
  pinned?: boolean;
}

export function prosePaths(text: string, source: string): PathCand[] {
  const out: PathCand[] = [];
  const docDir = path.posix.dirname(source);
  let rest = text;
  for (const m of text.matchAll(/\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    rest = rest.replace(m[0], ' ' + m[1] + ' ');
    let t = m[2]!;
    const gh = /^https?:\/\/github\.com\/[^/]+\/[^/]+\/(?:blob|tree)\/([^/]+)\/([^#?]+)/.exec(t);
    if (gh) {
      // pinned commit / tag: historical, so a missing path is no conflict (it can still verify)
      out.push({ p: decodeURIComponent(gh[2]!), strong: !(/^[0-9a-f]{7,40}$/.test(gh[1]!) || /^v?\d/.test(gh[1]!)), pinned: /^[0-9a-f]{7,40}$/.test(gh[1]!) || /^v?\d/.test(gh[1]!) });
      continue;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('#') || t.startsWith('/')) continue;
    t = t.replace(/[#?].*$/, '');
    if (!t || /(^|\/)(tree|blob|commit|pull|issues|releases|compare)(\/|$)/.test(t)) continue;
    try {
      t = decodeURIComponent(t);
    } catch {
      /* keep */
    }
    out.push({ p: t, strong: true, rel: docDir });
  }
  rest = rest.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, ' ');
  for (const m of rest.matchAll(/(?:^|[\s`'"(（:：])((?:\.{1,2}\/)?[A-Za-z0-9_@.-]+(?:\/[A-Za-z0-9_@.-]+)+\/?)(?=$|[\s`'"),，。;；:：])/g)) {
    out.push({ p: m[1]!.replace(/[.,]+$/, ''), strong: false });
  }
  // Xcode-style breadcrumbs: `Sources > WMFData > Services` (segments may contain spaces)
  for (const m of rest.matchAll(/(`?)([A-Z][\w-]*(?: [\w-]+)*)((?:\s+>\s+[\w-]+(?: [\w-]+)*)+)(`?)/g)) {
    const segs = [m[2]!, ...m[3]!.split('>').slice(1)].map((s) => s.trim());
    if (segs.length >= 2) out.push({ p: segs.join('/'), strong: false, breadcrumb: true, quoted: m[1] === '`' && m[4] === '`' });
  }
  return out;
}

function pathRules(k: Checker, c: Claim, out: RuleOut): void {
  const cands = prosePaths(c.text, c.source);
  if (!cands.length) return;
  const ix = repoIndex(k);
  const seen = new Set<string>();
  for (const cd of cands) {
    if (seen.has(cd.p) || placeholderRe.test(cd.p) || cd.p.includes('://')) continue;
    seen.add(cd.p);
    const p = cd.p.replace(/^\.\//, '').replace(/\/+$/, '');
    if (!p || p.startsWith('../') && !cd.rel) continue;
    let hit = '';
    if (cd.breadcrumb) {
      // the last segment may run into prose ("… > Environment directory"): try its word prefixes
      const segs = p.split('/');
      const words = segs[segs.length - 1]!.split(' ');
      for (let w = words.length; w >= 1 && !hit; w--) hit = pathExists(ix, [...segs.slice(0, -1), words.slice(0, w).join(' ')].join('/'), true);
      if (!hit && !(cd.quoted && words.length === 1)) continue;
    } else if (cd.rel !== undefined) {
      const joined = path.posix.normalize(path.posix.join(cd.rel, p));
      if (joined.startsWith('..')) continue; // points outside the repo
      // links written against another base still count when the path exists somewhere in the repo
      hit = pathExists(ix, joined, false) || pathExists(ix, p.replace(/^(\.\.\/)+/, ''), true);
    } else hit = pathExists(ix, p, true);
    if (hit) {
      verifiedf(out, `路径 \`${cd.p}\` 存在（${hit}）`);
      continue;
    }
    if (cd.pinned) continue;
    if (k.gitignored(p) || /(^|\/)(build|out|dist|DerivedData|\.gradle)\//.test(p) || /^[/~]/.test(cd.p)) continue; // generated output / absolute machine paths
    const segs = p.split('/');
    if (/\b(e\.g\.|for example|such as|create|copy|add|rename|generate|download)\b|例如|比如|新建|创建|复制|生成/i.test(c.text.slice(0, Math.max(0, c.text.indexOf(cd.p))))) continue;
    let stale = false;
    if (cd.strong) stale = true;
    else if (cd.breadcrumb) stale = pathExists(ix, segs.slice(0, -1).join('/'), true) !== '' && segs.length >= 3 && !!cd.quoted;
    else {
      // a plain path: its first directory must exist at the root (or it starts with ./) and it must look
      // like a file path or a deep directory path, not prose like "iOS/macOS" or "TV/Wear"
      const firstOk = ix.top.has(segs[0]!) && ix.dirs.includes(segs[0]!);
      const shape = fileExtRe.test(segs[segs.length - 1]!) || segs.length >= 3 || cd.p.startsWith('./');
      stale = (firstOk || cd.p.startsWith('./')) && shape && segs.length >= 2;
    }
    if (stale) conflictf(out, `文档引用的路径 \`${cd.p}\` 在仓库中不存在（过时路径）`);
  }
}

// counts -------------------------------------------------------------------------------------

const wordNum: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function moduleCounts(k: Checker): number[] {
  const ix = repoIndex(k);
  const counts: number[] = [];
  let all = 0, nonTest = 0, gradle = 0, ohos = 0;
  for (const f of ix.buildFiles) {
    let b = '';
    try {
      b = fs.readFileSync(path.join(k.Dir, f), 'utf8');
    } catch {
      continue;
    }
    if (f.endsWith('Package.swift')) {
      for (const m of b.matchAll(/\.(testTarget|target|executableTarget|binaryTarget|macro|plugin)\(\s*\n?\s*name:/g)) {
        all++;
        if (m[1] !== 'testTarget') nonTest++;
      }
    } else if (/settings\.gradle(\.kts)?$/.test(f)) gradle += (b.match(/["']:[\w:-]+["']/g) ?? []).length;
  }
  try {
    const bp = fs.readFileSync(path.join(k.Dir, 'build-profile.json5'), 'utf8');
    ohos = (bp.match(/\bsrcPath\s*:/g) ?? []).length;
  } catch {
    /* none */
  }
  for (const n of [all, nonTest, gradle, ohos]) if (n > 0) counts.push(n);
  return counts;
}

function countOk(n: number, actual: number, qual: string): boolean {
  if (/more than|over|超过/.test(qual)) return actual > n;
  if (qual) return Math.abs(actual - n) <= Math.max(1, n * 0.2);
  return actual === n;
}

function countRules(k: Checker, c: Claim, out: RuleOut): void {
  const text = c.text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  if (/\b(additional|other|extra|new|more|besides|another)\b|之外|另外|新增/i.test(text)) return;
  for (const m of text.matchAll(/\b(?:(nearly|about|around|approximately|almost|roughly|over|more than|~)\s+)?(\d{1,5})\s+(modules|targets|screenshots)\b/gi)) {
    const n = +m[2]!, qual = (m[1] ?? '').toLowerCase(), noun = m[3]!.toLowerCase();
    let actual: number[] = [];
    if (noun === 'screenshots') {
      const ix = repoIndex(k);
      const shots = ix.files.filter((f) => /\.png$/i.test(f) && /(^|\/)[^/]*(snapshot|screenshot)[^/]*\//i.test(f)).length;
      if (shots) actual = [shots];
    } else actual = moduleCounts(k);
    if (!actual.length) continue;
    if (actual.some((a) => countOk(n, a, qual))) verifiedf(out, `数量 ${m[0]} 与仓库一致（${actual.join('/')}）`);
    else conflictf(out, `文档写 ${m[0]}，仓库中实际为 ${actual.join(' / ')}（数量过时）`);
  }
  enumeratedCount(k, c, text, out);
}

/** "We have 3 stores: a, b, c" (or the list in the bullets that follow): the listed identifiers are
 * properties of one type; count that type's properties with the same name suffix. */
function enumeratedCount(k: Checker, c: Claim, text: string, out: RuleOut): void {
  const m = /\b(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)\s+([a-z]+)s\b[^.:：]{0,30}[:：]\s*(.*)$/i.exec(text);
  if (!m) return;
  const n = /^\d+$/.test(m[1]!) ? +m[1]! : wordNum[m[1]!.toLowerCase()]!;
  let names = [...(m[3] ?? '').matchAll(/\b([a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)\b/g)].map((x) => x[1]!);
  if (names.length < 2) {
    // the list follows as bullets in the document
    let lines: string[] = [];
    try {
      lines = fs.readFileSync(path.join(k.Dir, c.source), 'utf8').split('\n').slice(c.line, c.line + n + 4);
    } catch {
      return;
    }
    names = [];
    for (const l of lines) {
      if (/^\s*#/.test(l)) break;
      if (!/^\s*[-*+]|^\s*\d+\./.test(l)) continue;
      const im = /\b([a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)\b/.exec(l.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'));
      if (im) names.push(im[1]!);
    }
  }
  if (names.length < 2) return;
  const suf = /([A-Z][a-z0-9]+)$/.exec(names[0]!)?.[1] ?? '';
  if (!suf || !suf.toLowerCase().startsWith(m[2]!.toLowerCase().slice(0, 4)) || !names.every((x) => x.endsWith(suf))) return;
  const parents = new Map<string, number>();
  for (const nm of names) for (const s of k.findSymbols(nm)) if (s.parent && s.kind === 'property') parents.set(s.parent, (parents.get(s.parent) ?? 0) + 1);
  const best = [...parents].filter(([, v]) => v === names.length).map(([p]) => p);
  if (!best.length) return;
  // every type that declares all listed names is a candidate; a conflict needs all of them to disagree
  const found = best.map((b) => ({ owner: getSym(k.G, b), names: [...new Set(k.G.symbols.filter((s) => s.parent === b && s.kind === 'property' && s.name.endsWith(suf) && /^[a-z]/.test(s.name)).map((s) => s.name))] }));
  const ok = found.find((f) => f.names.length === n);
  if (ok) verifiedf(out, `${ok.owner?.qual ?? ''} 中有 ${n} 个 *${suf}：${ok.names.join(', ')}`);
  else if (names.length <= n && found.every((f) => f.names.length > n)) {
    const f = found.sort((a, b) => b.names.length - a.names.length)[0]!;
    conflictf(out, `文档说有 ${n} 个 ${m[2]}s，代码中 ${f.owner?.qual ?? ''} 有 ${f.names.length} 个：${f.names.join(', ')}`);
  }
  for (const f of found) if (f.owner) out.anchors.push(f.owner.id);
}

// dependencies -------------------------------------------------------------------------------

const depStop = new Set(
  'nodejs node deno bun browser browsers jvm npm yarn pnpm mvvm mvc mvi mvp viper tdd bdd clean git github gitlab gradle xcode android ios macos ipados watchos tvos kotlin swift java javascript typescript json xml sql rest http https api apis material english the a an our this that it we you markdown yaml objectivec objective c cpp rust go ruby python homebrew'.split(' '),
);
const firstStop = new Set(['nodejs', 'node', 'deno', 'bun', 'browser', 'browsers', 'the', 'our', 'this']);
const depAlias: Record<string, string[]> = { cocoapods: ['podfile'], swiftpm: ['packageswift'], 'swift package manager': ['packageswift'], spm: ['packageswift'] };

function depPresent(k: Checker, name: string, strict = false): string {
  const ix = repoIndex(k);
  const n = alnum(name);
  if (n.length < 3) return 'short';
  if (ix.build.includes(n)) return 'build files';
  for (const a of depAlias[name.toLowerCase()] ?? []) if (ix.files.some((f) => alnum(path.posix.basename(f)) === a)) return 'build files';
  for (const fi of Object.values(k.G.files)) if ((fi.imports ?? []).some((i) => alnum(i).includes(n))) return 'imports';
  if (strict) return ix.files.some((f) => alnum(path.posix.basename(f)).startsWith(n)) ? 'file names' : '';
  if (k.tokenSearch(name.replace(/\s+/g, '')) || k.findSymbols(name).length) return 'code';
  if (ix.files.some((f) => alnum(f).includes(n))) return 'file names';
  return '';
}

function dependencyRules(k: Checker, c: Claim, out: RuleOut): void {
  const names: [string, boolean, boolean?][] = []; // [name, conflict allowed, strict (library link)]
  const text = c.text;
  // a bullet that is just a link to a library repo, e.g. "[Appboy](https://github.com/Appboy/Appboy-segment-ios)"
  const lm = /^(?:[^\[\]]*[:：]\s*)?\[([A-Z][\w.+ -]{1,40})\]\(https?:\/\/(?:github\.com|gitlab\.com|bitbucket\.org)\/[^/]+\/([^/)#?]+)\/?\)\s*$/.exec(text.trim());
  if (lm) names.push([lm[1]!.trim(), true, true]);
  const plain = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`/g, '');
  for (const m of plain.matchAll(/\b([Hh]eavy use of|[Mm]akes? use of|[Ww]e use|[Uu]ses|[Uu]sing|[Bb]uilt (?:with|on|upon|in)|[Bb]ased on|[Dd]epends? on|[Pp]owered by|[Rr]elies on)\s+(?:the\s+)?([A-Za-z][\w.+-]*(?:\s[A-Z][\w.+-]*)?)(?![\w.+-]*\s+(?:architecture|pattern|approach|style|principles|conventions|language|branch|APIs?|SDKs?|features?|support|runtime|versions?|environments?))/g)) {
    // "uses X" alone only verifies; a lower-case name ("ktlint") must appear in build files
    if (/^[a-z]/.test(m[2]!)) {
      if (!depStop.has(m[2]!) && !/^(a|an|this|that|its|it|our|your|their|some|many|one|two|streams?|data|code)$/.test(m[2]!) && repoIndex(k).build.includes(alnum(m[2]!)) && alnum(m[2]!).length >= 4) verifiedf(out, `工具/依赖 \`${m[2]}\` 出现在构建文件中`);
      continue;
    }
    names.push([m[2]!, /heavy use|make use|makes use|depends? on|relies on/i.test(m[1]!)]);
  }
  // "Kermit - Logging", "Koin - Dependency Injection" list items
  const dm = /^([A-Z][\w.+-]*(?: [A-Z][\w.+-]*)?)\s+(?:[-–—]\s+[A-Z]|\((?:[a-z][\w ]*)\)\s*$)/.exec(plain.trim());
  if (dm) names.push([dm[1]!, false]);
  // "Turbine is a small testing library for …"
  const im = /^([A-Z][\w.+-]*)\s+is\s+an?\s+(?:[\w-]+\s+){0,3}(?:library|framework|tool|plugin|SDK|package)\b/.exec(plain.trim());
  if (im) names.push([im[1]!, false]);
  const seen = new Set<string>();
  for (let [nm, may, strict] of names) {
    nm = nm.replace(/[.,;:]+$/, '');
    if (seen.has(nm) || depStop.has(nm.toLowerCase()) || depStop.has(alnum(nm)) || firstStop.has(alnum(nm.split(/\s/)[0]!))) continue;
    seen.add(nm);
    // a library link is checked against build/lock files, imports and file names only (a constant
    // that merely starts with the vendor name is not the dependency)
    const where = depPresent(k, nm, strict);
    if (where === 'short') continue;
    if (where) verifiedf(out, `依赖/技术 \`${nm}\` 出现在${where === 'build files' ? '构建文件' : where === 'imports' ? ' import' : where === 'code' ? '代码' : '文件名'}中`);
    else if (may && repoIndex(k).buildFiles.length) conflictf(out, `文档称使用 \`${nm}\`，但构建文件、import 和代码中都没有它（依赖已移除或改名）`);
  }
}

// commands and identifiers ------------------------------------------------------------------

function commandRules(k: Checker, c: Claim, out: RuleOut): void {
  const ix = repoIndex(k);
  for (const m of c.text.matchAll(/\bmake\s+([a-z][\w-]*)/g)) {
    let mk = '';
    try {
      mk = fs.readFileSync(path.join(k.Dir, 'Makefile'), 'utf8');
    } catch {
      continue;
    }
    if (new RegExp('^' + regexQuoteMeta(m[1]!) + '\\s*:', 'm').test(mk)) verifiedf(out, `Makefile 目标 \`${m[1]}\` 存在`);
  }
  for (const m of c.text.matchAll(/\.\/gradlew\s+((?::[\w-]+)+|[\w-]+)/g)) {
    if (!ix.files.includes('gradlew')) continue;
    const mod = /^:([\w-]+)/.exec(m[1]!);
    if (!mod || ix.dirs.includes(mod[1]!) || ix.dirs.some((d) => d.endsWith('/' + mod[1]))) verifiedf(out, `gradle 命令 \`${m[0]}\` 的模块存在`);
  }
}

function identifierRules(k: Checker, c: Claim, out: RuleOut): void {
  const text = c.text.replace(reCodeG, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[a-z]+:\/\/\S+/g, ' ');
  let n = 0;
  const ix = repoIndex(k);
  // gradle module paths (`:ui:i18n` -> ui/i18n)
  for (const m of c.text.matchAll(/(?:^|[\s(`])((?::[a-z][\w-]*)+)(?=$|[\s),.`])/g)) {
    const d = m[1]!.slice(1).replace(/:/g, '/');
    if (ix.dirs.includes(d) || ix.dirs.some((x) => x.endsWith('/' + d))) verifiedf(out, `Gradle 模块 \`${m[1]}\` 存在（${d}）`);
  }
  // annotations: `@ContributesNode(RoomScope::class)`
  for (const m of c.text.matchAll(/@([A-Z]\w{3,})\b/g)) {
    const hit = k.findSymbols(m[1]!)[0]?.id || k.tokenSearch(m[1]!);
    if (hit) verifiedf(out, `注解 \`@${m[1]}\` 在代码中使用（${hit}）`);
  }
  // UPPER_SNAKE keys and dotted member paths (TIVI_TMDB_API_KEY, KsApi.Secrets.isOSS)
  for (const m of text.matchAll(/\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+){2,}|[A-Za-z]\w*(?:\.[A-Za-z]\w*){1,3})\b/g)) {
    const name = m[1]!;
    if (name.includes('.') && (/^[a-z]+\.[a-z]+$/.test(name) || fileExtRe.test(name) && !/[A-Z]/.test(name.split('.').pop()!))) continue;
    const syms = k.findSymbols(name);
    const hit = syms.length ? syms[0]!.id : !name.includes('.') ? k.tokenSearch(name) : '';
    if (hit) {
      out.anchors.push(hit);
      verifiedf(out, `\`${name}\` 出现在代码中（${hit}）`);
    } else if (!name.includes('.') && ix.build.includes(alnum(name))) verifiedf(out, `\`${name}\` 出现在构建配置中`);
  }
  for (const m of text.matchAll(/\b([A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+|[a-z]+(?:[A-Z][a-z0-9]+)+)\b/g)) {
    if (n >= 3) break;
    const name = m[1]!;
    if (name.length < 5 || builtinTypesLower.has(name.toLowerCase())) continue;
    const syms = k.findSymbols(name);
    const hit = syms.length ? syms[0]!.id : k.tokenSearch(name);
    if (hit) {
      n++;
      out.anchors.push(hit);
      verifiedf(out, `\`${name}\` 出现在代码中（${hit}）`);
    }
  }
}
const builtinTypesLower = new Set(['javascript', 'typescript', 'github', 'gitlab', 'macos', 'ipados', 'watchos', 'tvos', 'cocoapods', 'swiftui', 'uikit', 'appkit', 'iphone', 'ipad', 'youtube', 'testflight', 'playstore', 'appstore']);

/** "Never use android.util.Log" / "Do not import X": the forbidden package must not be imported. */
function forbiddenImports(k: Checker, c: Claim, out: RuleOut): void {
  for (const m of c.text.matchAll(/\b(?:[Nn]ever|[Dd]o not|[Dd]on't|[Mm]ust not|[Ss]hould not)\s+(?:use|import)\s+`?([a-z][\w]*(?:\.[A-Za-z_]\w*)+)`?/g)) {
    const pkg = m[1]!;
    const hits: string[] = [];
    for (const [f, fi] of Object.entries(k.G.files)) if ((fi.imports ?? []).some((raw) => {
        const i = raw.slice(raw.indexOf('|') + 1); // imports are recorded as "Alias|full.path"
        return i === pkg || i.startsWith(pkg + '.');
      })) hits.push(f);
    hits.sort(cmpStr);
    if (hits.length) conflictf(out, `文档禁止使用 \`${pkg}\`，但 ${hits.length} 个文件仍 import 它：${hits.slice(0, 3).join(', ')}`);
    else verifiedf(out, `代码中没有 import \`${pkg}\``);
  }
}

/** "add the harInit interface … see feature/x/Index.ets": the example file exists, but the identifier
 * the sentence is about appears nowhere in the code any more. */
function referencedExample(k: Checker, c: Claim, out: RuleOut): void {
  const refs = [...c.text.matchAll(/(?:参考|可参考|see|refer to|for example)\s*[:：]?\s*`?([\w./-]+\.\w{1,6})`?/gi)].map((m) => m[1]!);
  if (!refs.length) return;
  const ix = repoIndex(k);
  if (!refs.some((r) => pathExists(ix, r.replace(/^\.\//, ''), true))) return;
  const idents = [...c.text.replace(/[\w./-]+\.\w{1,6}/g, ' ').matchAll(/(?:^|[^A-Za-z0-9_])([a-z]+[A-Z][A-Za-z0-9]*)(?![A-Za-z0-9_])/g)].map((m) => m[1]!);
  for (const id of new Set(idents)) {
    if (id.length < 6 || k.findSymbols(id).length || k.tokenSearch(id) || ix.build.includes(alnum(id))) continue;
    conflictf(out, `文档以 \`${refs[0]}\` 为例说明 \`${id}\`，但代码中已没有 \`${id}\``);
  }
}

/** Rules for ordinary prose claims (any style): stale paths, counts, dependencies, commands, identifiers. */
export function proseRules(k: Checker, c: Claim): RuleOut {
  const out: RuleOut = { conflict: false, verified: false, evidence: [], anchors: [] };
  pathRules(k, c, out);
  countRules(k, c, out);
  dependencyRules(k, c, out);
  commandRules(k, c, out);
  forbiddenImports(k, c, out);
  referencedExample(k, c, out);
  if (c.style === 'prose') identifierRules(k, c, out);
  return out;
}
