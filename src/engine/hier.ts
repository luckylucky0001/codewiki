// Hierarchical wiki (design-v2 §2–3): module_tree.json build / repair inside
// compound, L0–L3 pages (template prose + kb-owned blocks), per-level indexes,
// hierarchical llms.txt and the freshness checks verify runs.
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../config/config.js';
import { wikiPath } from '../config/config.js';
import type { Facts, Graph, Symbol } from '../model.js';
import { getSym } from '../model.js';
import * as tree from '../tree/index.js';
import type { ModuleTree, TreeNode, RepairDecision } from '../tree/index.js';
import { cmpStr } from '../util/go.js';
import { type Page, StatusCurrent, idFromPath, parsePage, renderPage } from '../wiki/page.js';
import type { Issue, Report } from '../wiki/verify.js';
import { featurePage, OverviewPage } from './plan.js';

export const TreeFile = 'module_tree.json';

export interface TreeTask {
  page: string;
  node: string;
  level: number;
  op: 'create' | 'update' | 'refresh';
  reasons: string[];
}

export interface TreePlan {
  mode: 'build' | 'repair' | 'rebuild';
  depth: number;
  nodes_per_level: Record<string, number>;
  decisions: RepairDecision[];
  renamed_pages: { from: string; to: string }[];
  llm_route: string[];
  tasks: TreeTask[];
  warnings?: string[];
}

export function loadTree(wikiDir: string): ModuleTree | null {
  try {
    return tree.parseTree(fs.readFileSync(path.join(wikiDir, TreeFile), 'utf8'));
  } catch {
    return null;
  }
}

function fileBytes(root: string, g: Graph): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of Object.keys(g.files)) {
    try {
      out[f] = fs.statSync(path.join(root, f)).size;
    } catch {
      out[f] = 0;
    }
  }
  return out;
}

/** Build (first run, --full, incompatible baseline) or repair the tree. Pure apart from reading build files. */
export function computeTree(cfg: Config, g: Graph, oldGraph: Graph | null, facts: Facts, prev: ModuleTree | null, full: boolean, head: string): { tree: ModuleTree; plan: Omit<TreePlan, 'tasks'> } {
  const projects = tree.detectProjects(tree.fsSource(cfg.root));
  const input: tree.TreeInput = { graph: g, facts, projects, fileBytes: fileBytes(cfg.root, g), config: (cfg.tree ?? {}) as Partial<tree.TreeConfig>, prev, title: cfg.project, head, generatedBy: 'kb 0.2.0' };
  let t: ModuleTree;
  let mode: TreePlan['mode'] = 'build';
  let decisions: RepairDecision[] = [];
  let renamed: { from: string; to: string }[] = [];
  let llmRoute: string[] = [];
  if (prev && oldGraph && oldGraph.symbols.length && !full) {
    const r = tree.repairTree(prev, input, tree.deltaFromGraphs(oldGraph, g));
    t = r.tree;
    mode = r.rebuilt ? 'rebuild' : 'repair';
    decisions = r.decisions;
    renamed = r.renamedPages;
    llmRoute = r.llmRoute;
  } else t = tree.buildTree(input);
  t.head = head;
  summarize(t, g, facts);
  const st = tree.treeStats(t);
  const plan: Omit<TreePlan, 'tasks'> = { mode, depth: st.depth, nodes_per_level: st.nodesPerLevel, decisions, renamed_pages: renamed, llm_route: llmRoute };
  if (t.warnings?.length) plan.warnings = t.warnings;
  return { tree: t, plan };
}

const kindName: Record<string, string> = { repo: '仓库', project: '项目', module: '模块', cluster: '功能簇' };

function coreSyms(n: TreeNode, g: Graph): Symbol[] {
  return (n.core ?? []).map((id) => getSym(g, id)).filter((s): s is Symbol => !!s);
}

function filesOf(n: TreeNode, g: Graph): string[] {
  if (n.files?.length) return [...n.files].sort(cmpStr);
  return [...new Set(coreSyms(n, g).map((s) => s.file))].sort(cmpStr);
}

function countCore(n: TreeNode): number {
  let k = 0;
  tree.walk(n, (x) => {
    if (x.kind === 'cluster' || !x.children?.length) k += x.core?.length ?? 0;
  });
  return k;
}

/** Deterministic summaries (≤ 80 words), bottom-up; kept when an LLM wrote one for unchanged members. */
export function summarize(t: ModuleTree, g: Graph, facts: Facts): void {
  const rec = (n: TreeNode) => {
    for (const c of n.children ?? []) rec(c);
    if (n.summary && (n as TreeNode & { summary_source?: string }).summary_source === 'llm') return;
    n.summary = detSummary(t, n, g, facts);
  };
  rec(t.root);
  tree.updateDigests(t.root);
}

function detSummary(t: ModuleTree, n: TreeNode, g: Graph, facts: Facts): string {
  const routes = n.routes?.length ? `；路由 ${n.routes.slice(0, 5).join(', ')}${n.routes.length > 5 ? ' 等' : ''}` : '';
  if (n.kind === 'cluster' || (n.kind !== 'repo' && !n.children?.length)) {
    const syms = coreSyms(n, g);
    const kinds = new Map<string, number>();
    for (const s of syms) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
    const k = [...kinds].sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0])).map(([kk, v]) => `${v} 个 ${kk}`).join('、');
    const top = syms.slice(0, 3).map((s) => s.name).join('、');
    return `${n.title}：${syms.length} 个核心符号（${k}），位于 ${filesOf(n, g).length} 个文件；主要符号 ${top}${routes}。`;
  }
  const kids = n.children ?? [];
  const byKind = kindName[kids[0]?.kind ?? 'module'] ?? '子节点';
  const names = kids.slice(0, 4).map((c) => c.title).join('、');
  if (n.kind === 'repo') {
    const r = facts.routes?.length ?? 0;
    return `${n.title}：${kids.length} 个${byKind}（${names}${kids.length > 4 ? ' 等' : ''}），共 ${countCore(n)} 个核心符号、${r} 条路由。`;
  }
  const meta = [n.build, n.platform, n.module_type].filter(Boolean).join(' · ');
  return `${n.title}${meta ? `（${meta}）` : ''}：${kids.length} 个${byKind}（${names}${kids.length > 4 ? ' 等' : ''}），${countCore(n)} 个核心符号${routes}。`;
}

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** kb-owned blocks of a tree page (name → body, plus diagram blocks). Deterministic over tree + graph + facts. */
export function treeBlocks(t: ModuleTree, n: TreeNode, g: Graph, facts: Facts): { name: string; body: string; attrs?: Record<string, string> }[] {
  const out: { name: string; body: string; attrs?: Record<string, string> }[] = [];
  const bc = tree.renderBreadcrumb(t, n.id);
  if (bc) out.push({ name: 'breadcrumb', body: bc });
  const kids = n.children ?? [];
  if (kids.length) {
    const rows = kids
      .slice()
      .sort((a, b) => cmpStr(a.importance === 'high' ? '0' : a.importance === 'low' ? '2' : '1', b.importance === 'high' ? '0' : b.importance === 'low' ? '2' : '1') || cmpStr(a.title, b.title))
      .map((c) => `| [${esc(c.title)}](${tree.relLink(n.page, c.page)}) | ${kindName[c.kind] ?? c.kind} | ${c.importance ?? ''} | ${esc(c.summary ?? '')} |`);
    out.push({ name: 'children', body: `## 子页面\n\n| 页面 | 层级 | 重要度 | 摘要 |\n|---|---|---|---|\n${rows.join('\n')}` });
  }
  const syms = coreSyms(n, g);
  if (syms.length) {
    const rows = syms.map((s) => `| \`${s.name}\` | ${s.kind} | \`${esc(s.signature)}\` | \`${s.file}:${s.start_line}-${s.end_line}\` |`);
    out.push({ name: 'symbols', body: `## 符号表\n\n| 符号 | kind | 签名 | 位置 |\n|---|---|---|---|\n${rows.join('\n')}` });
  }
  const rl = (n.routes ?? []).filter((r) => (facts.routes ?? []).some((x) => x.route_id === r));
  if (rl.length) out.push({ name: 'routes', body: `## 相关功能页\n\n${rl.map((r) => `- [${r}](${tree.relLink(n.page, featurePage(r))})`).join('\n')}` });
  if (n.kind === 'module' || n.kind === 'project') {
    // reverse build dependencies: kb-owned so they stay current when another module adds a dependency
    const users: TreeNode[] = [];
    tree.walk(t.root, (x) => void (x.deps?.includes(n.id) && users.push(x)));
    if (users.length) out.push({ name: 'dependents', body: `## 被依赖（${users.length} 个模块）\n\n${users.sort((a, b) => cmpStr(a.id, b.id)).map((d) => `- [${esc(d.title)}](${tree.relLink(n.page, d.page)})`).join('\n')}` });
  }
  for (const d of tree.nodeDiagrams(t, n.id, facts)) out.push({ name: 'diagram', body: '```mermaid\n' + d.mermaid + '\n```', attrs: { id: d.id, hash: sha12(d.mermaid) } });
  if (syms.length) {
    const lines = syms.map((s) => `\`${s.file}:${s.start_line}-${s.end_line}\``);
    out.push({ name: 'sources', body: `Sources: ${lines.join(' · ')}` });
  } else if (n.kind !== 'repo') {
    const fl = filesOf(n, g).slice(0, 12);
    if (fl.length) out.push({ name: 'sources', body: `Sources: ${fl.map((f) => '`' + f + '`').join(' · ')}${filesOf(n, g).length > 12 ? ` … +${filesOf(n, g).length - 12}` : ''}` });
  }
  return out;
}

import { createHash } from 'node:crypto';
const sha12 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 12);

function parentPageId(t: ModuleTree, n: TreeNode): string | undefined {
  const chain = tree.ancestors(t, n.id);
  return chain.length > 1 ? idFromPath(chain[chain.length - 2]!.page) : undefined;
}

/** Sets the tree frontmatter fields and (re)writes every kb block; human / LLM prose is untouched. */
export function finalizeTreePage(text: string, t: ModuleTree, n: TreeNode, g: Graph, facts: Facts, commit: string): string {
  const [pg] = parsePage(n.page, text);
  const f = pg.front;
  f.id = idFromPath(n.page);
  if (!f.title) f.title = n.title;
  if (n.kind !== 'repo' || !f.kind) f.kind = n.kind;
  f.level = n.level;
  f.tree_node = n.id;
  const parent = parentPageId(t, n);
  if (parent) f.parent = parent;
  else delete f.parent;
  f.summary = n.summary;
  if (n.platform && n.kind !== 'repo') f.platforms = [n.platform];
  if (n.importance) f.importance = n.importance;
  const syms = coreSyms(n, g);
  if (syms.length) f.sources = syms.map((s) => ({ sym: s.id, hash: s.hash }));
  if (n.children_digest) f.children_digest = n.children_digest;
  else delete f.children_digest;
  if (!f.source_commit) f.source_commit = commit;
  f.status = StatusCurrent;
  let body = pg.body;
  if (!/^# /m.test(body)) body = `# ${n.title}\n\n` + body;
  const blocks = treeBlocks(t, n, g, facts);
  for (const b of blocks) body = tree.upsertKbBlock(body, b.name, b.body, b.attrs ?? {});
  // drop kb blocks that no longer apply (e.g. a module lost its last dependent)
  const names = new Set(blocks.map((b) => b.name));
  for (const name of ['children', 'symbols', 'routes', 'dependents', 'sources']) {
    if (!names.has(name)) body = body.replace(new RegExp(`\\n*<!-- kb:${name}(?:\\s[^>]*)?-->[\\s\\S]*?<!-- /kb:${name} -->\\n?`, 'g'), '\n');
  }
  // drop kb blocks of diagrams that no longer exist
  const want = new Set(blocks.filter((b) => b.name === 'diagram').map((b) => b.attrs!.id));
  body = body.replace(/\n*<!-- kb:diagram (?:[^>]*?\s)?id=(\S+)[^>]*-->[\s\S]*?<!-- \/kb:diagram -->\n?/g, (m, id: string) => (want.has(id) ? m : '\n'));
  pg.body = body;
  pg.hasFM = true;
  return renderPage(pg);
}

/** Template prose for a tree page (deterministic); kb blocks are added by finalizeTreePage. */
export function templateTreePage(t: ModuleTree, n: TreeNode, g: Graph, facts: Facts, commit: string): string {
  let body = `# ${n.title}\n\n> 由 \`kb compound --llm template\` 根据模块树（module_tree.json）、符号图与 facts 确定性生成；使用 agent 模式可获得更完整的叙述。\n\n${n.summary ?? ''}\n`;
  if (n.kind === 'cluster' || (n.kind !== 'repo' && !n.children?.length)) {
    const syms = coreSyms(n, g);
    const consts = syms.filter((s) => s.value);
    const apis = (facts.apis ?? []).filter((a) => syms.some((s) => a.symbol === s.id || a.symbol.startsWith(s.id + '.')));
    const plats = new Set(syms.map((s) => s.platform));
    const tids = (facts.testids ?? []).filter((x) => (n.routes ?? []).includes(x.route_id) && plats.has(x.platform));
    body += '\n## 职责\n\n' + syms.slice(0, 8).map((s) => `- \`${s.id}\` — ${s.kind} \`${s.signature}\``).join('\n') + (syms.length > 8 ? `\n- … 另有 ${syms.length - 8} 个符号（见符号表）` : '') + '\n';
    if (apis.length) body += '\n## 接口\n\n' + apis.map((a) => `- ${a.method} \`${a.path}\`（${a.platform}，\`${a.symbol}\`）`).join('\n') + '\n';
    if (tids.length) body += '\n## testID\n\n' + tids.map((x) => `- \`${x.tid}\`（${x.platform}，\`${x.file}:${x.line}\`）`).join('\n') + '\n';
    if (consts.length) body += '\n## 关键常量\n\n' + consts.map((s) => `- \`${s.qual}\` = \`${s.value}\``).join('\n') + '\n';
    const rel = (n.related ?? []).map((id) => tree.findNode(t, id)).filter((x): x is TreeNode => !!x);
    if (rel.length) body += '\n## 相关簇\n\n' + rel.map((r) => `- [${r.title}](${tree.relLink(n.page, r.page)})`).join('\n') + '\n';
  } else if (n.kind !== 'repo') {
    const deps = (n.deps ?? []).map((id) => tree.findNode(t, id)).filter((x): x is TreeNode => !!x);
    if (deps.length) body += '\n## 依赖\n\n' + deps.map((d) => `- [${d.title}](${tree.relLink(n.page, d.page)})`).join('\n') + '\n';
  }
  const pg: Page = { path: n.page, hasFM: true, body, front: { id: idFromPath(n.page), title: n.title, kind: n.kind, source_commit: commit, status: StatusCurrent } };
  return finalizeTreePage(renderPage(pg), t, n, g, facts, commit);
}

/** Nodes in bottom-up order (leaves first) — parents read their children's summaries. */
export function bottomUp(t: ModuleTree): TreeNode[] {
  const out: TreeNode[] = [];
  tree.walk(t.root, (n) => out.push(n));
  return out.sort((a, b) => b.level - a.level || cmpStr(a.id, b.id));
}

/** Which tree pages need (re)writing and why. */
export function treeTasks(t: ModuleTree, g: Graph, pages: Page[]): TreeTask[] {
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const out: TreeTask[] = [];
  for (const n of bottomUp(t)) {
    if (n.page === OverviewPage) continue; // L0 = the v1 overview page (written by its own task; kb blocks added after)
    const pg = byPath.get(n.page);
    const reasons: string[] = [];
    let op: TreeTask['op'] = 'update';
    if (!pg) {
      op = 'create';
      reasons.push('page_missing');
    } else {
      if (pg.front.tree_node !== n.id) reasons.push('tree_node_changed');
      if ((pg.front.children_digest ?? '') !== (n.children_digest ?? '')) reasons.push('children_digest_changed');
      const want = coreSyms(n, g).map((s) => s.id + '@' + s.hash).join(',');
      const have = (pg.front.sources ?? []).map((a) => a.sym + '@' + a.hash).join(',');
      if (want !== have) reasons.push('members_or_anchors_changed');
    }
    if (reasons.length) out.push({ page: n.page, node: n.id, level: n.level, op, reasons });
  }
  return out;
}

/** Tree index pages (pages/<p>/index.md …) with links to child indexes, and the tree section of index.md. */
export function treeIndexFiles(t: ModuleTree): Map<string, string> {
  const out = new Map<string, string>();
  tree.walk(t.root, (n) => {
    if (!n.index || !n.children?.length || n.level === 0) return;
    let txt = tree.renderIndex(t, n.id);
    const sub = n.children.filter((c) => c.index && c.children?.length);
    if (sub.length) txt += '\nSub-indexes: ' + sub.map((c) => `[${c.title}](${tree.relLink(n.index!, c.index!)})`).join(' · ') + '\n';
    out.set(n.index, txt);
  });
  return out;
}

export function treeIndexSection(t: ModuleTree): string {
  const r = t.root;
  const st = tree.treeStats(t);
  const lines = ['', `## 模块树 tree（L0–L${Math.max(...Object.keys(st.nodesPerLevel).map((k) => Number(k.slice(1))))}，深度 ${st.depth}）`, '', `- [${r.title} 总览](${r.page}) — L0`];
  for (const c of r.children ?? []) {
    lines.push(`- [${c.title}](${c.page}) — L${c.level} ${c.kind}${c.index && c.children?.length ? ` · [索引](${c.index})` : ''}`);
  }
  return lines.join('\n') + '\n';
}

/** Is a wiki page owned by the tree (L1–L3 pages; L0 is the v1 overview)? */
export function treePagePaths(t: ModuleTree): Set<string> {
  const s = new Set<string>();
  tree.walk(t.root, (n) => s.add(n.page));
  return s;
}

/** verify: tree file consistent, every node page exists, kb blocks and digests fresh. */
export function verifyTree(wikiDir: string, g: Graph, facts: Facts, rep: Report): void {
  const p = path.join(wikiDir, TreeFile);
  if (!fs.existsSync(p)) return;
  const E = (i: Issue) => rep.errors.push(i);
  let t: ModuleTree;
  try {
    t = tree.parseTree(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    E({ code: 'E_TREE_INVALID', page: TreeFile, detail: (e as Error).message });
    rep.ok = false;
    return;
  }
  const seen = new Set<string>();
  tree.walk(t.root, (n) => {
    if (seen.has(n.page)) E({ code: 'E_TREE_INVALID', page: TreeFile, detail: `two nodes share page ${n.page}` });
    seen.add(n.page);
    for (const id of n.core ?? []) if (!getSym(g, id)) E({ code: 'E_TREE_STALE', page: TreeFile, sym: id, detail: `node ${n.id}: core symbol no longer exists (run kb compound)` });
    let text: string;
    try {
      text = fs.readFileSync(path.join(wikiDir, n.page), 'utf8');
    } catch {
      E({ code: 'E_TREE_PAGE_MISSING', page: n.page, detail: `page of tree node ${n.id} not found` });
      return;
    }
    const [pg] = parsePage(n.page, text);
    if (pg.front.tree_node !== n.id) E({ code: 'E_TREE_STALE', page: n.page, detail: `tree_node ${pg.front.tree_node ?? '(none)'} != ${n.id}` });
    if ((pg.front.children_digest ?? '') !== (n.children_digest ?? '')) E({ code: 'E_TREE_STALE', page: n.page, detail: 'children_digest differs from module_tree.json (child summaries changed)' });
    for (const b of treeBlocks(t, n, g, facts)) {
      const cur = tree.readKbBlock(text, b.name, b.attrs?.id);
      if (cur === undefined || cur.replace(/\n+$/, '') !== b.body.replace(/\n+$/, '') || (b.attrs?.hash && !tree.diagramFresh(text, b.attrs.id!, b.body.replace(/^```mermaid\n/, '').replace(/\n```$/, '')))) {
        E({ code: 'E_KB_BLOCK_STALE', page: n.page, detail: `kb:${b.name}${b.attrs?.id ? ' id=' + b.attrs.id : ''} is missing or out of date (run kb compound)` });
      }
    }
  });
  if (rep.errors.length) rep.ok = false;
}

export function treeConfigFor(cfg: Config): Partial<tree.TreeConfig> {
  return (cfg.tree ?? {}) as Partial<tree.TreeConfig>;
}

export { wikiPath };
