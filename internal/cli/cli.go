// Package cli implements the agent-friendly `kb` command line.
//
// Conventions: every command supports --json; data goes to stdout, logs to
// stderr; exit codes 0 ok, 1 stale/verify-failed, 2 usage, 3 internal error;
// commands that write support --dry-run; nothing is interactive; reruns are
// idempotent.
package cli

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
)

// Exit codes.
const (
	ExitOK       = 0
	ExitStale    = 1
	ExitUsage    = 2
	ExitInternal = 3
)

// Version is set at build time (-ldflags "-X .../cli.Version=...").
var Version = "0.1.0"

type app struct {
	stdout, stderr io.Writer
	json           bool
	root           string
	config         string
	wikiDir        string
	quiet          bool
}

type command struct {
	name    string
	usage   string
	summary string
	help    string
	run     func(a *app, fs *flag.FlagSet, args []string) int
	flags   func(fs *flag.FlagSet)
}

var commands []*command

func register(c *command) { commands = append(commands, c) }

type usageError struct{ msg string }

func (u usageError) Error() string { return u.msg }

// Run executes the CLI and returns the exit code.
func Run(args []string, stdout, stderr io.Writer) int {
	a := &app{stdout: stdout, stderr: stderr}
	if len(args) == 0 {
		a.mainUsage()
		return ExitUsage
	}
	// allow global flags before the command name: kb --root x verify
	var pre []string
	for len(args) > 0 && strings.HasPrefix(args[0], "-") && args[0] != "-h" && args[0] != "--help" && args[0] != "--version" {
		f := strings.TrimLeft(args[0], "-")
		pre = append(pre, args[0])
		args = args[1:]
		if (f == "root" || f == "config" || f == "wiki-dir") && len(args) > 0 {
			pre = append(pre, args[0])
			args = args[1:]
		}
	}
	if len(args) == 0 {
		a.mainUsage()
		return ExitUsage
	}
	args = append(append([]string{args[0]}, pre...), args[1:]...)
	name := args[0]
	if name == "-h" || name == "--help" || name == "help" {
		if len(args) > 1 {
			if c := find(args[1]); c != nil {
				a.cmdUsage(c, nil)
				return ExitOK
			}
		}
		a.mainUsage()
		return ExitOK
	}
	if name == "version" || name == "--version" {
		fmt.Fprintln(stdout, "kb", Version)
		return ExitOK
	}
	c := find(name)
	if c == nil {
		fmt.Fprintf(stderr, "kb: unknown command %q (run `kb --help`)\n", name)
		return ExitUsage
	}
	fs := flag.NewFlagSet("kb "+c.name, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	fs.BoolVar(&a.json, "json", false, "machine-readable JSON on stdout")
	fs.StringVar(&a.root, "root", ".", "repository root")
	fs.StringVar(&a.config, "config", "", "path to codewiki.yaml (default <root>/codewiki.yaml)")
	fs.StringVar(&a.wikiDir, "wiki-dir", "", "override wiki_dir (absolute, or relative to --root); e.g. a wiki kept outside the checkout")
	fs.BoolVar(&a.quiet, "quiet", false, "suppress logs on stderr")
	if c.flags != nil {
		c.flags(fs)
	}
	pos, err := parseInterspersed(fs, args[1:])
	if err != nil {
		if errors.Is(err, flag.ErrHelp) {
			a.cmdUsage(c, fs)
			return ExitOK
		}
		fmt.Fprintf(stderr, "kb %s: %v\n", c.name, err)
		a.cmdUsage(c, fs)
		return ExitUsage
	}
	if a.quiet {
		a.stderr = io.Discard
	}
	defer func() {
		if r := recover(); r != nil {
			fmt.Fprintf(stderr, "kb %s: internal error: %v\n", c.name, r)
			os.Exit(ExitInternal)
		}
	}()
	return c.run(a, fs, pos)
}

func find(name string) *command {
	for _, c := range commands {
		if c.name == name {
			return c
		}
	}
	return nil
}

// parseInterspersed allows flags after positional arguments.
func parseInterspersed(fs *flag.FlagSet, args []string) ([]string, error) {
	var flags, pos []string
	for i := 0; i < len(args); i++ {
		a := args[i]
		if a == "--" {
			pos = append(pos, args[i+1:]...)
			break
		}
		if strings.HasPrefix(a, "-") && len(a) > 1 {
			flags = append(flags, a)
			name := strings.TrimLeft(a, "-")
			if strings.Contains(name, "=") {
				continue
			}
			f := fs.Lookup(name)
			if f == nil {
				if name == "h" || name == "help" {
					return nil, flag.ErrHelp
				}
				return nil, fmt.Errorf("unknown flag -%s", name)
			}
			if bf, ok := f.Value.(interface{ IsBoolFlag() bool }); ok && bf.IsBoolFlag() {
				continue
			}
			if i+1 < len(args) {
				flags = append(flags, args[i+1])
				i++
			}
			continue
		}
		pos = append(pos, a)
	}
	if err := fs.Parse(flags); err != nil {
		return nil, err
	}
	return pos, nil
}

func (a *app) mainUsage() {
	w := a.stdout
	fmt.Fprintf(w, `kb — compound mobile monorepo code (Android/iOS/HarmonyOS) + legacy docs into a code-anchored LLM Wiki.

Usage: kb <command> [flags] [args]

Commands:
`)
	sorted := append([]*command{}, commands...)
	sort.SliceStable(sorted, func(i, j int) bool { return false })
	for _, c := range sorted {
		fmt.Fprintf(w, "  %-14s %s\n", c.name, c.summary)
	}
	fmt.Fprintf(w, `
Global flags (every command): --json  --root <dir>  --config <file>  --wiki-dir <dir>  --quiet

Conventions: data → stdout, logs → stderr; exit 0 ok, 1 stale/verify failed,
2 usage error, 3 internal error; writers support --dry-run; never interactive.

Typical flow:
  kb init && kb ingest --manifest <(kb discover-docs --json) && kb compound && kb verify
Run "kb help <command>" for details.
`)
}

func (a *app) cmdUsage(c *command, fs *flag.FlagSet) {
	w := a.stdout
	fmt.Fprintf(w, "Usage: kb %s %s\n\n%s\n", c.name, c.usage, c.summary)
	if c.help != "" {
		fmt.Fprintf(w, "\n%s\n", strings.TrimSpace(c.help))
	}
	if fs == nil {
		fs = flag.NewFlagSet(c.name, flag.ContinueOnError)
		if c.flags != nil {
			c.flags(fs)
		}
	}
	fmt.Fprintln(w, "\nFlags:")
	global := map[string]bool{"json": true, "root": true, "config": true, "wiki-dir": true, "quiet": true}
	fs.VisitAll(func(f *flag.Flag) {
		if global[f.Name] {
			return
		}
		def := ""
		if f.DefValue != "" && f.DefValue != "false" {
			def = fmt.Sprintf(" (default %q)", f.DefValue)
		}
		fmt.Fprintf(w, "  --%-16s %s%s\n", f.Name, f.Usage, def)
	})
	fmt.Fprintln(w, "  --json / --root / --config / --wiki-dir / --quiet  (global)")
}

func (a *app) logf(format string, args ...any) {
	fmt.Fprintf(a.stderr, format+"\n", args...)
}

// emit writes v as JSON (when --json) or calls human().
func (a *app) emit(v any, human func(w io.Writer)) {
	if a.json {
		enc := json.NewEncoder(a.stdout)
		enc.SetIndent("", "  ")
		enc.SetEscapeHTML(false)
		_ = enc.Encode(v)
		return
	}
	human(a.stdout)
}

func (a *app) fail(code int, err error) int {
	if a.json {
		a.emit(map[string]any{"ok": false, "error": err.Error(), "exit_code": code}, nil)
	}
	fmt.Fprintf(a.stderr, "kb: %v\n", err)
	return code
}
