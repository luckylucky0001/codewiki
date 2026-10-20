package cli

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/luckylucky0001/codewiki/internal/config"
	"github.com/luckylucky0001/codewiki/internal/engine"
	"github.com/luckylucky0001/codewiki/internal/facts"
	"github.com/luckylucky0001/codewiki/internal/model"
	"github.com/luckylucky0001/codewiki/internal/scan"
	"github.com/luckylucky0001/codewiki/internal/wiki"
	"github.com/luckylucky0001/codewiki/skills"
)

func (a *app) loadConfig() (*config.Config, error) {
	if a.config != "" {
		dir := filepath.Dir(a.config)
		b, err := os.ReadFile(a.config)
		if err != nil {
			return nil, err
		}
		tmp, err := os.MkdirTemp("", "kbcfg-")
		if err != nil {
			return nil, err
		}
		defer os.RemoveAll(tmp)
		if err := os.WriteFile(filepath.Join(tmp, config.FileName), b, 0o644); err != nil {
			return nil, err
		}
		cfg, err := config.Load(tmp)
		if err != nil {
			return nil, err
		}
		root, _ := filepath.Abs(a.root)
		cfg.Root = root
		if !filepath.IsAbs(cfg.WikiDir) && dir != "" {
			// wiki_dir in an external config is relative to the config file
			absDir, _ := filepath.Abs(dir)
			if a.root == "." {
				cfg.Root = absDir
			}
			if rel, err := filepath.Rel(cfg.Root, filepath.Join(absDir, cfg.WikiDir)); err == nil {
				cfg.WikiDir = rel
			}
		}
		return cfg, nil
	}
	return config.Load(a.root)
}

func (a *app) cfgOrFail() (*config.Config, int) {
	cfg, err := a.loadConfig()
	if err != nil {
		if errors.Is(err, config.ErrNotFound) {
			return nil, a.fail(ExitUsage, err)
		}
		return nil, a.fail(ExitInternal, err)
	}
	return cfg, ExitOK
}

func kbPath() string {
	p, err := os.Executable()
	if err != nil {
		return ""
	}
	return p
}

func init() {
	register(&command{name: "init", usage: "[--dry-run] [--project name]", summary: "create codewiki.yaml, the wiki skeleton and the AGENTS.md schema",
		help: "Detects platform roots (android/, ios/, harmony/, web/) and writes codewiki.yaml if missing. Never overwrites existing files.",
		flags: func(fs *flag.FlagSet) {
			fs.Bool("dry-run", false, "print what would be created")
			fs.String("project", "", "project name stored in codewiki.yaml")
		},
		run: cmdInit})
	register(&command{name: "scan", usage: "[--out graph.json] [--symbols]", summary: "parse sources with tree-sitter; report symbols, facts and parse_failures",
		flags: func(fs *flag.FlagSet) {
			fs.String("out", "", "write the full symbol graph JSON to this file")
			fs.Bool("symbols", false, "include every symbol in the output")
		},
		run: cmdScan})
	register(&command{name: "diff", usage: "[--base <sha>]", summary: "graph diff vs last compound (or --base): unchanged/body/signature/added/deleted/renamed",
		help: "Without --base the baseline is wiki/.kb/graph.json (last successful compound). --base <sha> rescans that revision (works after squash merges).",
		flags: func(fs *flag.FlagSet) {
			fs.String("base", "", "baseline git revision")
		},
		run: cmdDiff})
	register(&command{name: "plan", usage: "[--base <sha>] [--full] [--dry-run]", summary: "compute affected pages + write sets; writes wiki/.kb/plan.json",
		help: "Affected = pages whose anchors changed ∪ pages anchoring callers (k hops, plan.hops) of symbols whose signature changed/deleted/renamed, plus new routes. Falls back to a full rebuild when > rebuild_module_ratio of modules or > rebuild_structural_ratio of symbols changed structurally.",
		flags: func(fs *flag.FlagSet) {
			fs.String("base", "", "baseline git revision")
			fs.Bool("full", false, "force a full rebuild plan")
			fs.Bool("dry-run", false, "do not write wiki/.kb/plan.json")
		},
		run: cmdPlan})
	register(&command{name: "compound", usage: "[--llm template|claude|cmd] [--llm-cmd '...'] [--base sha] [--full] [--dry-run]", summary: "scan→diff→plan→LLM→verify→atomic publish; updates state, update_record, log.md",
		help: `Writers:
  --llm template   offline deterministic writer (CI without keys, reproducible demos)
  --llm claude     run the LLM command (default: llm.cmd in codewiki.yaml, i.e. claude -p ...)
  --llm cmd        same as claude; use --llm-cmd to override the command line
The LLM runs with cwd = staging wiki and the prompt on stdin. Writes outside the
task write set are reverted. The wiki is only replaced if kb verify passes on staging.
Exit 1 when verification fails (nothing is published).`,
		flags: func(fs *flag.FlagSet) {
			fs.String("llm", "template", "writer: template | claude | cmd")
			fs.String("llm-cmd", "", "override the LLM command line (prompt on stdin, cwd = staging)")
			fs.String("base", "", "baseline git revision (default: last compound graph)")
			fs.Bool("full", false, "force full rebuild")
			fs.Bool("dry-run", false, "plan only; write nothing")
			fs.Bool("fallback", false, "fall back to the template writer when an LLM task fails")
			fs.Int("max-llm-tasks", 0, "cap LLM tasks per run (rest use template); 0 = unlimited")
			fs.Bool("keep-work", false, "keep .kb-work/<run> (prompts, logs, staging)")
		},
		run: cmdCompound})
	register(&command{name: "verify", usage: "[--fix-index]", summary: "CI gate: anchors match HEAD, symbols exist, no dead links/orphans, index complete, facts fresh",
		flags: func(fs *flag.FlagSet) {
			fs.Bool("fix-index", false, "regenerate index.md/llms.txt before verifying")
			fs.Bool("dry-run", false, "with --fix-index: show what would change")
		},
		run: cmdVerify})
	register(&command{name: "status", usage: "", summary: "list stale pages (anchor hash differs from HEAD); exit 1 if any", run: cmdStatus})
	register(&command{name: "ingest", usage: "<docs...> | --manifest docs.json [--kinds spec,adr] [--llm template|claude]", summary: "copy docs to raw/docs, extract claims, verify them against code → pages/_conflicts.md + facts/requirements.json",
		flags: func(fs *flag.FlagSet) {
			fs.String("manifest", "", "docs manifest from `kb discover-docs --json` ('-' = stdin)")
			fs.String("kinds", "", "only ingest these kinds (comma separated: spec,design,tasks,adr,agent-guide,readme,doc)")
			fs.String("llm", "template", "claim checker: template | claude | cmd")
			fs.String("llm-cmd", "", "override the LLM command line")
			fs.Bool("dry-run", false, "list claims without writing")
			fs.Bool("fallback", false, "fall back to template when the LLM fails")
		},
		run: cmdIngest})
	register(&command{name: "discover-docs", usage: "[--out docs.json]", summary: "find spec/doc sources (spec-kit, OpenSpec, Kiro, ADR, RFC, AGENTS.md, README, docs/) and classify them",
		flags: func(fs *flag.FlagSet) {
			fs.String("out", "", "also write the manifest to this file")
		},
		run: cmdDiscover})
	register(&command{name: "search", usage: "<query> [--limit n]", summary: "full-text search over pages, facts and symbol names",
		flags: func(fs *flag.FlagSet) { fs.Int("limit", 10, "max results") }, run: cmdSearch})
	register(&command{name: "get", usage: "<page-id|path>", summary: "print one page (frontmatter + body)", run: cmdGet})
	register(&command{name: "context", usage: "<file>", summary: "pages, facts and symbols describing a source file (use before editing it)", run: cmdContext})
	register(&command{name: "anchor", usage: "<symbol-id...>", summary: "print the current hash of symbols (for page frontmatter)",
		help: "Uses $KB_GRAPH (set by kb compound for LLM tasks) when present, otherwise scans the repo.", run: cmdAnchor})
	register(&command{name: "lint-tid", usage: "[--strict]", summary: "testID coverage per route and platform",
		flags: func(fs *flag.FlagSet) { fs.Bool("strict", false, "exit 1 when a testID is missing on some platform") }, run: cmdLintTid})
	register(&command{name: "install-skills", usage: "<target-repo> [--dry-run]", summary: "install kb skills into <target>/.claude/skills for Claude Code",
		flags: func(fs *flag.FlagSet) { fs.Bool("dry-run", false, "list files only") }, run: cmdInstallSkills})
}

func boolFlag(fs *flag.FlagSet, n string) bool  { return fs.Lookup(n).Value.(flag.Getter).Get().(bool) }
func strFlag(fs *flag.FlagSet, n string) string { return fs.Lookup(n).Value.String() }
func intFlag(fs *flag.FlagSet, n string) int    { return fs.Lookup(n).Value.(flag.Getter).Get().(int) }

func today() string { return time.Now().UTC().Format("2006-01-02") }

// ---------- init ----------

func cmdInit(a *app, fs *flag.FlagSet, _ []string) int {
	root, _ := filepath.Abs(a.root)
	dry := boolFlag(fs, "dry-run")
	created := []string{}
	cfgPath := filepath.Join(root, config.FileName)
	var cfg *config.Config
	var err error
	if a.config != "" {
		cfg, err = a.loadConfig()
	} else {
		cfg, err = config.Load(root)
	}
	if errors.Is(err, config.ErrNotFound) {
		cfg = config.Default()
		cfg.Root = root
		cfg.Platforms = config.Detect(root)
		cfg.Project = strFlag(fs, "project")
		if cfg.Project == "" {
			cfg.Project = filepath.Base(root)
		}
		b, _ := cfg.Render()
		created = append(created, config.FileName)
		if !dry {
			if err := wiki.WriteFileAtomic(cfgPath, b); err != nil {
				return a.fail(ExitInternal, err)
			}
		}
	} else if err != nil {
		return a.fail(ExitInternal, err)
	}
	// keep run scratch space (.kb-work: staging, prompts, lock) out of git
	if work := filepath.Join(filepath.Dir(cfg.WikiPath()), ".kb-work"); strings.HasPrefix(work, cfg.Root+string(os.PathSeparator)) {
		gi := filepath.Join(cfg.Root, ".gitignore")
		cur, _ := os.ReadFile(gi)
		entry, _ := filepath.Rel(cfg.Root, work)
		entry = "/" + filepath.ToSlash(entry) + "/"
		cacheEntry, _ := filepath.Rel(cfg.Root, filepath.Join(cfg.WikiPath(), filepath.Dir(filepath.FromSlash(scan.CacheFile))))
		cacheEntry = "/" + filepath.ToSlash(cacheEntry) + "/"
		var add []string
		for _, e := range []string{entry, cacheEntry} {
			if !strings.Contains(string(cur), e) {
				add = append(add, e)
			}
		}
		if len(add) > 0 {
			created = append(created, ".gitignore (+"+strings.Join(add, " ")+")")
			if !dry {
				s := string(cur)
				if s != "" && !strings.HasSuffix(s, "\n") {
					s += "\n"
				}
				s += "# codewiki run scratch space and scan cache\n" + strings.Join(add, "\n") + "\n"
				if err := wiki.WriteFileAtomic(gi, []byte(s)); err != nil {
					return a.fail(ExitInternal, err)
				}
			}
		}
	}
	w, err := wiki.Init(cfg.WikiPath(), dry)
	if err != nil {
		return a.fail(ExitInternal, err)
	}
	for _, x := range w {
		created = append(created, filepath.ToSlash(filepath.Join(cfg.WikiDir, x)))
	}
	if !dry && len(w) > 0 {
		_ = wiki.AppendLog(cfg.WikiPath(), today(), "init", cfg.Project, []string{fmt.Sprintf("platforms: %d", len(cfg.Platforms))})
	}
	a.emit(map[string]any{"ok": true, "dry_run": dry, "created": created, "platforms": cfg.Platforms, "wiki_dir": cfg.WikiDir}, func(w io.Writer) {
		if len(created) == 0 {
			fmt.Fprintln(w, "already initialized")
		}
		for _, c := range created {
			fmt.Fprintln(w, "created", c)
		}
		for _, p := range cfg.Platforms {
			fmt.Fprintf(w, "platform %s → %s\n", p.Name, p.Root)
		}
	})
	return ExitOK
}

// ---------- scan ----------

func cmdScan(a *app, fs *flag.FlagSet, _ []string) int {
	cfg, code := a.cfgOrFail()
	if cfg == nil {
		return code
	}
	res, err := scan.ScanRepo(cfg)
	if err != nil {
		return a.fail(ExitInternal, err)
	}
	res.Graph.Commit = engine.GitHead(cfg.Root)
	f := facts.Extract(cfg, res)
	if out := strFlag(fs, "out"); out != "" {
		b, _ := json.MarshalIndent(res.Graph, "", " ")
		if err := os.WriteFile(out, b, 0o644); err != nil {
			return a.fail(ExitInternal, err)
		}
	}
	per := map[string]map[string]int{}
	for _, s := range res.Graph.Symbols {
		if per[s.Platform] == nil {
			per[s.Platform] = map[string]int{}
		}
		per[s.Platform][s.Lang]++
	}
	files := map[string]int{}
	for _, fi := range res.Graph.Files {
		files[fi.Platform]++
	}
	out := map[string]any{"ok": true, "commit": res.Graph.Commit, "files": files, "symbols": per, "total_symbols": len(res.Graph.Symbols),
		"parse_failures": res.Graph.ParseFailures, "scan_stats": res.Stats, "facts": map[string]int{"routes": len(f.Routes), "testids": len(f.TestIDs), "apis": len(f.APIs)}, "schemes": f.Schemes}
	if boolFlag(fs, "symbols") {
		out["symbol_list"] = res.Graph.Symbols
	}
	a.emit(out, func(w io.Writer) {
		fmt.Fprintf(w, "commit %s: %d files, %d symbols\n", short(res.Graph.Commit), len(res.Graph.Files), len(res.Graph.Symbols))
		for _, p := range sortedMapKeys(per) {
			fmt.Fprintf(w, "  %-8s files=%d %v\n", p, files[p], per[p])
		}
		fmt.Fprintf(w, "facts: %d routes, %d testids, %d apis; schemes %v\n", len(f.Routes), len(f.TestIDs), len(f.APIs), f.Schemes)
		fmt.Fprintf(w, "parse_failures: %d\n", len(res.Graph.ParseFailures))
		fmt.Fprintf(w, "scan: %d ms, parsed %d, cache hits %d, workers %d\n", res.Stats.DurationMs, res.Stats.Parsed, res.Stats.CacheHits, res.Stats.Workers)
		for _, pf := range res.Graph.ParseFailures {
			fmt.Fprintf(w, "  %s:%d %s\n", pf.File, pf.Line, pf.Error)
		}
		if boolFlag(fs, "symbols") {
			for _, s := range res.Graph.Symbols {
				fmt.Fprintf(w, "%s %s %s\n", s.Hash[:12], s.Kind, s.ID)
			}
		}
	})
	return ExitOK
}

func short(s string) string {
	if len(s) > 7 {
		return s[:7]
	}
	return s
}

func sortedMapKeys[V any](m map[string]V) []string {
	var out []string
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// ---------- diff / plan ----------

func (a *app) analyze(fs *flag.FlagSet, full bool) (*config.Config, *engine.Analysis, int) {
	cfg, code := a.cfgOrFail()
	if cfg == nil {
		return nil, nil, code
	}
	o := &engine.Options{Cfg: cfg, Base: strFlag(fs, "base"), Full: full}
	an, err := engine.Analyze(o)
	if err != nil {
		return nil, nil, a.fail(ExitInternal, err)
	}
	return cfg, an, ExitOK
}

func cmdDiff(a *app, fs *flag.FlagSet, _ []string) int {
	_, an, code := a.analyze(fs, false)
	if an == nil {
		return code
	}
	d := an.Diff
	a.emit(d, func(w io.Writer) {
		fmt.Fprintf(w, "base %s → head %s", short(d.Base), short(d.Head))
		if d.Incompatible {
			fmt.Fprint(w, " (no baseline: everything is added)")
		}
		fmt.Fprintln(w)
		for _, k := range []string{engine.ClassUnchanged, engine.ClassBody, engine.ClassSignature, engine.ClassAdded, engine.ClassDeleted, engine.ClassRenamed} {
			fmt.Fprintf(w, "  %-10s %d\n", k, d.Counts[k])
		}
		for _, c := range d.Changes {
			switch c.Class {
			case engine.ClassRenamed:
				fmt.Fprintf(w, "%-9s %s → %s (similarity %.2f)\n", c.Class, c.OldID, c.ID, c.Similarity)
			default:
				fmt.Fprintf(w, "%-9s %s\n", c.Class, c.ID)
			}
		}
	})
	return ExitOK
}

func cmdPlan(a *app, fs *flag.FlagSet, _ []string) int {
	cfg, an, code := a.analyze(fs, boolFlag(fs, "full"))
	if an == nil {
		return code
	}
	p := an.Plan
	if !boolFlag(fs, "dry-run") {
		if _, err := os.Stat(cfg.WikiPath()); err == nil {
			b, _ := json.MarshalIndent(p, "", "  ")
			if err := wiki.WriteFileAtomic(filepath.Join(cfg.WikiPath(), ".kb", "plan.json"), append(b, '\n')); err != nil {
				return a.fail(ExitInternal, err)
			}
		}
	}
	a.emit(p, func(w io.Writer) { printPlan(w, p) })
	return ExitOK
}

func printPlan(w io.Writer, p *engine.Plan) {
	fmt.Fprintf(w, "mode %s — %s\n", p.Mode, p.Reason)
	fmt.Fprintf(w, "stats: symbols=%d changes=%v module_ratio=%.2f structural_ratio=%.2f hops=%d propagated=%d\n",
		p.Stats.Symbols, p.Stats.Changes, p.Stats.ModuleRatio, p.Stats.StructuralRatio, p.Stats.Hops, p.Stats.Propagated)
	for _, t := range p.Tasks {
		var rs []string
		for _, r := range t.Reasons {
			s := r.Code
			if r.Sym != "" {
				s += ":" + lastPart(r.Sym)
			}
			rs = append(rs, s)
		}
		if len(rs) > 4 {
			rs = append(rs[:4], fmt.Sprintf("…+%d", len(rs)-4))
		}
		fmt.Fprintf(w, "  %s %-7s %-30s write_set=%v reasons=[%s]\n", t.ID, t.Op, t.Page, t.WriteSet, strings.Join(rs, ", "))
	}
}

func lastParts(ids []string) []string {
	var out []string
	for i, id := range ids {
		if i == 3 {
			out = append(out, fmt.Sprintf("…+%d", len(ids)-3))
			break
		}
		out = append(out, lastPart(id))
	}
	return out
}

func lastPart(id string) string {
	if i := strings.LastIndex(id, "#"); i >= 0 {
		return id[i+1:]
	}
	return id
}

// ---------- compound ----------

func llmMode(s string) (string, error) {
	switch s {
	case "template":
		return "template", nil
	case "claude", "cmd", "llm":
		return "cmd", nil
	}
	return "", usageError{"--llm must be template, claude or cmd"}
}

func cmdCompound(a *app, fs *flag.FlagSet, _ []string) int {
	cfg, code := a.cfgOrFail()
	if cfg == nil {
		return code
	}
	mode, err := llmMode(strFlag(fs, "llm"))
	if err != nil {
		return a.fail(ExitUsage, err)
	}
	o := &engine.Options{Cfg: cfg, LLM: mode, LLMCmd: strFlag(fs, "llm-cmd"), Base: strFlag(fs, "base"), Full: boolFlag(fs, "full"),
		DryRun: boolFlag(fs, "dry-run"), Fallback: boolFlag(fs, "fallback"), MaxTasks: intFlag(fs, "max-llm-tasks"),
		Keep: boolFlag(fs, "keep-work"), Log: a.stderr, KBPath: kbPath(), Kind: "compound"}
	r, err := engine.Compound(o)
	if err != nil {
		return a.fail(ExitInternal, err)
	}
	return a.reportRun(r)
}

func (a *app) reportRun(r *engine.Result) int {
	ok := r.Verify == nil || r.Verify.OK
	out := map[string]any{"ok": ok, "result": r}
	a.emit(out, func(w io.Writer) {
		fmt.Fprintf(w, "%s %s: base %s → head %s, mode %s, llm %s\n", r.Kind, r.RunID, short(r.Base), short(r.Head), r.Mode, r.LLM)
		printPlan(w, r.Plan)
		for _, t := range r.Tasks {
			fmt.Fprintf(w, "  task %-28s %-8s %s %s\n", t.ID, t.Status, t.Writer, t.Error)
		}
		fmt.Fprintf(w, "changed files: %d\n", len(r.Changed))
		for _, c := range r.Changed {
			fmt.Fprintf(w, "  %s\n", c)
		}
		if r.Verify != nil {
			printVerify(w, r.Verify)
		}
		fmt.Fprintln(w, r.Message)
	})
	if !ok {
		return ExitStale
	}
	return ExitOK
}

// ---------- verify / status ----------

func (a *app) verifyNow(cfg *config.Config) (*wiki.Report, *model.Graph, error) {
	res, err := scan.ScanRepo(cfg)
	if err != nil {
		return nil, nil, err
	}
	f := facts.Extract(cfg, res)
	rep := wiki.Verify(cfg.WikiPath(), res.Graph, wiki.VerifyOptions{ExpectedFacts: engine.ExpectedFacts(cfg, res.Graph, f)})
	engine.VerifyRequirements(cfg.WikiPath(), res.Graph, rep)
	return rep, res.Graph, nil
}

func cmdVerify(a *app, fs *flag.FlagSet, _ []string) int {
	cfg, code := a.cfgOrFail()
	if cfg == nil {
		return code
	}
	if _, err := os.Stat(cfg.WikiPath()); err != nil {
		return a.fail(ExitUsage, fmt.Errorf("wiki dir %s not found (run kb init)", cfg.WikiDir))
	}
	if boolFlag(fs, "fix-index") {
		if boolFlag(fs, "dry-run") {
			pages, _ := wiki.LoadPages(cfg.WikiPath())
			cur, _ := os.ReadFile(filepath.Join(cfg.WikiPath(), "index.md"))
			a.logf("fix-index (dry-run): index would %s", map[bool]string{true: "stay unchanged", false: "change"}[string(cur) == string(wiki.RenderIndex(pages))])
		} else {
			pages, _ := wiki.LoadPages(cfg.WikiPath())
			cur, _ := os.ReadFile(filepath.Join(cfg.WikiPath(), "index.md"))
			if string(cur) != string(wiki.RenderIndex(pages)) {
				if err := wiki.FixIndex(cfg.WikiPath()); err != nil {
					return a.fail(ExitInternal, err)
				}
				_ = wiki.AppendLog(cfg.WikiPath(), today(), "fix-index", "regenerated index.md", nil)
				a.logf("index.md regenerated")
			}
		}
	}
	rep, _, err := a.verifyNow(cfg)
	if err != nil {
		return a.fail(ExitInternal, err)
	}
	a.emit(rep, func(w io.Writer) { printVerify(w, rep) })
	if !rep.OK {
		return ExitStale
	}
	return ExitOK
}

func printVerify(w io.Writer, rep *wiki.Report) {
	state := "PASS"
	if !rep.OK {
		state = "FAIL"
	}
	fmt.Fprintf(w, "verify %s: %d pages, %d anchors, %d errors, %d warnings\n", state, rep.Pages, rep.Anchors, len(rep.Errors), len(rep.Warnings))
	for i, e := range rep.Errors {
		if i >= 40 {
			fmt.Fprintf(w, "  … %d more\n", len(rep.Errors)-i)
			break
		}
		fmt.Fprintf(w, "  %s %s %s %s\n", e.Code, e.Page, e.Sym, e.Detail)
	}
}

func cmdStatus(a *app, fs *flag.FlagSet, _ []string) int {
	cfg, code := a.cfgOrFail()
	if cfg == nil {
		return code
	}
	rep, _, err := a.verifyNow(cfg)
	if err != nil {
		return a.fail(ExitInternal, err)
	}
	type stalePage struct {
		Page    string   `json:"page"`
		Reason  string   `json:"reason"`
		Symbols []string `json:"symbols"`
	}
	m := map[string][]string{}
	reason := map[string]string{}
	for _, e := range rep.Errors {
		if strings.HasPrefix(e.Code, "E_ANCHOR") || e.Code == "E_REQ_ANCHOR_STALE" || e.Code == "E_STATUS_STALE" || e.Code == "E_FACTS_STALE" {
			if e.Sym != "" {
				m[e.Page] = append(m[e.Page], e.Sym)
			} else if _, ok := m[e.Page]; !ok {
				m[e.Page] = []string{}
			}
			reason[e.Page] = e.Code
		}
	}
	var out []stalePage
	for _, p := range sortedMapKeys(m) {
		out = append(out, stalePage{p, reason[p], m[p]})
	}
	if out == nil {
		out = []stalePage{}
	}
	st := map[string]any{}
	if b, err := os.ReadFile(filepath.Join(cfg.WikiPath(), ".kb", "state.json")); err == nil {
		_ = json.Unmarshal(b, &st)
	}
	head := engine.GitHead(cfg.Root)
	a.emit(map[string]any{"ok": len(out) == 0, "head": head, "state": st, "stale": out}, func(w io.Writer) {
		fmt.Fprintf(w, "head %s, last compound %v\n", short(head), st["last_sha"])
		if len(out) == 0 {
			fmt.Fprintln(w, "all pages current")
		}
		for _, s := range out {
			if s.Reason == "E_FACTS_STALE" {
				fmt.Fprintf(w, "stale %s (generated facts out of date)\n", s.Page)
			} else {
				fmt.Fprintf(w, "stale %s (%d anchors: %s)\n", s.Page, len(s.Symbols), strings.Join(lastParts(s.Symbols), ", "))
			}
		}
	})
	if len(out) > 0 {
		return ExitStale
	}
	return ExitOK
}

// ---------- ingest / discover ----------

func cmdDiscover(a *app, fs *flag.FlagSet, _ []string) int {
	root, _ := filepath.Abs(a.root)
	var excl []string
	if cfg, err := a.loadConfig(); err == nil {
		excl = append(excl, cfg.WikiDir)
		excl = append(excl, cfg.Docs.Exclude...)
	}
	m, err := engine.DiscoverDocs(root, excl)
	if err != nil {
		return a.fail(ExitInternal, err)
	}
	if out := strFlag(fs, "out"); out != "" {
		b, _ := json.MarshalIndent(m, "", "  ")
		if err := os.WriteFile(out, append(b, '\n'), 0o644); err != nil {
			return a.fail(ExitInternal, err)
		}
	}
	a.emit(m, func(w io.Writer) {
		counts := map[string]int{}
		for _, d := range m.Docs {
			counts[d.Kind]++
			fmt.Fprintf(w, "%-12s %-10s %s\n", d.Kind, d.Convention, d.Path)
		}
		fmt.Fprintf(w, "%d docs %v\n", len(m.Docs), counts)
	})
	return ExitOK
}

func cmdIngest(a *app, fs *flag.FlagSet, args []string) int {
	cfg, code := a.cfgOrFail()
	if cfg == nil {
		return code
	}
	mode, err := llmMode(strFlag(fs, "llm"))
	if err != nil {
		return a.fail(ExitUsage, err)
	}
	var docs []engine.DocEntry
	if mp := strFlag(fs, "manifest"); mp != "" {
		var b []byte
		if mp == "-" {
			b, err = io.ReadAll(os.Stdin)
		} else {
			b, err = os.ReadFile(mp)
		}
		if err != nil {
			return a.fail(ExitUsage, err)
		}
		var m engine.DocsManifest
		if err := json.Unmarshal(b, &m); err != nil {
			return a.fail(ExitUsage, fmt.Errorf("manifest: %w", err))
		}
		kinds := map[string]bool{}
		for _, k := range strings.Split(strFlag(fs, "kinds"), ",") {
			if k = strings.TrimSpace(k); k != "" {
				kinds[k] = true
			}
		}
		for _, d := range m.Docs {
			if len(kinds) > 0 && !kinds[d.Kind] {
				continue
			}
			if m.Root != "" && !filepath.IsAbs(d.Path) && m.Root != cfg.Root {
				if rel, err := filepath.Rel(cfg.Root, filepath.Join(m.Root, d.Path)); err == nil && !strings.HasPrefix(rel, "..") {
					d.Path = filepath.ToSlash(rel)
				} else {
					d.Path = filepath.Join(m.Root, d.Path)
				}
			}
			docs = append(docs, d)
		}
	}
	for _, p := range args {
		abs, _ := filepath.Abs(p)
		rel, err := filepath.Rel(cfg.Root, abs)
		if err != nil || strings.HasPrefix(rel, "..") {
			rel = abs
		}
		st, err := os.Stat(abs)
		if err != nil {
			return a.fail(ExitUsage, err)
		}
		if st.IsDir() {
			_ = filepath.Walk(abs, func(q string, info os.FileInfo, err error) error {
				if err == nil && !info.IsDir() && strings.HasSuffix(q, ".md") {
					r, _ := filepath.Rel(cfg.Root, q)
					if strings.HasPrefix(r, "..") {
						r = q
					}
					docs = append(docs, engine.DocEntry{Path: filepath.ToSlash(r)})
				}
				return nil
			})
			continue
		}
		docs = append(docs, engine.DocEntry{Path: filepath.ToSlash(rel)})
	}
	if len(docs) == 0 {
		return a.fail(ExitUsage, usageError{"no documents given (pass paths or --manifest)"})
	}
	if boolFlag(fs, "dry-run") {
		var claims []engine.Claim
		for _, d := range docs {
			p := d.Path
			if !filepath.IsAbs(p) {
				p = filepath.Join(cfg.Root, p)
			}
			b, err := os.ReadFile(p)
			if err != nil {
				return a.fail(ExitUsage, err)
			}
			claims = append(claims, engine.ExtractClaims(d.Path, "raw/docs/"+d.Path, b)...)
		}
		a.emit(map[string]any{"ok": true, "dry_run": true, "docs": docs, "claims": claims}, func(w io.Writer) {
			for _, c := range claims {
				fmt.Fprintf(w, "%-24s %-9s %s\n", c.ID, c.Style, c.Text)
			}
			fmt.Fprintf(w, "%d docs, %d claims (dry-run)\n", len(docs), len(claims))
		})
		return ExitOK
	}
	o := &engine.Options{Cfg: cfg, LLM: mode, LLMCmd: strFlag(fs, "llm-cmd"), Kind: "ingest", IngestDocs: docs, Log: a.stderr, KBPath: kbPath(), Fallback: boolFlag(fs, "fallback")}
	r, err := engine.Compound(o)
	if err != nil {
		return a.fail(ExitInternal, err)
	}
	return a.reportRun(r)
}

// ---------- search / get / context / anchor ----------

type hit struct {
	Kind    string  `json:"kind"` // page | symbol | route | testid | api
	ID      string  `json:"id"`
	Title   string  `json:"title,omitempty"`
	Path    string  `json:"path,omitempty"`
	Score   float64 `json:"score"`
	Snippet string  `json:"snippet,omitempty"`
}

func cmdSearch(a *app, fs *flag.FlagSet, args []string) int {
	if len(args) == 0 {
		return a.fail(ExitUsage, usageError{"usage: kb search <query>"})
	}
	cfg, code := a.cfgOrFail()
	if cfg == nil {
		return code
	}
	q := strings.ToLower(strings.Join(args, " "))
	terms := strings.Fields(q)
	pages, _ := wiki.LoadPages(cfg.WikiPath())
	var hits []hit
	for _, p := range pages {
		title := strings.ToLower(p.Front.Title + " " + p.Front.ID + " " + strings.Join(p.Front.Routes, " "))
		body := strings.ToLower(p.Body)
		score := 0.0
		for _, t := range terms {
			if strings.Contains(title, t) {
				score += 5
			}
			score += float64(min(strings.Count(body, t), 10))
		}
		if score == 0 {
			continue
		}
		if strings.HasPrefix(p.Path, "facts/") {
			score *= 0.6
		}
		hits = append(hits, hit{Kind: "page", ID: p.Front.ID, Title: p.Front.Title, Path: p.Path, Score: score, Snippet: snippet(p.Body, terms[0])})
	}
	if g, err := engine.LoadGraph(filepath.Join(cfg.WikiPath(), ".kb", "graph.json")); err == nil {
		for _, s := range g.Symbols {
			id := strings.ToLower(s.Qual)
			sc := 0.0
			for _, t := range terms {
				if strings.Contains(id, t) {
					sc += 2
				}
			}
			if sc > 0 {
				hits = append(hits, hit{Kind: "symbol", ID: s.ID, Title: s.Signature, Path: fmt.Sprintf("%s:%d", s.File, s.StartLine), Score: sc})
			}
		}
	}
	sort.SliceStable(hits, func(i, j int) bool { return hits[i].Score > hits[j].Score })
	if n := intFlag(fs, "limit"); len(hits) > n {
		hits = hits[:n]
	}
	if hits == nil {
		hits = []hit{}
	}
	a.emit(map[string]any{"query": q, "results": hits}, func(w io.Writer) {
		for _, h := range hits {
			fmt.Fprintf(w, "%5.1f %-6s %s  %s\n", h.Score, h.Kind, h.ID, h.Title)
			if h.Snippet != "" {
				fmt.Fprintf(w, "       %s\n", h.Snippet)
			}
		}
	})
	return ExitOK
}

func snippet(body, term string) string {
	lb := strings.ToLower(body)
	i := strings.Index(lb, term)
	if i < 0 {
		return ""
	}
	lo, hi := max(0, i-60), min(len(body), i+80)
	for lo > 0 && (body[lo]&0xC0) == 0x80 {
		lo--
	}
	for hi < len(body) && (body[hi]&0xC0) == 0x80 {
		hi++
	}
	return strings.Join(strings.Fields(body[lo:hi]), " ")
}

func cmdGet(a *app, fs *flag.FlagSet, args []string) int {
	if len(args) != 1 {
		return a.fail(ExitUsage, usageError{"usage: kb get <page-id>"})
	}
	cfg, code := a.cfgOrFail()
	if cfg == nil {
		return code
	}
	pages, _ := wiki.LoadPages(cfg.WikiPath())
	p := wiki.FindPage(pages, args[0])
	if p == nil {
		return a.fail(ExitUsage, fmt.Errorf("page %q not found", args[0]))
	}
	raw, _ := os.ReadFile(filepath.Join(cfg.WikiPath(), filepath.FromSlash(p.Path)))
	a.emit(map[string]any{"path": p.Path, "front": p.Front, "body": p.Body}, func(w io.Writer) { w.Write(raw) })
	return ExitOK
}

func cmdContext(a *app, fs *flag.FlagSet, args []string) int {
	if len(args) != 1 {
		return a.fail(ExitUsage, usageError{"usage: kb context <file>"})
	}
	cfg, code := a.cfgOrFail()
	if cfg == nil {
		return code
	}
	abs, _ := filepath.Abs(args[0])
	rel, err := filepath.Rel(cfg.Root, abs)
	if err != nil || strings.HasPrefix(rel, "..") {
		rel = args[0]
	}
	rel = filepath.ToSlash(rel)
	g, err := engine.LoadGraph(filepath.Join(cfg.WikiPath(), ".kb", "graph.json"))
	if err != nil {
		res, err := scan.ScanRepo(cfg)
		if err != nil {
			return a.fail(ExitInternal, err)
		}
		g = res.Graph
	}
	inFile := map[string]bool{}
	var syms []map[string]any
	for _, s := range g.Symbols {
		if s.File == rel || strings.HasPrefix(s.File, strings.TrimSuffix(rel, "/")+"/") {
			inFile[s.ID] = true
			syms = append(syms, map[string]any{"id": s.ID, "kind": s.Kind, "line": s.StartLine, "signature": s.Signature, "hash": s.Hash})
		}
	}
	pages, _ := wiki.LoadPages(cfg.WikiPath())
	type pref struct {
		Page    string   `json:"page"`
		Title   string   `json:"title"`
		Status  string   `json:"status"`
		Anchors []string `json:"anchors"`
	}
	var refs []pref
	for _, p := range pages {
		var an []string
		for _, s := range p.Front.Sources {
			if inFile[s.Sym] {
				an = append(an, s.Sym)
			}
		}
		if len(an) > 0 {
			refs = append(refs, pref{p.Path, p.Front.Title, p.Front.Status, an})
		}
	}
	var f model.Facts
	readFacts(cfg.WikiPath(), &f)
	var routes []model.Route
	for _, r := range f.Routes {
		if r.File == rel {
			routes = append(routes, r)
		}
	}
	var tids []model.TestID
	for _, t := range f.TestIDs {
		if t.File == rel {
			tids = append(tids, t)
		}
	}
	var apis []model.API
	for _, x := range f.APIs {
		if x.File == rel {
			apis = append(apis, x)
		}
	}
	out := map[string]any{"file": rel, "pages": refs, "symbols": syms, "routes": routes, "testids": tids, "apis": apis,
		"hint": "after editing this file run `kb compound` (or let CI do it); pages listed here will be re-checked"}
	a.emit(out, func(w io.Writer) {
		fmt.Fprintf(w, "file %s\n", rel)
		fmt.Fprintf(w, "pages (%d):\n", len(refs))
		for _, r := range refs {
			fmt.Fprintf(w, "  %s — %s [%s] anchors=%d\n", r.Page, r.Title, r.Status, len(r.Anchors))
		}
		fmt.Fprintf(w, "symbols (%d):\n", len(syms))
		for _, s := range syms {
			fmt.Fprintf(w, "  L%-4v %-10v %v\n", s["line"], s["kind"], s["id"])
		}
		for _, r := range routes {
			fmt.Fprintf(w, "route %s %s %s\n", r.Platform, r.RouteID, r.Deeplink)
		}
		for _, t := range tids {
			fmt.Fprintf(w, "testid %s L%d\n", t.Tid, t.Line)
		}
		for _, x := range apis {
			fmt.Fprintf(w, "api %s %s\n", x.Method, x.Path)
		}
	})
	return ExitOK
}

func readFacts(wikiDir string, f *model.Facts) {
	var r struct {
		Routes []model.Route `json:"routes"`
	}
	var t struct {
		TestIDs []model.TestID `json:"testids"`
	}
	var p struct {
		APIs []model.API `json:"apis"`
	}
	if b, err := os.ReadFile(filepath.Join(wikiDir, "facts", "routes.json")); err == nil {
		_ = json.Unmarshal(b, &r)
	}
	if b, err := os.ReadFile(filepath.Join(wikiDir, "facts", "testids.json")); err == nil {
		_ = json.Unmarshal(b, &t)
	}
	if b, err := os.ReadFile(filepath.Join(wikiDir, "facts", "apis.json")); err == nil {
		_ = json.Unmarshal(b, &p)
	}
	f.Routes, f.TestIDs, f.APIs = r.Routes, t.TestIDs, p.APIs
}

func cmdAnchor(a *app, fs *flag.FlagSet, args []string) int {
	if len(args) == 0 {
		return a.fail(ExitUsage, usageError{"usage: kb anchor <symbol-id...>"})
	}
	var g *model.Graph
	if gp := os.Getenv("KB_GRAPH"); gp != "" {
		g, _ = engine.LoadGraph(gp)
	}
	if g == nil {
		if a.root == "." && os.Getenv("KB_ROOT") != "" {
			a.root = os.Getenv("KB_ROOT")
		}
		cfg, code := a.cfgOrFail()
		if cfg == nil {
			return code
		}
		res, err := scan.ScanRepo(cfg)
		if err != nil {
			return a.fail(ExitInternal, err)
		}
		g = res.Graph
	}
	var out []model.Anchor
	missing := 0
	for _, id := range args {
		s := g.Get(id)
		if s == nil {
			missing++
			out = append(out, model.Anchor{Sym: id})
			continue
		}
		out = append(out, model.Anchor{Sym: s.ID, Hash: s.Hash})
	}
	a.emit(map[string]any{"ok": missing == 0, "anchors": out}, func(w io.Writer) {
		for _, x := range out {
			if x.Hash == "" {
				fmt.Fprintf(w, "%s NOT_FOUND\n", x.Sym)
				continue
			}
			fmt.Fprintf(w, "  - sym: %s\n    hash: %s\n", x.Sym, x.Hash)
		}
	})
	if missing > 0 {
		return ExitStale
	}
	return ExitOK
}

// ---------- lint-tid ----------

func cmdLintTid(a *app, fs *flag.FlagSet, _ []string) int {
	cfg, code := a.cfgOrFail()
	if cfg == nil {
		return code
	}
	res, err := scan.ScanRepo(cfg)
	if err != nil {
		return a.fail(ExitInternal, err)
	}
	f := facts.Extract(cfg, res)
	var plats []string
	for _, p := range cfg.Platforms {
		plats = append(plats, p.Name)
	}
	type row struct {
		RouteID string          `json:"route_id"`
		Tid     string          `json:"tid"`
		Present map[string]bool `json:"present"`
		Missing []string        `json:"missing"`
	}
	matrix := map[string]map[string]map[string]bool{} // route -> tid -> platform
	routePlats := map[string]map[string]bool{}
	for _, r := range f.Routes {
		if routePlats[r.RouteID] == nil {
			routePlats[r.RouteID] = map[string]bool{}
		}
		routePlats[r.RouteID][r.Platform] = true
	}
	for _, t := range f.TestIDs {
		rid := t.RouteID
		if rid == "" {
			rid = "(shared)"
		}
		if matrix[rid] == nil {
			matrix[rid] = map[string]map[string]bool{}
		}
		if matrix[rid][t.Tid] == nil {
			matrix[rid][t.Tid] = map[string]bool{}
		}
		matrix[rid][t.Tid][t.Platform] = true
	}
	// shared tids attributed to no route count as present on that platform for every route
	var rows []row
	gaps := 0
	var noTid []string
	for _, rid := range sortedMapKeys(routePlats) {
		if len(matrix[rid]) == 0 {
			noTid = append(noTid, rid)
		}
	}
	for _, rid := range sortedMapKeys(matrix) {
		for _, tid := range sortedMapKeys(matrix[rid]) {
			r := row{RouteID: rid, Tid: tid, Present: matrix[rid][tid], Missing: []string{}}
			for _, p := range plats {
				if rid != "(shared)" && !routePlats[rid][p] {
					continue
				}
				if !r.Present[p] && !(rid != "(shared)" && matrix["(shared)"][tid][p]) {
					r.Missing = append(r.Missing, p)
				}
			}
			gaps += len(r.Missing)
			rows = append(rows, r)
		}
	}
	a.emit(map[string]any{"ok": gaps == 0, "platforms": plats, "rows": rows, "gaps": gaps, "routes_without_testids": noTid}, func(w io.Writer) {
		fmt.Fprintf(w, "%-16s %-18s %s\n", "route_id", "tid", strings.Join(plats, " "))
		for _, r := range rows {
			var cells []string
			for _, p := range plats {
				c := "✓"
				if !r.Present[p] {
					c = "·"
					for _, m := range r.Missing {
						if m == p {
							c = "✗"
						}
					}
				}
				cells = append(cells, fmt.Sprintf("%-*s", len(p), c))
			}
			fmt.Fprintf(w, "%-16s %-18s %s\n", r.RouteID, r.Tid, strings.Join(cells, " "))
		}
		fmt.Fprintf(w, "gaps: %d; routes without testIDs: %v\n", gaps, noTid)
	})
	if gaps > 0 && boolFlag(fs, "strict") {
		return ExitStale
	}
	return ExitOK
}

// ---------- install-skills ----------

func cmdInstallSkills(a *app, fs *flag.FlagSet, args []string) int {
	if len(args) != 1 {
		return a.fail(ExitUsage, usageError{"usage: kb install-skills <target-repo>"})
	}
	target := filepath.Join(args[0], ".claude", "skills")
	files, err := skills.Files()
	if err != nil {
		return a.fail(ExitInternal, err)
	}
	var written []string
	for _, f := range files {
		dst := filepath.Join(target, filepath.FromSlash(f.Path))
		written = append(written, filepath.ToSlash(dst))
		if boolFlag(fs, "dry-run") {
			continue
		}
		if err := wiki.WriteFileAtomic(dst, f.Data); err != nil {
			return a.fail(ExitInternal, err)
		}
		if strings.HasPrefix(filepath.Base(dst), "") && strings.Contains(f.Path, "/scripts/") {
			_ = os.Chmod(dst, 0o755)
		}
	}
	a.emit(map[string]any{"ok": true, "target": target, "files": written}, func(w io.Writer) {
		for _, x := range written {
			fmt.Fprintln(w, x)
		}
	})
	return ExitOK
}
