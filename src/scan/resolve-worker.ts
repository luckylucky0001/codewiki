// worker_threads entry: resolves references for one slice of the symbol table.
import v8 from 'node:v8';
import { parentPort, workerData } from 'node:worker_threads';
import { computeRefs } from './resolve.js';

const { sab, lo, hi } = workerData as { sab: SharedArrayBuffer; lo: number; hi: number };
const g = v8.deserialize(Buffer.from(sab)) as Parameters<typeof computeRefs>[0];
parentPort!.postMessage(computeRefs(g, lo, hi));
