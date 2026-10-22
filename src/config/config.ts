// codewiki.yaml loading, defaults and zero-config platform detection.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const FileName = 'codewiki.yaml';

export interface Platform {
  name: string;
  root: string;
  include?: string[];
}

export interface Config {
  version: number;
  wiki_dir: string;
  project: string;
  platforms: Platform[];
  exclude: string[];
  /** facts*: LLM fallback extraction of routes/APIs during `kb compound` (on by default; degrades to rules only without an agent) */
  llm: { cmd: string; agent?: string; model?: string; timeout_sec: number; facts?: boolean; facts_agent?: string; facts_model?: string; facts_max_files?: number };
  plan: { hops: number; rebuild_module_ratio: number; rebuild_structural_ratio: number };
  docs: { exclude: string[] };
  facts: { uikit?: boolean };
  /** v2 hierarchical tree overrides (docs/tree.md, design-v2 §3.6) */
  tree?: Record<string, unknown>;
  /** docs ownership scopes (docs/ownership.md §1) */
  scopes?: { projects?: { id?: string; root: string }[]; repository?: { write?: boolean; read?: boolean } };
  /** docs dimension overrides */
  docs_schema?: Record<string, unknown>;
  /** absolute repo root (not serialized to yaml) */
  root: string;
}

export const DefaultLLMCmd =
  'claude -p --permission-mode acceptEdits --allowedTools "Read,Write,Edit,Glob,Grep,Bash(kb anchor:*),Bash(kb get:*),Bash(kb search:*)" --output-format text';

export function defaultConfig(): Config {
  return {
    version: 1,
    wiki_dir: 'wiki',
    project: 'project',
    platforms: [],
    exclude: ['**/build/**', '**/node_modules/**', '**/.git/**', '**/Pods/**', '**/oh_modules/**', '**/.gradle/**', '**/.kb-work/**'],
    llm: { cmd: DefaultLLMCmd, timeout_sec: 600, facts: true },
    plan: { hops: 1, rebuild_module_ratio: 0.5, rebuild_structural_ratio: 0.3 },
    docs: { exclude: [] },
    facts: {},
    root: '',
  };
}

export class ConfigNotFoundError extends Error {
  constructor() {
    super('codewiki.yaml not found (run `kb init` first, then `kb compound --llm template` to build the wiki; `kb routes`, `kb lint-tid` and `kb parity` work without it)');
  }
}

export function uikitEnabled(c: Config): boolean {
  return c.facts.uikit === undefined || c.facts.uikit === null || c.facts.uikit;
}

/** path.resolve plus symlink resolution (WalkDir does not descend into a symlinked root). */
export function absRoot(p: string): string {
  const abs = path.resolve(p);
  try {
    return fs.realpathSync(abs);
  } catch {
    return abs;
  }
}

function mergeInto(dst: Record<string, unknown>, src: unknown): void {
  if (!src || typeof src !== 'object') return;
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    const cur = dst[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
      mergeInto(cur as Record<string, unknown>, v);
    } else if (v !== null && v !== undefined) {
      dst[k] = v;
    }
  }
}

/** Load <root>/codewiki.yaml (or an explicit config file), filling defaults. */
export function loadConfig(root: string, configFile?: string): Config {
  const abs = absRoot(root);
  const file = configFile ? path.resolve(configFile) : path.join(abs, FileName);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new ConfigNotFoundError();
    throw e;
  }
  const c = defaultConfig();
  let doc: unknown;
  try {
    doc = YAML.parse(text);
  } catch (e) {
    throw new Error(`parse ${FileName}: ${(e as Error).message}`);
  }
  mergeInto(c as unknown as Record<string, unknown>, doc);
  if (!c.wiki_dir) c.wiki_dir = 'wiki';
  if (!c.plan.hops) c.plan.hops = 1;
  if (!c.llm.cmd) c.llm.cmd = DefaultLLMCmd;
  c.llm.facts = boolValue(c.llm.facts, true);
  c.platforms = (c.platforms ?? []).map((p) => ({ name: String(p.name ?? ''), root: String(p.root ?? ''), ...(p.include ? { include: p.include.map(String) } : {}) }));
  c.root = abs;
  return c;
}

/** YAML/env-ish boolean: false / 0 / off / no (any case) are false; absent → def. */
export function boolValue(v: unknown, def: boolean): boolean {
  if (v === undefined || v === null || v === '') return def;
  if (typeof v === 'boolean') return v;
  return !/^(false|0|off|no|n)$/i.test(String(v).trim());
}

/** LLM facts fallback settings for `kb compound` (llm.facts*, defaults: on, claude, haiku, 40 files). */
export function llmFactsSettings(c: Config): { enabled: boolean; agent: string; model: string; maxFiles: number } {
  const n = Number(c.llm.facts_max_files);
  return { enabled: boolValue(c.llm.facts, true), agent: String(c.llm.facts_agent || 'claude'), model: String(c.llm.facts_model || 'haiku'), maxFiles: Number.isFinite(n) && n > 0 ? n : 40 };
}

/** The configuration `kb init` would write for root, without writing anything (zero-config mode). */
export function detectedConfig(root: string): Config {
  const abs = absRoot(root);
  const c = defaultConfig();
  c.root = abs;
  c.platforms = detect(abs);
  c.project = path.basename(abs);
  return c;
}

export function wikiPath(c: Config): string {
  return path.isAbsolute(c.wiki_dir) ? c.wiki_dir : path.join(c.root, c.wiki_dir);
}

/** Guess platforms from the directory layout of root (see Go config.Detect). */
export function detect(root: string): Platform[] {
  const out: Platform[] = [];
  const isDir = (d: string) => {
    try {
      return fs.statSync(path.join(root, d)).isDirectory();
    } catch {
      return false;
    }
  };
  const exists = (f: string) => fs.existsSync(path.join(root, f));
  const glob = (suffix: string) => {
    try {
      return fs.readdirSync(root).some((n) => n.endsWith(suffix) && n.length > suffix.length);
    } catch {
      return false;
    }
  };
  const dirs = (name: string, ...ds: string[]) => {
    for (const d of ds) {
      if (isDir(d)) {
        out.push({ name, root: d });
        return true;
      }
    }
    return false;
  };
  const atRoot: Record<string, boolean> = {};
  if (!dirs('android', 'android', 'Android')) {
    if (exists('settings.gradle') || exists('settings.gradle.kts')) {
      out.push({ name: 'android', root: '.' });
      atRoot.android = true;
    } else dirs('android', 'app');
  }
  if (glob('.xcodeproj') || glob('.xcworkspace') || (exists('Package.swift') && !atRoot.android)) {
    out.push({ name: 'ios', root: '.' });
    atRoot.ios = true;
  } else dirs('ios', 'ios', 'iOS', 'iosApp', 'app/iosApp');
  if (!dirs('harmony', 'harmony', 'harmonyos', 'ohos', 'HarmonyOS')) {
    if (exists('build-profile.json5') || exists('oh-package.json5') || isDir('AppScope')) {
      out.push({ name: 'harmony', root: '.' });
      atRoot.harmony = true;
    }
  }
  if (out.length === 0) {
    // nothing at the top level: one app project one directory down (e.g. HarmonyOS-Cases/CommonAppDevelopment)
    let kids: string[] = [];
    try {
      kids = fs.readdirSync(root).filter((n) => !n.startsWith('.') && isDir(n)).sort();
    } catch {
      /* unreadable */
    }
    const has = (d: string, f: string) => exists(path.join(d, f));
    for (const k of kids) {
      if (!out.some((p) => p.name === 'harmony') && has(k, 'build-profile.json5') && isDir(path.join(k, 'AppScope'))) out.push({ name: 'harmony', root: k });
      else if (!out.some((p) => p.name === 'android') && (has(k, 'settings.gradle') || has(k, 'settings.gradle.kts'))) out.push({ name: 'android', root: k });
      else if (!out.some((p) => p.name === 'ios') && fs.readdirSync(path.join(root, k)).some((n) => n.endsWith('.xcodeproj'))) out.push({ name: 'ios', root: k });
    }
    if (out.length) return out;
  }
  if (Object.keys(atRoot).length === 0 || isDir('web')) dirs('web', 'web', 'src', 'lib');
  addKMPModules(root, out, isDir, exists);
  return out;
}

const kmpSourceSets = ['src/commonMain', 'src/androidMain', 'src/iosMain'];

/**
 * Kotlin Multiplatform modules (shared/, composeApp/, core/, libs/foo/ ... with src/commonMain,
 * src/androidMain or src/iosMain) next to an android/ project are not under the android root, so
 * their Kotlin sources would never be scanned. When the build is Gradle and the android root is a
 * subdirectory, widen android to the repo root restricted (via include) to its old root plus those
 * modules. Symbol ids stay unique (one android entry) and deeper roots of other platforms still
 * shadow it. Skipped when another platform already owns the repo root, since a second root-level
 * platform would stop shadowing the android subtree for it.
 */
function addKMPModules(root: string, out: Platform[], isDir: (d: string) => boolean, exists: (f: string) => boolean): void {
  const ai = out.findIndex((p) => p.name === 'android');
  if (ai < 0) return;
  const ar = cleanRoot(out[ai].root);
  if (ar === '' || out[ai].include?.length) return; // root Gradle build already covers every module
  const gradle = (d: string) => ['settings.gradle', 'settings.gradle.kts'].some((f) => exists(path.join(d, f)));
  if (!gradle('.') && !gradle(ar)) return;
  if (out.some((p, i) => i !== ai && cleanRoot(p.root) === '')) return;
  const ls = (d: string) => {
    try {
      return fs.readdirSync(path.join(root, d)).filter((n) => !n.startsWith('.') && n !== 'build' && n !== 'node_modules' && isDir(path.join(d, n))).sort();
    } catch {
      return [];
    }
  };
  const isKMP = (d: string) => kmpSourceSets.some((s) => isDir(path.join(d, s)));
  const owned = (d: string) => out.some((p) => rootContains(cleanRoot(p.root), d));
  const mods: string[] = [];
  for (const k of ls('.')) {
    if (owned(k)) continue;
    if (isKMP(k)) {
      mods.push(k);
      continue;
    }
    for (const kk of ls(k)) {
      const d = k + '/' + kk;
      if (!owned(d) && isKMP(d)) mods.push(d);
    }
  }
  if (mods.length === 0) return;
  out[ai] = { name: 'android', root: '.', include: [ar, ...mods].map((d) => d + '/**') };
}

function q(s: string): string {
  // yaml.v3 style scalar quoting: plain when safe, single quotes otherwise
  if (s === '') return '""';
  if (/^[A-Za-z0-9_./][A-Za-z0-9_./ \-()",:*@]*$/.test(s) && !/: |\s#|:$/.test(s) && !/^(true|false|null|yes|no|on|off|~|[-+]?\d[\d.]*)$/i.test(s)) return s;
  return "'" + s.replace(/'/g, "''") + "'";
}

/** Serialize as YAML (yaml.v3 layout: 4-space indent) with a header comment. */
export function renderConfig(c: Config): string {
  const L: string[] = ['# codewiki configuration. See README.md ("配置").'];
  L.push(`version: ${c.version}`, `wiki_dir: ${q(c.wiki_dir)}`, `project: ${q(c.project)}`);
  if (c.platforms.length === 0) L.push('platforms: []');
  else {
    L.push('platforms:');
    for (const p of c.platforms) {
      L.push(`    - name: ${q(p.name)}`, `      root: ${q(p.root)}`);
      if (p.include && p.include.length) {
        L.push('      include:');
        for (const i of p.include) L.push(`        - ${q(i)}`);
      }
    }
  }
  if (c.exclude.length === 0) L.push('exclude: []');
  else {
    L.push('exclude:');
    for (const e of c.exclude) L.push(`    - ${q(e)}`);
  }
  L.push('llm:', `    cmd: ${q(c.llm.cmd)}`);
  if (c.llm.agent) L.push(`    agent: ${q(c.llm.agent)}`);
  if (c.llm.model) L.push(`    model: ${q(c.llm.model)}`);
  L.push(`    timeout_sec: ${c.llm.timeout_sec}`);
  L.push('    # LLM fallback extraction of routes/APIs in `kb compound` (every item verified against the source; cached).');
  L.push('    # Default on; turn off with false, `--no-llm-facts` or KB_LLM_FACTS=0. Without the agent CLI it degrades to rules only.');
  L.push(`    facts: ${c.llm.facts !== false}`);
  if (c.llm.facts_agent) L.push(`    facts_agent: ${q(c.llm.facts_agent)}`);
  if (c.llm.facts_model) L.push(`    facts_model: ${q(c.llm.facts_model)}`);
  if (c.llm.facts_max_files) L.push(`    facts_max_files: ${c.llm.facts_max_files}`);
  L.push('plan:', `    hops: ${c.plan.hops}`, `    rebuild_module_ratio: ${c.plan.rebuild_module_ratio}`, `    rebuild_structural_ratio: ${c.plan.rebuild_structural_ratio}`);
  L.push('docs:');
  if (c.docs.exclude.length === 0) L.push('    exclude: []');
  else {
    L.push('    exclude:');
    for (const e of c.docs.exclude) L.push(`        - ${q(e)}`);
  }
  if (c.facts.uikit !== undefined) L.push('facts:', `    uikit: ${c.facts.uikit}`);
  if (c.tree && Object.keys(c.tree).length) {
    const y = YAML.stringify({ tree: c.tree }, { indent: 4 });
    L.push(y.replace(/\n$/, ''));
  }
  return L.join('\n') + '\n';
}

function cleanRoot(root: string): string {
  const r = path.posix.normalize(root.replace(/\\/g, '/')).replace(/^\/+|\/+$/g, '');
  return r === '.' ? '' : r;
}
function rootContains(r: string, rel: string): boolean {
  return r === '' || rel === r || rel.startsWith(r + '/');
}

/** rel lies under p's root but also under a strictly deeper root of another platform. */
export function shadowed(c: Config, p: Platform, rel: string): boolean {
  const pr = cleanRoot(p.root);
  for (const qq of c.platforms) {
    if (qq.name === p.name) continue;
    const qr = cleanRoot(qq.root);
    if (qr.length > pr.length && rootContains(qr, rel) && rootContains(pr, qr)) return true;
  }
  return false;
}
