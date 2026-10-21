import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  activateDimensions, DefaultSchema, detectBackend, dimensionOutput, discoverExtraDocs, extraEntryPath, inferTarget, isFrozenDoc,
  matchGlob, mergeSchema, parseExtraSchema, planDimensionWrites, resolveDocTarget, updateExtraSchema, type DocsScopeRef,
} from '../../src/docs/schema.js';
import { loadDocsState, parseDocsState, recordScopeScan, resolveScanBase, saveDocsState, serializeDocsState } from '../../src/docs/docsstate.js';

describe('default schema', () => {
  it('has the mobile monorepo dimensions with unique ids and outputs', () => {
    expect(DefaultSchema.map((d) => d.id)).toEqual([
      'architecture', 'design-patterns', 'coding-standards', 'navigation', 'api-contracts', 'testing',
      'product-specs', 'features', 'requirements', 'constitution', 'service-topology',
    ]);
    expect(new Set(DefaultSchema.map((d) => d.output_path)).size).toBe(DefaultSchema.length);
    expect(DefaultSchema.filter((d) => d.requirement_oriented).map((d) => d.id)).toEqual(['product-specs', 'features', 'requirements']);
    expect(DefaultSchema.filter((d) => d.constitution_exception).map((d) => d.id)).toEqual(['constitution']);
    expect(DefaultSchema.find((d) => d.id === 'service-topology')!.requires_backend).toBe(true);
    expect(DefaultSchema.find((d) => d.id === 'navigation')!.scopes).toEqual(['project']);
  });
  it('output paths map docs/ to the scope docs root', () => {
    const arch = DefaultSchema[0]!;
    expect(dimensionOutput(arch, '', 'docs')).toBe('docs/architecture.md');
    expect(dimensionOutput(arch, 'apps/a', 'apps/a/docs')).toBe('apps/a/docs/architecture.md');
    expect(dimensionOutput(arch, '', 'documentation')).toBe('documentation/architecture.md');
    expect(dimensionOutput({ ...arch, output_path: 'ARCH.md' }, 'apps/a', 'apps/a/docs')).toBe('apps/a/ARCH.md');
  });
  it('mergeSchema overrides by id and appends custom dimensions', () => {
    const s = mergeSchema(DefaultSchema, [{ id: 'testing', output_path: 'docs/qa.md' }, { id: 'release', output_path: 'docs/release.md' }, { id: 'nope' }]);
    expect(s.find((d) => d.id === 'testing')!.output_path).toBe('docs/qa.md');
    expect(s.find((d) => d.id === 'release')).toMatchObject({ output_path: 'docs/release.md', requirement_oriented: false });
    expect(s.find((d) => d.id === 'nope')).toBeUndefined();
  });
  it('globs', () => {
    expect(matchGlob('**/AndroidManifest.xml', 'app/src/main/AndroidManifest.xml')).toBe(true);
    expect(matchGlob('**/AndroidManifest.xml', 'AndroidManifest.xml')).toBe(true);
    expect(matchGlob('docker-compose*.y*ml', 'docker-compose.prod.yaml')).toBe(true);
    expect(matchGlob('**/server/**/*.{go,kt}', 'svc/server/a/b.kt')).toBe(true);
    expect(matchGlob('specs/*.md', 'specs/a/b.md')).toBe(false);
  });
});

describe('activation', () => {
  const androidFiles = ['settings.gradle.kts', 'app/build.gradle.kts', 'app/src/main/AndroidManifest.xml', 'app/src/main/java/CartViewModel.kt', 'app/src/test/CartTest.kt'];
  const act = (extra: Partial<Parameters<typeof activateDimensions>[1]> = {}) =>
    activateDimensions(DefaultSchema, { scope: 'project', ownerRoot: 'apps/a', docsRoot: 'apps/a/docs', files: androidFiles, exists: () => false, ...extra });
  it('probes activate; inactive dims say why', () => {
    const a = act();
    const on = a.filter((x) => x.active).map((x) => x.id);
    expect(on).toEqual(['architecture', 'design-patterns', 'navigation', 'testing', 'features']);
    expect(a.find((x) => x.id === 'architecture')!.reasons).toEqual(['probe:settings.gradle.kts']);
    expect(a.find((x) => x.id === 'service-topology')!.inactive).toBe('no backend in scope');
    expect(a.find((x) => x.id === 'constitution')!.inactive).toMatch(/no probe hit/);
  });
  it('existing output, force and produced entries activate; disable wins', () => {
    const a = act({ exists: (p) => p === 'apps/a/docs/constitution.md', force: ['coding-standards'], produced: { 'api-contracts': 2 }, disable: ['testing'] });
    const by = Object.fromEntries(a.map((x) => [x.id, x]));
    expect(by['constitution']!.reasons).toEqual(['existing-output']);
    expect(by['coding-standards']!.reasons).toEqual(['force']);
    expect(by['api-contracts']!.reasons).toEqual(['produced-entries']);
    expect(by['testing']).toMatchObject({ active: false, inactive: 'disabled by user' });
  });
  it('repo scope excludes project-only dimensions', () => {
    const a = activateDimensions(DefaultSchema, { scope: 'repo', ownerRoot: '', docsRoot: 'docs', files: ['apps/a/src/main/AndroidManifest.xml'], exists: () => false });
    expect(a.find((x) => x.id === 'navigation')).toMatchObject({ active: false, inactive: 'not a repo dimension' });
  });
  it('service topology only with a backend (or existing output)', () => {
    const files = ['services/api/go.mod', 'docker-compose.yml'];
    expect(detectBackend(files)).toBe(true);
    expect(detectBackend(androidFiles)).toBe(false);
    const a = activateDimensions(DefaultSchema, { scope: 'repo', ownerRoot: '', docsRoot: 'docs', files, exists: () => false, hasBackend: true });
    expect(a.find((x) => x.id === 'service-topology')!.reasons).toEqual(['probe:docker-compose*.y*ml']);
    const kept = act({ exists: (p) => p === 'apps/a/docs/service-topology.md' });
    expect(kept.find((x) => x.id === 'service-topology')!.active).toBe(true);
  });
  it('null passthrough: active dims without entries never create files', () => {
    const a = act({ exists: (p) => p === 'apps/a/docs/navigation.md' });
    const w = planDimensionWrites(a, { architecture: 3 });
    expect(w).toEqual([
      { id: 'architecture', output: 'apps/a/docs/architecture.md', action: 'merge', entries: 3 },
      { id: 'design-patterns', output: 'apps/a/docs/design-patterns.md', action: 'skip-null', entries: 0 },
      { id: 'navigation', output: 'apps/a/docs/navigation.md', action: 'leave', entries: 0 },
      { id: 'testing', output: 'apps/a/docs/testing.md', action: 'skip-null', entries: 0 },
      { id: 'features', output: 'apps/a/docs/features.md', action: 'skip-null', entries: 0 },
    ]);
  });
});

describe('extra-schema registration', () => {
  const scopes: DocsScopeRef[] = [
    { scope: 'repo', ownerRoot: '', docsRoot: 'docs' },
    { scope: 'project', ownerRoot: 'apps/a', docsRoot: 'apps/a/docs' },
  ];
  const texts: Record<string, string> = {
    'docs/release-process.md': '---\nowner: x\n---\n\n# Release Process\n\nhow we ship\n',
    'docs/notes.md': 'Some **bold** [notes](x.md) about onboarding.\n',
    'apps/a/docs/oncall.md': '```\n# not a heading\n```\n\n## On-call 值班\n',
    'docs/AGENTS.md': '# Agent notes\n',
  };
  const md = ['docs/architecture.md', 'docs/release-process.md', 'docs/notes.md', 'docs/adr/0001-x.md', 'docs/tech-debt.md', 'apps/a/docs/oncall.md', 'apps/a/docs/navigation.md', 'docs/AGENTS.md', 'AGENTS.md', 'apps/a/README.md', 'docs/img.png'];
  const found = discoverExtraDocs(DefaultSchema, scopes, md, (p) => texts[p] ?? null);
  it('finds uncovered .md files under docs roots only', () => {
    expect(found).toEqual([
      { target_root: 'apps/a', output_path: 'docs/oncall.md', target: 'On-call 值班', enabled: true },
      { target_root: '.', output_path: 'docs/AGENTS.md', target: 'Agent notes', enabled: true },
      { target_root: '.', output_path: 'docs/notes.md', target: 'Some bold notes about onboarding.', enabled: true },
      { target_root: '.', output_path: 'docs/release-process.md', target: 'Release Process', enabled: true },
    ]);
  });
  it('inferTarget truncates long paragraphs', () => {
    expect(inferTarget('x'.repeat(200))).toHaveLength(120);
    expect(inferTarget('')).toBe('');
  });
  it('writes YAML, then only adds; user edits, comments and enabled:false survive', () => {
    const first = updateExtraSchema(null, found);
    expect(first.added).toHaveLength(4);
    expect(parseExtraSchema(first.text)).toEqual(found);
    const edited = first.text.replace(/target: Release Process\n {4}enabled: true/, 'target: Release Process\n    enabled: false # frozen by user').replace('version: 1', '# my comment\nversion: 1');
    expect(edited).toContain('enabled: false');
    const again = updateExtraSchema(edited, [...found, { target_root: '.', output_path: 'docs/new.md', target: 'New', enabled: true }]);
    expect(again.added.map(extraEntryPath)).toEqual(['docs/new.md']);
    expect(again.text).toContain('# my comment');
    expect(again.text).toContain('enabled: false # frozen by user');
    const parsed = parseExtraSchema(again.text);
    expect(parsed.find((e) => e.output_path === 'docs/release-process.md')!.enabled).toBe(false);
    const noop = updateExtraSchema(again.text, found);
    expect(noop.changed).toBe(false);
    expect(noop.text).toBe(again.text);
  });
  it('fills an empty target only', () => {
    const y = 'version: 1\nentries:\n  - target_root: .\n    output_path: docs/notes.md\n    target: ""\n    enabled: true\n';
    const r = updateExtraSchema(y, found);
    expect(parseExtraSchema(r.text).find((e) => e.output_path === 'docs/notes.md')!.target).toBe('Some bold notes about onboarding.');
  });
  it('parse is lenient: bad yaml → [], missing enabled → true', () => {
    expect(parseExtraSchema(': : :\n  - [')).toEqual([]);
    expect(parseExtraSchema('entries:\n  - output_path: docs/x.md\n')).toEqual([{ target_root: '.', output_path: 'docs/x.md', target: '', enabled: true }]);
  });
  it('resolveDocTarget / isFrozenDoc', () => {
    const extra = parseExtraSchema('entries:\n  - {target_root: ., output_path: docs/frozen.md, enabled: false}\n  - {target_root: apps/a, output_path: docs/oncall.md, enabled: true}\n');
    expect(resolveDocTarget('docs/architecture.md', DefaultSchema, scopes, extra)).toMatchObject({ kind: 'schema', dimension: { id: 'architecture' } });
    expect(resolveDocTarget('apps/a/docs/navigation.md', DefaultSchema, scopes, extra)).toMatchObject({ kind: 'schema' });
    expect(resolveDocTarget('docs/navigation.md', DefaultSchema, scopes, extra)).toBeNull(); // project-only dimension
    expect(resolveDocTarget('docs/tech-debt.md', DefaultSchema, scopes, extra)).toEqual({ kind: 'knowledge-layer' });
    expect(resolveDocTarget('apps/a/docs/oncall.md', DefaultSchema, scopes, extra)).toMatchObject({ kind: 'extra' });
    expect(isFrozenDoc('docs/frozen.md', DefaultSchema, scopes, extra)).toBe(true);
    expect(isFrozenDoc('apps/a/docs/oncall.md', DefaultSchema, scopes, extra)).toBe(false);
    expect(isFrozenDoc('docs/unregistered.md', DefaultSchema, scopes, extra)).toBe(true);
    expect(isFrozenDoc('AGENTS.md', DefaultSchema, scopes, extra)).toBe(true);
  });
});

describe('docs-state (per-scope incremental base)', () => {
  const managed = [{ path: 'docs/a.md', frontmatter: { last_compound_scan: '2026-09-01', compound_source_commit: 'aaa111' } }];
  it('docs-state wins over frontmatter; falls back otherwise', () => {
    const s = recordScopeScan({}, 'repo', 'bbb222', '2026-10-21');
    expect(resolveScanBase('repo', s, managed)).toEqual({ commit: 'bbb222', date: '2026-10-21', from: 'docs-state' });
    expect(resolveScanBase('shop', s, managed)).toEqual({ commit: 'aaa111', date: '2026-09-01', from: 'frontmatter' });
    expect(resolveScanBase('shop', s, [])).toBeNull();
  });
  it('a no-op run still advances the base via docs-state', () => {
    let s = recordScopeScan({}, 'repo', 'c1', '2026-10-01');
    s = recordScopeScan(s, 'repo', 'c2', '2026-10-21');
    expect(resolveScanBase('repo', s, managed)!.commit).toBe('c2');
  });
  it('parse is defensive and serialization is sorted', () => {
    expect(parseDocsState('nope')).toEqual({});
    expect(parseDocsState('[]')).toEqual({});
    expect(parseDocsState('{"repo":{"last_scan_commit":"zz","last_scan_date":"2026-13-01"},"a":{"last_scan_date":"2026-10-01"}}')).toEqual({ a: { last_scan_date: '2026-10-01' } });
    expect(serializeDocsState({ b: { last_scan_date: '2026-10-01' }, a: { last_scan_commit: 'abcd' } })).toBe('{\n  "a": {\n    "last_scan_commit": "abcd"\n  },\n  "b": {\n    "last_scan_date": "2026-10-01"\n  }\n}\n');
  });
  it('save / load', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-docsstate-'));
    try {
      expect(loadDocsState(dir)).toEqual({});
      const s = recordScopeScan({}, 'repo', 'abc123', '2026-10-21');
      saveDocsState(dir, s);
      expect(loadDocsState(dir)).toEqual(s);
      expect(fs.existsSync(path.join(dir, '.kb', 'docs-state.json'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
