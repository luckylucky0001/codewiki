// kb eval: replay a labelled golden project (claims + plan impact) in a temp git repo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { defaultConfig, detect, wikiPath } from '../config/config.js';
import type { Requirement } from '../model.js';
import { initWiki } from '../wiki/layout.js';
import { ClaimConflict, ClaimUnverifiable, ClaimVerified } from './claims.js';
import { type DocEntry, discoverDocs } from './docs.js';
import { analyze, compound, type Result } from './compound.js';
import { round2, sortedKeys } from './graphutil.js';

interface Golden {
  version?: number;
  project: string;
  changes?: string;
  docs?: { from: string; to?: string }[];
  claims?: { id: string; expected: string; note?: string }[];
  impact?: { change: string; pages: string[] }[];
}

export interface PR {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}
const pr = (): PR => ({ tp: 0, fp: 0, fn: 0, precision: 0, recall: 0, f1: 0 });
function finish(p: PR): void {
  if (p.tp + p.fp > 0) p.precision = round2(p.tp / (p.tp + p.fp));
  if (p.tp + p.fn > 0) p.recall = round2(p.tp / (p.tp + p.fn));
  if (p.precision + p.recall > 0) p.f1 = round2((2 * p.precision * p.recall) / (p.precision + p.recall));
}

export interface EvalReport {
  llm: string;
  claims: { id: string; expected: string; predicted: string; ok: boolean; note?: string }[] | null;
  claim_accuracy: number;
  claim_per_class: Record<string, PR>;
  claim_confusion: Record<string, Record<string, number>>;
  missing_claims: string[];
  impact: { change: string; expected: string[]; predicted: string[] | null; missed: string[]; extra: string[]; pr: PR }[] | null;
  impact_micro: PR;
  labelled_claims: number;
}

export interface EvalOptions {
  goldenPath: string;
  llm: string;
  llmCmd?: string;
  agent?: string;
  kbPath?: string;
  log?: (s: string) => void;
  extraDocs?: string[];
}

function git(dir: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=kb-eval', '-c', 'user.email=eval@codewiki.local', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
}

export async function runEval(o: EvalOptions): Promise<EvalReport> {
  const gs = YAML.parse(fs.readFileSync(o.goldenPath, 'utf8')) as Golden;
  const base = path.dirname(o.goldenPath);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-eval-'));
  try {
    fs.cpSync(path.join(base, gs.project), tmp, { recursive: true });
    const only = new Set<string>();
    const place = (from: string, to: string) => {
      to = path.posix.normalize(to.split(path.sep).join('/'));
      if (to.startsWith('../') || path.isAbsolute(to)) throw new Error(`eval doc target ${JSON.stringify(to)} must stay inside the project`);
      const dst = path.join(tmp, to);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      only.add(to);
      fs.copyFileSync(from, dst);
    };
    for (const d of gs.docs ?? []) place(path.join(base, d.from), d.to || 'docs/eval/' + path.basename(d.from));
    for (const d of o.extraDocs ?? []) place(d, 'docs/eval/' + path.basename(d));
    git(tmp, 'init', '-q', '-b', 'master');
    git(tmp, 'add', '-A');
    git(tmp, 'commit', '-qm', 'base');
    const cfg = defaultConfig();
    cfg.root = fs.realpathSync(tmp);
    cfg.platforms = detect(cfg.root);
    initWiki(wikiPath(cfg), false);
    const man = discoverDocs(cfg.root, [cfg.wiki_dir]);
    const docs: DocEntry[] = man.docs.filter((d) => (only.size ? only.has(d.path) : d.kind !== 'readme'));
    if (only.size && docs.length !== only.size) throw new Error(`eval docs not discovered: want ${JSON.stringify([...only].sort())}, discovered ${docs.length}`);
    const run = async (kind: string, ingest?: DocEntry[]): Promise<Result> => {
      const r = await compound({ cfg, llm: kind === 'ingest' ? o.llm : 'template', llmCmd: o.llmCmd, agent: o.agent, kind, ingestDocs: ingest, log: o.log, kbPath: o.kbPath, fallback: true });
      if (!r.published) throw new Error(`${kind} not published: ${r.message}`);
      return r;
    };
    await run('ingest', docs);
    const rep: EvalReport = { llm: o.llm, claims: null, claim_accuracy: 0, claim_per_class: {}, claim_confusion: {}, missing_claims: [], impact: null, impact_micro: pr(), labelled_claims: 0 };
    let reqs: Requirement[] = [];
    try {
      reqs = JSON.parse(fs.readFileSync(path.join(wikiPath(cfg), 'facts', 'requirements.json'), 'utf8')).requirements ?? [];
    } catch {
      reqs = [];
    }
    const pred = new Map(reqs.map((r) => [r.id, r.status]));
    const classes = [ClaimVerified, ClaimConflict, ClaimUnverifiable];
    const per: Record<string, PR> = Object.fromEntries(classes.map((c) => [c, pr()]));
    let correct = 0;
    for (const c of gs.claims ?? []) {
      let p = pred.get(c.id);
      if (p === undefined) {
        rep.missing_claims.push(c.id);
        p = 'missing';
      }
      const ce: EvalReport['claims'] extends (infer T)[] | null ? T : never = { id: c.id, expected: c.expected, predicted: p, ok: p === c.expected };
      if (c.note) ce.note = c.note;
      (rep.claims ??= []).push(ce);
      const row = (rep.claim_confusion[c.expected] ??= {});
      row[p] = (row[p] ?? 0) + 1;
      if (ce.ok) correct++;
      for (const cl of classes) {
        if (p === cl && c.expected === cl) per[cl]!.tp++;
        else if (p === cl) per[cl]!.fp++;
        else if (c.expected === cl) per[cl]!.fn++;
      }
    }
    rep.labelled_claims = gs.claims?.length ?? 0;
    if (rep.labelled_claims) rep.claim_accuracy = round2(correct / rep.labelled_claims);
    for (const cl of classes) finish(per[cl]!);
    rep.claim_per_class = Object.fromEntries(sortedKeys(new Set(classes)).map((c) => [c, per[c]!]));
    rep.claim_confusion = Object.fromEntries(Object.keys(rep.claim_confusion).sort().map((k) => [k, Object.fromEntries(Object.entries(rep.claim_confusion[k]!).sort((a, b) => (a[0] < b[0] ? -1 : 1)))]));
    await run('compound');
    git(tmp, 'add', '-A');
    git(tmp, 'commit', '-qm', 'wiki');
    const changes = path.join(base, gs.changes ?? '');
    for (const im of gs.impact ?? []) {
      fs.cpSync(path.join(changes, im.change, 'files'), tmp, { recursive: true });
      git(tmp, 'add', '-A');
      git(tmp, 'commit', '-qm', im.change);
      const a = await analyze({ cfg, llm: 'template' });
      const got = a.plan.tasks.map((t) => t.page);
      const exp = new Set(im.pages);
      const ie = { change: im.change, expected: im.pages, predicted: got.length ? got : null, missed: [] as string[], extra: [] as string[], pr: pr() };
      const gotSet = new Set(got);
      for (const p of got) {
        if (exp.has(p)) ie.pr.tp++;
        else {
          ie.pr.fp++;
          ie.extra.push(p);
        }
      }
      for (const p of im.pages) if (!gotSet.has(p)) {
        ie.pr.fn++;
        ie.missed.push(p);
      }
      finish(ie.pr);
      rep.impact_micro.tp += ie.pr.tp;
      rep.impact_micro.fp += ie.pr.fp;
      rep.impact_micro.fn += ie.pr.fn;
      (rep.impact ??= []).push(ie);
      await run('compound');
      git(tmp, 'add', '-A');
      git(tmp, 'commit', '-qm', 'wiki ' + im.change);
    }
    finish(rep.impact_micro);
    rep.claims?.sort((x, y) => (!x.ok && y.ok ? -1 : x.ok && !y.ok ? 1 : 0));
    return rep;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function formatEval(r: EvalReport): string {
  const f = (x: number) => x.toFixed(2);
  let b = `claim verification (${r.llm}, ${r.labelled_claims} labelled): accuracy ${f(r.claim_accuracy)}\n`;
  for (const cl of [ClaimVerified, ClaimConflict, ClaimUnverifiable]) {
    const p = r.claim_per_class[cl]!;
    b += `  ${cl.padEnd(13)} precision ${f(p.precision)} recall ${f(p.recall)} f1 ${f(p.f1)} (tp ${p.tp} fp ${p.fp} fn ${p.fn})\n`;
  }
  for (const c of r.claims ?? []) if (!c.ok) b += `  ✗ ${c.id.padEnd(22)} expected ${c.expected.padEnd(12)} got ${c.predicted.padEnd(12)} ${c.note ?? ''}\n`;
  b += `plan impact: micro precision ${f(r.impact_micro.precision)} recall ${f(r.impact_micro.recall)} f1 ${f(r.impact_micro.f1)}\n`;
  for (const i of r.impact ?? []) b += `  ${i.change.padEnd(22)} precision ${f(i.pr.precision)} recall ${f(i.pr.recall)} missed [${i.missed.join(' ')}] extra [${i.extra.join(' ')}]\n`;
  return b;
}
