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
