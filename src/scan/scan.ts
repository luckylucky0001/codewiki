// Walk the configured platform roots, parse every supported source file and
// build the symbol graph with resolved reference edges.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import v8 from 'node:v8';
import { createHash } from 'node:crypto';
import type { Config, Platform } from '../config/config.js';
import { absRoot, shadowed, wikiPath } from '../config/config.js';
import { GraphVersion, reindexGraph, type Graph, type Symbol, type ParseFailure } from '../model.js';
import { langForPath, Parsers, initParsers } from '../extract/lang.js';
import { parseFile, type Call, type FileResult } from '../extract/extract.js';
import { fingerprint } from '../extract/fingerprint.js';
import { compileGlobs, matchAny } from './glob.js';
import { resolveRefsParallel } from './resolve.js';
import { cmpStr } from '../util/go.js';

export interface Stats {
  files: number;
  parsed: number;
  cache_hits: number;
  workers: number;
  duration_ms: number;
  /** references reused from the scan cache (no file changed since they were resolved) */
  refs_cached?: boolean;
}

export interface ScanResult {
  graph: Graph;
  calls: Record<string, Call[]>;
  dir: string;
  stats: Stats;
}

export interface Job {
  platform: string;
  lang: string;
  rel: string;
  prel: string;
  path: string;
}

/** Walks the tree in lexical order (like filepath.WalkDir); visit returns false to skip a dir. */
export function walkDir(root: string, visit: (p: string, name: string, isDir: boolean) => boolean | void): void {
  const rec = (dir: string) => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    ents.sort((a, b) => cmpStr(a.name, b.name));
    for (const e of ents) {
      const p = path.join(dir, e.name);
      let isDir = e.isDirectory();
      if (e.isSymbolicLink()) isDir = false;
      if (isDir) {
        if (visit(p, e.name, true) === false) continue;
        rec(p);
      } else visit(p, e.name, false);
    }
  };
  let st: fs.Stats;
  try {
    st = fs.statSync(root);
  } catch {
    return;
  }
  if (!st.isDirectory()) {
    visit(root, path.basename(root), false);
    return;
  }
  if (visit(root, path.basename(root), true) === false) return;
  rec(root);
}

const toSlash = (p: string) => p.split(path.sep).join('/');

export function collectJobs(cfg: Config, abs: string): Job[] {
  const excl = compileGlobs([...cfg.exclude, cfg.wiki_dir + '/**']);
  const jobs: Job[] = [];
  for (const p of cfg.platforms) {
    const proot = path.join(abs, p.root);
    const incl = compileGlobs(p.include ?? []);
    if (!fs.existsSync(proot)) continue;
    walkDir(proot, (fp, name, isDir) => {
      let rel = toSlash(path.relative(abs, fp));
      if (rel === '') rel = '.';
      if (isDir) {
        if (rel !== '.' && (matchAny(excl, rel + '/') || matchAny(excl, rel) || name.startsWith('.')) && fp !== proot) return false;
        return true;
      }
      const lang = langForPath(fp);
      if (lang === '' || matchAny(excl, rel) || shadowed(cfg, p, rel)) return;
      const prel = toSlash(path.relative(proot, fp));
      if (incl.length > 0 && !matchAny(incl, prel)) return;
      jobs.push({ platform: p.name, lang, rel, prel, path: fp });
    });
  }
  return jobs;
}

export interface JobResult {
  hash: string;
  fr?: FileResult;
  err?: string;
  hit?: boolean;
}

export function runJobSync(ps: Parsers, j: Job, cache?: ScanCache): JobResult {
  let src: Buffer;
  try {
    src = fs.readFileSync(j.path);
  } catch (e) {
    return { hash: '', err: (e as Error).message };
  }
  const hash = createHash('sha256').update(src).digest('hex');
  if (src.length > 2 << 20) return { hash, err: 'file too large (>2MiB), skipped' };
  if (cache) {
    const fr = cache.get(j.rel, hash, j.lang, j.platform);
    if (fr) return { hash, fr, hit: true };
  }
  return { hash, fr: parseFile(ps, j.lang, j.platform, j.prel, j.rel, src.toString('utf8')) };
}

export interface ScanOptions {
  cache?: ScanCache;
  workers?: number;
}

/** Parse the source tree at dir according to cfg. */
export async function scan(cfg: Config, dir: string, opt: ScanOptions = {}): Promise<ScanResult> {
  const start = Date.now();
  const abs = absRoot(dir);
  const g: Graph = { version: GraphVersion, symbols: [], files: {}, parse_failures: [] };
  const res: ScanResult = { graph: g, calls: {}, dir: abs, stats: { files: 0, parsed: 0, cache_hits: 0, workers: 1, duration_ms: 0 } };
  const jobs = collectJobs(cfg, abs);
  let results: JobResult[];
  const { runJobs } = await import('./pool.js');
  const pr = await runJobs(jobs, opt.cache, opt.workers);
  results = pr.results;
  res.stats.workers = pr.workers;
  const seen = new Set<string>();
  jobs.forEach((j, i) => {
    const r = results[i]!;
    if (r.err !== undefined) {
      g.parse_failures.push({ file: j.rel, error: r.err });
      return;
    }
    const fr = r.fr!;
    if (fr.failure) g.parse_failures.push(fr.failure);
    for (const s of fr.symbols) g.symbols.push(s);
    res.calls[j.rel] = fr.calls;
    g.files[j.rel] = { platform: j.platform, lang: j.lang, hash: r.hash, symbols: fr.symbols.length, package: fr.package || undefined, imports: fr.imports.length ? fr.imports : undefined };
    res.stats.files++;
    if (r.hit) res.stats.cache_hits++;
    else res.stats.parsed++;
    seen.add(j.rel);
    if (opt.cache && !r.hit) opt.cache.put(j.rel, r.hash, j.lang, j.platform, fr);
  });
  if (opt.cache) opt.cache.prune(seen);
  g.symbols.sort((a, b) => cmpStr(a.id, b.id));
  g.parse_failures.sort((a, b) => cmpStr(a.file, b.file));
  // resolved references are a pure function of the parsed files: reuse them when every input is unchanged
  const refsKey = createHash('sha256');
  refsKey.update(cacheVersion() + '\n');
  jobs.forEach((j, i) => refsKey.update(`${j.rel}\0${j.prel}\0${j.lang}\0${j.platform}\0${results[i]!.hash}\0${results[i]!.err ?? ''}\n`));
  const key = refsKey.digest('hex');
  const cached = opt.cache?.refs;
  if (cached && cached.key === key) {
    for (const s of g.symbols) {
      const r = cached.refs[s.id];
      if (r) s.refs = r.slice();
      else delete s.refs;
    }
    reindexGraph(g);
    res.stats.refs_cached = true;
  } else {
    await resolveRefsParallel(g);
    if (opt.cache) {
      const refs: Record<string, string[]> = {};
      for (const s of g.symbols) if (s.refs?.length) refs[s.id] = s.refs.slice();
      opt.cache.refs = { key, refs };
      opt.cache.dirty = true;
    }
  }
  res.stats.duration_ms = Date.now() - start;
  return res;
}

// ---- cache ----

const cacheFormat = 'scan-cache/ts2';
export const CacheFile = '.kb/cache/scan.v8.gz';

export function cacheVersion(): string {
  return `${cacheFormat}/g${GraphVersion}/${fingerprint().slice(0, 16)}`;
}

interface CacheEntry {
  hash: string;
  lang: string;
  platform: string;
  fr: FileResult;
}

export class ScanCache {
  entries = new Map<string, CacheEntry>();
  /** resolved references of the last scan, keyed by its inputs */
  refs?: { key: string; refs: Record<string, string[]> };
  dirty = false;
  constructor(public version = cacheVersion()) {}

  static load(p: string): ScanCache {
    const c = new ScanCache();
    try {
      const raw = v8.deserialize(zlib.gunzipSync(fs.readFileSync(p))) as { version: string; entries: Record<string, CacheEntry>; refs?: ScanCache['refs'] };
      if (raw.version !== c.version) return c;
      for (const [k, v] of Object.entries(raw.entries)) c.entries.set(k, v);
      if (raw.refs) c.refs = raw.refs;
    } catch {
      /* missing or incompatible: empty cache */
    }
    return c;
  }

  save(p: string): void {
    if (!this.dirty) return;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = p + '.tmp~';
    const obj = { version: this.version, entries: Object.fromEntries(this.entries), ...(this.refs ? { refs: this.refs } : {}) };
    fs.writeFileSync(tmp, zlib.gzipSync(v8.serialize(obj), { level: 1 }));
    fs.renameSync(tmp, p);
    this.dirty = false;
  }

  get size(): number {
    return this.entries.size;
  }

  get(rel: string, hash: string, lang: string, platform: string): FileResult | undefined {
    const e = this.entries.get(rel);
    if (!e || e.hash !== hash || e.lang !== lang || e.platform !== platform) return undefined;
    // callers set refs on the returned symbols: copy them, share the rest
    return { ...e.fr, symbols: e.fr.symbols.map((x) => ({ ...x })) };
  }

  put(rel: string, hash: string, lang: string, platform: string, fr: FileResult): void {
    const syms: Symbol[] = fr.symbols.map((s) => {
      const cp = { ...s };
      delete cp.refs;
      return cp;
    });
    this.entries.set(rel, { hash, lang, platform, fr: { ...fr, symbols: syms } });
    this.dirty = true;
  }

  prune(seen: Set<string>): void {
    for (const k of [...this.entries.keys()]) {
      if (!seen.has(k)) {
        this.entries.delete(k);
        this.dirty = true;
      }
    }
  }
}

/** Scan cfg.root using the wiki's scan cache unless KB_NO_CACHE is set. */
export async function scanRepo(cfg: Config): Promise<ScanResult> {
  if (process.env.KB_NO_CACHE) return scan(cfg, cfg.root);
  const wiki = wikiPath(cfg);
  const p = path.join(wiki, CacheFile);
  const c = ScanCache.load(p);
  const res = await scan(cfg, cfg.root, { cache: c });
  try {
    if (fs.statSync(wiki).isDirectory()) c.save(p);
  } catch {
    /* no wiki dir: do not persist */
  }
  return res;
}

/** Cheap no-change check: hash of config + (path, size, mtime) of every non-excluded file. */
export function treeStamp(cfg: Config): string {
  const abs = absRoot(cfg.root);
  const h = createHash('sha256');
  h.update(`${cacheVersion()}\n${JSON.stringify(cfg.platforms)}\n${JSON.stringify(cfg.exclude)}\n${cfg.wiki_dir}\n`);
  const excl = compileGlobs([...cfg.exclude, cfg.wiki_dir + '/**']);
  for (const p of cfg.platforms as Platform[]) {
    const proot = path.join(abs, p.root);
    walkDir(proot, (fp, name, isDir) => {
      const rel = toSlash(path.relative(abs, fp)) || '.';
      if (isDir) {
        if (rel !== '.' && fp !== proot && (name.startsWith('.') || matchAny(excl, rel + '/') || matchAny(excl, rel))) return false;
        return true;
      }
      if (matchAny(excl, rel)) return;
      try {
        const st = fs.statSync(fp, { bigint: true });
        h.update(`${rel}\0${st.size}\0${st.mtimeNs}\n`);
      } catch {
        /* vanished */
      }
    });
  }
  return h.digest('hex');
}

export type { ParseFailure };
export { initParsers };
