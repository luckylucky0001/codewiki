// Spec / doc discovery and classification, raw/docs copies, and the rendered
// conflicts page + requirements.json.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Graph, Requirement } from '../model.js';
import { getSym } from '../model.js';
import { absRoot } from '../config/config.js';
import { cmpStr, goJSON } from '../util/go.js';
import { type Page, StatusCurrent, idFromPath, writeFileAtomic } from '../wiki/page.js';
import { ClaimConflict, ClaimUnverifiable, ClaimVerified, type Claim, extractClaims } from './claims.js';
import { ConflictsPage } from './plan.js';
import { sortedKeys } from './graphutil.js';

export interface DocEntry {
  path: string;
  kind: string;
  convention: string;
  hash: string;
  title?: string;
  bytes: number;
  raw?: string;
}
export interface DocsManifest {
  version: number;
  root?: string;
  docs: DocEntry[];
}

export function docJSON(d: DocEntry): Record<string, unknown> {
  const o: Record<string, unknown> = { path: d.path, kind: d.kind, convention: d.convention, hash: d.hash };
  if (d.title) o.title = d.title;
  o.bytes = d.bytes;
  if (d.raw) o.raw = d.raw;
  return o;
}
export function manifestJSON(m: DocsManifest): Record<string, unknown> {
  const o: Record<string, unknown> = { version: m.version };
  if (m.root) o.root = m.root;
  o.docs = m.docs.map(docJSON);
  return o;
}

const NonDocTop = /^(changelog|changes|history|release[-_ ]?notes|releases|news|license|licence|copying|notice|code[-_]of[-_]conduct|authors|contributors|maintainers|codeowners|funding|support|patents)(\.[a-z0-9-]+)*\.mdx?$/;

export function classifyDoc(rel: string): [string, string] | null {
  const p = rel.toLowerCase();
  const base = path.posix.basename(p);
  if (!p.endsWith('.md') && !p.endsWith('.mdx')) return null;
  const has = (seg: string) => p.startsWith(seg) || p.includes('/' + seg);
  if (has('.specify/')) return ['agent-guide', 'spec-kit'];
  if (has('specs/') && !has('openspec/') && !has('.kiro/')) {
    if (base === 'spec.md') return ['spec', 'spec-kit'];
    if (['plan.md', 'research.md', 'data-model.md', 'quickstart.md'].includes(base)) return ['design', 'spec-kit'];
    if (base === 'tasks.md') return ['tasks', 'spec-kit'];
    return ['doc', 'spec-kit'];
  }
  if (has('openspec/')) {
    if (base === 'spec.md') return ['spec', 'openspec'];
    if (base === 'proposal.md' || base === 'design.md') return ['design', 'openspec'];
    if (base === 'tasks.md') return ['tasks', 'openspec'];
    if (base === 'project.md' || base === 'agents.md') return ['agent-guide', 'openspec'];
    return ['doc', 'openspec'];
  }
  if (has('.kiro/specs/')) {
    if (base === 'requirements.md') return ['spec', 'kiro'];
    if (base === 'design.md') return ['design', 'kiro'];
    if (base === 'tasks.md') return ['tasks', 'kiro'];
    return ['doc', 'kiro'];
  }
  if (has('.kiro/steering/')) return ['agent-guide', 'kiro'];
  if (has('docs/adr/') || has('doc/adr/') || has('adr/') || has('architecture/decisions/') || has('docs/decisions/')) return ['adr', 'adr'];
  if (has('rfcs/') || has('rfc/')) return ['design', 'rfc'];
  if (base === 'agents.md' || base === 'claude.md' || base === 'gemini.md' || p === '.github/copilot-instructions.md') return ['agent-guide', 'agents-md'];
  if (base === 'threatmodel.md' || base === 'security.md') return ['design', 'security'];
  if (base === 'readme.md') return ['readme', 'readme'];
  if (has('docs/') || has('doc/') || has('documentation/') || has('wiki/')) return ['doc', 'docs'];
  if (base === 'contributing.md') return ['doc', 'docs'];
  // top-level prose (ARCHITECTURE.md, DESIGN.md, …); release / legal boilerplate stays out
  if (!p.includes('/') && !NonDocTop.test(base)) return ['doc', 'docs'];
  return null;
}

const skipDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'vendor', 'third_party', '.kb-work', 'Pods', 'oh_modules', '.gradle', '.idea', 'coverage']);

function firstHeading(b: string): string {
  for (const l of b.split('\n')) if (l.startsWith('# ')) return l.slice(2).trim();
  return '';
}
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export function discoverDocs(root: string, exclude: string[]): DocsManifest {
  const abs = absRoot(root);
  const m: DocsManifest = { version: 1, root: abs, docs: [] };
  const excl = new Set(exclude.map((e) => e.replace(/\/+$/, '')));
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
      const rel = path.relative(abs, p).split(path.sep).join('/');
      if (e.isDirectory()) {
        if (skipDirs.has(e.name) || excl.has(rel)) continue;
        // kb's own wiki (also in zero-config mode, where wiki_dir is unknown)
        if (fs.existsSync(path.join(p, '.kb')) && fs.existsSync(path.join(p, 'pages'))) continue;
        if (e.name.startsWith('.') && !['.kiro', '.specify', '.github'].includes(e.name)) continue;
        rec(p);
        continue;
      }
      const c = classifyDoc(rel);
      if (!c) continue;
      let b: Buffer;
      try {
        b = fs.readFileSync(p);
      } catch {
        continue;
      }
      m.docs.push({ path: rel, kind: c[0], convention: c[1], hash: sha(b), title: firstHeading(b.toString('utf8')), bytes: b.length });
    }
  };
  rec(abs);
  m.docs.sort((a, b) => cmpStr(a.path, b.path));
  return m;
}

export const RawManifestPath = 'raw/docs/manifest.json';

export function loadRawManifest(wikiDir: string): DocsManifest {
  const m: DocsManifest = { version: 1, docs: [] };
  try {
    const d = JSON.parse(fs.readFileSync(path.join(wikiDir, RawManifestPath), 'utf8'));
    if (Array.isArray(d.docs)) m.docs = d.docs;
    if (d.version) m.version = d.version;
  } catch {
    /* none */
  }
  return m;
}

export function copyDocs(repoRoot: string, wikiDir: string, docs: DocEntry[]): DocEntry[] {
  const man = loadRawManifest(wikiDir);
  const byPath = new Map(man.docs.map((d, i) => [d.path, i]));
  const copied: DocEntry[] = [];
  for (const d0 of docs) {
    const d = { ...d0 };
    const src = path.isAbsolute(d.path) ? d.path : path.join(repoRoot, d.path);
    let b: Buffer;
    try {
      b = fs.readFileSync(src);
    } catch (e) {
      throw new Error(`read ${d.path}: ${(e as Error).message}`);
    }
    let rel = d.path;
    if (path.isAbsolute(rel) || rel.startsWith('..')) rel = path.basename(rel);
    rel = rel.split(path.sep).join('/').replace(/^\.\//, '');
    d.raw = 'raw/docs/' + rel;
    if (!d.kind) {
      const c = classifyDoc(rel);
      [d.kind, d.convention] = c ?? ['doc', 'legacy'];
    }
    d.hash = sha(b);
    d.bytes = b.length;
    if (!d.title) d.title = firstHeading(b.toString('utf8'));
    writeFileAtomic(path.join(wikiDir, d.raw), b);
    const i = byPath.get(d.path);
    if (i !== undefined) man.docs[i] = d;
    else {
      byPath.set(d.path, man.docs.length);
      man.docs.push(d);
    }
    copied.push(d);
  }
  man.docs.sort((a, b) => cmpStr(a.path, b.path));
  writeFileAtomic(path.join(wikiDir, RawManifestPath), goJSON({ version: man.version, docs: man.docs.map(docJSON) }, '  ') + '\n');
  return copied;
}

export function allClaims(wikiDir: string): Claim[] {
  const out: Claim[] = [];
  for (const d of loadRawManifest(wikiDir).docs) {
    let b: string;
    try {
      b = fs.readFileSync(path.join(wikiDir, d.raw ?? ''), 'utf8');
    } catch {
      continue;
    }
    out.push(...extractClaims(d.path, d.raw ?? '', b));
  }
  return out;
}

export const ConflictsPageMaxRows = 300;
export const ConflictsPageMaxConflictRows = 1000;

const reMdLink = /!?\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g;
const inertLinks = (s: string) => s.replace(reMdLink, '$1（`$2`）');

export function renderConflicts(claims: Claim[], g: Graph, commit: string): [Page, Requirement[]] {
  const reqs: Requirement[] = [];
  const anchorSet = new Set<string>();
  const nVerified = claims.filter((c) => c.status === ClaimVerified).length;
  const bigVerified = nVerified > ConflictsPageMaxRows;
  const bySrc = new Map<string, Claim[]>();
  const counts: Record<string, number> = {};
  for (const c of claims) {
    const a = bySrc.get(c.source);
    if (a) a.push(c);
    else bySrc.set(c.source, [c]);
    counts[c.status ?? ''] = (counts[c.status ?? ''] ?? 0) + 1;
    const r: Requirement = { id: c.id, source: c.source, line: c.line, text: c.text, status: c.status ?? '', anchors: [], route_ids: c.route_ids ?? [], evidence: c.evidence };
    for (const a2 of c.anchors ?? []) {
      const s = getSym(g, a2);
      if (s) {
        r.anchors!.push({ sym: s.id, hash: s.hash });
        if (c.status === ClaimConflict || (c.status === ClaimVerified && !bigVerified)) anchorSet.add(s.id);
      }
    }
    reqs.push(r);
  }
  const srcs = [...bySrc.keys()].sort(cmpStr);
  let b = '# 文档核对：冲突与已验证断言\n\n> 代码为准（code wins）。本页由 `kb ingest` / `kb compound` 根据 `raw/docs/` 中的文档逐条核对生成；机器可读版本见 [facts/requirements.json](../facts/requirements.json)。\n\n';
  b += `| 状态 | 数量 |\n|---|---|\n| conflict（与代码冲突） | ${counts[ClaimConflict] ?? 0} |\n| verified（有代码锚点） | ${counts[ClaimVerified] ?? 0} |\n| unverifiable（无证据，不提升为知识） | ${counts[ClaimUnverifiable] ?? 0} |\n`;
  const section = (title: string, status: string) => {
    const rows: string[] = [];
    const perDoc = new Map<string, number>();
    for (const s of srcs) {
      for (const c of bySrc.get(s)!) {
        if (c.status !== status) continue;
        perDoc.set(s, (perDoc.get(s) ?? 0) + 1);
        rows.push(`- **${c.id}** （[${s}](../${c.raw}) L${c.line}）${inertLinks(c.text)}\n  - 证据：${(c.evidence ?? []).join('；')}`);
      }
    }
    b += `\n## ${title}\n\n`;
    if (!rows.length) {
      b += '（无）\n';
      return;
    }
    const limit = status === ClaimConflict ? ConflictsPageMaxConflictRows : ConflictsPageMaxRows;
    if (rows.length <= limit) {
      b += rows.join('\n') + '\n';
      return;
    }
    if (status === ClaimConflict) {
      b += rows.slice(0, limit).join('\n') + '\n';
      b += `\n…另有 ${rows.length - limit} 条冲突未列出（页面预算）。完整列表：\`kb conflicts\` 或 facts/requirements.json。\n`;
      return;
    }
    b += `共 ${rows.length} 条，超过页面预算（${limit}），只列每篇文档的数量；逐条内容见 facts/requirements.json（\`kb conflicts --all --json\`、\`kb search\`）。\n\n| 文档 | 数量 |\n|---|---|\n`;
    for (const s of srcs) if ((perDoc.get(s) ?? 0) > 0) b += `| ${s} | ${perDoc.get(s)} |\n`;
  };
  const sus: string[] = [];
  for (const s of srcs) for (const c of bySrc.get(s)!) if (c.suspicious) sus.push(`- **${c.id}** （[${s}](../${c.raw}) L${c.line}）匹配 \`${c.suspicious}\` —— 内容未展示，未提升`);
  if (sus.length) b += `\n## ⚠ 可疑内容（疑似 prompt injection）\n\n以下断言包含针对 AI 的指令性文字，已从 LLM 输入中隐去，且不会被核对或提升为知识。请人工检查原文。\n\n${sus.join('\n')}\n`;
  section('冲突 conflicts（文档已过时，以代码为准）', ClaimConflict);
  section('已验证 verified', ClaimVerified);
  section('无法验证 unverifiable', ClaimUnverifiable);
  const front: Page['front'] = { id: idFromPath(ConflictsPage), title: '文档核对（冲突与已验证断言）', kind: 'conflicts', source_commit: commit, status: StatusCurrent };
  const ids = sortedKeys(anchorSet);
  if (ids.length) front.sources = ids.map((id) => ({ sym: id, hash: getSym(g, id)!.hash }));
  return [{ path: ConflictsPage, hasFM: true, body: b, front }, reqs];
}
