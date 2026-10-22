// Page retirement (port of legacy-go/internal/engine/retire.go).
import fs from 'node:fs';
import path from 'node:path';
import { goJSON } from '../util/go.js';
import { loadPages, writeFileAtomic } from '../wiki/page.js';
import { ConflictsPage, OverviewPage, featurePage, finalize, type Plan } from './plan.js';
import { ParityPage } from './parity.js';
import { routeIDs } from './anchors.js';
import { loadKnowledgePlan } from './knowledge.js';
import type { TaskEnv } from './compound.js';

export const RetiredPagesFile = '.kb/retired-pages.json';

export function loadRetiredPages(dir: string): Record<string, string> {
  let b: string;
  try {
    b = fs.readFileSync(path.join(dir, RetiredPagesFile), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
  return JSON.parse(b) as Record<string, string>;
}

/**
 * Empty legacy concepts are not recreated just because their placeholder was explicitly
 * retired. New code evidence (context symbols) or an agent plan can restore them.
 */
export function suppressRetiredPlaceholders(a: { plan: Plan }, dir: string): void {
  const retired = loadRetiredPages(dir);
  if (!Object.keys(retired).length) return;
  a.plan.tasks = a.plan.tasks.filter((t) => !(t.page in retired && !fs.existsSync(path.join(dir, t.page)) && !t.knowledge && t.kind === 'concept' && t.context.length === 0));
  if (!a.plan.tasks.length) [a.plan.mode, a.plan.reason] = ['noop', 'no active page changes'];
  finalize(a.plan);
}

/**
 * --retire-pages: only changes the staging copy. Originals and the reason are archived under
 * .kb/retired/<run>/; the normal link verifier and atomic publisher remain the gate.
 */
export function retirePages(env: Pick<TaskEnv, 'o' | 'staging' | 'work'> & { a?: TaskEnv['a'] }): void {
  const o = env.o;
  if (!o.retirePages) return;
  if (!o.retireReason?.trim()) throw new Error('retire-pages requires retire-reason');
  const protectedPages = new Set([OverviewPage, ParityPage, ConflictsPage]);
  // route-backed feature pages are still required by the generated facts
  if (env.a?.facts) for (const rid of routeIDs(env.a.facts)) protectedPages.add(featurePage(rid));
  const kp = loadKnowledgePlan(env.staging);
  for (const p of kp?.pages ?? []) protectedPages.add(p.page);
  // v2: module tree pages are owned by kb (module_tree.json) and recreated on every run
  if (fs.existsSync(path.join(env.staging, 'pages'))) {
    const [pages] = loadPages(env.staging);
    for (const pg of pages) if (pg.front.tree_node) protectedPages.add(pg.path);
  }
  const retired = loadRetiredPages(env.staging);
  const originals = new Map<string, Buffer>();
  for (const value of o.retirePages.split(',')) {
    const p = value.trim();
    if (path.posix.normalize(p) !== p || !p.startsWith('pages/') || !p.endsWith('.md') || p.includes('\\') || protectedPages.has(p)) {
      throw new Error(`cannot retire unsafe, generated or planned page ${JSON.stringify(p)}`);
    }
    originals.set(p, fs.readFileSync(path.join(env.staging, p)));
  }
  for (const [p, b] of originals) {
    const archive = path.join(env.staging, '.kb', 'retired', path.basename(env.work), p);
    writeFileAtomic(archive, b);
    writeFileAtomic(archive + '.reason.txt', o.retireReason + '\n');
    fs.rmSync(path.join(env.staging, p));
    retired[p] = o.retireReason;
  }
  writeFileAtomic(path.join(env.staging, RetiredPagesFile), goJSON(retired, '  '));
}
