// Command kb compounds a mobile monorepo (Android / iOS / HarmonyOS) and its
// legacy docs into a code-anchored LLM Wiki. Run `kb --help`.
package main

import (
	"os"

	"github.com/luckylucky0001/codewiki/internal/cli"
)

func main() {
	os.Exit(cli.Run(os.Args[1:], os.Stdout, os.Stderr))
}
