// The verification gate: anchors match HEAD, symbols exist, no dead links or
// orphans, index complete, generated facts fresh.
import fs from 'node:fs';
import path from 'node:path';
import type { Graph } from '../model.js';
import { getSym } from '../model.js';
import { cmpStr } from '../util/go.js';
import { StatusCurrent, StatusOutdatedDoc, StatusStale, idFromPath, loadPages, writeFileAtomic, type Page } from './page.js';
import { SubIndexDir, renderIndexFiles, renderLLMSTxt } from './layout.js';

export interface Issue {
  code: string;
  page?: string;
  detail: string;
  sym?: string;
  want?: string;
  got?: string;
  fixable?: boolean;
}

export interface Report {
  ok: boolean;
  pages: number;
  anchors: number;
  errors: Issue[];
  warnings: Issue[];
  stale_pages: string[];
}

const symMention = /`((?:android|ios|harmony|web|[a-z][a-z0-9_-]{1,15}):\/\/[^`#\s]+#[^`\s]+)`/g;
const fenced = /```[\s\S]*?```/g;
const inlineCode = /`[^`\n]*`/g;
const mdLink = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Go issue field order with omitempty. */
function issue(i: Issue): Issue {
  const o: Issue = { code: i.code } as Issue;
  if (i.page) o.page = i.page;
  o.detail = i.detail;
  if (i.sym) o.sym = i.sym;
  if (i.want) o.want = i.want;
  if (i.got) o.got = i.got;
  if (i.fixable) o.fixable = true;
  return o;
}

const exists = (p: string) => fs.existsSync(p);

export function verifyWiki(wikiDir: string, g: Graph, expectedFacts?: Map<string, string>): Report {
  const r: Report = { ok: false, pages: 0, anchors: 0, errors: [], warnings: [], stale_pages: [] };
  const E = (i: Issue) => r.errors.push(issue(i));
  const [pages, errs] = loadPages(wikiDir);
  for (const e of errs) E({ code: 'E_FRONTMATTER', detail: e.message });
  r.pages = pages.length;
  const stale = new Set<string>();
  const links = new Map<string, string[]>();
  for (const p of pages) {
    if (p.hasFM) {
      if (!p.front.id || !p.front.title) E({ code: 'E_FRONTMATTER', page: p.path, detail: 'id and title are required' });
      else {
        const want = idFromPath(p.path);
        if (p.front.id !== want) E({ code: 'E_FRONTMATTER', page: p.path, detail: 'id must equal ' + want, want, got: p.front.id });
      }
      const st = p.front.status ?? '';
      if (!['', StatusCurrent, StatusStale, StatusOutdatedDoc].includes(st)) E({ code: 'E_FRONTMATTER', page: p.path, detail: 'invalid status ' + st });
    }
    if (p.path.startsWith('pages/') && !p.front.sources?.length && p.front.kind !== 'overview' && !p.front.generated) {
      r.warnings.push(issue({ code: 'W_NO_SOURCES', page: p.path, detail: 'page has no code anchors' }));
    }
    if (p.front.status === StatusStale) {
      stale.add(p.path);
      E({ code: 'E_STATUS_STALE', page: p.path, detail: 'page is marked stale' });
    }
    for (const a of p.front.sources ?? []) {
      r.anchors++;
      const s = getSym(g, a.sym);
      if (!s) {
        stale.add(p.path);
        E({ code: 'E_ANCHOR_MISSING', page: p.path, sym: a.sym, detail: 'anchored symbol no longer exists' });
        continue;
      }
      if (s.hash !== a.hash) {
        stale.add(p.path);
        E({ code: 'E_ANCHOR_STALE', page: p.path, sym: a.sym, want: s.hash, got: a.hash, detail: 'symbol body changed since the page was written' });
      }
    }
    for (const m of p.body.matchAll(symMention)) {
      if (isWebURL(m[1]!)) continue;
      if (!getSym(g, m[1]!)) E({ code: 'E_SYMBOL_UNKNOWN', page: p.path, sym: m[1], detail: 'page mentions a symbol id that does not exist' });
    }
    for (const t of linkTargets(p.path, p.body)) {
      const a = links.get(p.path) ?? [];
      a.push(t);
      links.set(p.path, a);
      if (!exists(path.join(wikiDir, t))) E({ code: 'E_DEAD_LINK', page: p.path, detail: 'link target not found: ' + t });
    }
  }
  let idx = '';
  try {
    idx = fs.readFileSync(path.join(wikiDir, 'index.md'), 'utf8');
  } catch {
    E({ code: 'E_INDEX_MISSING', detail: 'index.md not found', fixable: true });
  }
  const idxLinks = linkTargets('index.md', idx);
  for (const t of idxLinks) if (!exists(path.join(wikiDir, t))) E({ code: 'E_DEAD_LINK', page: 'index.md', detail: 'link target not found: ' + t, fixable: true });
  for (const t of [...idxLinks]) {
    if (!t.startsWith(SubIndexDir + '/')) continue;
    let sb: string;
    try {
      sb = fs.readFileSync(path.join(wikiDir, t), 'utf8');
    } catch {
      continue;
    }
    for (const st of linkTargets(t, sb)) {
      if (st === 'index.md') continue;
      if (!exists(path.join(wikiDir, st))) E({ code: 'E_DEAD_LINK', page: t, detail: 'link target not found: ' + st, fixable: true });
      idxLinks.push(st);
    }
  }
  const inIndex = new Set(idxLinks);
  const reach = new Set<string>();
  const queue = [...idxLinks];
  while (queue.length) {
    const x = queue.shift()!;
    if (reach.has(x)) continue;
    reach.add(x);
    queue.push(...(links.get(x) ?? []));
  }
  for (const p of pages) {
    if (!inIndex.has(p.path)) E({ code: 'E_INDEX_COVERAGE', page: p.path, detail: 'page not listed in index.md', fixable: true });
    if (!reach.has(p.path)) E({ code: 'E_ORPHAN', page: p.path, detail: 'page not reachable from index.md', fixable: true });
  }
  if (expectedFacts) {
    for (const k of [...expectedFacts.keys()].sort(cmpStr)) {
      let got: string | null = null;
      try {
        got = fs.readFileSync(path.join(wikiDir, k), 'utf8');
      } catch {
        got = null;
      }
      if (got !== expectedFacts.get(k)) E({ code: 'E_FACTS_STALE', page: k, detail: 'generated facts differ from current code (run kb compound)' });
    }
  }
  r.stale_pages = [...stale].sort(cmpStr);
  r.ok = r.errors.length === 0;
  return r;
}

export function linkTargets(from: string, body: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  body = body.replace(fenced, '').replace(inlineCode, '');
  for (const m of body.matchAll(mdLink)) {
    let t = m[1]!;
    if (t.includes('://') || t.startsWith('#') || t.startsWith('mailto:')) continue;
    const i = t.indexOf('#');
    if (i >= 0) t = t.slice(0, i);
    if (!t) continue;
    const res = t.startsWith('/') ? path.posix.normalize(t.slice(1)) : path.posix.normalize(path.posix.join(path.posix.dirname(from), t));
    const clean = res.replace(/\/$/, '') || '.';
    if (!seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

export function fixIndex(wikiDir: string): void {
  const [pages] = loadPages(wikiDir);
  const files = renderIndexFiles(pages);
  for (const [rel, b] of files) writeFileAtomic(path.join(wikiDir, rel), b);
  const subDir = path.join(wikiDir, SubIndexDir);
  try {
    for (const f of fs.readdirSync(subDir)) {
      if (f.endsWith('.md') && !files.has(SubIndexDir + '/' + f)) fs.rmSync(path.join(subDir, f));
    }
    if (files.size === 1) fs.rmdirSync(subDir);
  } catch {
    /* no sub-index dir */
  }
  writeFileAtomic(path.join(wikiDir, 'llms.txt'), renderLLMSTxt(pages));
}

export function subIndexesCurrent(wikiDir: string, pages: Page[]): boolean {
  const files = renderIndexFiles(pages);
  let old: string[] = [];
  try {
    old = fs.readdirSync(path.join(wikiDir, SubIndexDir)).filter((f) => f.endsWith('.md'));
  } catch {
    old = [];
  }
  if (old.length !== files.size - 1) return false;
  for (const [rel, b] of files) {
    if (rel === 'index.md') continue;
    try {
      if (fs.readFileSync(path.join(wikiDir, rel), 'utf8') !== b) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function isWebURL(s: string): boolean {
  return ['http://', 'https://', 'ftp://', 'file://'].some((p) => s.startsWith(p));
}
