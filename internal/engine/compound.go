package engine

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/luckylucky0001/codewiki/internal/config"
	"github.com/luckylucky0001/codewiki/internal/facts"
	"github.com/luckylucky0001/codewiki/internal/model"
	"github.com/luckylucky0001/codewiki/internal/scan"
	"github.com/luckylucky0001/codewiki/internal/wiki"
)

// PromptVersion is recorded in state.json; bump when prompts change materially.
const PromptVersion = "2026-10-20.1"

// Options configures a compound (or ingest) run.
type Options struct {
	Cfg        *config.Config
	LLM        string // "template" | "cmd"
	LLMCmd     string
	Base       string
	Full       bool
	DryRun     bool
	Fallback   bool // fall back to the template writer when an LLM task fails
	MaxTasks   int  // 0 = unlimited; extra tasks fall back to template
	Kind       string
	IngestDocs []DocEntry
	Log        io.Writer
	Date       string
	KBPath     string
	Keep       bool
}

// TaskResult records the outcome of one task.
type TaskResult struct {
	ID       string   `json:"id"`
	Page     string   `json:"page"`
	Op       string   `json:"op"`
	Writer   string   `json:"writer"`
	Status   string   `json:"status"` // ok | failed | violation
	Reverted []string `json:"reverted,omitempty"`
	Error    string   `json:"error,omitempty"`
	Millis   int64    `json:"millis"`
}

// Result is the outcome of a run.
type Result struct {
	RunID     string       `json:"run_id"`
	Kind      string       `json:"kind"`
	Base      string       `json:"base"`
	Head      string       `json:"head"`
	Mode      string       `json:"mode"`
	LLM       string       `json:"llm"`
	Plan      *Plan        `json:"plan"`
	Diff      *Diff        `json:"diff"`
	Tasks     []TaskResult `json:"tasks"`
	Verify    *wiki.Report `json:"verify,omitempty"`
	Published bool         `json:"published"`
	Changed   []string     `json:"changed"`
	WorkDir   string       `json:"work_dir,omitempty"`
	Message   string       `json:"message"`
}

// State is .kb/state.json.
type State struct {
	LastSHA       string `json:"last_sha"`
	GraphVersion  int    `json:"graph_version"`
	PromptVersion string `json:"prompt_version"`
	LLM           string `json:"llm"`
	UpdatedAt     string `json:"updated_at"`
}

func (o *Options) logf(format string, a ...any) {
	if o.Log != nil {
		fmt.Fprintf(o.Log, format+"\n", a...)
	}
}

// GitHead returns HEAD of the repo at root ("" if not a git repo).
func GitHead(root string) string {
	out, err := exec.Command("git", "-C", root, "rev-parse", "HEAD").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func short(sha string) string {
	if len(sha) > 7 {
		return sha[:7]
	}
	return sha
}

// ScanRevision extracts <sha> into a temp dir and scans it.
func ScanRevision(cfg *config.Config, sha string) (*scan.Result, func(), error) {
	tmp, err := os.MkdirTemp("", "kb-base-")
	if err != nil {
		return nil, nil, err
	}
	cleanup := func() { os.RemoveAll(tmp) }
	cmd := exec.Command("sh", "-c", fmt.Sprintf("git -C %q archive %q | tar -x -C %q", cfg.Root, sha, tmp))
	if out, err := cmd.CombinedOutput(); err != nil {
		cleanup()
		return nil, nil, fmt.Errorf("git archive %s: %v: %s", sha, err, out)
	}
	res, err := scan.Scan(cfg, tmp)
	if err != nil {
		cleanup()
		return nil, nil, err
	}
	res.Graph.Commit = sha
	return res, cleanup, nil
}

// LoadGraph reads a graph snapshot.
func LoadGraph(p string) (*model.Graph, error) {
	b, err := os.ReadFile(p)
	if err != nil {
		return nil, err
	}
	g := &model.Graph{}
	if err := json.Unmarshal(b, g); err != nil {
		return nil, err
	}
	g.Index()
	return g, nil
}

// Analysis holds scan + facts + diff + plan (shared by diff/plan/compound).
type Analysis struct {
	Scan  *scan.Result
	Graph *model.Graph
	Old   *model.Graph
	Facts *model.Facts
	Diff  *Diff
	Plan  *Plan
	Pages []*wiki.Page
}

// Analyze scans HEAD, loads the baseline and computes diff and plan.
func Analyze(o *Options) (*Analysis, error) {
	cfg := o.Cfg
	res, err := scan.Scan(cfg, cfg.Root)
	if err != nil {
		return nil, err
	}
	res.Graph.Commit = GitHead(cfg.Root)
	a := &Analysis{Scan: res, Graph: res.Graph, Facts: facts.Extract(cfg, res)}
	if o.Base != "" {
		br, cleanup, err := ScanRevision(cfg, o.Base)
		if err != nil {
			return nil, err
		}
		cleanup()
		a.Old = br.Graph
	} else if g, err := LoadGraph(filepath.Join(cfg.WikiPath(), ".kb", "graph.json")); err == nil {
		a.Old = g
	}
	a.Diff = DiffGraphs(a.Old, a.Graph)
	if a.Old == nil {
		a.Old = &model.Graph{}
	}
	a.Pages, _ = wiki.LoadPages(cfg.WikiPath())
	hasDocs := len(LoadRawManifest(cfg.WikiPath()).Docs) > 0 || len(o.IngestDocs) > 0
	a.Plan = BuildPlan(PlanInput{Cfg: cfg, Diff: a.Diff, Old: a.Old, Cur: a.Graph, Facts: a.Facts, Pages: a.Pages, ForceFull: o.Full, HasDocs: hasDocs})
	if o.Kind == "ingest" {
		// ingest only (re)checks documents
		var keep []Task
		for _, t := range a.Plan.Tasks {
			if t.Kind == "conflicts" {
				keep = append(keep, t)
			}
		}
		if len(keep) == 0 {
			keep = []Task{{ID: "t01-_conflicts", Op: OpRecheck, Kind: "conflicts", Page: ConflictsPage, Title: "文档核对", WriteSet: []string{VerdictsFile}, Reasons: []Reason{{Code: "ingest"}}, Context: []string{}}}
		}
		a.Plan.Tasks = keep
		a.Plan.Mode = "ingest"
		a.Plan.Reason = "check ingested documents against code"
	}
	for i := range a.Plan.Tasks {
		if a.Plan.Tasks[i].Kind == "conflicts" {
			a.Plan.Tasks[i].WriteSet = []string{VerdictsFile}
		}
	}
	return a, nil
}

// ExpectedFacts renders the generated facts files for a scan.
func ExpectedFacts(cfg *config.Config, g *model.Graph, f *model.Facts) map[string][]byte {
	var plats []string
	for _, p := range cfg.Platforms {
		plats = append(plats, p.Name)
	}
	return facts.Render(f, g, plats)
}

// Compound runs scan → diff → plan → LLM → verify → atomic publish.
func Compound(o *Options) (*Result, error) {
	if o.Kind == "" {
		o.Kind = "compound"
	}
	if o.Date == "" {
		o.Date = time.Now().UTC().Format("2006-01-02")
	}
	cfg := o.Cfg
	a, err := Analyze(o)
	if err != nil {
		return nil, err
	}
	head := a.Graph.Commit
	runID := time.Now().UTC().Format("20060102T150405") + "-" + short(head)
	r := &Result{RunID: runID, Kind: o.Kind, Base: a.Diff.Base, Head: head, Mode: a.Plan.Mode, LLM: o.LLM, Plan: a.Plan, Diff: a.Diff, Tasks: []TaskResult{}, Changed: []string{}}
	o.logf("kb %s: head=%s base=%s mode=%s tasks=%d (%s)", o.Kind, short(head), short(a.Diff.Base), a.Plan.Mode, len(a.Plan.Tasks), a.Plan.Reason)
	if o.DryRun {
		r.Message = "dry-run: nothing written"
		return r, nil
	}
	wikiDir := cfg.WikiPath()
	workRoot := filepath.Join(filepath.Dir(wikiDir), ".kb-work")
	work := filepath.Join(workRoot, runID)
	staging := filepath.Join(work, "wiki")
	if err := os.MkdirAll(work, 0o755); err != nil {
		return nil, err
	}
	unlock, err := lock(workRoot)
	if err != nil {
		return nil, err
	}
	defer unlock()
	r.WorkDir = work
	if _, err := os.Stat(wikiDir); err == nil {
		if err := copyDir(wikiDir, staging); err != nil {
			return nil, err
		}
	} else if _, err := wiki.Init(staging, false); err != nil {
		return nil, err
	}
	before, _ := snapshot(staging)
	// ingest: copy documents into raw/docs
	if len(o.IngestDocs) > 0 {
		docs, err := CopyDocs(cfg.Root, staging, o.IngestDocs)
		if err != nil {
			return nil, err
		}
		o.logf("ingested %d document(s) into raw/docs", len(docs))
	}
	// generated facts
	expected := ExpectedFacts(cfg, a.Graph, a.Facts)
	for rel, b := range expected {
		if err := wiki.WriteFileAtomic(filepath.Join(staging, filepath.FromSlash(rel)), b); err != nil {
			return nil, err
		}
	}
	graphPath := filepath.Join(work, "graph.json")
	gb, _ := json.MarshalIndent(a.Graph, "", " ")
	_ = os.WriteFile(graphPath, gb, 0o644)
	// tasks
	env := &taskEnv{o: o, a: a, staging: staging, work: work, graphPath: graphPath, head: head}
	for i, t := range a.Plan.Tasks {
		writer := o.LLM
		if o.MaxTasks > 0 && i >= o.MaxTasks && writer != "template" {
			writer = "template"
		}
		tr := env.run(t, writer)
		if tr.Status != "ok" && o.Fallback && writer != "template" {
			o.logf("  task %s failed (%s); falling back to template writer", t.ID, tr.Error)
			tr2 := env.run(t, "template")
			tr2.Error = "fallback after: " + tr.Error
			tr = tr2
		}
		r.Tasks = append(r.Tasks, tr)
		o.logf("  [%s] %-8s %-34s %s %s", tr.Status, t.Op, t.Page, tr.Writer, tr.Error)
	}
	// conflicts page + requirements.json are rendered by the CLI from verdicts
	if err := env.renderClaims(); err != nil {
		return nil, err
	}
	// index, llms.txt
	if err := wiki.FixIndex(staging); err != nil {
		return nil, err
	}
	after, _ := snapshot(staging)
	r.Changed = changedFiles(before, after)
	if len(r.Changed) == 0 && o.Kind == "compound" && a.Plan.Mode == "noop" {
		r.Message = "noop: wiki already up to date"
		r.Verify = wiki.Verify(wikiDir, a.Graph, wiki.VerifyOptions{ExpectedFacts: expected})
		VerifyRequirements(wikiDir, a.Graph, r.Verify)
		if !o.Keep {
			os.RemoveAll(work)
		}
		return r, nil
	}
	// state + records + log
	var bullets []string
	for _, tr := range r.Tasks {
		bullets = append(bullets, fmt.Sprintf("%s `%s` (%s, %s)", tr.Op, tr.Page, tr.Writer, tr.Status))
	}
	subject := fmt.Sprintf("%s %s, %d task(s), %d file(s) changed", short(head), a.Plan.Mode, len(r.Tasks), len(r.Changed))
	if err := wiki.AppendLog(staging, o.Date, o.Kind, subject, bullets); err != nil {
		return nil, err
	}
	if o.Kind == "compound" {
		_ = os.MkdirAll(filepath.Join(staging, ".kb"), 0o755)
		_ = os.WriteFile(filepath.Join(staging, ".kb", "graph.json"), gb, 0o644)
		st := State{LastSHA: head, GraphVersion: model.GraphVersion, PromptVersion: PromptVersion, LLM: o.LLM, UpdatedAt: time.Now().UTC().Format(time.RFC3339)}
		writeJSON(filepath.Join(staging, ".kb", "state.json"), st)
	}
	writeJSON(filepath.Join(staging, ".kb", "plan.json"), a.Plan)
	// verify staging before publishing
	rep := wiki.Verify(staging, a.Graph, wiki.VerifyOptions{ExpectedFacts: expected})
	VerifyRequirements(staging, a.Graph, rep)
	r.Verify = rep
	record := map[string]any{"run_id": runID, "kind": o.Kind, "base_sha": a.Diff.Base, "head_sha": head, "mode": a.Plan.Mode, "reason": a.Plan.Reason,
		"llm": o.LLM, "tasks": r.Tasks, "changed": r.Changed, "verify_ok": rep.OK, "verify_errors": len(rep.Errors), "date": o.Date}
	writeJSON(filepath.Join(staging, ".kb", "update_record.json"), record)
	r.Changed = changedFiles(before, mustSnapshot(staging))
	if !rep.OK {
		r.Message = fmt.Sprintf("verify failed with %d error(s); staging kept at %s; wiki NOT published", len(rep.Errors), staging)
		return r, nil
	}
	if err := publish(staging, wikiDir, work); err != nil {
		return nil, err
	}
	r.Published = true
	r.Message = fmt.Sprintf("published %d changed file(s) to %s", len(r.Changed), wikiDir)
	if !o.Keep {
		os.RemoveAll(work)
		r.WorkDir = ""
	}
	return r, nil
}

// VerifyRequirements checks anchors recorded in facts/requirements.json.
func VerifyRequirements(wikiDir string, g *model.Graph, rep *wiki.Report) {
	b, err := os.ReadFile(filepath.Join(wikiDir, "facts", "requirements.json"))
	if err != nil {
		return
	}
	var doc struct {
		Requirements []model.Requirement `json:"requirements"`
	}
	if json.Unmarshal(b, &doc) != nil {
		rep.Errors = append(rep.Errors, wiki.Issue{Code: "E_REQUIREMENTS", Page: "facts/requirements.json", Detail: "invalid JSON"})
		rep.OK = false
		return
	}
	for _, r := range doc.Requirements {
		for _, a := range r.Anchors {
			rep.Anchors++
			s := g.Get(a.Sym)
			if s == nil || s.Hash != a.Hash {
				rep.Errors = append(rep.Errors, wiki.Issue{Code: "E_REQ_ANCHOR_STALE", Page: "facts/requirements.json", Sym: a.Sym, Detail: "requirement " + r.ID + " anchor is stale (re-run kb compound / kb ingest)"})
				rep.OK = false
			}
		}
	}
}

func writeJSON(p string, v any) {
	b, _ := json.MarshalIndent(v, "", "  ")
	_ = wiki.WriteFileAtomic(p, append(b, '\n'))
}

func lock(dir string) (func(), error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	p := filepath.Join(dir, "lock")
	for i := 0; i < 2; i++ {
		f, err := os.OpenFile(p, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
		if err == nil {
			fmt.Fprintf(f, "%d\n", os.Getpid())
			f.Close()
			return func() { os.Remove(p) }, nil
		}
		if st, err2 := os.Stat(p); err2 == nil && time.Since(st.ModTime()) > time.Hour {
			os.Remove(p)
			continue
		}
		return nil, errors.New("another kb run holds " + p + " (delete it if stale)")
	}
	return nil, errors.New("could not acquire lock " + p)
}

func publish(staging, wikiDir, work string) error {
	prev := filepath.Join(work, "wiki.prev")
	if _, err := os.Stat(wikiDir); err == nil {
		if err := os.Rename(wikiDir, prev); err != nil {
			return err
		}
	}
	if err := os.Rename(staging, wikiDir); err != nil {
		_ = os.Rename(prev, wikiDir)
		return err
	}
	return nil
}

func copyDir(src, dst string) error {
	return filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		t := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(t, 0o755)
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(t, b, 0o644)
	})
}

func snapshot(dir string) (map[string]string, error) {
	m := map[string]string{}
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(dir, p)
		h := sha256.Sum256(b)
		m[filepath.ToSlash(rel)] = hex.EncodeToString(h[:])
		return nil
	})
	return m, err
}

func mustSnapshot(dir string) map[string]string {
	m, _ := snapshot(dir)
	return m
}

func changedFiles(a, b map[string]string) []string {
	var out []string
	for k, v := range b {
		if a[k] != v {
			out = append(out, k)
		}
	}
	for k := range a {
		if _, ok := b[k]; !ok {
			out = append(out, k)
		}
	}
	sort.Strings(out)
	if out == nil {
		out = []string{}
	}
	return out
}

// ---------- task execution ----------

type taskEnv struct {
	o         *Options
	a         *Analysis
	staging   string
	work      string
	graphPath string
	head      string
	claims    []Claim // checked claims (set by conflicts task)
	claimsSet bool
}

func (e *taskEnv) run(t Task, writer string) TaskResult {
	start := time.Now()
	tr := TaskResult{ID: t.ID, Page: t.Page, Op: t.Op, Writer: writer, Status: "ok"}
	var err error
	if writer == "template" {
		err = e.runTemplate(t)
	} else {
		tr.Reverted, err = e.runCmd(t)
		if err == nil && len(tr.Reverted) > 0 {
			tr.Status = "violation"
			tr.Error = "reverted writes outside write set: " + strings.Join(tr.Reverted, ", ")
		}
	}
	if err != nil {
		tr.Status = "failed"
		tr.Error = err.Error()
	}
	tr.Millis = time.Since(start).Milliseconds()
	return tr
}

func (e *taskEnv) writePage(pg *wiki.Page) error {
	return wiki.WriteFileAtomic(filepath.Join(e.staging, filepath.FromSlash(pg.Path)), pg.Render())
}

func (e *taskEnv) platforms() []string {
	var out []string
	for _, p := range e.o.Cfg.Platforms {
		out = append(out, p.Name)
	}
	return out
}

func (e *taskEnv) templateClaims() []Claim {
	claims := AllClaims(e.staging)
	ck := &Checker{G: e.a.Graph, F: e.a.Facts, Dir: e.a.Scan.Dir}
	for i := range claims {
		ck.Check(&claims[i])
	}
	return claims
}

func (e *taskEnv) runTemplate(t Task) error {
	switch t.Kind {
	case "feature":
		return e.writePage(TemplateFeature(e.a.Graph, e.a.Facts, t.RouteID, short(e.head)))
	case "overview":
		return e.writePage(TemplateOverview(e.a.Facts, e.platforms(), short(e.head)))
	case "conflicts":
		e.claims, e.claimsSet = e.templateClaims(), true
		writeJSON(filepath.Join(e.staging, filepath.FromSlash(VerdictsFile)), Verdicts{Version: 1, Claims: e.claims})
		return nil
	default:
		// unknown page kinds: restamp anchors that still exist (content unchanged)
		p := filepath.Join(e.staging, filepath.FromSlash(t.Page))
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		pg, err := wiki.ParsePage(t.Page, b)
		if err != nil {
			return err
		}
		var src []model.Anchor
		for _, a := range pg.Front.Sources {
			if s := e.a.Graph.Get(a.Sym); s != nil {
				src = append(src, model.Anchor{Sym: s.ID, Hash: s.Hash})
			}
		}
		pg.Front.Sources = src
		pg.Front.Status = wiki.StatusCurrent
		pg.Front.SourceCommit = short(e.head)
		return e.writePage(pg)
	}
}

func (e *taskEnv) renderClaims() error {
	if !e.claimsSet {
		// no conflicts task this run: keep existing page/requirements
		return nil
	}
	pg, reqs := RenderConflicts(e.claims, e.a.Graph, short(e.head))
	if err := e.writePage(pg); err != nil {
		return err
	}
	return wiki.WriteFileAtomic(filepath.Join(e.staging, "facts", "requirements.json"), facts.RequirementsJSON(reqs))
}

func (e *taskEnv) runCmd(t Task) ([]string, error) {
	cmdline := e.o.LLMCmd
	if cmdline == "" {
		cmdline = e.o.Cfg.LLM.Cmd
	}
	var templ []Claim
	if t.Kind == "conflicts" {
		templ = e.templateClaims()
	}
	prompt := e.buildPrompt(t, templ)
	tdir := filepath.Join(e.work, "tasks")
	_ = os.MkdirAll(tdir, 0o755)
	_ = os.WriteFile(filepath.Join(tdir, t.ID+".prompt.md"), []byte(prompt), 0o644)
	before, _ := snapshot(e.staging)
	saved := map[string][]byte{}
	for f := range before {
		if b, err := os.ReadFile(filepath.Join(e.staging, filepath.FromSlash(f))); err == nil {
			saved[f] = b
		}
	}
	timeout := time.Duration(e.o.Cfg.LLM.TimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 10 * time.Minute
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "sh", "-c", cmdline)
	cmd.Dir = e.staging
	cmd.Stdin = strings.NewReader(prompt)
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out
	env := os.Environ()
	if e.o.KBPath != "" {
		env = append(env, "PATH="+filepath.Dir(e.o.KBPath)+string(os.PathListSeparator)+os.Getenv("PATH"))
	}
	env = append(env, "KB_ROOT="+e.o.Cfg.Root, "KB_GRAPH="+e.graphPath, "KB_TASK="+t.ID)
	cmd.Env = env
	runErr := cmd.Run()
	_ = os.WriteFile(filepath.Join(tdir, t.ID+".log"), out.Bytes(), 0o644)
	// enforce write set
	after, _ := snapshot(e.staging)
	allowed := map[string]bool{}
	for _, w := range t.WriteSet {
		allowed[w] = true
	}
	var reverted []string
	for _, f := range changedFiles(before, after) {
		if allowed[f] {
			continue
		}
		reverted = append(reverted, f)
		if b, existed := saved[f]; existed {
			_ = os.MkdirAll(filepath.Dir(filepath.Join(e.staging, filepath.FromSlash(f))), 0o755)
			_ = os.WriteFile(filepath.Join(e.staging, filepath.FromSlash(f)), b, 0o644)
			continue
		}
		_ = os.Remove(filepath.Join(e.staging, filepath.FromSlash(f)))
	}
	if runErr != nil {
		return reverted, fmt.Errorf("llm command failed: %v (see %s)", runErr, filepath.Join(tdir, t.ID+".log"))
	}
	if t.Kind == "conflicts" {
		return reverted, e.mergeVerdicts(templ)
	}
	return reverted, e.postProcess(t)
}

// postProcess normalizes the frontmatter written by the LLM: id/kind/routes
// are enforced, anchors for symbols given in the task context are restamped
// with their current hash, unknown symbols are rejected.
func (e *taskEnv) postProcess(t Task) error {
	p := filepath.Join(e.staging, filepath.FromSlash(t.Page))
	b, err := os.ReadFile(p)
	if err != nil {
		return fmt.Errorf("LLM did not write %s", t.Page)
	}
	pg, err := wiki.ParsePage(t.Page, b)
	if err != nil {
		return fmt.Errorf("LLM output %s: %v", t.Page, err)
	}
	ctx := map[string]bool{}
	for _, id := range t.Context {
		ctx[id] = true
	}
	var src []model.Anchor
	seen := map[string]bool{}
	for _, a := range pg.Front.Sources {
		s := e.a.Graph.Get(a.Sym)
		if s == nil {
			return fmt.Errorf("LLM anchored unknown symbol %s", a.Sym)
		}
		if seen[s.ID] {
			continue
		}
		seen[s.ID] = true
		if ctx[s.ID] || a.Hash != s.Hash {
			a.Hash = s.Hash // the LLM was shown the current body of context symbols
		}
		src = append(src, a)
	}
	if len(src) == 0 && t.Kind != "overview" {
		for _, id := range t.Context {
			src = append(src, model.Anchor{Sym: id, Hash: e.a.Graph.Get(id).Hash})
		}
	}
	pg.Front.Sources = src
	pg.Front.ID = wiki.IDFromPath(t.Page)
	if pg.Front.Title == "" {
		pg.Front.Title = t.Title
	}
	if t.Kind != "" {
		pg.Front.Kind = t.Kind
	}
	if t.RouteID != "" {
		pg.Front.Routes = []string{t.RouteID}
		pg.Front.Platforms = platformsOf(e.a.Facts, t.RouteID)
	}
	if t.Kind == "overview" {
		pg.Front.Routes = routeIDs(e.a.Facts)
	}
	pg.Front.SourceCommit = short(e.head)
	pg.Front.Status = wiki.StatusCurrent
	return e.writePage(pg)
}

func (e *taskEnv) mergeVerdicts(templ []Claim) error {
	b, err := os.ReadFile(filepath.Join(e.staging, filepath.FromSlash(VerdictsFile)))
	if err != nil {
		return fmt.Errorf("LLM did not write %s", VerdictsFile)
	}
	var v Verdicts
	if err := json.Unmarshal(b, &v); err != nil {
		return fmt.Errorf("invalid %s: %v", VerdictsFile, err)
	}
	byID := map[string]Claim{}
	for _, c := range v.Claims {
		byID[c.ID] = c
	}
	for i := range templ {
		c, ok := byID[templ[i].ID]
		if !ok {
			continue
		}
		switch c.Status {
		case ClaimVerified, ClaimConflict, ClaimUnverifiable:
		default:
			continue
		}
		var anchors []string
		for _, a := range c.Anchors {
			if e.a.Graph.Get(a) != nil {
				anchors = append(anchors, a)
			}
		}
		if c.Status == ClaimVerified && len(anchors) == 0 && len(templ[i].Anchors) == 0 {
			c.Status = ClaimUnverifiable // verified requires code anchors
		}
		templ[i].Status = c.Status
		if len(anchors) > 0 {
			templ[i].Anchors = anchors
		}
		if ev := llmEvidence(c.Evidence, templ[i].Evidence); ev != "" {
			templ[i].Evidence = append([]string{"[llm] " + ev}, templ[i].Evidence...)
		}
		if len(c.RouteIDs) > 0 {
			templ[i].RouteIDs = c.RouteIDs
		}
	}
	e.claims, e.claimsSet = templ, true
	writeJSON(filepath.Join(e.staging, filepath.FromSlash(VerdictsFile)), Verdicts{Version: 1, Claims: templ})
	return nil
}

// llmEvidence joins the LLM's evidence, dropping "[llm]" prefixes copied from
// earlier runs and sentences that merely repeat the deterministic pre-check.
func llmEvidence(llm, templ []string) string {
	known := map[string]bool{}
	for _, t := range templ {
		known[strings.TrimSpace(t)] = true
	}
	seen := map[string]bool{}
	var out []string
	for _, e := range llm {
		for _, part := range strings.FieldsFunc(e, func(r rune) bool { return r == '；' || r == ';' }) {
			part = strings.TrimSpace(part)
			for strings.HasPrefix(part, "[llm]") {
				part = strings.TrimSpace(strings.TrimPrefix(part, "[llm]"))
			}
			if part == "" || known[part] || seen[part] {
				continue
			}
			seen[part] = true
			out = append(out, part)
		}
	}
	return strings.Join(out, "；")
}
