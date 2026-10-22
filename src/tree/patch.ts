// tree-patch: the only structural edits an LLM may propose (design-v2 §3.5):
// rename (title/slug), merge (sibling clusters, result ≤ max core) and split
// (members must partition the cluster exactly). kb validates, then applies.
import type { ModuleTree, PatchError, PatchOp, TreeNode } from './types.js';
import { ancestors, findNode, updateDigests } from './tree.js';
import { clusterId, membersHash } from './cluster/cluster.js';
import { cmp } from './util.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const RESERVED = new Set(['overview', 'index']);

function parentOf(tree: ModuleTree, id: string): TreeNode | undefined {
  const a = ancestors(tree, id);
  return a.length >= 2 ? a[a.length - 2] : undefined;
}

function slugTaken(parent: TreeNode | undefined, slug: string, except: Set<string>): boolean {
  return !!parent?.children?.some((c) => !except.has(c.id) && c.slug === slug);
}

/** Validates a patch against the tree; returns [] when every op is acceptable. Ops are checked in order on a scratch copy. */
export function validatePatch(tree: ModuleTree, ops: PatchOp[], maxCore = tree.algo.max_core, minCore = tree.algo.min_core): PatchError[] {
  const errs: PatchError[] = [];
  const scratch = JSON.parse(JSON.stringify(tree)) as ModuleTree;
  ops.forEach((op, index) => {
    const e = (error: string) => errs.push({ index, op: (op as { op?: string }).op ?? '?', node: (op as { node?: string }).node ?? '', error });
    if (!op || typeof op !== 'object' || !['rename', 'merge', 'split'].includes((op as { op: string }).op)) return e('unknown op (allowed: rename, merge, split)');
    const n = findNode(scratch, op.node);
    if (!n) return e('unknown node');
    const parent = parentOf(scratch, op.node);
    if (op.op === 'rename') {
      if (op.title === undefined && op.slug === undefined) return e('rename needs title or slug');
      if (op.title !== undefined && (typeof op.title !== 'string' || !op.title.trim() || op.title.length > 120)) return e('title must be 1..120 chars');
      if (op.slug !== undefined) {
        if (n.kind !== 'cluster') return e('only cluster slugs can be renamed');
        if (!SLUG_RE.test(op.slug) || RESERVED.has(op.slug)) return e('slug must match [a-z0-9-]{1,40} and not be overview/index');
        if (slugTaken(parent, op.slug, new Set([n.id]))) return e('slug already used by a sibling');
      }
      applyOne(scratch, op);
      return;
    }
    if (n.kind !== 'cluster') return e(`${op.op} applies to clusters only`);
    if (op.op === 'merge') {
      const into = findNode(scratch, op.into);
      if (!into || into.kind !== 'cluster') return e('merge target must be a cluster');
      if (into.id === n.id) return e('cannot merge a cluster into itself');
      if (parentOf(scratch, into.id) !== parent) return e('merge target must be a sibling (same module)');
      const size = (n.core?.length ?? 0) + (into.core?.length ?? 0);
      if (size > maxCore) return e(`merged cluster would have ${size} core symbols (> ${maxCore})`);
      if (op.slug !== undefined && (!SLUG_RE.test(op.slug) || RESERVED.has(op.slug) || slugTaken(parent, op.slug, new Set([n.id, into.id])))) return e('invalid or taken slug');
      applyOne(scratch, op);
      return;
    }
    // split
    if (!Array.isArray(op.members) || op.members.length < 2) return e('split needs at least two member groups');
    const orig = new Set(n.core ?? []);
    const seen = new Set<string>();
    for (const g of op.members) {
      if (!Array.isArray(g) || !g.length) return e('empty member group');
      if (g.length < minCore) return e(`each group needs ≥ ${minCore} core symbols`);
      for (const id of g) {
        if (!orig.has(id)) return e(`member ${id} is not in the cluster`);
        if (seen.has(id)) return e(`member ${id} listed twice`);
        seen.add(id);
      }
    }
    if (seen.size !== orig.size) return e('split groups must cover every core symbol of the cluster');
    applyOne(scratch, op);
  });
  return errs;
}

function applyOne(tree: ModuleTree, op: PatchOp): void {
  const n = findNode(tree, op.node)!;
  const parent = parentOf(tree, op.node)!;
  if (op.op === 'rename') {
    if (op.title !== undefined) {
      n.title = op.title;
      n.title_source = 'llm';
    }
    if (op.slug !== undefined) {
      n.slug = op.slug;
      n.page = n.page.replace(/[^/]+\.md$/, `${op.slug}.md`);
    }
    return;
  }
  if (op.op === 'merge') {
    const into = findNode(tree, op.into)!;
    into.core = [...(into.core ?? []), ...(n.core ?? [])].sort(cmp);
    into.members_hash = membersHash(into.core);
    if (op.title) {
      into.title = op.title;
      into.title_source = 'llm';
    }
    if (op.slug) {
      into.slug = op.slug;
      into.page = into.page.replace(/[^/]+\.md$/, `${op.slug}.md`);
    }
    parent.children = parent.children!.filter((c) => c.id !== n.id);
    return;
  }
  const prefix = n.id.slice(0, n.id.length - n.id.split('/').pop()!.length);
  const kids: TreeNode[] = op.members.map((g, i) => {
    const core = g.slice().sort(cmp);
    // the largest group keeps the original id/slug/page so links stay stable
    return { ...n, core, members_hash: membersHash(core), title: op.titles?.[i] ?? n.title, title_source: op.titles?.[i] ? 'llm' : n.title_source } as TreeNode;
  });
  const keep = kids.reduce((b, k, i) => ((k.core!.length > kids[b]!.core!.length ? i : b)), 0);
  const used = new Set(parent.children!.map((c) => c.slug));
  kids.forEach((k, i) => {
    if (i === keep) return;
    k.id = prefix + clusterId(k.core!, []);
    let s = `${n.slug}-${i + 1}`;
    while (used.has(s)) s += 'x';
    used.add(s);
    k.slug = s;
    k.page = n.page.replace(/[^/]+\.md$/, `${s}.md`);
    delete k.summary;
  });
  parent.children = [...parent.children!.filter((c) => c.id !== n.id), ...kids].sort((a, b) => cmp(a.id, b.id));
}

/** Applies a validated patch (throws with the validation errors otherwise). Returns a new tree. */
export function applyPatch(tree: ModuleTree, ops: PatchOp[]): ModuleTree {
  const errs = validatePatch(tree, ops);
  if (errs.length) throw new Error('invalid tree-patch: ' + errs.map((e) => `#${e.index} ${e.op} ${e.node}: ${e.error}`).join('; '));
  const out = JSON.parse(JSON.stringify(tree)) as ModuleTree;
  for (const op of ops) applyOne(out, op);
  updateDigests(out.root);
  return out;
}
