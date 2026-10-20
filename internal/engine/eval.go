package engine

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/luckylucky0001/codewiki/internal/config"
	"github.com/luckylucky0001/codewiki/internal/model"
	"github.com/luckylucky0001/codewiki/internal/wiki"
)

// Golden is a human-labelled evaluation set.
type Golden struct {
	Version int    `yaml:"version"`
	Project string `yaml:"project"`
	Changes string `yaml:"changes"`
	// Docs are extra documents (paths relative to the golden file) copied into
	// the project at To before ingest. When present, only these documents are
	// ingested, so a held-out doc can be evaluated against an existing project.
	Docs []struct {
		From string `yaml:"from"`
		To   string `yaml:"to"`
	} `yaml:"docs"`
	Claims []struct {
		ID       string `yaml:"id"`
		Expected string `yaml:"expected"`
		Note     string `yaml:"note"`
	} `yaml:"claims"`
	Impact []struct {
		Change string   `yaml:"change"`
		Pages  []string `yaml:"pages"`
	} `yaml:"impact"`
}

// PR is a precision/recall pair.
type PR struct {
	TP        int     `json:"tp"`
	FP        int     `json:"fp"`
	FN        int     `json:"fn"`
	Precision float64 `json:"precision"`
	Recall    float64 `json:"recall"`
	F1        float64 `json:"f1"`
}

func (p *PR) finish() {
	if p.TP+p.FP > 0 {
		p.Precision = round2(float64(p.TP) / float64(p.TP+p.FP))
	}
	if p.TP+p.FN > 0 {
		p.Recall = round2(float64(p.TP) / float64(p.TP+p.FN))
	}
	if p.Precision+p.Recall > 0 {
		p.F1 = round2(2 * p.Precision * p.Recall / (p.Precision + p.Recall))
	}
}

// ClaimEval is one labelled claim with the pipeline's prediction.
type ClaimEval struct {
	ID        string `json:"id"`
	Expected  string `json:"expected"`
	Predicted string `json:"predicted"`
	OK        bool   `json:"ok"`
	Note      string `json:"note,omitempty"`
}

// ImpactEval compares planned pages with the expected ones for a change set.
type ImpactEval struct {
	Change    string   `json:"change"`
	Expected  []string `json:"expected"`
	Predicted []string `json:"predicted"`
	Missed    []string `json:"missed"`
	Extra     []string `json:"extra"`
	PR        PR       `json:"pr"`
}

// EvalReport is the output of kb eval.
type EvalReport struct {
	LLM          string                    `json:"llm"`
	Claims       []ClaimEval               `json:"claims"`
	Accuracy     float64                   `json:"claim_accuracy"`
	PerClass     map[string]PR             `json:"claim_per_class"`
	Confusion    map[string]map[string]int `json:"claim_confusion"` // expected -> predicted -> n
	Missing      []string                  `json:"missing_claims"`
	Impact       []ImpactEval              `json:"impact"`
	ImpactMicro  PR                        `json:"impact_micro"`
	ClaimsLabels int                       `json:"labelled_claims"`
}

// EvalOptions configures RunEval.
type EvalOptions struct {
	GoldenPath string
	LLM        string // template | cmd
	LLMCmd     string
	KBPath     string
	Log        io.Writer
	// ExtraDocs (kb eval --doc) are copied to docs/eval/<name> in the project
	// copy; like Golden.Docs they restrict ingest to the given documents.
	ExtraDocs []string
}

func gitRun(dir string, args ...string) error {
	cmd := exec.Command("git", append([]string{"-c", "user.name=kb-eval", "-c", "user.email=eval@codewiki.local", "-c", "commit.gpgsign=false"}, args...)...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git %v: %v: %s", args, err, out)
	}
	return nil
}

// RunEval replays the golden project in a temp git repo: ingest docs (claim
// verification), initial compound, then each change set (plan impact).
func RunEval(o EvalOptions) (*EvalReport, error) {
	b, err := os.ReadFile(o.GoldenPath)
	if err != nil {
		return nil, err
	}
	var gs Golden
	if err := yaml.Unmarshal(b, &gs); err != nil {
		return nil, err
	}
	base := filepath.Dir(o.GoldenPath)
	proj := filepath.Join(base, gs.Project)
	tmp, err := os.MkdirTemp("", "kb-eval-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp)
	if err := copyDir(proj, tmp); err != nil {
		return nil, err
	}
	only := map[string]bool{}
	place := func(from, to string) error {
		b, err := os.ReadFile(from)
		if err != nil {
			return err
		}
		to = filepath.ToSlash(filepath.Clean(to))
		if strings.HasPrefix(to, "../") || filepath.IsAbs(to) {
			return fmt.Errorf("eval doc target %q must stay inside the project", to)
		}
		dst := filepath.Join(tmp, filepath.FromSlash(to))
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			return err
		}
		only[to] = true
		return os.WriteFile(dst, b, 0o644)
	}
	for _, d := range gs.Docs {
		to := d.To
		if to == "" {
			to = "docs/eval/" + filepath.Base(d.From)
		}
		if err := place(filepath.Join(base, d.From), to); err != nil {
			return nil, err
		}
	}
	for _, d := range o.ExtraDocs {
		if err := place(d, "docs/eval/"+filepath.Base(d)); err != nil {
			return nil, err
		}
	}
	if err := gitRun(tmp, "init", "-q", "-b", "master"); err != nil {
		return nil, err
	}
	_ = gitRun(tmp, "add", "-A")
	if err := gitRun(tmp, "commit", "-qm", "base"); err != nil {
		return nil, err
	}
	cfg := config.Default()
	cfg.Root = tmp
	cfg.Platforms = config.Detect(tmp)
	if _, err := wiki.Init(cfg.WikiPath(), false); err != nil {
		return nil, err
	}
	man, err := DiscoverDocs(tmp, []string{cfg.WikiDir})
	if err != nil {
		return nil, err
	}
	var docs []DocEntry
	for _, d := range man.Docs {
		if len(only) > 0 {
			if only[d.Path] {
				docs = append(docs, d)
			}
			continue
		}
		if d.Kind != "readme" {
			docs = append(docs, d)
		}
	}
	if len(only) > 0 && len(docs) != len(only) {
		return nil, fmt.Errorf("eval docs not discovered: want %v, discovered %d", sortedKeys(only), len(docs))
	}
	logw := o.Log
	if logw == nil {
		logw = io.Discard
	}
	// the LLM (when requested) is only used for claim verification; page
	// writing does not influence the evaluated metrics, so compounds use the
	// template writer to keep evaluation cheap and deterministic
	run := func(kind string, ingest []DocEntry) (*Result, error) {
		llm := "template"
		if kind == "ingest" {
			llm = o.LLM
		}
		r, err := Compound(&Options{Cfg: cfg, LLM: llm, LLMCmd: o.LLMCmd, Kind: kind, IngestDocs: ingest, Log: logw, KBPath: o.KBPath, Fallback: true})
		if err != nil {
			return nil, err
		}
		if !r.Published {
			return r, fmt.Errorf("%s not published: %s", kind, r.Message)
		}
		return r, nil
	}
	if _, err := run("ingest", docs); err != nil {
		return nil, err
	}
	rep := &EvalReport{LLM: o.LLM, PerClass: map[string]PR{}, Confusion: map[string]map[string]int{}, Missing: []string{}}
	// claims
	pred := map[string]string{}
	for _, r := range loadRequirements(cfg.WikiPath()) {
		pred[r.ID] = r.Status
	}
	classes := []string{ClaimVerified, ClaimConflict, ClaimUnverifiable}
	per := map[string]*PR{}
	for _, c := range classes {
		per[c] = &PR{}
	}
	correct := 0
	for _, c := range gs.Claims {
		p, ok := pred[c.ID]
		if !ok {
			rep.Missing = append(rep.Missing, c.ID)
			p = "missing"
		}
		ce := ClaimEval{ID: c.ID, Expected: c.Expected, Predicted: p, OK: p == c.Expected, Note: c.Note}
		rep.Claims = append(rep.Claims, ce)
		if rep.Confusion[c.Expected] == nil {
			rep.Confusion[c.Expected] = map[string]int{}
		}
		rep.Confusion[c.Expected][p]++
		if ce.OK {
			correct++
		}
		for _, cl := range classes {
			switch {
			case p == cl && c.Expected == cl:
				per[cl].TP++
			case p == cl:
				per[cl].FP++
			case c.Expected == cl:
				per[cl].FN++
			}
		}
	}
	rep.ClaimsLabels = len(gs.Claims)
	if len(gs.Claims) > 0 {
		rep.Accuracy = round2(float64(correct) / float64(len(gs.Claims)))
	}
	for _, cl := range classes {
		per[cl].finish()
		rep.PerClass[cl] = *per[cl]
	}
	// impact
	if _, err := run("compound", nil); err != nil {
		return nil, err
	}
	_ = gitRun(tmp, "add", "-A")
	_ = gitRun(tmp, "commit", "-qm", "wiki")
	changes := filepath.Join(base, gs.Changes)
	for _, im := range gs.Impact {
		if err := copyDir(filepath.Join(changes, im.Change, "files"), tmp); err != nil {
			return nil, err
		}
		_ = gitRun(tmp, "add", "-A")
		if err := gitRun(tmp, "commit", "-qm", im.Change); err != nil {
			return nil, err
		}
		a, err := Analyze(&Options{Cfg: cfg})
		if err != nil {
			return nil, err
		}
		var got []string
		for _, t := range a.Plan.Tasks {
			got = append(got, t.Page)
		}
		ie := ImpactEval{Change: im.Change, Expected: im.Pages, Predicted: got, Missed: []string{}, Extra: []string{}}
		exp := map[string]bool{}
		for _, p := range im.Pages {
			exp[p] = true
		}
		gotSet := map[string]bool{}
		for _, p := range got {
			gotSet[p] = true
			if exp[p] {
				ie.PR.TP++
			} else {
				ie.PR.FP++
				ie.Extra = append(ie.Extra, p)
			}
		}
		for _, p := range im.Pages {
			if !gotSet[p] {
				ie.PR.FN++
				ie.Missed = append(ie.Missed, p)
			}
		}
		ie.PR.finish()
		rep.ImpactMicro.TP += ie.PR.TP
		rep.ImpactMicro.FP += ie.PR.FP
		rep.ImpactMicro.FN += ie.PR.FN
		rep.Impact = append(rep.Impact, ie)
		if _, err := run("compound", nil); err != nil {
			return nil, err
		}
		_ = gitRun(tmp, "add", "-A")
		_ = gitRun(tmp, "commit", "-qm", "wiki "+im.Change)
	}
	rep.ImpactMicro.finish()
	sort.SliceStable(rep.Claims, func(i, j int) bool { return !rep.Claims[i].OK && rep.Claims[j].OK })
	return rep, nil
}

// FormatEval renders a human-readable report.
func FormatEval(r *EvalReport) string {
	var b strings.Builder
	fmt.Fprintf(&b, "claim verification (%s, %d labelled): accuracy %.2f\n", r.LLM, r.ClaimsLabels, r.Accuracy)
	for _, cl := range []string{ClaimVerified, ClaimConflict, ClaimUnverifiable} {
		p := r.PerClass[cl]
		fmt.Fprintf(&b, "  %-13s precision %.2f recall %.2f f1 %.2f (tp %d fp %d fn %d)\n", cl, p.Precision, p.Recall, p.F1, p.TP, p.FP, p.FN)
	}
	for _, c := range r.Claims {
		if !c.OK {
			fmt.Fprintf(&b, "  ✗ %-22s expected %-12s got %-12s %s\n", c.ID, c.Expected, c.Predicted, c.Note)
		}
	}
	fmt.Fprintf(&b, "plan impact: micro precision %.2f recall %.2f f1 %.2f\n", r.ImpactMicro.Precision, r.ImpactMicro.Recall, r.ImpactMicro.F1)
	for _, i := range r.Impact {
		fmt.Fprintf(&b, "  %-22s precision %.2f recall %.2f missed %v extra %v\n", i.Change, i.PR.Precision, i.PR.Recall, i.Missed, i.Extra)
	}
	return b.String()
}

func loadRequirements(wikiDir string) []model.Requirement {
	b, err := os.ReadFile(filepath.Join(wikiDir, "facts", "requirements.json"))
	if err != nil {
		return nil
	}
	var doc struct {
		Requirements []model.Requirement `json:"requirements"`
	}
	_ = json.Unmarshal(b, &doc)
	return doc.Requirements
}
