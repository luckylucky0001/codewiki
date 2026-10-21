// Tiny streaming XML tokenizer (enough for AndroidManifest, Info.plist,
// storyboards and navigation graphs). Mirrors encoding/xml token semantics we
// rely on: start/end elements with local names, attributes and char data.
export type XmlToken =
  | { type: 'start'; name: string; attrs: Record<string, string>; selfClosing: boolean }
  | { type: 'end'; name: string }
  | { type: 'text'; text: string };

const local = (n: string) => n.slice(n.indexOf(':') + 1);

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    switch (e) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
    }
    return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });
}

export function* xmlTokens(src: string): Generator<XmlToken> {
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      yield { type: 'text', text: decodeEntities(src.slice(i)) };
      return;
    }
    if (lt > i) yield { type: 'text', text: decodeEntities(src.slice(i, lt)) };
    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4);
      if (e < 0) return;
      i = e + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9);
      if (e < 0) return;
      yield { type: 'text', text: src.slice(lt + 9, e) };
      i = e + 3;
      continue;
    }
    if (src.startsWith('<?', lt) || src.startsWith('<!', lt)) {
      const e = src.indexOf('>', lt);
      if (e < 0) return;
      i = e + 1;
      continue;
    }
    // find end of tag honoring quotes
    let j = lt + 1;
    let q = '';
    for (; j < n; j++) {
      const ch = src[j];
      if (q) {
        if (ch === q) q = '';
      } else if (ch === '"' || ch === "'") q = ch;
      else if (ch === '>') break;
    }
    if (j >= n) return; // malformed: stop like encoding/xml would error
    const body = src.slice(lt + 1, j);
    i = j + 1;
    if (body.startsWith('/')) {
      yield { type: 'end', name: local(body.slice(1).trim()) };
      continue;
    }
    const selfClosing = body.endsWith('/');
    const inner = selfClosing ? body.slice(0, -1) : body;
    const m = /^\s*([^\s/>]+)/.exec(inner);
    if (!m) return;
    const attrs: Record<string, string> = {};
    const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    const rest = inner.slice(m[0].length);
    while ((a = re.exec(rest))) {
      const k = local(a[1]!);
      if (!(k in attrs)) attrs[k] = decodeEntities(a[3] ?? a[4] ?? '');
    }
    const name = local(m[1]!);
    yield { type: 'start', name, attrs, selfClosing };
    if (selfClosing) yield { type: 'end', name };
  }
}
