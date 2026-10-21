// Tolerant mini-parsers for build metadata: JSON5 (HarmonyOS *.json5) and the
// OpenStep property-list dialect of Xcode project.pbxproj. No dependencies.

/** Parses JSON5 (comments, trailing commas, unquoted keys, single quotes, hex). Returns undefined on error. */
export function parseJSON5(src: string): unknown {
  let i = 0;
  const n = src.length;
  const fail = (): never => {
    throw new Error('json5 parse error at ' + i);
  };
  const ws = () => {
    for (;;) {
      const c = src[i];
      if (c === undefined) return;
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '﻿' || c === ' ') i++;
      else if (c === '/' && src[i + 1] === '/') {
        while (i < n && src[i] !== '\n') i++;
      } else if (c === '/' && src[i + 1] === '*') {
        const e = src.indexOf('*/', i + 2);
        i = e < 0 ? n : e + 2;
      } else return;
    }
  };
  const str = (q: string): string => {
    i++;
    let out = '';
    while (i < n && src[i] !== q) {
      let c = src[i]!;
      if (c === '\\') {
        i++;
        c = src[i]!;
        const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '0': '\0' };
        if (c === 'u') {
          out += String.fromCharCode(parseInt(src.slice(i + 1, i + 5), 16));
          i += 4;
        } else if (c === '\n') {
          /* line continuation */
        } else out += map[c] ?? c;
      } else out += c;
      i++;
    }
    if (src[i] !== q) fail();
    i++;
    return out;
  };
  const ident = (): string => {
    const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 256));
    if (!m) fail();
    i += m![0].length;
    return m![0];
  };
  const value = (): unknown => {
    ws();
    const c = src[i];
    if (c === '{') {
      i++;
      const o: Record<string, unknown> = {};
      for (;;) {
        ws();
        if (src[i] === '}') {
          i++;
          return o;
        }
        const k = src[i] === '"' || src[i] === "'" ? str(src[i]!) : ident();
        ws();
        if (src[i] !== ':') fail();
        i++;
        const v = value();
        if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') o[k] = v;
        ws();
        if (src[i] === ',') i++;
        else if (src[i] !== '}') fail();
      }
    }
    if (c === '[') {
      i++;
      const a: unknown[] = [];
      for (;;) {
        ws();
        if (src[i] === ']') {
          i++;
          return a;
        }
        a.push(value());
        ws();
        if (src[i] === ',') i++;
        else if (src[i] !== ']') fail();
      }
    }
    if (c === '"' || c === "'") return str(c);
    const m = /^[+-]?(?:0x[0-9a-fA-F]+|Infinity|NaN|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(src.slice(i, i + 64));
    if (m) {
      i += m[0].length;
      return Number(m[0]);
    }
    const id = ident();
    if (id === 'true') return true;
    if (id === 'false') return false;
    if (id === 'null') return null;
    return fail();
  };
  try {
    const v = value();
    ws();
    return i >= n ? v : undefined;
  } catch {
    return undefined;
  }
}

export type Plist = string | Plist[] | { [k: string]: Plist };

/** Parses an OpenStep plist (project.pbxproj). Returns undefined on error. */
export function parseOpenStep(src: string): Plist | undefined {
  let i = 0;
  const n = src.length;
  const fail = (): never => {
    throw new Error('plist parse error at ' + i);
  };
  const ws = () => {
    for (;;) {
      const c = src[i];
      if (c === undefined) return;
      if (c <= ' ') i++;
      else if (c === '/' && src[i + 1] === '/') {
        while (i < n && src[i] !== '\n') i++;
      } else if (c === '/' && src[i + 1] === '*') {
        const e = src.indexOf('*/', i + 2);
        i = e < 0 ? n : e + 2;
      } else return;
    }
  };
  const atom = (): string => {
    ws();
    if (src[i] === '"') {
      i++;
      let out = '';
      while (i < n && src[i] !== '"') {
        if (src[i] === '\\') {
          i++;
          const c = src[i]!;
          out += c === 'n' ? '\n' : c === 't' ? '\t' : c;
        } else out += src[i];
        i++;
      }
      i++;
      return out;
    }
    const m = /^[^\s;,={}()"]+/.exec(src.slice(i, i + 1024));
    if (!m) fail();
    i += m![0].length;
    return m![0];
  };
  const value = (): Plist => {
    ws();
    const c = src[i];
    if (c === '{') {
      i++;
      const o: { [k: string]: Plist } = {};
      for (;;) {
        ws();
        if (src[i] === '}') {
          i++;
          return o;
        }
        const k = atom();
        ws();
        if (src[i] !== '=') fail();
        i++;
        const v = value();
        if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') o[k] = v;
        ws();
        if (src[i] === ';') i++;
      }
    }
    if (c === '(') {
      i++;
      const a: Plist[] = [];
      for (;;) {
        ws();
        if (src[i] === ')') {
          i++;
          return a;
        }
        a.push(value());
        ws();
        if (src[i] === ',') i++;
      }
    }
    return atom();
  };
  try {
    ws();
    if (src.startsWith('// !$*UTF8*$!')) i = src.indexOf('\n');
    return value();
  } catch {
    return undefined;
  }
}

/** Strips // and /* *\/ comments (outside of string literals) from Gradle / Swift sources. */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      while (j < src.length && src[j] !== q && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      i = e < 0 ? src.length : e + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}
