// kb — the single codewiki CLI. Conventions: data → stdout, logs → stderr;
// --json everywhere; exit 0 ok, 1 stale/verify failed, 2 usage, 3 internal.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigNotFoundError, FileName, absRoot, defaultConfig, detect, detectedConfig, loadConfig, renderConfig, wikiPath, type Config } from '../config/config.js';
import { scanRepo, CacheFile } from '../scan/scan.js';
import { extractFacts } from '../facts/facts.js';
import { factsJSON } from '../facts/render.js';
import { symbolJSON, parseFailureJSON, getSym } from '../model.js';
import { analyze, compound, expectedFacts, gitHead, loadGraph, today, verifyRequirements } from '../engine/compound.js';
import { agentCommand } from '../agents/agents.js';
import { fixIndex, verifyWiki } from '../wiki/verify.js';
import { appendLog, initWiki } from '../wiki/layout.js';
import { findPage, loadPages, renderPage, writeFileAtomic } from '../wiki/page.js';
import { cmpStr, goJSON } from '../util/go.js';
import { short } from '../engine/graphutil.js';
import { computeParity } from '../engine/parity.js';

export const Version = '0.2.0-ts';
const ExitOK = 0, ExitStale = 1, ExitUsage = 2, ExitInternal = 3;

type FlagType = 'bool' | 'string' | 'int';
interface Command {
  name: string;
  usage: string;
  summary: string;
  flags?: Record<string, [FlagType, string, string | number | boolean]>;
  run: (a: App, f: Flags, pos: string[]) => Promise<number> | number;
}
type Flags = Record<string, string | number | boolean>;

class App {
  json = false;
  root = '.';
  config = '';
  wikiDir = '';
  quiet = false;
  out = (s: string) => process.stdout.write(s);
  log = (s: string) => {
    if (!this.quiet) process.stderr.write(s + '\n');
  };
  emit(v: unknown, human: () => void): void {
    if (this.json) this.out(goJSON(v, '  ', false) + '\n');
    else human();
  }
  fail(code: number, err: Error | string): number {
    const msg = typeof err === 'string' ? err : err.message;
    if (this.json) this.emit({ ok: false, error: msg, exit_code: code }, () => {});
    process.stderr.write(`kb: ${msg}\n`);
    return code;
  }
  applyWikiDir(cfg: Config): Config {
    if (this.wikiDir) cfg.wiki_dir = path.resolve(cfg.root, this.wikiDir);
    return cfg;
  }
  loadCfg(): Config {
    return this.applyWikiDir(loadConfig(this.root, this.config || undefined));
  }
  cfgOrFail(): Config | number {
    try {
      return this.loadCfg();
    } catch (e) {
      return this.fail(e instanceof ConfigNotFoundError ? ExitUsage : ExitInternal, e as Error);
    }
  }
  cfgOrDetect(): Config | number {
    try {
      return this.loadCfg();
    } catch (e) {
      if (!(e instanceof ConfigNotFoundError) || this.config) return this.fail(e instanceof ConfigNotFoundError ? ExitUsage : ExitInternal, e as Error);
    }
    const cfg = detectedConfig(this.root);
    if (!cfg.platforms.length) return this.fail(ExitUsage, `${FileName} not found and no platform root detected (run \`kb init\` and set platforms)`);
    this.applyWikiDir(cfg);
    this.log(`kb: no ${FileName}, zero-config mode (detected ${cfg.platforms.map((p) => p.name + '=' + p.root).join(', ')}); run \`kb init\` to persist it`);
    return cfg;
  }
}

const commands: Command[] = [];
const register = (c: Command) => commands.push(c);

register({
  name: 'init', usage: '[--dry-run] [--project name]', summary: 'create codewiki.yaml, the wiki skeleton and the AGENTS.md schema',
  flags: { 'dry-run': ['bool', 'print what would be created', false], project: ['string', 'project name stored in codewiki.yaml', ''] },
  run(a, f) {
    const root = path.resolve(a.root);
    const dry = !!f['dry-run'];
    const created: string[] = [];
    let cfg: Config;
    try {
      cfg = a.loadCfg();
    } catch (e) {
      if (!(e instanceof ConfigNotFoundError)) return a.fail(ExitInternal, e as Error);
      cfg = defaultConfig();
      cfg.root = root;
      cfg.platforms = detect(root);
      cfg.project = String(f.project || '') || path.basename(root);
      created.push(FileName);
      if (!dry) writeFileAtomic(path.join(root, FileName), renderConfig(cfg));
      a.applyWikiDir(cfg);
    }
    const wp = wikiPath(cfg);
    const work = path.join(path.dirname(wp), '.kb-work');
    if (work.startsWith(cfg.root + path.sep)) {
      const gi = path.join(cfg.root, '.gitignore');
      let cur = '';
      try {
        cur = fs.readFileSync(gi, 'utf8');
      } catch {
        cur = '';
      }
      const entry = '/' + path.relative(cfg.root, work).split(path.sep).join('/') + '/';
      const cacheEntry = '/' + path.relative(cfg.root, path.join(wp, path.dirname(CacheFile))).split(path.sep).join('/') + '/';
      const add = [entry, cacheEntry].filter((e) => !cur.includes(e));
      if (add.length) {
        created.push('.gitignore (+' + add.join(' ') + ')');
        if (!dry) {
          let s = cur;
          if (s && !s.endsWith('\n')) s += '\n';
          s += '# codewiki run scratch space and scan cache\n' + add.join('\n') + '\n';
          writeFileAtomic(gi, s);
        }
      }
    }
    const w = initWiki(wp, dry);
    for (const x of w) created.push(path.posix.join(cfg.wiki_dir.split(path.sep).join('/'), x));
    if (!dry && w.length) appendLog(wp, today(), 'init', cfg.project, [`platforms: ${cfg.platforms.length}`]);
    a.emit({ ok: true, dry_run: dry, created, platforms: cfg.platforms, wiki_dir: cfg.wiki_dir }, () => {
      if (!created.length) a.out('already initialized\n');
      for (const c of created) a.out('created ' + c + '\n');
      for (const p of cfg.platforms) a.out(`platform ${p.name} → ${p.root}\n`);
    });
    return ExitOK;
  },
});

register({
  name: 'scan', usage: '[--out graph.json] [--symbols]', summary: 'parse sources with tree-sitter; report symbols, facts and parse_failures',
  flags: { out: ['string', 'write the full symbol graph JSON to this file', ''], symbols: ['bool', 'include every symbol in the output', false] },
  async run(a, f) {
    const cfg = a.cfgOrDetect();
    if (typeof cfg === 'number') return cfg;
    const res = await scanRepo(cfg);
    const commit = gitHead(cfg.root);
    if (commit) res.graph.commit = commit;
    const facts = extractFacts(cfg, res);
    if (f.out) {
      const { graphJSON } = await import('../model.js');
      fs.writeFileSync(String(f.out), goJSON(graphJSON(res.graph), ' '));
    }
    const per: Record<string, Record<string, number>> = {};
    for (const s of res.graph.symbols) {
      per[s.platform] ??= {};
      per[s.platform]![s.lang] = (per[s.platform]![s.lang] ?? 0) + 1;
    }
    const files: Record<string, number> = {};
    for (const fi of Object.values(res.graph.files)) files[fi.platform] = (files[fi.platform] ?? 0) + 1;
    const sortObj = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort((x, y) => cmpStr(x[0], y[0])));
    const fj = factsJSON(facts);
    const out: Record<string, unknown> = {
      commit, facts: { apis: facts.apis?.length ?? 0, routes: facts.routes?.length ?? 0, testids: facts.testids?.length ?? 0 }, files: sortObj(files), ok: true,
      parse_failures: res.graph.parse_failures.map(parseFailureJSON), scan_stats: res.stats, schemes: fj.schemes ?? {},
    };
    if (f.symbols) out.symbol_list = res.graph.symbols.map(symbolJSON);
    out.symbols = sortObj(Object.fromEntries(Object.entries(per).map(([k, v]) => [k, sortObj(v)])));
    out.total_symbols = res.graph.symbols.length;
    a.emit(out, () => {
      a.out(`commit ${short(commit)}: ${Object.keys(res.graph.files).length} files, ${res.graph.symbols.length} symbols\n`);
      for (const p of Object.keys(per).sort(cmpStr)) a.out(`  ${p.padEnd(8)} files=${files[p] ?? 0} ${JSON.stringify(per[p])}\n`);
      a.out(`facts: ${facts.routes?.length} routes, ${facts.testids?.length} testids, ${facts.apis?.length} apis; schemes ${JSON.stringify(facts.schemes ?? {})}\n`);
      a.out(`parse_failures: ${res.graph.parse_failures.length}\n`);
      a.out(`scan: ${res.stats.duration_ms} ms, parsed ${res.stats.parsed}, cache hits ${res.stats.cache_hits}, workers ${res.stats.workers}\n`);
      for (const pf of res.graph.parse_failures) a.out(`  ${pf.file}:${pf.line ?? 0} ${pf.error}\n`);
      if (f.symbols) for (const s of res.graph.symbols) a.out(`${s.hash.slice(0, 12)} ${s.kind} ${s.id}\n`);
    });
    return ExitOK;
  },
});

const baseFlag: Command['flags'] = { base: ['string', 'baseline git revision', ''] };

register({
  name: 'diff', usage: '[--base <sha>]', summary: 'graph diff vs last compound (or --base): unchanged/body/signature/added/deleted/renamed', flags: baseFlag,
  async run(a, f) {
    const cfg = a.cfgOrFail();
    if (typeof cfg === 'number') return cfg;
    const an = await analyze({ cfg, llm: 'template', base: String(f.base || '') });
    const d = an.diff;
    a.emit(d, () => {
      a.out(`base ${short(d.base)} → head ${d.head ? short(d.head) : '(no git)'}${d.incompatible ? ' (no baseline: everything is added)' : ''}\n`);
      for (const k of ['unchanged', 'body', 'signature', 'added', 'deleted', 'renamed']) a.out(`  ${k.padEnd(10)} ${d.counts[k] ?? 0}\n`);
      a.out(`changed_route_ids: [${d.changed_route_ids.join(' ')}]\nchanged_files: ${d.changed_files.length}\n`);
      for (const c of d.changes) a.out(c.class === 'renamed' ? `${c.class.padEnd(9)} ${c.old_id} → ${c.id} (similarity ${(c.similarity ?? 0).toFixed(2)})\n` : `${c.class.padEnd(9)} ${c.id}\n`);
    });
    return ExitOK;
  },
});

register({
  name: 'plan', usage: '[--base <sha>] [--full] [--dry-run]', summary: 'compute affected pages + write sets; writes wiki/.kb/plan.json',
  flags: { ...baseFlag, full: ['bool', 'force a full rebuild plan', false], 'dry-run': ['bool', 'do not write wiki/.kb/plan.json', false] },
  async run(a, f) {
    const cfg = a.cfgOrFail();
    if (typeof cfg === 'number') return cfg;
    const an = await analyze({ cfg, llm: 'template', base: String(f.base || ''), full: !!f.full });
    const p = an.plan;
    if (!f['dry-run'] && fs.existsSync(wikiPath(cfg))) writeFileAtomic(path.join(wikiPath(cfg), '.kb', 'plan.json'), goJSON(p, '  ') + '\n');
    a.emit(p, () => {
      a.out(`mode ${p.mode}: ${p.reason}\n`);
      for (const t of p.tasks) a.out(`${t.id}  ${t.op.padEnd(8)} ${t.page}  (${t.reasons.map((r) => r.code).join(', ')})\n`);
    });
    return ExitOK;
  },
});

register({
  name: 'compound', usage: "[--llm template|cmd] [--agent claude|codex|gemini] [--llm-cmd '...'] [--base sha] [--full] [--dry-run]", summary: 'scan→diff→plan→LLM→verify→atomic publish; updates state, update_record, log.md',
  flags: {
    llm: ['string', 'writer: template | cmd | claude | codex | gemini', ''], agent: ['string', 'coding agent backend: claude | codex | gemini', ''], 'llm-cmd': ['string', 'any command line (prompt on stdin)', ''],
    model: ['string', 'model passed to the agent adapter', ''], ...baseFlag, full: ['bool', 'force full rebuild', false], 'dry-run': ['bool', 'plan only; write nothing', false],
    fallback: ['bool', 'fall back to the template writer when an LLM task fails', false], 'max-llm-tasks': ['int', 'cap LLM tasks per run (rest use template); 0 = unlimited', 0], 'keep-work': ['bool', 'keep .kb-work/<run>', false],
  },
  async run(a, f) {
    const cfg = a.cfgOrFail();
    if (typeof cfg === 'number') return cfg;
    let llm = String(f.llm || '');
    let agent = String(f.agent || '');
    let llmCmd = String(f['llm-cmd'] || '');
    if (!agent && ['claude', 'codex', 'gemini', 'generic'].includes(llm)) agent = llm;
    if (llmCmd) llm = 'cmd';
    else if (agent) {
      try {
        llmCmd = agent === 'generic' ? cfg.llm.cmd : agentCommand(agent, String(f.model || cfg.llm.model || ''));
      } catch (e) {
        return a.fail(ExitUsage, e as Error);
      }
      llm = 'cmd';
    } else if (!llm) llm = 'template';
    else if (llm === 'cmd' && cfg.llm.agent && cfg.llm.agent !== 'generic') {
      agent = cfg.llm.agent;
      llmCmd = agentCommand(agent, cfg.llm.model ?? '');
    }
    if (llm !== 'template' && llm !== 'cmd') return a.fail(ExitUsage, `unknown --llm ${llm} (template | cmd | claude | codex | gemini)`);
    const r = await compound({ cfg, llm, llmCmd, agent, base: String(f.base || ''), full: !!f.full, dryRun: !!f['dry-run'], fallback: !!f.fallback, maxTasks: Number(f['max-llm-tasks'] || 0), keep: !!f['keep-work'], log: a.log, kbPath: process.argv[1] });
    a.emit(r, () => {
      for (const c of r.changed) a.out(`  ${c}\n`);
      if (r.verify) a.out(`verify ${r.verify.ok ? 'PASS' : 'FAIL'}: ${r.verify.pages} pages, ${r.verify.anchors} anchors, ${r.verify.errors.length} errors, ${r.verify.warnings.length} warnings\n`);
      for (const e of r.verify?.errors ?? []) a.out(`  ${e.code} ${e.page ?? ''} ${e.sym ?? ''} ${e.detail}\n`);
      a.out(r.message + '\n');
    });
    if (r.verify && !r.verify.ok) return ExitStale;
    return ExitOK;
  },
});

register({
  name: 'verify', usage: '[--fix-index]', summary: 'CI gate: anchors match HEAD, symbols exist, no dead links/orphans, index complete, facts fresh',
  flags: { 'fix-index': ['bool', 'regenerate index.md/llms.txt before verifying', false], 'dry-run': ['bool', 'with --fix-index: show what would change', false] },
  async run(a, f) {
    const cfg = a.cfgOrFail();
    if (typeof cfg === 'number') return cfg;
    const wp = wikiPath(cfg);
    if (f['fix-index'] && !f['dry-run']) {
      fixIndex(wp);
      appendLog(wp, today(), 'fix-index', 'index.md, llms.txt', []);
    }
    const res = await scanRepo(cfg);
    const facts = extractFacts(cfg, res);
    const rep = verifyWiki(wp, res.graph, expectedFacts(cfg, res.graph, facts));
    verifyRequirements(wp, res.graph, rep);
    a.emit(rep, () => {
      for (const e of rep.errors) a.out(`ERROR ${e.code} ${e.page ?? ''} ${e.sym ?? ''} ${e.detail}\n`);
      for (const w of rep.warnings) a.out(`warn  ${w.code} ${w.page ?? ''} ${w.detail}\n`);
      a.out(`verify ${rep.ok ? 'PASS' : 'FAIL'}: ${rep.pages} pages, ${rep.anchors} anchors, ${rep.errors.length} errors, ${rep.warnings.length} warnings\n`);
    });
    return rep.ok ? ExitOK : ExitStale;
  },
});

register({
  name: 'status', usage: '', summary: 'list stale pages (anchor hash differs from HEAD); exit 1 if any',
  async run(a) {
    const cfg = a.cfgOrFail();
    if (typeof cfg === 'number') return cfg;
    const res = await scanRepo(cfg);
    const rep = verifyWiki(wikiPath(cfg), res.graph);
    const st = { ok: rep.stale_pages.length === 0, stale_pages: rep.stale_pages, head: gitHead(cfg.root) };
    a.emit(st, () => {
      if (!rep.stale_pages.length) a.out('all pages current\n');
      for (const p of rep.stale_pages) a.out('stale ' + p + '\n');
    });
    return st.ok ? ExitOK : ExitStale;
  },
});

register({
  name: 'anchor', usage: '<symbol-id...>', summary: 'print the current hash of symbols (for page frontmatter)',
  async run(a, _f, pos) {
    if (!pos.length) return a.fail(ExitUsage, 'usage: kb anchor <symbol-id...>');
    let g = process.env.KB_GRAPH ? (() => {
      try {
        const x = JSON.parse(fs.readFileSync(process.env.KB_GRAPH!, 'utf8'));
        return x;
      } catch {
        return null;
      }
    })() : null;
    if (!g) {
      const cfg = a.cfgOrDetect();
      if (typeof cfg === 'number') return cfg;
      g = (await scanRepo(cfg)).graph;
    }
    let code = ExitOK;
    const out = pos.map((id) => {
      const s = getSym(g, id);
      if (!s) code = ExitStale;
      return { sym: id, hash: s?.hash ?? '', found: !!s };
    });
    a.emit(out, () => out.forEach((x) => a.out(x.found ? `- sym: ${x.sym}\n  hash: ${x.hash}\n` : `# not found: ${x.sym}\n`)));
    return code;
  },
});

register({
  name: 'get', usage: '<page-id|path>', summary: 'print one page (frontmatter + body)',
  run(a, _f, pos) {
    const cfg = a.cfgOrFail();
    if (typeof cfg === 'number') return cfg;
    if (!pos.length) return a.fail(ExitUsage, 'usage: kb get <page-id|path>');
    const [pages] = loadPages(wikiPath(cfg));
    const p = findPage(pages, pos[0]!);
    if (!p) return a.fail(ExitStale, `page not found: ${pos[0]}`);
    a.emit({ path: p.path, front: p.front, body: p.body }, () => a.out(renderPage(p)));
    return ExitOK;
  },
});

register({
  name: 'search', usage: '<query> [--limit n]', summary: 'full-text search over pages, facts and symbol names',
  flags: { limit: ['int', 'max results', 10] },
  run(a, f, pos) {
    const cfg = a.cfgOrFail();
    if (typeof cfg === 'number') return cfg;
    const q = pos.join(' ').toLowerCase();
    if (!q) return a.fail(ExitUsage, 'usage: kb search <query>');
    const [pages] = loadPages(wikiPath(cfg));
    const terms = q.split(/\s+/).filter(Boolean);
    const hits = pages
      .map((p) => {
        const text = (p.front.title + ' ' + p.path + ' ' + p.body).toLowerCase();
        const score = terms.reduce((n, t) => n + (text.split(t).length - 1) + (p.front.title.toLowerCase().includes(t) ? 5 : 0), 0);
        return { path: p.path, title: p.front.title, score };
      })
      .filter((h) => h.score > 0)
      .sort((x, y) => y.score - x.score || cmpStr(x.path, y.path))
      .slice(0, Number(f.limit) || 10);
    a.emit({ query: q, results: hits }, () => hits.forEach((h) => a.out(`${h.path}  ${h.title}  (${h.score})\n`)));
    return ExitOK;
  },
});

register({
  name: 'parity', usage: '[--strict]', summary: 'feature × platform matrix: routes, testIDs, APIs and constants that differ across platforms',
  flags: { strict: ['bool', 'exit 1 when any gap or constant difference exists', false] },
  async run(a, f) {
    const cfg = a.cfgOrDetect();
    if (typeof cfg === 'number') return cfg;
    const res = await scanRepo(cfg);
    const p = computeParity(res.graph, extractFacts(cfg, res), cfg.platforms.map((x) => x.name));
    a.emit(p, () => {
      for (const r of p.features) a.out(`${r.route_id}: ${p.platforms.map((pl) => `${pl}=${r.platforms[pl]!.route ? '✓' : '✗'}`).join(' ')}\n`);
      a.out(`gaps: ${p.gaps}\n`);
    });
    return f.strict && p.gaps > 0 ? ExitStale : ExitOK;
  },
});

function mainUsage(a: App): void {
  a.out('kb — compound mobile monorepo code (Android/iOS/HarmonyOS) + legacy docs into a code-anchored LLM Wiki.\n\nUsage: kb <command> [flags] [args]\n\nCommands:\n');
  for (const c of commands) a.out(`  ${c.name.padEnd(14)} ${c.summary}\n`);
  a.out('\nGlobal flags (every command): --json  --root <dir>  --config <file>  --wiki-dir <dir>  --quiet\n\nConventions: data → stdout, logs → stderr; exit 0 ok, 1 stale/verify failed,\n2 usage error, 3 internal error; writers support --dry-run; never interactive.\n\nRun "kb help <command>" for details.\n');
}

function cmdUsage(a: App, c: Command): void {
  a.out(`Usage: kb ${c.name} ${c.usage}\n\n${c.summary}\n\nFlags:\n`);
  for (const [n, [, u, d]] of Object.entries(c.flags ?? {})) a.out(`  --${n.padEnd(16)} ${u}${d !== '' && d !== false && d !== 0 ? ` (default "${d}")` : ''}\n`);
  a.out('  --json / --root / --config / --wiki-dir / --quiet  (global)\n');
}

export async function run(argv: string[]): Promise<number> {
  const a = new App();
  if (!argv.length) {
    mainUsage(a);
    return ExitUsage;
  }
  const pre: string[] = [];
  while (argv.length && argv[0]!.startsWith('-') && !['-h', '--help', '--version'].includes(argv[0]!)) {
    const f = argv[0]!.replace(/^-+/, '');
    pre.push(argv.shift()!);
    if (['root', 'config', 'wiki-dir'].includes(f) && argv.length) pre.push(argv.shift()!);
  }
  if (!argv.length) {
    mainUsage(a);
    return ExitUsage;
  }
  const name = argv[0]!;
  const rest = [...pre, ...argv.slice(1)];
  if (name === '-h' || name === '--help' || name === 'help') {
    const c = commands.find((x) => x.name === rest[0]);
    if (c) cmdUsage(a, c);
    else mainUsage(a);
    return ExitOK;
  }
  if (name === 'version' || name === '--version') {
    a.out(`kb ${Version}\n`);
    return ExitOK;
  }
  const c = commands.find((x) => x.name === name);
  if (!c) {
    process.stderr.write(`kb: unknown command ${JSON.stringify(name)} (run \`kb --help\`)\n`);
    return ExitUsage;
  }
  const spec: Record<string, [FlagType, string, string | number | boolean]> = {
    json: ['bool', '', false], root: ['string', '', '.'], config: ['string', '', ''], 'wiki-dir': ['string', '', ''], quiet: ['bool', '', false], ...(c.flags ?? {}),
  };
  const flags: Flags = {};
  for (const [k, v] of Object.entries(spec)) flags[k] = v[2];
  const pos: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const x = rest[i]!;
    if (x === '--') {
      pos.push(...rest.slice(i + 1));
      break;
    }
    if (x.startsWith('-') && x.length > 1) {
      let n = x.replace(/^-+/, '');
      let val: string | undefined;
      const eq = n.indexOf('=');
      if (eq >= 0) {
        val = n.slice(eq + 1);
        n = n.slice(0, eq);
      }
      if (n === 'h' || n === 'help') {
        cmdUsage(a, c);
        return ExitOK;
      }
      const s = spec[n];
      if (!s) {
        process.stderr.write(`kb ${c.name}: unknown flag -${n}\n`);
        cmdUsage(a, c);
        return ExitUsage;
      }
      if (s[0] === 'bool') flags[n] = val === undefined ? true : val !== 'false';
      else {
        if (val === undefined) val = rest[++i] ?? '';
        if (s[0] === 'int') {
          const v = parseInt(val, 10);
          if (Number.isNaN(v)) {
            process.stderr.write(`kb ${c.name}: invalid value ${JSON.stringify(val)} for flag -${n}\n`);
            return ExitUsage;
          }
          flags[n] = v;
        } else flags[n] = val;
      }
      continue;
    }
    pos.push(x);
  }
  a.json = !!flags.json;
  a.root = String(flags.root);
  a.config = String(flags.config);
  a.wikiDir = String(flags['wiki-dir']);
  a.quiet = !!flags.quiet;
  try {
    return await c.run(a, flags, pos);
  } catch (e) {
    process.stderr.write(`kb ${c.name}: internal error: ${(e as Error).stack ?? e}\n`);
    return ExitInternal;
  }
}

void absRoot;
void loadGraph;
