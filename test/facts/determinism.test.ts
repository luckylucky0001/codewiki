// Facts must not depend on the scan cache state (cold parse, warm cache hits after a save/load,
// worker threads) — a regression here shows up as facts files rewritten by a no-op compound.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectedConfig } from '../../src/config/config.js';
import { scan, ScanCache } from '../../src/scan/scan.js';
import { extractFacts } from '../../src/facts/facts.js';
import { renderFacts } from '../../src/facts/render.js';
import { fingerprint } from '../../src/extract/fingerprint.js';

const repo = path.resolve(__dirname, '../..');

describe('facts are independent of scan cache state', () => {
  it('cold scan, warm (reloaded) cache and worker threads give identical facts files', async () => {
    const cfg = detectedConfig(path.join(repo, 'examples/minishop'));
    const render = (r: Awaited<ReturnType<typeof scan>>) => [...renderFacts(extractFacts(cfg, r), r.graph, cfg.platforms.map((p) => p.name))];
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-det-'));
    try {
      const cachePath = path.join(tmp, 'scan.gz');
      const c1 = new ScanCache();
      const cold = render(await scan(cfg, cfg.root, { cache: c1 }));
      c1.save(cachePath);
      const c2 = ScanCache.load(cachePath);
      const warmRes = await scan(cfg, cfg.root, { cache: c2 });
      expect(warmRes.stats.cache_hits).toBeGreaterThan(0);
      expect(render(warmRes)).toEqual(cold);
      expect(render(await scan(cfg, cfg.root, { workers: 2 }))).toEqual(cold);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000);
  it('the extractor fingerprint covers the facts code', () => {
    // a facts-code change must invalidate facts query caches keyed on the fingerprint
    expect(fingerprint()).toMatch(/^[0-9a-f]{64}$/);
    const src = fs.readFileSync(path.join(repo, 'src/extract/fingerprint.ts'), 'utf8');
    expect(src).toContain("path.join(here, '..', 'facts')");
  });
});
