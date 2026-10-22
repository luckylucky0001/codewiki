// Wiki pages with YAML frontmatter (the page contract) and atomic writes.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { Anchor } from '../model.js';
import { cmpStr } from '../util/go.js';
import { walkDir } from '../scan/scan.js';

export const StatusCurrent = 'current';
export const StatusStale = 'stale';
export const StatusOutdatedDoc = 'outdated-doc';

export interface Front {
  id: string;
  title: string;
  kind?: string;
  /** v2 tree pages: 0 repo · 1 project · 2 module · 3 cluster */
  level?: number;
  tree_node?: string;
  parent?: string;
  summary?: string;
  platforms?: string[];
  routes?: string[];
  importance?: string;
  sources?: Anchor[];
  children_digest?: string;
  source_commit?: string;
  status?: string;
  generated?: boolean;
}

export interface Page {
  path: string;
  front: Front;
  body: string;
  hasFM: boolean;
}

export class NoFrontmatterError extends Error {
  constructor() {
    super('missing frontmatter');
  }
}

/** Parse markdown with optional YAML frontmatter; returns [page, error?]. */
export function parsePage(p: string, s: string): [Page, Error | null] {
  const page: Page = { path: p, front: { id: '', title: '' }, body: s, hasFM: false };
  if (!s.startsWith('---\n')) return [page, new NoFrontmatterError()];
  const end = s.slice(4).indexOf('\n---');
  if (end < 0) return [page, new NoFrontmatterError()];
  const fm = s.slice(4, 4 + end);
  let rest = s.slice(4 + end + 4);
  if (rest.startsWith('\n')) rest = rest.slice(1);
  page.body = rest;
  page.hasFM = true;
  try {
    const d = (YAML.parse(fm) ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
    const arr = (v: unknown) => (Array.isArray(v) ? v.map(str) : undefined);
    page.front = { id: str(d.id), title: str(d.title) };
    if (d.kind) page.front.kind = str(d.kind);
    if (typeof d.level === 'number') page.front.level = d.level;
    if (d.tree_node) page.front.tree_node = str(d.tree_node);
    if (d.parent) page.front.parent = str(d.parent);
    if (d.summary) page.front.summary = str(d.summary);
    if (d.importance) page.front.importance = str(d.importance);
    if (d.children_digest) page.front.children_digest = str(d.children_digest);
    const pl = arr(d.platforms);
    if (pl) page.front.platforms = pl;
    const rs = arr(d.routes);
    if (rs) page.front.routes = rs;
    if (Array.isArray(d.sources)) page.front.sources = d.sources.map((a: Record<string, unknown>) => ({ sym: str(a?.sym), hash: str(a?.hash) }));
    if (d.source_commit) page.front.source_commit = str(d.source_commit);
    if (d.status) page.front.status = str(d.status);
    if (d.generated) page.front.generated = d.generated === true;
  } catch (e) {
    return [page, new Error('frontmatter: ' + (e as Error).message)];
  }
  return [page, null];
}

/** yaml.v3-compatible scalar rendering (plain when unambiguous, else quoted). */
export function yamlScalar(s: string): string {
  if (s === '') return '""';
  const plainOK =
    !/^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(s) &&
    !/[\s]$/.test(s) &&
    !/: |:$| #|[\n\t]/.test(s) &&
    !/^(true|false|yes|no|on|off|y|n|null|~|[-+]?(\d[\d_]*(\.\d*)?([eE][-+]?\d+)?|\.\d+|0x[0-9a-fA-F]+|0o[0-7]+|\.inf|\.nan))$/i.test(s);
  if (plainOK) return s;
  if (!/[\n'\\]/.test(s) || !s.includes("'")) {
    if (!s.includes('\n')) return "'" + s.replace(/'/g, "''") + "'";
  }
  return JSON.stringify(s);
}

function flowList(xs: string[]): string {
  return '[' + xs.map((x) => (/[,[\]{}:#]|^\s|\s$/.test(x) || x === '' ? yamlScalar(x) : yamlScalar(x))).join(', ') + ']';
}

export function renderFront(f: Front): string {
  const L: string[] = [];
  L.push('id: ' + yamlScalar(f.id));
  L.push('title: ' + yamlScalar(f.title));
  if (f.kind) L.push('kind: ' + yamlScalar(f.kind));
  if (f.level !== undefined) L.push('level: ' + f.level);
  if (f.tree_node) L.push('tree_node: ' + yamlScalar(f.tree_node));
  if (f.parent) L.push('parent: ' + yamlScalar(f.parent));
  if (f.summary) L.push('summary: ' + yamlScalar(f.summary));
  if (f.platforms?.length) L.push('platforms: ' + flowList(f.platforms));
  if (f.routes?.length) L.push('routes: ' + flowList(f.routes));
  if (f.importance) L.push('importance: ' + yamlScalar(f.importance));
  if (f.sources?.length) {
    L.push('sources:');
    for (const a of f.sources) L.push('  - sym: ' + yamlScalar(a.sym), '    hash: ' + yamlScalar(a.hash));
  }
  if (f.children_digest) L.push('children_digest: ' + yamlScalar(f.children_digest));
  if (f.source_commit) L.push('source_commit: ' + yamlScalar(f.source_commit));
  if (f.status) L.push('status: ' + yamlScalar(f.status));
  if (f.generated) L.push('generated: true');
  return L.join('\n') + '\n';
}

export function renderPage(p: Page): string {
  let out = '---\n' + renderFront(p.front) + '---\n' + p.body;
  if (!out.endsWith('\n')) out += '\n';
  return out;
}

/** Per-level tree index pages (pages/<p>/index.md, pages/<p>/<m>/index.md) are rendered by kb, like index.md. */
export function isTreeIndexPath(rel: string): boolean {
  // v1 directories never hold tree indexes (a route id may be literally `index`)
  return rel.startsWith('pages/') && rel.endsWith('/index.md') && !/^pages\/(features|concepts|flows|decisions)\//.test(rel);
}

export function idFromPath(rel: string): string {
  let id = rel.endsWith('.md') ? rel.slice(0, -3) : rel;
  if (id.startsWith('pages/')) id = id.slice(6);
  return id;
}

export function isPagePath(rel: string): boolean {
  if (!rel.endsWith('.md')) return false;
  if (isTreeIndexPath(rel)) return false;
  return rel.startsWith('pages/') || rel.startsWith('facts/');
}

export function loadPages(wikiDir: string): [Page[], Error[]] {
  const pages: Page[] = [];
  const errs: Error[] = [];
  for (const sub of ['pages', 'facts']) {
    walkDir(path.join(wikiDir, sub), (fp, _n, isDir) => {
      if (isDir) return true;
      const rel = path.relative(wikiDir, fp).split(path.sep).join('/');
      if (!isPagePath(rel)) return;
      let b: string;
      try {
        b = fs.readFileSync(fp, 'utf8');
      } catch (e) {
        errs.push(e as Error);
        return;
      }
      const [p, err] = parsePage(rel, b);
      if (err) errs.push(new Error(`${rel}: ${err.message}`));
      pages.push(p);
    });
  }
  pages.sort((a, b) => cmpStr(a.path, b.path));
  return [pages, errs];
}

export function findPage(pages: Page[], q: string): Page | undefined {
  if (q.startsWith('./')) q = q.slice(2);
  return pages.find((p) => p.path === q || p.front.id === q || idFromPath(p.path) === q || p.path === q + '.md' || p.path === 'pages/' + q + '.md');
}

export function writeFileAtomic(p: string, data: string | Buffer): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp~';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, p);
}
