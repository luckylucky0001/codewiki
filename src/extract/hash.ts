// Hash helpers shared by the extractor: sha256 (hex) and a 64-bit simhash over
// FNV-1a token 3-shingles, bit-identical to the Go implementation.
import { sha256hex } from '../util/go.js';

export const sha = (s: string): string => sha256hex(s);

/** FNV-1a 64-bit over bytes; returns [lo32, hi32]. Uses 16-bit limbs (no BigInt). */
function fnv64a(buf: Uint8Array): [number, number] {
  let h0 = 0x2325, h1 = 0x8422, h2 = 0x9ce4, h3 = 0xcbf2;
  for (let i = 0; i < buf.length; i++) {
    h0 ^= buf[i]!;
    // h * 0x100000001b3 = h*0x1b3 + (h << 40)
    const t0 = h0 * 0x1b3;
    const t1 = h1 * 0x1b3 + (t0 >>> 16);
    const t2 = h2 * 0x1b3 + (t1 >>> 16) + (h0 << 8);
    const t3 = h3 * 0x1b3 + (t2 >>> 16) + (h1 << 8);
    h0 = t0 & 0xffff;
    h1 = t1 & 0xffff;
    h2 = t2 & 0xffff;
    h3 = t3 & 0xffff;
  }
  return [(h1 << 16 | h0) >>> 0, (h3 << 16 | h2) >>> 0];
}

const enc = new TextEncoder();

export function simhash(toks: string[]): string {
  const n = toks.length;
  if (n === 0) return '0000000000000000';
  const v = new Int32Array(64);
  const k = Math.min(3, n);
  for (let i = 0; i + k <= n; i++) {
    const [lo, hi] = fnv64a(enc.encode(toks.slice(i, i + k).join('\x00')));
    for (let b = 0; b < 32; b++) {
      v[b]! += (lo >>> b) & 1 ? 1 : -1;
      v[b + 32]! += (hi >>> b) & 1 ? 1 : -1;
    }
  }
  let lo = 0, hi = 0;
  for (let b = 0; b < 32; b++) {
    if (v[b]! > 0) lo |= 1 << b;
    if (v[b + 32]! > 0) hi |= 1 << b;
  }
  return (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0');
}

function popcount32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** 1 - hamming(a,b)/64 for two simhash hex strings. */
export function similarity(a: string, b: string): number {
  const p = (s: string): [number, number] => {
    const m = /^[0-9a-fA-F]+/.exec(s);
    const h = (m ? m[0] : '0').padStart(16, '0').slice(-16);
    return [parseInt(h.slice(8), 16) >>> 0, parseInt(h.slice(0, 8), 16) >>> 0];
  };
  const [al, ah] = p(a), [bl, bh] = p(b);
  return 1 - (popcount32((al ^ bl) >>> 0) + popcount32((ah ^ bh) >>> 0)) / 64;
}
