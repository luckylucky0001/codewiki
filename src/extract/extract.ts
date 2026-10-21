// Parse one source file with tree-sitter and extract symbols, reference names,
// call sites, the package and imports. Never throws: failures are reported in
// FileResult.failure.
import type { Node } from 'web-tree-sitter';
import type { Symbol, ParseFailure } from '../model.js';
import { compact, fields, trimSpace, truncate, cmpStr, trimChars, trimSuffix, trimPrefix } from '../util/go.js';
import { Parsers, type LangSpec } from './lang.js';
import { sha, simhash } from './hash.js';

export interface Part {
  lit?: string;
  ref?: string;
  param?: string;
}
export interface Arg {
  label?: string;
  text: string;
  parts?: Part[];
  props?: Record<string, string>;
}
export interface Call {
  callee: string;
  callee_text: string;
  args: Arg[] | null;
  line: number;
  enclosing: string;
  inner?: string[];
  receiver?: string;
  type_args?: string[];
}
export interface FileResult {
  symbols: Symbol[];
  calls: Call[];
  failure?: ParseFailure;
  package: string;
  imports: string[];
}

interface SymNode {
  sym: Symbol;
  node: Node;
  start: number;
  end: number;
}

interface Token {
  text: string;
  ident: boolean;
  start: number;
}

const reKotlinTypeDecl = /\b(class|object|interface)\b/;

/**
 * tree-sitter-kotlin (v1.1.0) cannot parse `object Routes { const val HOME = "home" }`
 * on one line; the space before the final brace becomes ';' (offsets unchanged).
 */
export function kotlinOneLineBodies(src: string): string {
  let out: string[] | null = null;
  let start = 0;
  while (start <= src.length) {
    let end = src.indexOf('\n', start);
    if (end < 0) end = src.length;
    const line = src.slice(start, end);
    const t = line.replace(/[ \t\r]+$/, '');
    const n = t.length;
    if (n >= 3 && t[n - 1] === '}' && t[n - 2] === ' ' && t[n - 3] !== '{') {
      const open = t.indexOf('{');
      if (open > 0 && reKotlinTypeDecl.test(t.slice(0, open)) && count(t, '{') === count(t, '}') && !t.includes('//')) {
        if (!out) out = src.split('');
        out[start + n - 2] = ';';
      }
    }
    start = end + 1;
  }
  return out ? out.join('') : src;
}

function count(s: string, ch: string): number {
  let c = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === ch) c++;
  return c;
}

const kids = (n: Node): Node[] => {
  const out: Node[] = [];
  const c = n.childCount;
  for (let i = 0; i < c; i++) out.push(n.child(i)!);
  return out;
};
const namedKids = (n: Node): Node[] => {
  const out: Node[] = [];
  const c = n.namedChildCount;
  for (let i = 0; i < c; i++) out.push(n.namedChild(i)!);
  return out;
};

export function childOfKind(n: Node | null | undefined, kind: string): Node | null {
  if (!n) return null;
  for (const ch of namedKids(n)) if (ch.type === kind) return ch;
  return null;
}

const identKinds = new Set(['identifier', 'simple_identifier', 'type_identifier', 'property_identifier', 'field_identifier']);
const stopKinds = new Set(['value_arguments', 'call_suffix', 'arguments', 'argument_list', 'lambda_literal', 'annotated_lambda']);

/** The last identifier-like leaf in n (depth-first). */
export function lastIdent(n: Node | null | undefined, src: string): string {
  if (!n) return '';
  let last = '';
  const walk = (x: Node): void => {
    if (identKinds.has(x.type)) {
      last = src.slice(x.startIndex, x.endIndex);
      return;
    }
    if (stopKinds.has(x.type)) return;
    for (const ch of namedKids(x)) walk(ch);
  };
  walk(n);
  return last;
}

function hasToken(n: Node, tok: string): boolean {
  for (const ch of kids(n)) if (!ch.isNamed && ch.type === tok) return true;
  return false;
}

function firstIdent(n: Node, src: string): string {
  for (const ch of namedKids(n)) {
    switch (ch.type) {
      case 'identifier':
      case 'simple_identifier':
      case 'type_identifier':
      case 'property_identifier':
        return src.slice(ch.startIndex, ch.endIndex);
    }
  }
  return '';
}

function hasModifier(n: Node, src: string, mod: string): boolean {
  for (const ch of namedKids(n)) {
    if (ch.type === 'modifiers') return src.slice(ch.startIndex, ch.endIndex).includes(mod);
  }
  return false;
}

function firstError(n: Node): [number, string] {
  if (n.isError || n.isMissing) {
    let kind = 'syntax error';
    if (n.isMissing) kind = 'missing ' + n.type;
    return [n.startPosition.row + 1, kind];
  }
  for (const ch of kids(n)) {
    if (ch.hasError || ch.isMissing) return firstError(ch);
  }
  return [n.startPosition.row + 1, 'syntax error'];
}

function appendLit(parts: Part[], s: string): Part[] {
  if (parts.length > 0 && parts[parts.length - 1]!.lit) {
    parts[parts.length - 1]!.lit += s;
    return parts;
  }
  if (s === '') return parts;
  parts.push({ lit: s });
  return parts;
}

const ktTemplateRe = /\$([A-Za-z_][A-Za-z0-9_]*)/g;

function splitKotlinTemplate(parts: Part[]): Part[] {
  let out: Part[] = [];
  for (const p of parts) {
    if (!p.lit || !p.lit.includes('$')) {
      out.push(p);
      continue;
    }
    let last = 0;
    for (const m of p.lit.matchAll(ktTemplateRe)) {
      const i = m.index!;
      if (i > last) out = appendLit(out, p.lit.slice(last, i));
      out.push({ ref: m[1]! });
      last = i + m[0].length;
    }
    if (last < p.lit.length) out = appendLit(out, p.lit.slice(last));
  }
  return out;
}

function isSpaceCh(c: string | undefined): boolean {
  return c === ' ' || c === '\n' || c === '\t' || c === '\r';
}

function joinSig(ts: string[]): string {
  let b = '';
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]!;
    const prev = i > 0 ? ts[i - 1]! : '';
    if (i > 0 && !/[().,:<>[\]?]/.test(t) && !prev.endsWith('(') && !prev.endsWith('<') && !prev.endsWith('[') && !prev.endsWith('.')) {
      b += ' ';
    } else if (i > 0 && (t === ':' || prev === ',' || prev === ':')) {
      b += ' ';
    }
    if (t === ':' && b.length > 0) b = b.replace(/ +$/, '');
    b += t;
  }
  return b;
}

class FileCtx {
  syms: SymNode[] = [];
  members = new Map<string, SymNode>();
  seen = new Map<string, number>();
  constructor(
    public spec: LangSpec,
    public src: string,
    public platform: string,
    public relPath: string,
    public repoPath: string,
  ) {}

  text(n: Node): string {
    return this.src.slice(n.startIndex, n.endIndex);
  }

  walkDecls(n: Node, parent: SymNode | null): void {
    for (const ch of namedKids(n)) {
      const kind = ch.type;
      const symKind = this.spec.decls[kind];
      if (symKind !== undefined && Object.prototype.hasOwnProperty.call(this.spec.decls, kind) && this.declAllowed(ch, parent)) {
        const sn = this.newSymbol(ch, symKind, parent);
        if (sn && this.spec.containers.has(kind)) this.walkDecls(ch, sn);
        else if (!sn && this.spec.transparent.has(kind)) this.walkDecls(ch, parent);
        continue;
      }
      if (this.spec.transparent.has(kind) || (parent && this.spec.bodies.has(kind))) this.walkDecls(ch, parent);
    }
  }

  declAllowed(n: Node, parent: SymNode | null): boolean {
    if (n.type === 'variable_declarator') {
      const p = n.parent;
      if (!p) return false;
      const gp = p.parent;
      return parent === null && !!gp && (gp.type === 'program' || gp.type === 'export_statement');
    }
    return true;
  }

  declName(n: Node): string {
    switch (n.type) {
      case 'property_declaration': {
        if (this.spec.name === 'kotlin') {
          for (const ch of namedKids(n)) {
            if (ch.type === 'variable_declaration' || ch.type === 'multi_variable_declaration') return firstIdent(ch, this.src);
          }
        }
        const f = n.childForFieldName('name');
        if (f) {
          const b = f.childForFieldName('bound_identifier');
          if (b) return this.text(b);
          return firstIdent(f, this.src);
        }
        break;
      }
      case 'field_declaration': {
        const d = n.childForFieldName('declarator');
        if (d) {
          const nm = d.childForFieldName('name');
          if (nm) return this.text(nm);
        }
        break;
      }
      case 'init_declaration':
        return 'init';
      case 'secondary_constructor':
        return 'constructor';
      case 'class_declaration':
        if (this.spec.name === 'swift' && hasToken(n, 'extension')) {
          const f = n.childForFieldName('name');
          if (f) return compact(this.text(f));
        }
    }
    const f = n.childForFieldName('name');
    if (f) return compact(this.text(f));
    return firstIdent(n, this.src);
  }

  newSymbol(n: Node, kind: string, parent: SymNode | null): SymNode | null {
    if (n.type === 'variable_declarator') {
      const f = n.childForFieldName('name');
      if (!f || f.type !== 'identifier') return null;
    }
    const name = this.declName(n);
    if (name === '' || /[{}[\] ]/.test(name)) return null;
    kind = this.refineKind(n, kind);
    let qual = name;
    if (parent) {
      qual = parent.sym.qual + '.' + name;
      if (parent.sym.qual.endsWith('+ext')) qual = trimSuffix(parent.sym.qual, '+ext') + '.' + name;
    }
    if (kind === 'extension') qual = name + '+ext';
    const k = this.seen.get(qual) ?? 0;
    if (k > 0) {
      this.seen.set(qual, k + 1);
      qual = `${qual}~${k + 1}`;
    } else this.seen.set(qual, 1);
    let start = n.startIndex;
    const end = n.endIndex;
    let startRow = n.startPosition.row;
    const p = n.parent;
    if (p && p.type === 'export_statement' && n.type !== 'variable_declarator') {
      start = p.startIndex;
      startRow = p.startPosition.row;
    }
    for (let prev = n.previousNamedSibling; prev && prev.type === 'decorator'; prev = prev.previousNamedSibling) {
      start = prev.startIndex;
      startRow = prev.startPosition.row;
    }
    const sym: Symbol = {
      id: this.platform + '://' + this.relPath + '#' + qual,
      platform: this.platform,
      lang: this.spec.name,
      kind,
      name,
      qual,
      file: this.repoPath,
      start_line: startRow + 1,
      end_line: n.endPosition.row + 1,
      signature: '',
      hash: '',
      sig_hash: '',
      norm_hash: '',
      simhash: '',
    };
    if (parent) sym.parent = parent.sym.id;
    const sn: SymNode = { sym, node: n, start, end };
    this.syms.push(sn);
    if (parent) this.members.set(n.startIndex + ':' + n.endIndex, sn);
    return sn;
  }

  refineKind(n: Node, kind: string): string {
    switch (this.spec.name) {
      case 'kotlin':
        if (n.type === 'class_declaration') {
          if (hasToken(n, 'interface')) return 'interface';
          if (hasModifier(n, this.src, 'enum')) return 'enum';
        }
        if (n.type === 'function_declaration' && hasModifier(n, this.src, '@Composable')) return 'composable';
        break;
      case 'swift':
        if (n.type === 'class_declaration') {
          for (const k of ['struct', 'enum', 'extension', 'actor', 'class']) if (hasToken(n, k)) return k;
        }
        break;
      case 'arkts':
      case 'typescript':
      case 'javascript':
      case 'tsx':
        if (n.type === 'variable_declarator') {
          const v = n.childForFieldName('value');
          if (v && (v.type === 'arrow_function' || v.type === 'function_expression' || v.type === 'function')) return 'function';
        }
        if (n.type === 'struct_declaration') return 'component';
    }
    return kind;
  }

  tokens(n: Node, self: SymNode | null, out: Token[]): Token[] {
    if (this.spec.comments.has(n.type)) return out;
    if (self && !(n.startIndex === self.node.startIndex && n.endIndex === self.node.endIndex)) {
      const m = this.members.get(n.startIndex + ':' + n.endIndex);
      if (m && m !== self && m.node.type === n.type) {
        out.push({ text: '⟪', ident: false, start: 0 });
        for (const t of this.sigTokens(m)) out.push(t);
        out.push({ text: '⟫', ident: false, start: 0 });
        return out;
      }
    }
    const cc = n.childCount;
    if (cc === 0) {
      const t = trimSpace(this.text(n));
      if (t === '') return out;
      const ident = this.spec.idents.has(n.type);
      for (const f of fields(t)) out.push({ text: f, ident, start: n.startIndex });
      return out;
    }
    for (let i = 0; i < cc; i++) this.tokens(n.child(i)!, self, out);
    return out;
  }

  bodyChild(n: Node): Node | null {
    for (const ch of kids(n)) if (this.spec.bodies.has(ch.type)) return ch;
    return null;
  }

  sigCache = new Map<SymNode, Token[]>();
  sigTokens(sn: SymNode): Token[] {
    const cached = this.sigCache.get(sn);
    if (cached) return cached;
    const all = this.tokens(sn.node, null, []);
    let cutAt = Number.MAX_SAFE_INTEGER;
    const b = this.bodyChild(sn.node);
    if (b) cutAt = b.startIndex;
    const out: Token[] = [];
    for (const t of all) {
      if (t.start >= cutAt) break;
      if (t.text === '=' && (sn.sym.kind === 'property' || sn.sym.kind === 'const' || sn.sym.kind === 'case')) break;
      out.push(t);
    }
    this.sigCache.set(sn, out);
    return out;
  }

  finishSymbol(sn: SymNode): void {
    let toks: Token[] = [];
    if (sn.start < sn.node.startIndex) toks = this.prefixTokens(sn);
    toks = this.tokens(sn.node, sn, toks);
    const sig = this.sigTokens(sn);
    const name = sn.sym.name;
    const texts: string[] = new Array(toks.length);
    const normTexts: string[] = [];
    const refSet = new Set<string>();
    let selfCount = 0;
    for (const t of toks) if (t.ident && t.text === name) selfCount++;
    if (selfCount > 1) refSet.add(name);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]!;
      texts[i] = t.text;
      normTexts.push(t.text === name ? '§' : t.text);
      if (t.ident && t.text !== name) refSet.add(t.text);
    }
    const sigTexts = sig.map((t) => t.text);
    sn.sym.hash = sha(texts.join(' '));
    sn.sym.sig_hash = sha(sigTexts.join(' '));
    sn.sym.norm_hash = sha(normTexts.join(' '));
    sn.sym.simhash = simhash(normTexts);
    sn.sym.signature = truncate(this.sigDisplay(sn, sig, sigTexts), 240);
    sn.sym.refNames = [...refSet].sort(cmpStr);
    const called = new Set<string>();
    for (let i = 0; i + 1 < toks.length; i++) {
      if (toks[i]!.ident && refSet.has(toks[i]!.text) && toks[i + 1]!.text.startsWith('(')) called.add(toks[i]!.text);
    }
    sn.sym.callNames = [...called].sort(cmpStr);
    const v = this.literalValue(sn.node);
    if (v) sn.sym.value = v;
  }

  prefixTokens(sn: SymNode): Token[] {
    let out: Token[] = [];
    const p = sn.node.parent;
    if (p && p.type === 'export_statement' && p.startIndex === sn.start) {
      for (const ch of kids(p)) {
        if (ch.startIndex >= sn.node.startIndex) break;
        this.tokens(ch, null, out);
      }
      return out;
    }
    for (let prev = sn.node.previousNamedSibling; prev && prev.type === 'decorator' && prev.startIndex >= sn.start; prev = prev.previousNamedSibling) {
      out = this.tokens(prev, null, []).concat(out);
    }
    return out;
  }

  literalValue(n: Node): string {
    let v: Node | null = null;
    switch (n.type) {
      case 'property_declaration':
      case 'variable_declarator':
      case 'public_field_definition':
      case 'enum_entry': {
        const f = n.childForFieldName('value') ?? n.childForFieldName('raw_value');
        if (f) v = f;
        else {
          let afterEq = false;
          for (const ch of kids(n)) {
            if (!ch.isNamed && ch.type === '=') {
              afterEq = true;
              continue;
            }
            if (afterEq && ch.isNamed) {
              v = ch;
              break;
            }
          }
        }
        break;
      }
      case 'field_declaration': {
        const d = n.childForFieldName('declarator');
        if (d) v = d.childForFieldName('value');
        break;
      }
    }
    if (!v) return '';
    const k = v.type;
    if (this.spec.strings.has(k)) {
      const parts = this.evalParts(v);
      if ((parts.length === 1 && parts[0]!.lit) || parts.length === 0) {
        if (parts.length === 0) return '""';
        return parts[0]!.lit!;
      }
      return '';
    }
    if (k.includes('literal') || k === 'number' || k === 'true' || k === 'false' || k === 'integer' || k === 'float') {
      if (k.includes('string')) return '';
      return trimSpace(this.text(v));
    }
    if (k === 'array' || k === 'array_literal' || k === 'collection_literal') {
      const t = compact(this.text(v));
      if (Buffer.byteLength(t) <= 200) return t;
    }
    return '';
  }

  sigDisplay(sn: SymNode, sig: Token[], texts: string[]): string {
    if (sig.length === 0) return '';
    const last = sig[sig.length - 1]!;
    let end = last.start + last.text.length;
    if (end > sn.end || last.start < sn.start) return joinSig(texts);
    const src = this.src;
    while (end < src.length && end < sn.end && !isSpaceCh(src[end]) && src[end] !== '{' && src[end] !== '=') end++;
    const raw = src.slice(sn.start, end);
    if (raw.includes('//') || raw.includes('/*')) return joinSig(texts);
    return compact(raw);
  }

  // ---- calls ----

  collectCalls(n: Node, out: Call[]): void {
    const type = n.type;
    if (this.spec.comments.has(type)) return;
    if (this.spec.calls.has(type)) {
      const c = this.buildCall(n);
      if (c) out.push(c);
    }
    if (this.spec.name === 'kotlin' && type === 'binary_expression') {
      const l = n.namedChild(0);
      if (l && l.type === 'binary_expression' && n.namedChildCount === 2 && n.namedChild(1)!.type === 'lambda_literal') {
        const f = l.namedChild(0), ty = l.namedChild(1);
        if (f && ty && f.type === 'identifier' && (ty.type === 'identifier' || ty.type === 'user_type' || ty.type === 'navigation_expression') && this.text(l).includes('<')) {
          const call: Call = { callee: this.text(f), callee_text: this.text(f), args: null, line: f.startPosition.row + 1, enclosing: this.enclosing(n), type_args: [lastIdent(ty, this.src)] };
          if (ty.type === 'identifier') call.type_args = [this.text(ty)];
          const inner = (x: Node): void => {
            for (const ch of namedKids(x)) {
              if (ch.type === 'call_expression') {
                const name = lastIdent(ch.namedChild(0), this.src);
                if (name) (call.inner ??= []).push(name);
              }
              inner(ch);
            }
          };
          inner(n.namedChild(1)!);
          out.push(call);
        }
      }
    }
    if (type === 'arkui_component_expression') {
      const cc = n.childCount;
      for (let i = 0; i + 1 < cc; i++) {
        if (n.fieldNameForChild(i) !== 'property') continue;
        const prop = n.child(i)!;
        const args = n.child(i + 1);
        if (!args || n.fieldNameForChild(i + 1) !== 'arguments') continue;
        const call: Call = { callee: this.text(prop), callee_text: '.' + this.text(prop), args: null, line: prop.startPosition.row + 1, enclosing: this.enclosing(prop) };
        const fn = n.childForFieldName('function');
        if (fn) call.receiver = this.text(fn) + '()';
        for (const a of namedKids(args)) (call.args ??= []).push(this.buildArg(a));
        out.push(call);
      }
    }
    const nc = n.namedChildCount;
    for (let i = 0; i < nc; i++) this.collectCalls(n.namedChild(i)!, out);
  }

  enclosing(n: Node): string {
    let best: SymNode | null = null;
    const s = n.startIndex, e = n.endIndex;
    for (const sn of this.syms) {
      if (sn.start <= s && e <= sn.end) {
        if (!best || sn.end - sn.start < best.end - best.start) best = sn;
      }
    }
    return best ? best.sym.id : '';
  }

  buildCall(n: Node): Call | null {
    const call: Call = { callee: '', callee_text: '', args: null, line: n.startPosition.row + 1, enclosing: this.enclosing(n) };
    let calleeNode: Node | null = null;
    let argsNode: Node | null = null;
    switch (this.spec.name) {
      case 'kotlin':
        if (n.type === 'annotation') {
          const ci = childOfKind(n, 'constructor_invocation');
          if (!ci) {
            const ut = childOfKind(n, 'user_type');
            if (!ut) return null;
            call.callee = '@' + compact(this.text(ut));
            call.callee_text = call.callee;
            return call;
          }
          calleeNode = childOfKind(ci, 'user_type');
          argsNode = childOfKind(ci, 'value_arguments');
          call.callee = '@' + lastIdent(calleeNode, this.src);
          call.callee_text = '@' + compact(calleeNode ? this.text(calleeNode) : '');
        } else {
          calleeNode = n.namedChild(0);
          argsNode = childOfKind(n, 'value_arguments');
          let typeArgs = childOfKind(n, 'type_arguments');
          if (calleeNode && calleeNode.type === 'call_expression' && childOfKind(n, 'annotated_lambda')) {
            argsNode = childOfKind(calleeNode, 'value_arguments');
            typeArgs = childOfKind(calleeNode, 'type_arguments');
            calleeNode = calleeNode.namedChild(0);
          }
          if (typeArgs) {
            for (const ta of namedKids(typeArgs)) {
              const t = lastIdent(ta, this.src);
              if (t) (call.type_args ??= []).push(t);
            }
          }
        }
        break;
      case 'swift': {
        calleeNode = n.namedChild(0);
        const cs = childOfKind(n, 'call_suffix');
        if (cs) argsNode = childOfKind(cs, 'value_arguments');
        break;
      }
      case 'java':
        switch (n.type) {
          case 'annotation':
            calleeNode = n.childForFieldName('name');
            argsNode = n.childForFieldName('arguments');
            if (calleeNode) {
              call.callee = '@' + lastIdent(calleeNode, this.src);
              call.callee_text = '@' + this.text(calleeNode);
            }
            break;
          case 'object_creation_expression':
            calleeNode = n.childForFieldName('type');
            argsNode = n.childForFieldName('arguments');
            break;
          default: {
            calleeNode = n.childForFieldName('name');
            argsNode = n.childForFieldName('arguments');
            const obj = n.childForFieldName('object');
            if (obj) call.receiver = compact(this.text(obj));
          }
        }
        break;
      default:
        calleeNode = n.childForFieldName('function') ?? n.childForFieldName('constructor');
        argsNode = n.childForFieldName('arguments');
    }
    if (!calleeNode) return null;
    if (call.callee === '') {
      call.callee = lastIdent(calleeNode, this.src);
      call.callee_text = compact(this.text(calleeNode));
      const b = Buffer.from(call.callee_text, 'utf8');
      if (b.length > 160) call.callee_text = b.subarray(b.length - 160).toString('utf8');
    }
    if (calleeNode.type === 'await_expression' && calleeNode.namedChildCount > 0) {
      calleeNode = calleeNode.namedChild(calleeNode.namedChildCount - 1)!;
    }
    if (!call.receiver) {
      const obj = calleeNode.childForFieldName('object');
      const tg = obj ? null : calleeNode.childForFieldName('target');
      if (obj) call.receiver = truncate(compact(this.text(obj)), 160);
      else if (tg) call.receiver = truncate(compact(this.text(tg)), 160);
      else if (calleeNode.type === 'navigation_expression' && calleeNode.namedChildCount > 1) {
        call.receiver = truncate(compact(this.text(calleeNode.namedChild(0)!)), 160);
      }
      if (call.receiver === '') delete call.receiver;
    }
    if (argsNode) {
      for (const a of namedKids(argsNode)) {
        if (this.spec.comments.has(a.type)) continue;
        (call.args ??= []).push(this.buildArg(a));
      }
    }
    const inner = (x: Node, depth: number): void => {
      if (depth > 12) return;
      for (const ch of namedKids(x)) {
        if (this.spec.calls.has(ch.type) && ch.type !== 'annotation') {
          let cn: Node | null;
          switch (this.spec.name) {
            case 'kotlin':
            case 'swift':
              cn = ch.namedChild(0);
              break;
            case 'java':
              cn = ch.childForFieldName('name');
              break;
            default:
              cn = ch.childForFieldName('function');
          }
          if (cn) {
            const name = lastIdent(cn, this.src);
            if (name) (call.inner ??= []).push(name);
          }
        }
        inner(ch, depth + 1);
      }
    };
    const cs = calleeNode.startIndex, ce = calleeNode.endIndex;
    for (const ch of namedKids(n)) {
      if (ch.startIndex === cs && ch.endIndex === ce) continue;
      inner(ch, 0);
    }
    return call;
  }

  buildArg(a: Node): Arg {
    let expr = a;
    const arg: Arg = { text: '' };
    switch (a.type) {
      case 'value_argument':
        if (this.spec.name === 'swift') {
          const l = a.childForFieldName('name');
          if (l) arg.label = trimSuffix(compact(this.text(l)), ':');
          const v = a.childForFieldName('value');
          if (v) expr = v;
        } else {
          const cnt = a.namedChildCount;
          if (cnt >= 2 && hasToken(a, '=')) arg.label = this.text(a.namedChild(0)!);
          if (cnt > 0) expr = a.namedChild(cnt - 1)!;
        }
        break;
      case 'element_value_pair': {
        const k = a.childForFieldName('key');
        if (k) arg.label = this.text(k);
        const v = a.childForFieldName('value');
        if (v) expr = v;
        break;
      }
    }
    if (arg.label === '') delete arg.label;
    const out: Arg = arg.label !== undefined ? { label: arg.label, text: '' } : { text: '' };
    out.text = truncate(compact(this.text(expr)), 200);
    const parts = this.evalParts(expr);
    if (parts.length) out.parts = parts;
    if (expr.type === 'object') {
      const props: Record<string, string> = {};
      for (const p of namedKids(expr)) {
        if (p.type !== 'pair') continue;
        const k = p.childForFieldName('key'), v = p.childForFieldName('value');
        if (k && v) props[trimChars(this.text(k), `"'`)] = truncate(compact(this.text(v)), 120);
      }
      if (Object.keys(props).length) out.props = props;
    }
    return out;
  }

  evalParts(n: Node): Part[] {
    const k = n.type;
    if (this.spec.strings.has(k)) {
      let parts: Part[] = [];
      const walk = (x: Node): void => {
        for (const ch of namedKids(x)) {
          switch (ch.type) {
            case 'string_content':
            case 'string_fragment':
            case 'line_str_text':
            case 'multi_line_str_text':
            case 'escape_sequence':
            case 'str_escaped_char':
              parts = appendLit(parts, this.text(ch));
              break;
            case 'interpolation':
            case 'interpolated_expression':
            case 'template_substitution':
            case 'line_string_interpolation':
              parts.push({ param: lastIdent(ch, this.src) });
              break;
            default:
              if (this.spec.idents.has(ch.type)) parts.push({ param: this.text(ch) });
              else walk(ch);
          }
        }
      };
      walk(n);
      if (this.spec.name === 'kotlin') parts = splitKotlinTemplate(parts);
      if (parts.length === 0 && n.namedChildCount === 0 && this.spec.name === 'java') parts = appendLit(parts, trimChars(this.text(n), '"'));
      return parts;
    }
    if (k === 'parenthesized_expression') {
      if (n.namedChildCount === 1) return this.evalParts(n.namedChild(0)!);
    } else if (k.includes('binary') || k.includes('additive')) {
      if (n.namedChildCount === 2 && this.text(n).includes('+')) {
        return this.evalParts(n.namedChild(0)!).concat(this.evalParts(n.namedChild(1)!));
      }
    } else if (this.spec.idents.has(k)) {
      return [{ ref: this.text(n) }];
    } else if (k === 'navigation_expression' || k === 'member_expression' || k === 'field_access' || k === 'scoped_identifier') {
      const t = compact(this.text(n)).replaceAll(' ', '');
      if (!/[()]/.test(t)) return [{ ref: t }];
    }
    return [{ param: lastIdent(n, this.src) }];
  }

  // ---- imports ----

  imports(root: Node): [string, string[]] {
    let pkg = '';
    const out: string[] = [];
    for (const n of namedKids(root)) {
      switch (this.spec.name) {
        case 'kotlin':
          switch (n.type) {
            case 'package_header': {
              const q = childOfKind(n, 'qualified_identifier');
              pkg = q ? fields(this.text(q)).join('') : trimSpace(trimPrefix(this.text(n), 'package'));
              break;
            }
            case 'import':
            case 'import_header':
            case 'import_list':
              out.push(...this.kotlinImports(n));
          }
          break;
        case 'java':
          if (n.type === 'package_declaration') {
            pkg = trimSuffix(trimSpace(trimPrefix(this.text(n), 'package')), ';');
          } else if (n.type === 'import_declaration') {
            let t = trimSuffix(trimSpace(trimPrefix(this.text(n), 'import')), ';');
            t = trimSpace(trimPrefix(t, 'static '));
            out.push(importPair(t));
          }
          break;
        case 'arkts':
        case 'typescript':
        case 'tsx':
        case 'javascript':
          if (n.type === 'import_statement') out.push(...this.esImports(n));
      }
    }
    return [pkg, out];
  }

  kotlinImports(n: Node): string[] {
    if (n.type === 'import_list') return namedKids(n).flatMap((c) => this.kotlinImports(c));
    let t = trimSpace(trimPrefix(this.text(n), 'import'));
    let alias = '';
    const i = t.indexOf(' as ');
    if (i >= 0) {
      alias = trimSpace(t.slice(i + 4));
      t = t.slice(0, i);
    }
    let p = importPair(t);
    if (alias !== '') p = alias + '|' + fields(t).join('');
    return [p];
  }

  esImports(n: Node): string[] {
    let src = '';
    const s = n.childForFieldName('source');
    if (s) src = trimChars(this.text(s), '\'"`');
    const out: string[] = [];
    const walk = (x: Node): void => {
      for (const ch of namedKids(x)) {
        switch (ch.type) {
          case 'import_specifier': {
            const name = ch.childForFieldName('name');
            const alias = ch.childForFieldName('alias');
            if (alias) out.push(this.text(alias) + '|' + src + '#' + (name ? this.text(name) : ''));
            else if (name) out.push(this.text(name) + '|' + src);
            break;
          }
          case 'identifier':
            out.push(this.text(ch) + '|' + src);
            break;
          case 'namespace_import':
            out.push('*|' + src);
            break;
          default:
            walk(ch);
        }
      }
    };
    const cl = childOfKind(n, 'import_clause');
    if (cl) walk(cl);
    return out;
  }
}

/** "a.b.C" -> "C|a.b.C", "a.b.*" -> "*|a.b". */
export function importPair(p: string): string {
  p = fields(p).join('');
  if (p.endsWith('.*')) return '*|' + p.slice(0, -2);
  const i = p.lastIndexOf('.');
  const name = i >= 0 ? p.slice(i + 1) : p;
  return name + '|' + p;
}

/** Parse src and extract symbols and call sites. Never throws. */
export function parseFile(ps: Parsers, lang: string, platform: string, relPath: string, repoPath: string, src: string): FileResult {
  let tree;
  try {
    const { parser, spec } = ps.get(lang);
    if (lang === 'kotlin') src = kotlinOneLineBodies(src);
    tree = parser.parse(src);
    if (!tree) return { symbols: [], calls: [], package: '', imports: [], failure: { file: repoPath, error: 'parser returned no tree' } };
    const root = tree.rootNode;
    const c = new FileCtx(spec, src, platform, relPath, repoPath);
    c.walkDecls(root, null);
    for (const sn of c.syms) c.finishSymbol(sn);
    const calls: Call[] = [];
    c.collectCalls(root, calls);
    const [pkg, imports] = c.imports(root);
    const res: FileResult = { symbols: c.syms.map((s) => s.sym), calls, package: pkg, imports };
    if (root.hasError) {
      const [line, msg] = firstError(root);
      res.failure = { file: repoPath, line, error: msg };
    }
    return res;
  } catch (e) {
    return { symbols: [], calls: [], package: '', imports: [], failure: { file: repoPath, error: `extractor panic: ${(e as Error).message}` } };
  } finally {
    tree?.delete();
  }
}
