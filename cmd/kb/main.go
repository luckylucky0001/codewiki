// Command kb compounds a mobile monorepo (Android / iOS / HarmonyOS) and its
// legacy docs into a code-anchored LLM Wiki. Run `kb --help`.
package main

import (
	"os"
	"runtime/pprof"
	"strconv"
	"time"

	"github.com/luckylucky0001/codewiki/internal/cli"
)

func main() {
	// KB_CPUPROFILE=/path/cpu.prof writes a CPU profile (go tool pprof) for this run.
	if p := os.Getenv("KB_CPUPROFILE"); p != "" {
		if f, err := os.Create(p); err == nil {
			if pprof.StartCPUProfile(f) == nil {
				// KB_CPUPROFILE_SECS=N stops profiling after N seconds (for runs that are too slow to finish).
				if n, err := strconv.Atoi(os.Getenv("KB_CPUPROFILE_SECS")); err == nil && n > 0 {
					go func() { time.Sleep(time.Duration(n) * time.Second); pprof.StopCPUProfile(); f.Close() }()
				}
				code := cli.Run(os.Args[1:], os.Stdout, os.Stderr)
				pprof.StopCPUProfile()
				f.Close()
				os.Exit(code)
			}
			f.Close()
		}
	}
	os.Exit(cli.Run(os.Args[1:], os.Stdout, os.Stderr))
}
