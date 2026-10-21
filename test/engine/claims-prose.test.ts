// Prose claims: extraction from ordinary README/docs text and deterministic stale-path / count /
// dependency checks (conflicts only on hard evidence).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Checker, checkableProse, extractClaims, proseSource, splitSentences } from '../../src/engine/claims.js';
import { prosePaths } from '../../src/engine/valuecheck.js';
import type { Facts, Graph } from '../../src/model.js';

describe('prose claim extraction', () => {
  it('selects READMEs / agent guides / docs, not specs or plans', () => {
    expect(proseSource('README.md')).toBe(true);
    expect(proseSource('docs/architecture.md')).toBe(true);
    expect(proseSource('AGENTS.md')).toBe(true);
    expect(proseSource('specs/001/spec.md')).toBe(false);
    expect(proseSource('docs/plans/2024-x.md')).toBe(false);
  });
  it('splits sentences and keeps only checkable ones', () => {
    expect(splitSentences('We use Apollo. It is fast. See `x.md`.')).toEqual(['We use Apollo.', 'It is fast.', 'See `x.md`.']);
    expect(checkableProse('This is a friendly app for everyone.')).toBe(false);
    expect(checkableProse('The router lives in Sources/Router/Router.swift.')).toBe(true);
    expect(checkableProse('We make heavy use of Kingfisher')).toBe(true);
  });
  it('joins wrapped paragraphs and prefixes list items with their lead-in', () => {
    const cs = extractClaims('README.md', 'raw/docs/README.md', 'We use view models to\nisolate effects in `Library/ViewModels`.\n\nWe make heavy use of:\n* [Apollo](https://github.com/apollographql/apollo-ios)\n');
    expect(cs.map((c) => c.text)).toEqual(['We use view models to isolate effects in `Library/ViewModels`.', 'We make heavy use of: [Apollo](https://github.com/apollographql/apollo-ios)']);
    expect(cs.every((c) => c.style === 'prose')).toBe(true);
  });
  it('path candidates: own-repo links on a branch, relative links, breadcrumbs; pinned links skipped', () => {
    const ps = prosePaths('[a](https://github.com/o/r/blob/main/app/A.kt) [b](https://github.com/o/r/blob/69e9d862b5/app/B.kt) [c](../x/C.md) `Sources > Data > Services`', 'docs/r.md');
    expect(ps.map((p) => [p.p, p.strong, p.rel ?? '', !!p.breadcrumb])).toEqual([
      ['app/A.kt', true, '', false],
      ['../x/C.md', true, 'docs', false],
      ['Sources/Data/Services', false, '', true],
    ]);
  });
});

describe('prose claim checks', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-prose-'));
  const w = (p: string, s: string) => {
    fs.mkdirSync(path.dirname(path.join(tmp, p)), { recursive: true });
    fs.writeFileSync(path.join(tmp, p), s);
  };
  w('Package.swift', 'let package = Package(name: "x", dependencies: [.package(url: "https://github.com/onevcat/Kingfisher", from: "7.0.0")], targets: [.target(\n name: "A"), .target(\n name: "B"), .testTarget(\n name: "ATests")])\n');
  w('Sources/A/A.swift', 'struct A {}\n');
  w('docs/guide.md', 'x\n');
  const g: Graph = { version: 1, symbols: [], files: {}, parse_failures: [] };
  const f: Facts = { routes: [], testids: [], apis: [] };
  const check = (text: string, source = 'README.md') => {
    const c = extractClaims(source, 'raw/docs/' + source, text + '\n').at(-1);
    expect(c).toBeDefined();
    new Checker(g, f, tmp).check(c!);
    return c!;
  };
  it('stale and existing paths', () => {
    expect(check('Sources live in [Sources/A](Sources/A/A.swift).').status).toBe('verified');
    expect(check('Old code is in [the views](https://github.com/o/r/tree/main/Sources/Old).').status).toBe('conflict');
    expect(check('See [setup](../setup.md) for details.', 'docs/guide.md').status).toBe('conflict');
    expect(check('Copy it to `Sources/Generated/Secrets.swift` before building.').status).not.toBe('conflict');
  });
  it('dependencies: library links and strong phrasing only', () => {
    expect(check('We make heavy use of Kingfisher for images.').status).toBe('verified');
    expect(check('We make heavy use of:\n* [PerimeterX](https://github.com/PerimeterX/px-iOS-Framework)').status).toBe('conflict');
    expect(check('The library relies on Node.js APIs for streams.').status).not.toBe('conflict');
    expect(check('The app uses Combine for state.').status).not.toBe('conflict');
  });
  it('forbidden imports and stale examples', () => {
    expect(check('Never use `java.util.logging` in app code.').status).toBe('verified');
  });
  it('module counts: exact, or within tolerance with a qualifier', () => {
    expect(check('The app is split into 2 modules (Package.swift).').status).toBe('verified');
    expect(check('The app is split into 9 modules (Package.swift).').status).toBe('conflict');
    expect(check('The app is split into about 3 modules (Package.swift).').status).toBe('verified');
  });
});
