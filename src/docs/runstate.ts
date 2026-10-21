// .kb/run-state.json: resumable docs compound runs.
import fs from 'node:fs';
import path from 'node:path';

export type RunStatus = 'running' | 'done' | 'failed';
export type RunPhase = 'discover' | 'scan' | 'plan' | 'write' | 'verify' | 'publish';
export type AgentKind = 'project-code' | 'project-spec' | 'repo-synth';

export interface RunAgent {
  id: string;
  kind: AgentKind;
  status: 'pending' | 'running' | 'continuation' | 'done' | 'failed';
  result?: string;
  remaining_scope: string[];
  continuations?: number;
}

export interface RunState {
  version: 1;
  run_id: string;
  head: string;
  status: RunStatus;
  phase: RunPhase;
  scopes: { id: string; mode: 'full' | 'incremental'; base?: string }[];
  agents: RunAgent[];
  completed_docs: string[];
  tasks_done: string[];
}

export const RunStateFile = path.join('.kb', 'run-state.json');

export function newRunState(head: string, now: Date, scopes: RunState['scopes'] = []): RunState {
  return {
    version: 1,
    run_id: `${now.toISOString().replace(/\.\d{3}Z$/, 'Z')}-${head.slice(0, 7)}`,
    head,
    status: 'running',
    phase: 'discover',
    scopes,
    agents: [],
    completed_docs: [],
    tasks_done: [],
  };
}

/** Parses run-state JSON; returns null for missing / malformed / unknown-version content. */
export function parseRunState(text: string | null): RunState | null {
  if (!text) return null;
  let v: unknown;
  try { v = JSON.parse(text); } catch { return null; }
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<RunState>;
  if (o.version !== 1 || typeof o.run_id !== 'string' || typeof o.head !== 'string') return null;
  if (o.status !== 'running' && o.status !== 'done' && o.status !== 'failed') return null;
  return {
    version: 1,
    run_id: o.run_id,
    head: o.head,
    status: o.status,
    phase: (o.phase ?? 'discover') as RunPhase,
    scopes: Array.isArray(o.scopes) ? o.scopes : [],
    agents: Array.isArray(o.agents) ? o.agents.map((a) => ({ ...a, remaining_scope: Array.isArray(a.remaining_scope) ? a.remaining_scope : [] })) : [],
    completed_docs: Array.isArray(o.completed_docs) ? o.completed_docs : [],
    tasks_done: Array.isArray(o.tasks_done) ? o.tasks_done : [],
  };
}

export interface ResumeDecision {
  action: 'fresh' | 'resume' | 'restart';
  reason: string;
}

/** Default: resume when the same HEAD has a running/failed run; --restart discards; HEAD change → restart. */
export function decideResume(prev: RunState | null, head: string, flags: { resume?: boolean; restart?: boolean } = {}): ResumeDecision {
  if (!prev) return { action: 'fresh', reason: 'no previous run' };
  if (flags.restart) return { action: 'restart', reason: '--restart' };
  if (prev.status === 'done') return { action: 'fresh', reason: 'previous run completed' };
  if (prev.head !== head) return { action: 'restart', reason: `HEAD changed (${prev.head.slice(0, 7)} → ${head.slice(0, 7)})` };
  return { action: 'resume', reason: flags.resume ? '--resume' : `unfinished run ${prev.run_id} at phase ${prev.phase}` };
}

export function markDocCompleted(s: RunState, doc: string): RunState {
  return s.completed_docs.includes(doc) ? s : { ...s, completed_docs: [...s.completed_docs, doc] };
}

export function upsertAgent(s: RunState, a: RunAgent): RunState {
  const agents = s.agents.filter((x) => x.id !== a.id);
  agents.push(a);
  agents.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return { ...s, agents };
}

/** Agents still to dispatch on resume (not done), with their remaining scope. */
export function pendingAgents(s: RunState): RunAgent[] {
  return s.agents.filter((a) => a.status !== 'done');
}

export function finishRun(s: RunState, status: 'done' | 'failed'): RunState {
  return { ...s, status, phase: status === 'done' ? 'publish' : s.phase };
}

export function loadRunState(kbParent: string): RunState | null {
  try { return parseRunState(fs.readFileSync(path.join(kbParent, RunStateFile), 'utf8')); } catch { return null; }
}

export function saveRunState(kbParent: string, s: RunState): void {
  const p = path.join(kbParent, RunStateFile);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

export function clearRunState(kbParent: string): void {
  try { fs.rmSync(path.join(kbParent, RunStateFile)); } catch { /* absent */ }
}
