// kb bench: cold vs warm (cached) scan on a synthetic or real repo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Config } from '../config/config.js';
import { defaultConfig } from '../config/config.js';
import { ScanCache, scan } from '../scan/scan.js';

export function genSynthetic(dir: string, n: number): void {
  for (let i = 0; i < n; i++) {
    const mod = Math.floor(i / 50);
    let rel: string, src: string;
    switch (i % 3) {
      case 0:
        rel = `android/app/src/main/java/com/bench/m${mod}/Feature${i}.kt`;
        src = `package com.bench.m${mod}

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag

/** Generated feature ${i}. */
class Feature${i}ViewModel {
    val items = mutableListOf<String>()

    fun add(sku: String): Boolean {
        if (items.size >= LIMIT_${i}) return false
        items.add(sku)
        return true
    }

    fun total(): Int = items.size

    companion object {
        const val LIMIT_${i} = ${i}
    }
}

@Composable
fun Feature${i}Screen(vm: Feature${i}ViewModel) {
    Text("total \${vm.total()}", modifier = Modifier.testTag("feature_${i}_total"))
    Button(onClick = { vm.add("x") }, modifier = Modifier.testTag("feature_${i}_add")) { Text("Add") }
}
`;
        break;
      case 1:
        rel = `ios/Bench/M${mod}/Feature${i}View.swift`;
        src = `import SwiftUI

final class Feature${i}ViewModel: ObservableObject {
    static let limit = ${i}
    @Published var items: [String] = []

    func add(sku: String) -> Bool {
        guard items.count < Feature${i}ViewModel.limit else { return false }
        items.append(sku)
        return true
    }

    func total() -> Int { items.count }
}

struct Feature${i}View: View {
    @StateObject private var vm = Feature${i}ViewModel()

    var body: some View {
        VStack {
            Text("total \\(vm.total())").accessibilityIdentifier("feature_${i}_total")
            Button("Add") { _ = vm.add(sku: "x") }.accessibilityIdentifier("feature_${i}_add")
        }
    }
}
`;
        break;
      default:
        rel = `harmony/entry/src/main/ets/m${mod}/Feature${i}Page.ets`;
        src = `export const LIMIT_${i}: number = ${i};

export class Feature${i}Store {
  static items: string[] = [];

  static add(sku: string): boolean {
    if (Feature${i}Store.items.length >= LIMIT_${i}) {
      return false;
    }
    Feature${i}Store.items.push(sku);
    return true;
  }
}

@Component
export struct Feature${i}Page {
  @State total: number = 0;

  build() {
    Column() {
      Text('total ' + this.total).id('feature_${i}_total')
      Button('Add').id('feature_${i}_add').onClick(() => { Feature${i}Store.add('x'); })
    }
  }
}
`;
    }
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, src);
  }
}

export interface BenchRun {
  name: string;
  duration_ms: number;
  parsed: number;
  cache_hits: number;
}

export async function runBench(base: Config | null, synthetic: number, keep: string, workers: number) {
  let cfg: Config;
  let cleanup = '';
  if (synthetic > 0) {
    let dir = keep;
    if (!dir) dir = cleanup = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-bench-'));
    genSynthetic(dir, synthetic);
    cfg = defaultConfig();
    cfg.root = fs.realpathSync(dir);
    cfg.platforms = [{ name: 'android', root: 'android' }, { name: 'ios', root: 'ios' }, { name: 'harmony', root: 'harmony' }];
  } else cfg = base!;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-bench-cache-'));
  const cachePath = path.join(tmp, 'scan.json.gz');
  const runs: BenchRun[] = [];
  try {
    const measure = async (name: string, c: ScanCache | null) => {
      const t0 = Date.now();
      const cache = c ?? ScanCache.load(cachePath);
      const res = await scan(cfg, cfg.root, { cache, workers });
      cache.save(cachePath);
      runs.push({ name, duration_ms: Date.now() - t0, parsed: res.stats.parsed, cache_hits: res.stats.cache_hits });
      return res;
    };
    const cold = await measure('cold', new ScanCache());
    await measure('warm', null);
    if (synthetic > 0) {
      const files = Object.keys(cold.graph.files);
      const k = Math.max(1, Math.floor(files.length / 100));
      for (const f of files.slice(0, k)) fs.appendFileSync(path.join(cfg.root, f), '\n// touched\n');
      await measure('warm-1pct-changed', null);
    }
    let cacheBytes = 0;
    try {
      cacheBytes = fs.statSync(cachePath).size;
    } catch {
      cacheBytes = 0;
    }
    return { cache_bytes: cacheBytes, cpus: os.availableParallelism(), files: Object.keys(cold.graph.files).length, ok: true, parse_failures: cold.graph.parse_failures.length, root: cfg.root, runs, symbols: cold.graph.symbols.length, workers: cold.stats.workers };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (cleanup) fs.rmSync(cleanup, { recursive: true, force: true });
  }
}
