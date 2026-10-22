// worker_threads entry: parses batches of files and posts FileResults back.
import fs from 'node:fs';
import { parentPort } from 'node:worker_threads';
import { Parsers, initParsers } from '../extract/lang.js';
import { parseFile } from '../extract/extract.js';
import type { Job } from './scan.js';

await initParsers();
const ps = new Parsers();
parentPort!.on('message', (batch: { i: number; job: Job }[]) => {
  const out = batch.map(({ i, job }) => {
    let src = '';
    try {
      src = fs.readFileSync(job.path, 'utf8');
    } catch (e) {
      return { i, fr: { symbols: [], calls: [], package: '', imports: [], failure: { file: job.rel, error: (e as Error).message } } };
    }
    return { i, fr: parseFile(ps, job.lang, job.platform, job.prel, job.rel, src) };
  });
  parentPort!.postMessage(out);
});
parentPort!.postMessage('ready');
