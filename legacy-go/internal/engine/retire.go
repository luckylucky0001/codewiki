package engine

import (
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/luckylucky0001/codewiki/internal/wiki"
)

const retiredPagesFile = ".kb/retired-pages.json"

func loadRetiredPages(dir string) (map[string]string, error) {
	retired := map[string]string{}
	b, err := os.ReadFile(filepath.Join(dir, retiredPagesFile))
	if os.IsNotExist(err) {
		return retired, nil
	}
	if err != nil {
		return nil, err
	}
	err = json.Unmarshal(b, &retired)
	return retired, err
}

// Empty legacy concepts should not be recreated just because their placeholder
// was explicitly retired. New code evidence or an agent plan can restore them.
func suppressRetiredPlaceholders(a *Analysis, dir string) error {
	retired, err := loadRetiredPages(dir)
	if err != nil {
		return err
	}
	if len(retired) == 0 {
		return nil
	}
	var tasks []Task
	for _, t := range a.Plan.Tasks {
		_, retiredPage := retired[t.Page]
		_, statErr := os.Stat(filepath.Join(dir, t.Page))
		if retiredPage && os.IsNotExist(statErr) && !t.Knowledge && t.Kind == "concept" && len(t.Context) == 0 {
			continue
		}
		tasks = append(tasks, t)
	}
	a.Plan.Tasks = tasks
	if len(tasks) == 0 {
		a.Plan.Mode, a.Plan.Reason = "noop", "no active page changes"
	}
	finalize(a.Plan)
	return nil
}

// retirePages only changes the staging copy. The normal link verifier and atomic
// publisher remain the gate, and originals are kept outside the active page tree.
func (e *taskEnv) retirePages() error {
	if e.o.RetirePages == "" {
		return nil
	}
	if strings.TrimSpace(e.o.RetireReason) == "" {
		return fmt.Errorf("retire-pages requires retire-reason")
	}
	protected := map[string]bool{OverviewPage: true, ParityPage: true, "pages/_conflicts.md": true}
	// Route-backed feature pages are still required by the generated facts.
	if e.a != nil && e.a.Facts != nil {
		for _, rid := range routeIDs(e.a.Facts) {
			protected[FeaturePage(rid)] = true
		}
	}
	if kp, err := loadKnowledgePlan(e.staging); err == nil {
		for _, p := range kp.Pages {
			protected[p.Page] = true
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	originals := map[string][]byte{}
	retired, err := loadRetiredPages(e.staging)
	if err != nil {
		return err
	}
	for _, value := range strings.Split(e.o.RetirePages, ",") {
		p := strings.TrimSpace(value)
		if path.Clean(p) != p || !strings.HasPrefix(p, "pages/") || !strings.HasSuffix(p, ".md") || strings.Contains(p, "\\") || protected[p] {
			return fmt.Errorf("cannot retire unsafe, generated or planned page %q", p)
		}
		b, err := os.ReadFile(filepath.Join(e.staging, filepath.FromSlash(p)))
		if err != nil {
			return err
		}
		originals[p] = b
	}
	for p, b := range originals {
		archive := filepath.Join(e.staging, ".kb", "retired", filepath.Base(e.work), filepath.FromSlash(p))
		if err := wiki.WriteFileAtomic(archive, b); err != nil {
			return err
		}
		if err := wiki.WriteFileAtomic(archive+".reason.txt", []byte(e.o.RetireReason+"\n")); err != nil {
			return err
		}
		if err := os.Remove(filepath.Join(e.staging, filepath.FromSlash(p))); err != nil {
			return err
		}
		retired[p] = e.o.RetireReason
	}
	b, err := json.MarshalIndent(retired, "", "  ")
	if err != nil {
		return err
	}
	return wiki.WriteFileAtomic(filepath.Join(e.staging, retiredPagesFile), b)
}
