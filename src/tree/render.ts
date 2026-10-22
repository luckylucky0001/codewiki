// Deterministic renderers over module_tree.json (design-v2 §3.4): per-level
// index tables, breadcrumbs, llms.txt hierarchy and mermaid diagrams, all wrapped
// in <!-- kb:name --> … <!-- /kb:name --> generated blocks that only kb rewrites.
import type { Facts, ModuleTree, TreeNode } from './types.js';
import { ancestors, findNode, walk } from './tree.js';
import { cmp, sha1, sha256 } from './util.js';

export const GeneratedHeader = '<!-- maintained by kb; do not edit by hand -->';

// ---------- kb blocks ----------

export function kbBlock(name: string, body: string, attrs: Record<string, string> = {}): string {
  const a = Object.keys(attrs)
    .sort(cmp)
    .map((k) => ` ${k}=${attrs[k]}`)
    .join('');
  return `<!-- kb:${name}${a} -->\n${body.replace(/\n+$/, '')}\n<!-- /kb:${name} -->`;
}

function blockRe(name: string, id?: string): RegExp {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const idPart = id ? `(?=[^>]*\\bid=${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|-->))` : '';
  return new RegExp(`<!-- kb:${n}${idPart}(?:\\s[^>]*)?-->[\\s\\S]*?<!-- /kb:${n} -->`);
}

/** Replaces the kb block `name` (matching attrs.id when given) or inserts it: breadcrumb after the first H1, others at the end. */
export function upsertKbBlock(text: string, name: string, body: string, attrs: Record<string, string> = {}): string {
  const block = kbBlock(name, body, attrs);
  const re = blockRe(name, attrs.id);
  if (re.test(text)) return text.replace(re, () => block);
  if (name === 'breadcrumb') {
    const m = /^(---\n[\s\S]*?\n---\n)?([\s\S]*?^# .*\n)/m.exec(text);
    if (m) {
      const at = m.index + m[0].length;
      return text.slice(0, at) + '\n' + block + '\n' + text.slice(at);
    }
  }
  return text.replace(/\n*$/, '\n\n') + block + '\n';
}

/** Body of a kb block, or undefined. */
export function readKbBlock(text: string, name: string, id?: string): string | undefined {
  const m = blockRe(name, id).exec(text);
  if (!m) return undefined;
  return m[0].replace(/^<!--[^>]*-->\n?/, '').replace(/\n?<!-- \/kb:[^>]*-->$/, '');
}

// ---------- links ----------

/** Relative link from one wiki-relative file to another. */
export function relLink(fromFile: string, toFile: string): string {
  const a = fromFile.split('/').slice(0, -1);
  const b = toFile.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/') || '.';
}

function firstSentence(s: string | undefined): string {
  if (!s) return '';
  const m = /^(.+?[.!?。！？])(\s|$)/.exec(s.trim());
  return (m ? m[1]! : s.trim()).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

const IMP_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function sortForIndex(xs: TreeNode[]): TreeNode[] {
  return xs.slice().sort((a, b) => (IMP_ORDER[a.importance ?? 'medium']! - IMP_ORDER[b.importance ?? 'medium']!) || cmp(a.title, b.title) || cmp(a.id, b.id));
}

// ---------- breadcrumb / index ----------

/** `> [Repo](../../overview.md) › [proj](../overview.md) › [mod](overview.md) › Title` for the node's page. */
export function renderBreadcrumb(tree: ModuleTree, id: string): string {
  const chain = ancestors(tree, id);
  if (!chain.length) return '';
  const self = chain[chain.length - 1]!;
  const parts = chain.slice(0, -1).map((n) => `[${n.title}](${relLink(self.page, n.page)})`);
  parts.push(self.title);
  return '> ' + parts.join(' › ');
}

/** Index page of a node with children (L0 → index.md, L1/L2 → pages/<id>/index.md): one table of children. */
export function renderIndex(tree: ModuleTree, id: string): string {
  const n = findNode(tree, id);
  if (!n) throw new Error(`unknown node ${id}`);
  const at = n.index ?? n.page;
  const rows = sortForIndex(n.children ?? []).map((c) => {
    const extra = c.kind === 'cluster' ? `${c.core?.length ?? 0} symbols` : c.module_type ?? c.build ?? '';
    return `| [${c.title.replace(/\|/g, '\\|')}](${relLink(at, c.page)}) | ${c.kind} | ${extra} | ${c.importance ?? ''} | ${firstSentence(c.summary)} |`;
  });
  const lines = [
    GeneratedHeader,
    `# ${n.title}`,
    '',
    renderBreadcrumb(tree, id).replace(/› ([^›]+)$/, `› [${n.title}](${relLink(at, n.page)})`),
    '',
    `Overview: [${n.title}](${relLink(at, n.page)})`,
    '',
    '| Page | Kind | Detail | Importance | Summary |',
    '|---|---|---|---|---|',
    ...rows,
  ];
  if (n.level === 0 && !n.children?.length) lines.push('', '_(no sub-pages)_');
  return lines.join('\n') + '\n';
}

/** All index pages of the tree: wiki-relative path → content. */
export function renderIndexes(tree: ModuleTree): Map<string, string> {
  const out = new Map<string, string>();
  walk(tree.root, (n) => {
    if (n.index && n.children?.length) out.set(n.index, renderIndex(tree, n.id));
  });
  return out;
}

// ---------- llms.txt ----------

/** llms.txt (AnswerDotAI format): H1 title, > summary, one H2 per L1 node with nested page links. */
export function renderLlmsTxt(tree: ModuleTree, opts: { summary?: string } = {}): string {
  const r = tree.root;
  const out = [`# ${r.title}`, ''];
  const sum = opts.summary ?? r.summary;
  if (sum) out.push(`> ${sum.replace(/\n/g, ' ')}`, '');
  out.push(`- [${r.title} overview](${r.page})${r.summary ? ': ' + firstSentence(r.summary) : ''}`, '');
  const item = (n: TreeNode, depth: number) => {
    out.push(`${'  '.repeat(depth)}- [${n.title}](${n.page})${n.summary ? ': ' + firstSentence(n.summary) : ''}`);
    for (const c of sortForIndex(n.children ?? [])) item(c, depth + 1);
  };
  const sections = r.children?.length && r.children.every((c) => c.kind === 'project') ? r.children : [r];
  for (const s of sections) {
    out.push(`## ${s.title}`, '');
    if (s !== r) out.push(`- [${s.title} overview](${s.page})${s.summary ? ': ' + firstSentence(s.summary) : ''}`);
    for (const c of sortForIndex(s.children ?? [])) item(c, s === r ? 0 : 1);
    out.push('');
  }
  return out.join('\n').replace(/\n+$/, '\n');
}

// ---------- mermaid ----------

export function mermaidId(key: string): string {
  return 'n' + sha1(key).slice(0, 6);
}

export function mermaidLabel(s: string): string {
  return '"' + s.replace(/"/g, '#quot;').replace(/[<>]/g, (c) => (c === '<' ? '#lt;' : '#gt;')).replace(/\n/g, ' ') + '"';
}

function capNodes(nodes: TreeNode[], max: number): { keep: TreeNode[]; dropped: number } {
  if (nodes.length <= max) return { keep: nodes, dropped: 0 };
  const keep = sortForIndex(nodes).slice(0, max);
  return { keep: keep.sort((a, b) => cmp(a.id, b.id)), dropped: nodes.length - max };
}

/** Module holders (nodes carrying a build-module key) under a node, including the node itself. */
export function moduleNodes(n: TreeNode): TreeNode[] {
  const out: TreeNode[] = [];
  walk(n, (x) => {
    if (x.key) out.push(x);
  });
  return out.sort((a, b) => cmp(a.id, b.id));
}

/**
 * Module dependency graph under `scopeId` (default: whole tree): build deps as solid
 * arrows, cross-module reference links (not already a build dep) as dotted lines.
 */
export function moduleDependencyDiagram(tree: ModuleTree, scopeId = tree.root.id, maxNodes = 30): string {
  const scope = findNode(tree, scopeId);
  if (!scope) throw new Error(`unknown node ${scopeId}`);
  const all = moduleNodes(scope);
  const { keep, dropped } = capNodes(all, maxNodes);
  const ids = new Set(keep.map((n) => n.id));
  const lines = ['flowchart LR'];
  for (const n of keep) lines.push(`  ${mermaidId(n.id)}[${mermaidLabel(n.title)}]`);
  const seen = new Set<string>();
  for (const n of keep) {
    for (const d of n.deps ?? []) {
      if (!ids.has(d)) continue;
      lines.push(`  ${mermaidId(n.id)} --> ${mermaidId(d)}`);
      seen.add(n.id < d ? n.id + '|' + d : d + '|' + n.id);
    }
  }
  for (const n of keep) {
    for (const d of n.ref_deps ?? []) {
      const k = n.id < d ? n.id + '|' + d : d + '|' + n.id;
      if (!ids.has(d) || seen.has(k) || n.id > d) continue;
      seen.add(k);
      lines.push(`  ${mermaidId(n.id)} -.- ${mermaidId(d)}`);
    }
  }
  if (dropped) lines.push(`  more[${mermaidLabel(`… +${dropped}`)}]`);
  return lines.join('\n');
}

/** Project-level graph for L0: an edge p→q when any module of p depends on (or references) a module of q. */
export function projectDiagram(tree: ModuleTree): string {
  const projects = (tree.root.children ?? []).filter((c) => c.kind === 'project');
  const owner = new Map<string, string>();
  for (const p of projects) for (const m of moduleNodes(p)) owner.set(m.id, p.id);
  const lines = ['flowchart LR'];
  for (const p of projects) lines.push(`  ${mermaidId(p.id)}[${mermaidLabel(p.title)}]`);
  const edges = new Set<string>();
  for (const p of projects)
    for (const m of moduleNodes(p))
      for (const d of [...(m.deps ?? []), ...(m.ref_deps ?? [])]) {
        const q = owner.get(d);
        if (q && q !== p.id) edges.add(`  ${mermaidId(p.id)} --> ${mermaidId(q)}`);
      }
  lines.push(...[...edges].sort(cmp));
  return lines.join('\n');
}

/** Cluster relation graph inside a module (edges from `related`), ≤ maxNodes clusters. */
export function clusterDiagram(tree: ModuleTree, moduleId: string, maxNodes = 15): string {
  const m = findNode(tree, moduleId);
  if (!m) throw new Error(`unknown node ${moduleId}`);
  const cs = (m.children ?? []).filter((c) => c.kind === 'cluster');
  const { keep, dropped } = capNodes(cs, maxNodes);
  const ids = new Set(keep.map((c) => c.id));
  const lines = ['flowchart LR'];
  for (const c of keep) lines.push(`  ${mermaidId(c.id)}[${mermaidLabel(c.title)}]`);
  const seen = new Set<string>();
  for (const c of keep)
    for (const r of c.related ?? []) {
      if (!ids.has(r)) continue;
      const k = c.id < r ? c.id + '|' + r : r + '|' + c.id;
      if (seen.has(k)) continue;
      seen.add(k);
      lines.push(`  ${mermaidId(c.id)} --- ${mermaidId(r)}`);
    }
  if (dropped) lines.push(`  more[${mermaidLabel(`… +${dropped}`)}]`);
  return lines.join('\n');
}

/** Navigation graph from facts.navigation (route → route, labelled by kind), optionally one platform. */
export function navigationDiagram(facts: Facts, platform?: string, maxNodes = 40): string {
  const edges = (facts.navigation ?? []).filter((e) => !platform || e.platform === platform);
  const routes = new Set<string>();
  for (const r of facts.routes ?? []) if (!platform || r.platform === platform) routes.add(r.route_id);
  for (const e of edges) {
    routes.add(e.from);
    routes.add(e.to);
  }
  const all = [...routes].sort(cmp);
  const deg = new Map<string, number>();
  for (const e of edges) {
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
  }
  const keep = all.length > maxNodes ? all.slice().sort((a, b) => (deg.get(b) ?? 0) - (deg.get(a) ?? 0) || cmp(a, b)).slice(0, maxNodes).sort(cmp) : all;
  const ks = new Set(keep);
  const lines = ['flowchart LR'];
  for (const r of keep) lines.push(`  ${mermaidId('route:' + r)}[${mermaidLabel(r)}]`);
  const seen = new Set<string>();
  for (const e of edges.slice().sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.kind, b.kind))) {
    if (!ks.has(e.from) || !ks.has(e.to)) continue;
    const l = `  ${mermaidId('route:' + e.from)} -->|${e.kind || 'nav'}| ${mermaidId('route:' + e.to)}`;
    if (!seen.has(l)) {
      seen.add(l);
      lines.push(l);
    }
  }
  if (all.length > keep.length) lines.push(`  more[${mermaidLabel(`… +${all.length - keep.length}`)}]`);
  return lines.join('\n');
}

/** Wraps a mermaid source in a kb:diagram block whose hash lets verify detect staleness. */
export function diagramBlock(id: string, mermaid: string): string {
  return kbBlock('diagram', '```mermaid\n' + mermaid + '\n```', { id, hash: sha256(mermaid).slice(0, 12) });
}

/** True when the page's diagram block `id` matches a freshly rendered mermaid source. */
export function diagramFresh(text: string, id: string, mermaid: string): boolean {
  const m = new RegExp(`<!-- kb:diagram (?=[^>]*\\bid=${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|-->))[^>]*\\bhash=([0-9a-f]+)`).exec(text);
  return !!m && m[1] === sha256(mermaid).slice(0, 12);
}

/** The default diagrams of a node, by level (L0 projects, L1 modules (+nav), L2 clusters). */
export function nodeDiagrams(tree: ModuleTree, id: string, facts?: Facts | null): { id: string; kind: string; mermaid: string }[] {
  const n = findNode(tree, id);
  if (!n) return [];
  const out: { id: string; kind: string; mermaid: string }[] = [];
  const holders = moduleNodes(n);
  if (n.level === 0 && n.children?.some((c) => c.kind === 'project')) out.push({ id: `${n.id}.projects`, kind: 'deps', mermaid: projectDiagram(tree) });
  if (holders.length > 1) out.push({ id: `${n.id}.deps`, kind: 'deps', mermaid: moduleDependencyDiagram(tree, n.id) });
  if (facts?.navigation?.length && n.level <= 1) {
    const mer = navigationDiagram(facts, n.platform);
    if (mer.split('\n').length > 1) out.push({ id: `${n.id}.nav`, kind: 'nav', mermaid: mer });
  }
  if (n.children?.some((c) => c.kind === 'cluster')) out.push({ id: `${n.id}.clusters`, kind: 'clusters', mermaid: clusterDiagram(tree, n.id) });
  return out;
}
