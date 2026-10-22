import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { changedSince, computeScopeChanges, earliestScanBase, parseNameStatus, parsePorcelain, type GitRunner } from '../../src/docs/changes.js';
import {
  clearRunState, decideResume, finishRun, loadRunState, markDocCompleted, newRunState, parseRunState, pendingAgents, saveRunState, upsertAgent,
} from '../../src/docs/runstate.js';

function fakeGit(map: Record<string, { code?: number; stdout?: string }>, calls: string[][] = []): GitRunner {
  return (args) => {
    calls.push(args);
    const k = args.join(' ');
    const hit = map[k];
    if (hit) return { code: hit.code ?? 0, stdout: hit.stdout ?? '' };
    return { code: 0, stdout: '' };
  };
}

const BASE_GIT = {
  'rev-parse --is-inside-work-tree': { stdout: 'true\n' },
  'rev-parse --is-shallow-repository': { stdout: 'false\n' },
};

describe('earliestScanBase', () => {
  it('picks the earliest date and its commit; null when nothing is managed', () => {
    expect(earliestScanBase([{ path: 'a', frontmatter: null }, { path: 'b', frontmatter: { last_compound_scan: 'bad' } }])).toBeNull();
    expect(earliestScanBase([
      { path: 'a', frontmatter: { last_compound_scan: '2026-10-05', compound_source_commit: 'aaa' } },
      { path: 'b', frontmatter: { last_compound_scan: '2026-10-01', compound_source_commit: 'bbb' } },
    ])).toEqual({ date: '2026-10-01', commit: 'bbb' });
    expect(earliestScanBase([
      { path: 'a', frontmatter: { last_compound_scan: '2026-10-01', compound_source_commit: 'aaa' } },
      { path: 'b', frontmatter: { last_compound_scan: '2026-10-01' } },
    ])).toEqual({ date: '2026-10-01' });
  });
});

describe('git output parsing', () => {
  it('name-status with renames and quoted paths', () => {
    expect(parseNameStatus('M\ta.ts\nR087\told/x.ts\tnew/x.ts\nD\t"sp ace/\\u00e9.ts"\nC100\ta\tb\n\n')).toEqual({
      files: ['a.ts', 'old/x.ts', 'new/x.ts', 'sp ace/é.ts', 'a', 'b'],
      renamed: [['old/x.ts', 'new/x.ts']],
    });
  });
  it('porcelain incl. renames and untracked', () => {
    expect(parsePorcelain(' M a.ts\nR  old.ts -> new.ts\n?? apps/x/new.kt\nA  b.ts\n')).toEqual({
      files: ['a.ts', 'old.ts', 'new.ts', 'apps/x/new.kt', 'b.ts'],
      renamed: [['old.ts', 'new.ts']],
    });
  });
});

describe('changedSince / computeScopeChanges', () => {
  it('commit base: diff base..HEAD + worktree + index + status', () => {
    const calls: string[][] = [];
    const git = fakeGit({
      ...BASE_GIT,
      'diff --name-status -M abc HEAD': { stdout: 'M\tapps/a/src/A.kt\nR100\tapps/a/old.kt\tapps/b/new.kt\n' },
      'diff --name-status -M': { stdout: 'M\tdocs/x.md\n' },
      'diff --cached --name-status -M': { stdout: 'A\tspecs/001-login/spec.md\n' },
      'status --porcelain --untracked-files=all': { stdout: '?? apps/b/src/N.kt\n' },
    }, calls);
    const r = computeScopeChanges(git, [
      { id: 'repo', root: '.', base: { commit: 'abc', date: '2026-10-01' } },
      { id: 'a', root: 'apps/a', base: { commit: 'abc', date: '2026-10-01' } },
      { id: 'b', root: 'apps/b', base: { commit: 'abc', date: '2026-10-01' } },
    ]);
    expect(r.map((s) => [s.scopeId, s.mode, s.files])).toEqual([
      ['repo', 'incremental', ['docs/x.md', 'specs/001-login/spec.md']],
      ['a', 'incremental', ['apps/a/old.kt', 'apps/a/src/A.kt']],
      ['b', 'incremental', ['apps/b/new.kt', 'apps/b/src/N.kt']],
    ]);
    expect(r[1]!.renamed).toEqual([['apps/a/old.kt', 'apps/b/new.kt']]);
    expect(r[2]!.renamed).toEqual([['apps/a/old.kt', 'apps/b/new.kt']]);
    // root specs concern every scope
    expect(r[1]!.specDirs).toEqual(['specs/001-login']);
    // git queried once per distinct base
    expect(calls.filter((c) => c[0] === 'diff' && c.includes('HEAD'))).toHaveLength(1);
  });
  it('date base uses git log --since', () => {
    const git = fakeGit({ ...BASE_GIT, 'log --since=2026-10-01 --name-status -M --format=': { stdout: '\nM\tapps/a/x.kt\n\nA\tapps/a/y.kt\n' } });
    expect(changedSince(git, { date: '2026-10-01' })!.files).toEqual(['apps/a/x.kt', 'apps/a/y.kt']);
  });
  it('unknown commit falls back to date when not shallow', () => {
    const git = fakeGit({ ...BASE_GIT, 'cat-file -e zzz^{commit}': { code: 1 }, 'log --since=2026-10-01 --name-status -M --format=': { stdout: 'M\ta\n' } });
    expect(changedSince(git, { commit: 'zzz', date: '2026-10-01' })!.files).toEqual(['a']);
  });
  it('shallow clone without the base → full', () => {
    const git = fakeGit({ ...BASE_GIT, 'rev-parse --is-shallow-repository': { stdout: 'true\n' }, 'cat-file -e zzz^{commit}': { code: 1 } });
    expect(changedSince(git, { commit: 'zzz', date: '2026-10-01' })).toBeNull();
    expect(changedSince(git, { date: '2026-10-01' })).toBeNull();
    const r = computeScopeChanges(git, [{ id: 'repo', root: '.', base: { date: '2026-10-01' } }]);
    expect(r[0]).toMatchObject({ mode: 'full' });
  });
  it('shallow clone that still has the base commit → incremental', () => {
    const git = fakeGit({ ...BASE_GIT, 'rev-parse --is-shallow-repository': { stdout: 'true\n' }, 'diff --name-status -M abc HEAD': { stdout: 'M\tx\n' } });
    expect(changedSince(git, { commit: 'abc' })!.files).toEqual(['x']);
  });
  it('non-git → full; no managed file → full', () => {
    const git = fakeGit({ 'rev-parse --is-inside-work-tree': { code: 128, stdout: '' } });
    const r = computeScopeChanges(git, [{ id: 'repo', root: '.', base: { date: '2026-10-01' } }, { id: 'a', root: 'apps/a', base: null }]);
    expect(r.map((s) => [s.mode, s.reason])).toEqual([
      ['full', 'not a git work tree, shallow clone or unknown base'],
      ['full', 'no managed docs file'],
    ]);
  });
});

describe('run-state', () => {
  const now = new Date('2026-10-21T17:20:00.123Z');
  it('new / parse round-trip', () => {
    const s = newRunState('8c1d2e4abcdef', now, [{ id: 'repo', mode: 'incremental', base: '1a2b3c4' }]);
    expect(s.run_id).toBe('2026-10-21T17:20:00Z-8c1d2e4');
    expect(parseRunState(JSON.stringify(s))).toEqual(s);
  });
  it('rejects malformed state', () => {
    expect(parseRunState(null)).toBeNull();
    expect(parseRunState('{')).toBeNull();
    expect(parseRunState('{"version":2,"run_id":"x","head":"y","status":"running"}')).toBeNull();
    expect(parseRunState('{"version":1,"run_id":"x","head":"y","status":"weird"}')).toBeNull();
  });
  it('resume decisions', () => {
    const s = newRunState('h1', now);
    expect(decideResume(null, 'h1').action).toBe('fresh');
    expect(decideResume(s, 'h1').action).toBe('resume');
    expect(decideResume(s, 'h1', { restart: true }).action).toBe('restart');
    expect(decideResume(s, 'h2')).toMatchObject({ action: 'restart', reason: expect.stringMatching(/HEAD changed/) });
    expect(decideResume(finishRun(s, 'done'), 'h1').action).toBe('fresh');
    expect(decideResume(finishRun(s, 'failed'), 'h1').action).toBe('resume');
  });
  it('agents and completed docs', () => {
    let s = newRunState('h', now);
    s = upsertAgent(s, { id: 'B:x', kind: 'project-spec', status: 'done', remaining_scope: [] });
    s = upsertAgent(s, { id: 'A:x', kind: 'project-code', status: 'continuation', remaining_scope: ['apps/x/feature'] });
    s = upsertAgent(s, { id: 'A:x', kind: 'project-code', status: 'continuation', remaining_scope: ['apps/x/feature2'], continuations: 1 });
    expect(s.agents.map((a) => a.id)).toEqual(['A:x', 'B:x']);
    expect(pendingAgents(s).map((a) => a.remaining_scope)).toEqual([['apps/x/feature2']]);
    s = markDocCompleted(markDocCompleted(s, 'docs/a.md'), 'docs/a.md');
    expect(s.completed_docs).toEqual(['docs/a.md']);
  });
  it('save / load / clear on disk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-runstate-'));
    try {
      const s = newRunState('h', now);
      saveRunState(dir, s);
      expect(loadRunState(dir)).toEqual(s);
      clearRunState(dir);
      expect(loadRunState(dir)).toBeNull();
      clearRunState(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
