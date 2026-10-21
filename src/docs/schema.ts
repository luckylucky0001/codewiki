// Dimension schema for mobile monorepos + per-scope activation, null
// passthrough and extra-schema registration (.kb/docs-schema-extra.yaml).
import YAML from 'yaml';
import { parseHeadingLine } from './markers.js';
import { isKnowledgeLayerFile } from './ownership.js';
import { findFrontmatter, isUnder, joinPath, normalizeRepoPath, splitLines } from './text.js';

export type ScopeKind = 'repo' | 'project';
export type EvidenceKind = 'code' | 'build' | 'facts' | 'spec' | 'doc' | 'config';

export interface Dimension {
  id: string;
  /** relative to the owner root (repo root or project root); a leading `docs/` maps to the scope's docs root */
  output_path: string;
  title: string;
  /** what the file is for (prompt + docs) */
  target: string;
  scopes: ScopeKind[];
  /** owner-root-relative globs that activate the dimension */
  probe_paths: string[];
  evidence: EvidenceKind[];
  /** Draft specs may feed it ([Unconfirmed] entries) */
  requirement_oriented: boolean;
  /**
   * Constitution exception: entries are `compound:owned:start/end` blocks with an
   * Evidence line instead of generic `**Source**` entries, and only trusted evidence
   * (code, build config, Implemented/Verified/Archived specs) may feed it.
   */
  constitution_exception: boolean;
  /** only activated when a backend is present in the scope */
  requires_backend?: boolean;
}

const ANDROID_BUILD = ['settings.gradle', 'settings.gradle.kts', 'build.gradle', 'build.gradle.kts', '**/build.gradle', '**/build.gradle.kts'];
const IOS_BUILD = ['Package.swift', '**/Package.swift', '**/*.xcodeproj/project.pbxproj', 'Podfile'];
const HARMONY_BUILD = ['build-profile.json5', '**/build-profile.json5', '**/module.json5', 'oh-package.json5'];

export const DefaultSchema: Dimension[] = [
  {
    id: 'architecture', output_path: 'docs/architecture.md', title: 'Architecture',
    target: 'Architecture overview and module map: layers, build modules, dependency direction, entry points.',
    scopes: ['repo', 'project'], probe_paths: [...ANDROID_BUILD, ...IOS_BUILD, ...HARMONY_BUILD, 'package.json', 'go.mod'],
    evidence: ['build', 'code', 'facts'], requirement_oriented: false, constitution_exception: false,
  },
  {
    id: 'design-patterns', output_path: 'docs/design-patterns.md', title: 'Design Patterns',
    target: 'Recurring design patterns (MVVM/MVI, Repository, Coordinator, DI, state management) with canonical examples.',
    scopes: ['repo', 'project'],
    probe_paths: ['**/*ViewModel.kt', '**/*ViewModel.swift', '**/*ViewModel.ets', '**/*Repository.kt', '**/*Repository.swift', '**/*Coordinator.swift', '**/*Presenter.*', '**/di/**', '**/*Module.kt'],
    evidence: ['code'], requirement_oriented: false, constitution_exception: false,
  },
  {
    id: 'coding-standards', output_path: 'docs/coding-standards.md', title: 'Coding Standards',
    target: 'Coding standards enforced by tooling: lint/format configs, naming, error handling, logging conventions.',
    scopes: ['repo', 'project'],
    probe_paths: ['.editorconfig', '**/.editorconfig', '.swiftlint.yml', '**/.swiftlint.yml', '.swiftformat', 'detekt.yml', '**/detekt*.yml', '**/lint.xml', '.eslintrc*', '**/code-linter.json5', 'ktlint*', '.ktlint*'],
    evidence: ['config', 'code'], requirement_oriented: false, constitution_exception: false,
  },
  {
    id: 'navigation', output_path: 'docs/navigation.md', title: 'Navigation & Deep Links',
    target: 'Pages/routes, navigation graph and deep links, generated from facts (routes, testIDs).',
    scopes: ['project'],
    probe_paths: ['**/AndroidManifest.xml', '**/nav_graph*.xml', '**/navigation/*.xml', '**/Info.plist', '**/*.entitlements', '**/router_map.json', '**/main_pages.json', '**/route_map.json'],
    evidence: ['facts', 'code'], requirement_oriented: false, constitution_exception: false,
  },
  {
    id: 'api-contracts', output_path: 'docs/contracts.md', title: 'API Contracts',
    target: 'HTTP/RPC contracts consumed or exposed: endpoints, payload schemas, error codes, shared models.',
    scopes: ['repo', 'project'],
    probe_paths: ['**/*Api.kt', '**/*Api.swift', '**/*Api.ets', '**/*Service.kt', '**/*Client.swift', '**/openapi*.y*ml', '**/swagger*.json', '**/*.proto', '**/*.graphql'],
    evidence: ['code', 'facts', 'spec'], requirement_oriented: false, constitution_exception: false,
  },
  {
    id: 'testing', output_path: 'docs/testing.md', title: 'Testing Conventions',
    target: 'Test layout, frameworks, testID conventions, fixtures and how to run each suite.',
    scopes: ['repo', 'project'],
    probe_paths: ['**/src/test/**', '**/src/androidTest/**', '**/*Tests/**', '**/*UITests/**', '**/ohosTest/**', '**/test/**/*.test.*'],
    evidence: ['code', 'facts', 'config'], requirement_oriented: false, constitution_exception: false,
  },
  {
    id: 'product-specs', output_path: 'docs/product-specs.md', title: 'Product Specs Index',
    target: 'Index of product specs with status (Draft/Implemented/Verified/Archived) and links; never copies spec bodies.',
    scopes: ['repo', 'project'], probe_paths: ['specs/**/spec.md', 'specs/*.md', '.kiro/specs/**', 'openspec/**'],
    evidence: ['spec'], requirement_oriented: true, constitution_exception: false,
  },
  {
    id: 'features', output_path: 'docs/features.md', title: 'Feature Catalog',
    target: 'User-facing features: entry pages, flows, platforms that implement each one, related specs.',
    scopes: ['repo', 'project'], probe_paths: ['specs/**/spec.md', '**/router_map.json', '**/AndroidManifest.xml', '**/main_pages.json', '**/*Screen.kt', '**/*View.swift'],
    evidence: ['facts', 'code', 'spec'], requirement_oriented: true, constitution_exception: false,
  },
  {
    id: 'requirements', output_path: 'docs/requirements.md', title: 'Requirement Patterns',
    target: 'Recurring business rules and requirement patterns (limits, validation, permissions), verified against code.',
    scopes: ['repo', 'project'], probe_paths: ['specs/**/spec.md', '**/requirements*.md'],
    evidence: ['spec', 'code'], requirement_oriented: true, constitution_exception: false,
  },
  {
    id: 'constitution', output_path: 'docs/constitution.md', title: 'Constitution',
    target: 'Fixed rules that every change must follow (layering, forbidden APIs, security), each with evidence.',
    scopes: ['repo', 'project'], probe_paths: ['.specify/memory/constitution.md', 'AGENTS.md', 'CLAUDE.md', '**/lint.xml', '**/detekt*.yml', '.swiftlint.yml'],
    evidence: ['config', 'code', 'spec'], requirement_oriented: false, constitution_exception: true,
  },
  {
    id: 'service-topology', output_path: 'docs/service-topology.md', title: 'Service Topology',
    target: 'Backend services, their dependencies, data stores and how mobile clients reach them.',
    scopes: ['repo', 'project'],
    probe_paths: ['docker-compose*.y*ml', '**/docker-compose*.y*ml', '**/Dockerfile', 'k8s/**', 'helm/**', '**/*.tf'],
    evidence: ['config', 'code'], requirement_oriented: false, constitution_exception: false, requires_backend: true,
  },
];

export function getDimension(schema: Dimension[], id: string): Dimension | undefined {
  return schema.find((d) => d.id === id);
}

/** Overrides by id (e.g. from .codewiki/schema.yaml); unknown ids are appended as custom dimensions. */
export function mergeSchema(base: Dimension[], overrides: (Partial<Dimension> & { id: string })[]): Dimension[] {
  const out = base.map((d) => ({ ...d }));
  for (const o of overrides) {
    const i = out.findIndex((d) => d.id === o.id);
    if (i >= 0) out[i] = { ...out[i]!, ...o };
    else if (o.output_path) {
      out.push({
        title: o.id, target: '', scopes: ['repo', 'project'], probe_paths: [], evidence: ['code'],
        requirement_oriented: false, constitution_exception: false, output_path: o.output_path, ...o,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// globs (own copy: ** / * / ? / {a,b})

const globCache = new Map<string, RegExp>();
export function globToRegExp(pat: string): RegExp {
  const hit = globCache.get(pat);
  if (hit) return hit;
  let b = '^';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i]!;
    if (c === '*') {
      if (pat[i + 1] === '*') {
        i++;
        if (pat[i + 1] === '/') { i++; b += '(?:.*/)?'; } else b += '.*';
      } else b += '[^/]*';
    } else if (c === '?') b += '[^/]';
    else if (c === '{') {
      const j = pat.indexOf('}', i);
      if (j < 0) { b += '\\{'; continue; }
      b += '(?:' + pat.slice(i + 1, j).split(',').map((x) => x.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|') + ')';
      i = j;
    } else b += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  const re = new RegExp(b + '$');
  globCache.set(pat, re);
  return re;
}

export function matchGlob(pat: string, p: string): boolean {
  return globToRegExp(pat).test(p);
}

// ---------------------------------------------------------------------------
// activation

export interface ActivationInput {
  scope: ScopeKind;
  /** '' for the repository */
  ownerRoot: string;
  /** repo-relative docs root of the scope */
  docsRoot: string;
  /** files under the owner root, owner-root-relative (caller filters ignored dirs / nested projects) */
  files: string[];
  /** repo-relative existence check (existing output activates) */
  exists: (repoPath: string) => boolean;
  /** --dimension force list */
  force?: string[];
  /** user-disabled dimensions (always win) */
  disable?: string[];
  /** backend present in the scope (see detectBackend) */
  hasBackend?: boolean;
  /** entries produced this run per dimension id */
  produced?: Record<string, number>;
}

export interface DimensionActivation {
  id: string;
  /** repo-relative output file */
  output: string;
  active: boolean;
  reasons: string[];
  /** why inactive */
  inactive?: string;
}

/** Repo-relative output path of a dimension in a scope. */
export function dimensionOutput(d: Dimension, ownerRoot: string, docsRoot: string): string {
  const rel = normalizeRepoPath(d.output_path);
  if (rel.startsWith('docs/')) return joinPath(docsRoot, rel.slice(5));
  return joinPath(ownerRoot, rel);
}

const BACKEND_PROBES = ['**/go.mod', '**/pom.xml', '**/Dockerfile', 'docker-compose*.y*ml', '**/docker-compose*.y*ml', 'k8s/**', 'helm/**', 'services/**', '**/server/**/*.{go,java,kt,ts,py}', '**/*.tf'];

/** True when the scope contains backend service evidence (server build files, containers, IaC). */
export function detectBackend(files: string[]): boolean {
  return files.some((f) => BACKEND_PROBES.some((p) => matchGlob(p, f)));
}

export function activateDimensions(schema: Dimension[], input: ActivationInput): DimensionActivation[] {
  const force = new Set(input.force ?? []);
  const disable = new Set(input.disable ?? []);
  const out: DimensionActivation[] = [];
  for (const d of schema) {
    const output = dimensionOutput(d, input.ownerRoot, input.docsRoot);
    const reasons: string[] = [];
    if (disable.has(d.id)) { out.push({ id: d.id, output, active: false, reasons, inactive: 'disabled by user' }); continue; }
    if (!d.scopes.includes(input.scope)) { out.push({ id: d.id, output, active: false, reasons, inactive: `not a ${input.scope} dimension` }); continue; }
    if (force.has(d.id)) reasons.push('force');
    if (input.exists(output)) reasons.push('existing-output');
    if (d.requires_backend && !input.hasBackend && !reasons.length) {
      out.push({ id: d.id, output, active: false, reasons, inactive: 'no backend in scope' });
      continue;
    }
    const probe = d.probe_paths.find((p) => input.files.some((f) => matchGlob(p, f)));
    if (probe) reasons.push(`probe:${probe}`);
    if ((input.produced?.[d.id] ?? 0) > 0) reasons.push('produced-entries');
    out.push({ id: d.id, output, active: reasons.length > 0, reasons, ...(reasons.length ? {} : { inactive: 'no probe hit, no existing output, not forced' }) });
  }
  return out;
}

export type DimensionWrite = { id: string; output: string; action: 'merge' | 'leave' | 'skip-null'; entries: number };

/**
 * Null-value passthrough: an active dimension with no entries never creates a
 * file, heading or TODO; an existing file is left untouched.
 */
export function planDimensionWrites(acts: DimensionActivation[], entriesByDim: Record<string, number>): DimensionWrite[] {
  return acts
    .filter((a) => a.active)
    .map((a) => {
      const n = entriesByDim[a.id] ?? 0;
      if (n > 0) return { id: a.id, output: a.output, action: 'merge' as const, entries: n };
      return { id: a.id, output: a.output, action: a.reasons.includes('existing-output') ? ('leave' as const) : ('skip-null' as const), entries: 0 };
    });
}

// ---------------------------------------------------------------------------
// extra-schema registration (.kb/docs-schema-extra.yaml)

export const ExtraSchemaFile = '.kb/docs-schema-extra.yaml';

export interface ExtraEntry {
  /** owner root ('.' for the repository) */
  target_root: string;
  /** relative to target_root */
  output_path: string;
  target: string;
  /** false = file is frozen: never read for merge, never written (byte-for-byte untouched) */
  enabled: boolean;
}

export interface DocsScopeRef {
  scope: ScopeKind;
  ownerRoot: string;
  docsRoot: string;
}

/** First heading, else the first paragraph line (markdown stripped, ≤120 chars). */
export function inferTarget(text: string): string {
  const lines = splitLines(text);
  const fm = findFrontmatter(lines);
  let fence = false;
  let para: string | null = null;
  for (let i = fm ? fm.end + 1 : 0; i < lines.length; i++) {
    const t = lines[i]!.text.replace(/^﻿/, '');
    if (/^ {0,3}(`{3,}|~{3,})/.test(t)) { fence = !fence; continue; }
    if (fence || !t.trim()) continue;
    const h = parseHeadingLine(t);
    if (h && h.text) return h.text.slice(0, 120);
    if (para === null && !/^<!--/.test(t.trim())) para = t.trim();
  }
  if (!para) return '';
  const plain = para.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`>#]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > 120 ? plain.slice(0, 117) + '...' : plain;
}

/** Deepest docs root containing the file. */
function docsScopeOf(scopes: DocsScopeRef[], p: string): DocsScopeRef | null {
  let best: DocsScopeRef | null = null;
  for (const s of scopes) if (isUnder(p, s.docsRoot) && (!best || s.docsRoot.length > best.docsRoot.length)) best = s;
  return best;
}

function ownerRel(ownerRoot: string, p: string): string {
  const r = normalizeRepoPath(ownerRoot);
  return r === '' ? p : p.slice(r.length + 1);
}

/**
 * Custom .md files under docs roots that no schema dimension covers.
 * Knowledge-layer files (adr/**, tech-debt.md) are excluded; pointer files
 * (AGENTS.md…) under a docs root are ordinary human docs and are included.
 */
export function discoverExtraDocs(
  schema: Dimension[],
  scopes: DocsScopeRef[],
  mdFiles: string[],
  read: (p: string) => string | null,
): ExtraEntry[] {
  const docsRoots = scopes.map((s) => s.docsRoot);
  const out: ExtraEntry[] = [];
  for (const raw of [...mdFiles].map(normalizeRepoPath).sort()) {
    if (!/\.md$/i.test(raw)) continue;
    const s = docsScopeOf(scopes, raw);
    if (!s) continue;
    if (isKnowledgeLayerFile(raw, docsRoots)) continue;
    const covered = schema.some((d) => d.scopes.includes(s.scope) && dimensionOutput(d, s.ownerRoot, s.docsRoot) === raw);
    if (covered) continue;
    const text = read(raw);
    out.push({ target_root: s.ownerRoot === '' ? '.' : s.ownerRoot, output_path: ownerRel(s.ownerRoot, raw), target: text ? inferTarget(text) : '', enabled: true });
  }
  return out;
}

export function parseExtraSchema(text: string | null): ExtraEntry[] {
  if (!text) return [];
  let v: unknown;
  try { v = YAML.parse(text); } catch { return []; }
  const arr = (v && typeof v === 'object' && Array.isArray((v as { entries?: unknown }).entries)) ? (v as { entries: unknown[] }).entries : [];
  const out: ExtraEntry[] = [];
  for (const e of arr) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    if (typeof o['output_path'] !== 'string') continue;
    out.push({
      target_root: typeof o['target_root'] === 'string' ? normalizeRepoPath(o['target_root']) || '.' : '.',
      output_path: normalizeRepoPath(o['output_path']),
      target: typeof o['target'] === 'string' ? o['target'] : '',
      enabled: o['enabled'] !== false, // missing → enabled; only an explicit false freezes
    });
  }
  return out;
}

export function extraEntryPath(e: ExtraEntry): string {
  return joinPath(e.target_root === '.' ? '' : e.target_root, e.output_path);
}

/**
 * Adds newly discovered entries to the extra-schema YAML. Existing entries
 * (including user edits, comments and `enabled: false`) are never changed;
 * only an empty `target` is filled in.
 */
export function updateExtraSchema(existing: string | null, discovered: ExtraEntry[]): { text: string; added: ExtraEntry[]; changed: boolean } {
  const doc = existing && existing.trim() ? YAML.parseDocument(existing) : YAML.parseDocument('version: 1\nentries: []\n');
  if (!doc.has('entries') || !YAML.isSeq(doc.get('entries'))) doc.set('entries', doc.createNode([]));
  const seq = doc.get('entries') as YAML.YAMLSeq;
  if (seq.items.length === 0) seq.flow = false;
  const have = new Map<string, YAML.YAMLMap>();
  for (const it of seq.items) {
    if (!YAML.isMap(it)) continue;
    const op = it.get('output_path');
    if (typeof op !== 'string') continue;
    const tr = it.get('target_root');
    have.set(extraEntryPath({ target_root: typeof tr === 'string' ? normalizeRepoPath(tr) || '.' : '.', output_path: normalizeRepoPath(op), target: '', enabled: true }), it);
  }
  const added: ExtraEntry[] = [];
  let changed = false;
  for (const e of discovered) {
    const key = extraEntryPath(e);
    const cur = have.get(key);
    if (cur) {
      const t = cur.get('target');
      if ((t === undefined || t === null || t === '') && e.target) { cur.set('target', e.target); changed = true; }
      continue;
    }
    const node = doc.createNode({ target_root: e.target_root, output_path: e.output_path, target: e.target, enabled: e.enabled });
    seq.add(node);
    have.set(key, node as YAML.YAMLMap);
    added.push(e);
    changed = true;
  }
  return { text: changed || !existing ? doc.toString() : existing, added, changed: changed || !existing };
}

export type DocTarget =
  | { kind: 'schema'; dimension: Dimension }
  | { kind: 'extra'; entry: ExtraEntry }
  | { kind: 'knowledge-layer' }
  | null;

/** What governs a repo-relative docs file. Extra entries with enabled=false must not be touched. */
export function resolveDocTarget(path: string, schema: Dimension[], scopes: DocsScopeRef[], extra: ExtraEntry[]): DocTarget {
  const p = normalizeRepoPath(path);
  const s = docsScopeOf(scopes, p);
  if (!s) return null;
  if (isKnowledgeLayerFile(p, scopes.map((x) => x.docsRoot))) return { kind: 'knowledge-layer' };
  const d = schema.find((x) => x.scopes.includes(s.scope) && dimensionOutput(x, s.ownerRoot, s.docsRoot) === p);
  if (d) return { kind: 'schema', dimension: d };
  const e = extra.find((x) => extraEntryPath(x) === p);
  return e ? { kind: 'extra', entry: e } : null;
}

/** True when kb must leave the file byte-for-byte untouched (frozen extra entry or unknown file). */
export function isFrozenDoc(path: string, schema: Dimension[], scopes: DocsScopeRef[], extra: ExtraEntry[]): boolean {
  const t = resolveDocTarget(path, schema, scopes, extra);
  if (!t) return true;
  return t.kind === 'extra' && !t.entry.enabled;
}
