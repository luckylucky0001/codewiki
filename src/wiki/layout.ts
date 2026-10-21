// Wiki skeleton, layered index.md (+ per-module sub-indexes), llms.txt and log.md.
import fs from 'node:fs';
import path from 'node:path';
import { cmpStr } from '../util/go.js';
import { AgentsMD } from './agents-md.js';
import { type Page, StatusCurrent, idFromPath, loadPages, writeFileAtomic } from './page.js';

export { AgentsMD };

export function initWiki(wikiDir: string, dryRun: boolean): string[] {
  const created: string[] = [];
  const files: Record<string, string> = {
    'AGENTS.md': AgentsMD,
    'log.md': '# Log\n\nappend-only；格式：`## [YYYY-MM-DD] op | subject`\n',
    'raw/docs/.gitkeep': '',
    'pages/features/.gitkeep': '',
    'pages/flows/.gitkeep': '',
    'pages/concepts/.gitkeep': '',
    'pages/decisions/.gitkeep': '',
    'facts/.gitkeep': '',
    '.kb/.gitkeep': '',
  };
  for (const rel of Object.keys(files).sort(cmpStr)) {
    const p = path.join(wikiDir, rel);
    if (fs.existsSync(p)) continue;
    created.push(rel);
    if (!dryRun) writeFileAtomic(p, files[rel]!);
  }
  const idx = path.join(wikiDir, 'index.md');
  if (!fs.existsSync(idx)) {
    created.push('index.md');
    if (!dryRun) {
      const [pages] = loadPages(wikiDir);
      writeFileAtomic(idx, renderIndex(pages));
      writeFileAtomic(path.join(wikiDir, 'llms.txt'), renderLLMSTxt(pages));
    }
  }
  return created;
}

const sectionOrder: [string, string][] = [
  ['pages/overview', '总览'],
  ['pages/parity', '三端一致性 parity（生成）'],
  ['pages/features/', '功能 features'],
  ['pages/flows/', '流程 flows'],
  ['pages/concepts/', '概念 concepts'],
  ['pages/decisions/', '决策 decisions'],
  ['pages/_', '文档核对 conflicts'],
  ['pages/', '其他页面'],
  ['facts/', '事实 facts（生成）'],
];

function section(p: string): number {
  for (let i = 0; i < sectionOrder.length; i++) if (p.startsWith(sectionOrder[i]![0])) return i;
  return sectionOrder.length - 1;
}

export const FeatureIndexMax = 150;
export const IndexMaxRoutesPerLine = 8;
export const SubIndexMaxGroups = 40;
export const SubIndexDir = 'index';

export function pageModule(p: Page): string {
  if (!p.front.sources?.length) return 'other';
  let f = p.front.sources[0]!.sym;
  const i = f.indexOf('://');
  if (i >= 0) f = f.slice(i + 3);
  const h = f.indexOf('#');
  if (h >= 0) f = f.slice(0, h);
  const s = f.indexOf('/src/');
  if (s > 0) return f.slice(0, s);
  let d = path.posix.dirname(f).split('/');
  if (d.length > 2) d = d.slice(0, 2);
  const m = d.join('/');
  return m !== '.' && m !== '' ? m : 'root';
}

function moduleSlug(m: string): string {
  let b = '';
  for (const r of m.toLowerCase()) b += (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') ? r : '-';
  return b.replace(/^-+|-+$/g, '');
}

function indexLine(p: Page, prefix: string): string {
  const title = p.front.title || idFromPath(p.path);
  const status = p.front.status && p.front.status !== StatusCurrent ? ' ⚠ ' + p.front.status : '';
  let extra = '';
  let rs = p.front.routes ?? [];
  if (rs.length) {
    let more = '';
    if (rs.length > IndexMaxRoutesPerLine) {
      more = ` … +${rs.length - IndexMaxRoutesPerLine}`;
      rs = rs.slice(0, IndexMaxRoutesPerLine);
    }
    extra = ' — routes: `' + rs.join('`, `') + '`' + more;
  }
  return `- [${title}](${prefix}${p.path})${extra}${status}\n`;
}

export function renderIndex(pages: Page[]): string {
  return renderIndexFiles(pages).get('index.md')!;
}

export function renderIndexFiles(pages: Page[]): Map<string, string> {
  const out = new Map<string, string>();
  let b = '# Index\n\n<!-- maintained by kb (kb verify --fix-index); do not edit by hand -->\n\n';
  b += '入口：[AGENTS.md](AGENTS.md)（写作规范） · [log.md](log.md)（变更日志） · `facts/*.json`（机器可读事实）\n';
  const groups = new Map<number, Page[]>();
  for (const p of pages) {
    const s = section(p.path);
    const a = groups.get(s);
    if (a) a.push(p);
    else groups.set(s, [p]);
  }
  sectionOrder.forEach(([prefix, title], i) => {
    const ps = groups.get(i);
    if (!ps?.length) return;
    b += `\n## ${title}\n\n`;
    if (prefix === 'facts/') {
      const order: string[] = [];
      const links = new Map<string, string[]>();
      for (const p of ps) {
        const parts = p.path.slice(6).split('/');
        const group = parts.length >= 2 ? parts[0]! : '(root)';
        if (!links.has(group)) {
          order.push(group);
          links.set(group, []);
        }
        links.get(group)!.push(`[${path.posix.basename(p.path).replace(/\.md$/, '')}](${p.path})`);
      }
      for (const g of order) b += `- **${g}**: ${links.get(g)!.join(' ')}\n`;
      return;
    }
    if (prefix === 'pages/features/' && ps.length > FeatureIndexMax) {
      let mods: string[] = [];
      let byMod = new Map<string, Page[]>();
      for (let depth = 0; depth <= 3; depth++) {
        mods = [];
        byMod = new Map();
        for (const p of ps) {
          let m = pageModule(p);
          if (depth > 0) {
            const seg = m.split('/');
            if (seg.length > 4 - depth) m = seg.slice(0, 4 - depth).join('/');
          }
          if (!byMod.has(m)) {
            mods.push(m);
            byMod.set(m, []);
          }
          byMod.get(m)!.push(p);
        }
        if (mods.length <= SubIndexMaxGroups) break;
      }
      mods.sort(cmpStr);
      b += `${ps.length} 个功能页，按模块分组（每组一个子索引）：\n\n`;
      const used = new Set<string>();
      for (const m of mods) {
        let slug = moduleSlug(m) || 'root';
        for (let base = slug, k = 2; used.has(slug); k++) slug = `${base}-${k}`;
        used.add(slug);
        const sub = SubIndexDir + '/features-' + slug + '.md';
        let sb = `# Index · 功能 · ${m}\n\n<!-- maintained by kb (kb verify --fix-index); do not edit by hand -->\n\n[← index.md](../index.md)\n\n`;
        let last = '';
        for (const p of byMod.get(m)!) {
          const fm = pageModule(p);
          if (fm !== m && fm !== last) {
            sb += `\n### ${fm}\n\n`;
            last = fm;
          }
          sb += indexLine(p, '../');
        }
        out.set(sub, sb);
        b += `- [${m}](${sub}) — ${byMod.get(m)!.length}\n`;
      }
      return;
    }
    for (const p of ps) b += indexLine(p, '');
  });
  out.set('index.md', b);
  return out;
}

export function renderLLMSTxt(pages: Page[]): string {
  let b = '# codewiki\n\n> Code-anchored knowledge base. Every page lists `sources` (symbol id + hash) verified against HEAD by `kb verify`.\n\n';
  b += '## Docs\n\n- [index.md](index.md): layered table of contents\n- [AGENTS.md](AGENTS.md): writing schema\n- [facts/routes.json](facts/routes.json), [facts/testids.json](facts/testids.json), [facts/apis.json](facts/apis.json), [facts/requirements.json](facts/requirements.json): machine-readable facts\n\n## Pages\n\n';
  const files = renderIndexFiles(pages);
  const hier = files.size > 1;
  for (const p of pages) {
    if (p.path.startsWith('pages/') && !(hier && p.path.startsWith('pages/features/'))) b += `- [${p.front.title}](${p.path})\n`;
  }
  if (hier) {
    const subs = [...files.keys()].filter((r) => r !== 'index.md').sort(cmpStr);
    b += '\n## Feature indexes (one per module)\n\n';
    for (const rel of subs) b += `- [${rel.replace(SubIndexDir + '/features-', '').replace(/\.md$/, '')}](${rel})\n`;
  }
  return b;
}

export function appendLog(wikiDir: string, date: string, op: string, subject: string, bullets: string[]): void {
  const p = path.join(wikiDir, 'log.md');
  let s = '';
  try {
    s = fs.readFileSync(p, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  if (s === '') s = '# Log\n\nappend-only；格式：`## [YYYY-MM-DD] op | subject`\n';
  if (!s.endsWith('\n')) s += '\n';
  s += `\n## [${date}] ${op} | ${subject}\n`;
  if (bullets.length) {
    s += '\n';
    for (const l of bullets) s += '- ' + l + '\n';
  }
  writeFileAtomic(p, s);
}
