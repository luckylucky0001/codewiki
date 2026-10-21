// kb tree build|show|explain|patch — the L0–L3 module tree (module_tree.json).
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../config/config.js';
import { wikiPath } from '../config/config.js';
import * as tree from '../tree/index.js';
import type { ModuleTree, TreeNode, PatchOp } from '../tree/index.js';
import { scanRepo } from '../scan/scan.js';
import { extractFacts } from '../facts/facts.js';
import { gitHead, loadGraph } from '../engine/compound.js';
import { computeTree, loadTree, TreeFile } from '../engine/hier.js';
import { writeFileAtomic } from '../wiki/page.js';

export interface TreeCmdOut {
  json: unknown;
  text: string;
  code: number;
}

function nodeBrief(n: TreeNode) {
  return { id: n.id, level: n.level, kind: n.kind, title: n.title, page: n.page, ...(n.index ? { index: n.index } : {}), ...(n.summary ? { summary: n.summary } : {}) };
}

async function current(cfg: Config, full: boolean): Promise<{ t: ModuleTree; mode: string; warnings?: string[] }> {
  const res = await scanRepo(cfg);
  const head = gitHead(cfg.root);
  const facts = extractFacts(cfg, res);
  const prev = loadTree(wikiPath(cfg));
  const old = loadGraph(path.join(wikiPath(cfg), '.kb', 'graph.json'));
  const ct = computeTree(cfg, res.graph, old, facts, prev, full || !prev, head);
  return { t: ct.tree, mode: ct.plan.mode, warnings: ct.plan.warnings };
}

function render(t: ModuleTree): string {
  const lines: string[] = [];
  tree.walk(t.root, (n, _p, d) => lines.push(`${'  '.repeat(d)}L${n.level} ${n.kind.padEnd(8)} ${n.title}  [${n.id}] → ${n.page}${n.core?.length ? `  (${n.core.length} core)` : ''}`));
  const st = tree.treeStats(t);
  lines.push('', `depth ${st.depth}; nodes ${JSON.stringify(st.nodesPerLevel)}; clusters ${st.clusters} (p50 ${st.clusterSizes.p50}, max ${st.clusterSizes.max})`);
  return lines.join('\n') + '\n';
}

export async function treeCommand(cfg: Config, sub: string, args: string[], flags: { rebuild?: boolean; dryRun?: boolean }): Promise<TreeCmdOut> {
  const wp = wikiPath(cfg);
  switch (sub) {
    case 'build': {
      const { t, mode, warnings } = await current(cfg, !!flags.rebuild);
      const write = !flags.dryRun && fs.existsSync(wp);
      if (write) writeFileAtomic(path.join(wp, TreeFile), tree.serializeTree(t));
      const st = tree.treeStats(t);
      return {
        json: { mode, ok: true, path: write ? path.join(wp, TreeFile) : null, stats: st, warnings: warnings ?? [] },
        text: render(t) + (write ? `wrote ${path.join(wp, TreeFile)} (${mode}); run kb compound to (re)write the pages\n` : `dry-run (${mode}): nothing written${fs.existsSync(wp) ? '' : ' (no wiki dir: run kb init)'}\n`),
        code: 0,
      };
    }
    case 'show': {
      let t = loadTree(wp);
      let note = '';
      if (!t) {
        t = (await current(cfg, true)).t;
        note = '(computed; no module_tree.json in the wiki yet)\n';
      }
      return { json: t, text: note + render(t), code: 0 };
    }
    case 'explain': {
      if (!args.length) return { json: { error: 'usage: kb tree explain <symbol-id|file>', ok: false }, text: 'usage: kb tree explain <symbol-id|file>\n', code: 2 };
      const res = await scanRepo(cfg);
      const facts = extractFacts(cfg, res);
      const t = loadTree(wp) ?? (await current(cfg, true)).t;
      const projects = tree.detectProjects(tree.fsSource(cfg.root));
      const ctx = tree.prepare({ graph: res.graph, facts, projects, config: (cfg.tree ?? {}) as Partial<tree.TreeConfig> });
      const out: unknown[] = [];
      let text = '';
      let code = 0;
      for (const target0 of args) {
        let target = target0;
        const abs = path.resolve(target0);
        if (fs.existsSync(abs)) target = path.relative(cfg.root, abs).split(path.sep).join('/');
        const hit = tree.explain(t, target, ctx.cg);
        if (!hit) {
          code = 1;
          out.push({ found: false, target });
          text += `${target}: not in the tree\n`;
          continue;
        }
        const chain = tree.ancestors(t, hit.node.id).map(nodeBrief);
        out.push({ found: true, node: nodeBrief(hit.node), path: chain, target, via: hit.via });
        text += `${target}\n  ${hit.via} → ${hit.node.title} [${hit.node.id}] ${hit.node.page}\n  path: ${chain.map((c) => c.title).join(' › ')}\n`;
      }
      return { json: { ok: code === 0, results: out }, text, code };
    }
    case 'patch': {
      if (args.length !== 1) return { json: { error: 'usage: kb tree patch <ops.json>', ok: false }, text: 'usage: kb tree patch <ops.json>\n', code: 2 };
      const t = loadTree(wp);
      if (!t) return { json: { error: 'no module_tree.json (run kb compound first)', ok: false }, text: 'no module_tree.json (run kb compound first)\n', code: 2 };
      let ops: PatchOp[];
      try {
        const raw = JSON.parse(fs.readFileSync(args[0]!, 'utf8'));
        ops = Array.isArray(raw) ? raw : raw.ops;
      } catch (e) {
        return { json: { error: (e as Error).message, ok: false }, text: (e as Error).message + '\n', code: 2 };
      }
      const errs = tree.validatePatch(t, ops);
      if (errs.length) return { json: { errors: errs, ok: false }, text: errs.map((e) => `#${e.index} ${e.op} ${e.node}: ${e.error}`).join('\n') + '\n', code: 1 };
      const t2 = tree.applyPatch(t, ops);
      if (!flags.dryRun) writeFileAtomic(path.join(wp, TreeFile), tree.serializeTree(t2));
      return { json: { applied: ops.length, dry_run: !!flags.dryRun, ok: true }, text: render(t2) + `${flags.dryRun ? 'dry-run: ' : ''}applied ${ops.length} op(s); run kb compound to rewrite the pages\n`, code: 0 };
    }
  }
  return { json: { error: `unknown kb tree subcommand ${JSON.stringify(sub)} (build | show | explain | patch)`, ok: false }, text: 'usage: kb tree build|show|explain <symbol|file>|patch <ops.json>\n', code: 2 };
}
