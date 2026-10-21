// Parallel parsing with worker_threads. Small scans run in-process; larger
// ones fan out cache misses to N workers (each loads the WASM grammars once).
import fs from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { Parsers, initParsers } from '../extract/lang.js';
import { parseFile } from '../extract/extract.js';
import type { Job, JobResult, ScanCache } from './scan.js';

const MIN_PARALLEL = 150;

export async function runJobs(jobs: Job[], cache: ScanCache | undefined, want?: number): Promise<{ results: JobResult[]; workers: number }> {
  const results: JobResult[] = new Array(jobs.length);
  const misses: number[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i]!;
    let src: Buffer;
    try {
      src = fs.readFileSync(j.path);
    } catch (e) {
      results[i] = { hash: '', err: (e as Error).message };
      continue;
    }
    const hash = createHash('sha256').update(src).digest('hex');
    if (src.length > 2 << 20) {
      results[i] = { hash, err: 'file too large (>2MiB), skipped' };
      continue;
    }
    const fr = cache?.get(j.rel, hash, j.lang, j.platform);
    if (fr) {
      results[i] = { hash, fr, hit: true };
      continue;
    }
    results[i] = { hash };
    misses.push(i);
  }
  let workers = want && want > 0 ? want : Math.max(1, Math.min(os.availableParallelism(), 8));
  if (process.env.KB_WORKERS) workers = Math.max(1, parseInt(process.env.KB_WORKERS, 10) || 1);
  if (misses.length < MIN_PARALLEL) workers = 1;
  workers = Math.max(1, Math.min(workers, misses.length));
  if (misses.length === 0) return { results, workers: 1 };
  if (workers === 1) {
    await initParsers();
    const ps = new Parsers();
    for (const i of misses) {
      const j = jobs[i]!;
      const src = fs.readFileSync(j.path, 'utf8');
      results[i]!.fr = parseFile(ps, j.lang, j.platform, j.prel, j.rel, src);
    }
    ps.close();
    return { results, workers: 1 };
  }
  const url = new URL('./worker.js', import.meta.url);
  let next = 0;
  await Promise.all(
    Array.from({ length: workers }, () =>
      new Promise<void>((resolve, reject) => {
        const w = new Worker(fileURLToPath(url));
        const feed = () => {
          const batch: { i: number; job: Job }[] = [];
          while (batch.length < 16 && next < misses.length) {
            const i = misses[next++]!;
            batch.push({ i, job: jobs[i]! });
          }
          if (batch.length === 0) {
            void w.terminate();
            resolve();
            return;
          }
          w.postMessage(batch);
        };
        w.on('message', (msg: { i: number; fr: JobResult['fr'] }[] | 'ready') => {
          if (msg !== 'ready') for (const r of msg) results[r.i]!.fr = r.fr;
          feed();
        });
        w.on('error', reject);
      }),
    ),
  );
  return { results, workers };
}
