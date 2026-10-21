package cli

import (
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/luckylucky0001/codewiki/internal/config"
	"github.com/luckylucky0001/codewiki/internal/scan"
)

func init() {
	register(&command{name: "bench", usage: "[--synthetic N] [--keep dir] | --root <repo> [--config f]", summary: "measure cold vs warm (cached) scan time on a synthetic or real repo",
		help: `--synthetic N generates N source files (Kotlin/Swift/ArkTS, 1/3 each) in a temp dir.
Without --synthetic the repo given by --root/--config is measured; the cache is kept in a
temp dir, so nothing is written to the repo. Reports: cold (no cache), warm (cache loaded
from disk, nothing changed) and warm after touching 1% of the files.`,
		flags: func(fs *flag.FlagSet) {
			fs.Int("synthetic", 0, "generate a synthetic repo with N files")
			fs.String("keep", "", "write the synthetic repo here instead of a temp dir")
			fs.Int("workers", 0, "parser goroutines (0 = GOMAXPROCS)")
		},
		run: cmdBench})
}

type benchRun struct {
	Name       string `json:"name"`
	DurationMs int64  `json:"duration_ms"`
	Parsed     int    `json:"parsed"`
	CacheHits  int    `json:"cache_hits"`
}

func cmdBench(a *app, fs *flag.FlagSet, _ []string) int {
	n := intFlag(fs, "synthetic")
	var cfg *config.Config
	if n > 0 {
		dir := strFlag(fs, "keep")
		if dir == "" {
			d, err := os.MkdirTemp("", "kb-bench-")
			if err != nil {
				return a.fail(ExitInternal, err)
			}
			defer os.RemoveAll(d)
			dir = d
		}
		if err := genSynthetic(dir, n); err != nil {
			return a.fail(ExitInternal, err)
		}
		cfg = config.Default()
		cfg.Root = dir
		cfg.Platforms = []config.Platform{{Name: "android", Root: "android"}, {Name: "ios", Root: "ios"}, {Name: "harmony", Root: "harmony"}}
	} else {
		c, code := a.cfgOrFail()
		if c == nil {
			return code
		}
		cfg = c
	}
	tmp, err := os.MkdirTemp("", "kb-bench-cache-")
	if err != nil {
		return a.fail(ExitInternal, err)
	}
	defer os.RemoveAll(tmp)
	cachePath := filepath.Join(tmp, "scan.gob.gz")
	opt := scan.Options{Workers: intFlag(fs, "workers")}
	var runs []benchRun
	measure := func(name string, c *scan.Cache) (*scan.Result, error) {
		t0 := time.Now()
		if c == nil && name != "cold-nocache" {
			c = scan.LoadCache(cachePath)
		}
		o := opt
		o.Cache = c
		res, err := scan.ScanWith(cfg, cfg.Root, o)
		if err != nil {
			return nil, err
		}
		if c != nil {
			if err := c.Save(cachePath); err != nil {
				return nil, err
			}
		}
		runs = append(runs, benchRun{Name: name, DurationMs: time.Since(t0).Milliseconds(), Parsed: res.Stats.Parsed, CacheHits: res.Stats.CacheHits})
		return res, nil
	}
	cold, err := measure("cold", scan.NewCache()) // parse everything, populate cache
	if err != nil {
		return a.fail(ExitInternal, err)
	}
	if _, err := measure("warm", nil); err != nil {
		return a.fail(ExitInternal, err)
	}
	if n > 0 {
		// touch 1% of files (append a comment-free statement change)
		touched := 0
		for f := range cold.Graph.Files {
			if touched >= max(1, len(cold.Graph.Files)/100) {
				break
			}
			p := filepath.Join(cfg.Root, filepath.FromSlash(f))
			b, _ := os.ReadFile(p)
			_ = os.WriteFile(p, append(b, []byte("\n// touched\n")...), 0o644)
			touched++
		}
		if _, err := measure("warm-1pct-changed", nil); err != nil {
			return a.fail(ExitInternal, err)
		}
	}
	st, _ := os.Stat(cachePath)
	var cacheBytes int64
	if st != nil {
		cacheBytes = st.Size()
	}
	out := map[string]any{"ok": true, "root": cfg.Root, "files": len(cold.Graph.Files), "symbols": len(cold.Graph.Symbols),
		"parse_failures": len(cold.Graph.ParseFailures), "workers": cold.Stats.Workers, "cpus": runtime.NumCPU(), "cache_bytes": cacheBytes, "runs": runs}
	a.emit(out, func(w io.Writer) {
		fmt.Fprintf(w, "%s: %d files, %d symbols, %d parse failures, %d workers, cache %.1f MiB\n", cfg.Root, len(cold.Graph.Files), len(cold.Graph.Symbols), len(cold.Graph.ParseFailures), cold.Stats.Workers, float64(cacheBytes)/(1<<20))
		for _, r := range runs {
			fmt.Fprintf(w, "  %-18s %7d ms  parsed=%d cache_hits=%d\n", r.Name, r.DurationMs, r.Parsed, r.CacheHits)
		}
	})
	return ExitOK
}

func genSynthetic(dir string, n int) error {
	for i := 0; i < n; i++ {
		var rel, src string
		mod := i / 50
		switch i % 3 {
		case 0:
			rel = fmt.Sprintf("android/app/src/main/java/com/bench/m%d/Feature%d.kt", mod, i)
			src = fmt.Sprintf(`package com.bench.m%[1]d

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag

/** Generated feature %[2]d. */
class Feature%[2]dViewModel {
    val items = mutableListOf<String>()

    fun add(sku: String): Boolean {
        if (items.size >= LIMIT_%[2]d) return false
        items.add(sku)
        return true
    }

    fun total(): Int = items.size

    companion object {
        const val LIMIT_%[2]d = %[2]d
    }
}

@Composable
fun Feature%[2]dScreen(vm: Feature%[2]dViewModel) {
    Text("total ${vm.total()}", modifier = Modifier.testTag("feature_%[2]d_total"))
    Button(onClick = { vm.add("x") }, modifier = Modifier.testTag("feature_%[2]d_add")) { Text("Add") }
}
`, mod, i)
		case 1:
			rel = fmt.Sprintf("ios/Bench/M%d/Feature%dView.swift", mod, i)
			src = fmt.Sprintf(`import SwiftUI

final class Feature%[1]dViewModel: ObservableObject {
    static let limit = %[1]d
    @Published var items: [String] = []

    func add(sku: String) -> Bool {
        guard items.count < Feature%[1]dViewModel.limit else { return false }
        items.append(sku)
        return true
    }

    func total() -> Int { items.count }
}

struct Feature%[1]dView: View {
    @StateObject private var vm = Feature%[1]dViewModel()

    var body: some View {
        VStack {
            Text("total \(vm.total())").accessibilityIdentifier("feature_%[1]d_total")
            Button("Add") { _ = vm.add(sku: "x") }.accessibilityIdentifier("feature_%[1]d_add")
        }
    }
}
`, i)
		default:
			rel = fmt.Sprintf("harmony/entry/src/main/ets/m%d/Feature%dPage.ets", mod, i)
			src = fmt.Sprintf(`export const LIMIT_%[1]d: number = %[1]d;

export class Feature%[1]dStore {
  static items: string[] = [];

  static add(sku: string): boolean {
    if (Feature%[1]dStore.items.length >= LIMIT_%[1]d) {
      return false;
    }
    Feature%[1]dStore.items.push(sku);
    return true;
  }
}

@Component
export struct Feature%[1]dPage {
  @State total: number = 0;

  build() {
    Column() {
      Text('total ' + this.total).id('feature_%[1]d_total')
      Button('Add').id('feature_%[1]d_add').onClick(() => { Feature%[1]dStore.add('x'); })
    }
  }
}
`, i)
		}
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(p, []byte(src), 0o644); err != nil {
			return err
		}
	}
	return nil
}
