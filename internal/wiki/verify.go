package wiki

import (
	"bytes"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/luckylucky0001/codewiki/internal/model"
)

// Issue is one verification finding.
type Issue struct {
	Code    string `json:"code"`
	Page    string `json:"page,omitempty"`
	Detail  string `json:"detail"`
	Sym     string `json:"sym,omitempty"`
	Want    string `json:"want,omitempty"`
	Got     string `json:"got,omitempty"`
	Fixable bool   `json:"fixable,omitempty"`
}

// Report is the result of Verify.
type Report struct {
	OK         bool     `json:"ok"`
	Pages      int      `json:"pages"`
	Anchors    int      `json:"anchors"`
	Errors     []Issue  `json:"errors"`
	Warnings   []Issue  `json:"warnings"`
	StalePages []string `json:"stale_pages"`
}

// VerifyOptions configures Verify.
type VerifyOptions struct {
	// ExpectedFacts, when set, are compared byte-for-byte with facts/ files.
	ExpectedFacts map[string][]byte
}

var (
	symMention = regexp.MustCompile("`((?:android|ios|harmony|web|[a-z][a-z0-9_-]{1,15})://[^`#\\s]+#[^`\\s]+)`")
	fenced     = regexp.MustCompile("(?s)```.*?```")
	inlineCode = regexp.MustCompile("`[^`\n]*`")
	mdLink     = regexp.MustCompile(`\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)`)
)

// Verify checks the wiki against the current symbol graph.
func Verify(wikiDir string, g *model.Graph, opt VerifyOptions) *Report {
	r := &Report{Errors: []Issue{}, Warnings: []Issue{}, StalePages: []string{}}
	pages, errs := LoadPages(wikiDir)
	for _, e := range errs {
		r.Errors = append(r.Errors, Issue{Code: "E_FRONTMATTER", Detail: e.Error()})
	}
	r.Pages = len(pages)
	byPath := map[string]*Page{}
	for _, p := range pages {
		byPath[p.Path] = p
	}
	stale := map[string]bool{}
	links := map[string][]string{} // page -> linked wiki-relative targets
	for _, p := range pages {
		if p.HasFM {
			if p.Front.ID == "" || p.Front.Title == "" {
				r.Errors = append(r.Errors, Issue{Code: "E_FRONTMATTER", Page: p.Path, Detail: "id and title are required"})
			} else if want := IDFromPath(p.Path); p.Front.ID != want {
				r.Errors = append(r.Errors, Issue{Code: "E_FRONTMATTER", Page: p.Path, Detail: "id must equal " + want, Want: want, Got: p.Front.ID})
			}
			switch p.Front.Status {
			case "", StatusCurrent, StatusStale, StatusOutdatedDoc:
			default:
				r.Errors = append(r.Errors, Issue{Code: "E_FRONTMATTER", Page: p.Path, Detail: "invalid status " + p.Front.Status})
			}
		}
		if strings.HasPrefix(p.Path, "pages/") && len(p.Front.Sources) == 0 && p.Front.Kind != "overview" {
			r.Warnings = append(r.Warnings, Issue{Code: "W_NO_SOURCES", Page: p.Path, Detail: "page has no code anchors"})
		}
		if p.Front.Status == StatusStale {
			stale[p.Path] = true
			r.Errors = append(r.Errors, Issue{Code: "E_STATUS_STALE", Page: p.Path, Detail: "page is marked stale"})
		}
		for _, a := range p.Front.Sources {
			r.Anchors++
			s := g.Get(a.Sym)
			if s == nil {
				stale[p.Path] = true
				r.Errors = append(r.Errors, Issue{Code: "E_ANCHOR_MISSING", Page: p.Path, Sym: a.Sym, Detail: "anchored symbol no longer exists"})
				continue
			}
			if s.Hash != a.Hash {
				stale[p.Path] = true
				r.Errors = append(r.Errors, Issue{Code: "E_ANCHOR_STALE", Page: p.Path, Sym: a.Sym, Want: s.Hash, Got: a.Hash, Detail: "symbol body changed since the page was written"})
			}
		}
		for _, m := range symMention.FindAllStringSubmatch(p.Body, -1) {
			if g.Get(m[1]) == nil {
				r.Errors = append(r.Errors, Issue{Code: "E_SYMBOL_UNKNOWN", Page: p.Path, Sym: m[1], Detail: "page mentions a symbol id that does not exist"})
			}
		}
		for _, t := range linkTargets(p.Path, p.Body) {
			links[p.Path] = append(links[p.Path], t)
			if _, err := os.Stat(filepath.Join(wikiDir, filepath.FromSlash(t))); err != nil {
				r.Errors = append(r.Errors, Issue{Code: "E_DEAD_LINK", Page: p.Path, Detail: "link target not found: " + t})
			}
		}
	}
	// index coverage + orphans (reachability from index.md)
	idxB, err := os.ReadFile(filepath.Join(wikiDir, "index.md"))
	if err != nil {
		r.Errors = append(r.Errors, Issue{Code: "E_INDEX_MISSING", Detail: "index.md not found", Fixable: true})
	}
	idxLinks := linkTargets("index.md", string(idxB))
	for _, t := range idxLinks {
		if _, err := os.Stat(filepath.Join(wikiDir, filepath.FromSlash(t))); err != nil {
			r.Errors = append(r.Errors, Issue{Code: "E_DEAD_LINK", Page: "index.md", Detail: "link target not found: " + t, Fixable: true})
		}
	}
	inIndex := map[string]bool{}
	for _, t := range idxLinks {
		inIndex[t] = true
	}
	reach := map[string]bool{}
	queue := append([]string{}, idxLinks...)
	for len(queue) > 0 {
		x := queue[0]
		queue = queue[1:]
		if reach[x] {
			continue
		}
		reach[x] = true
		queue = append(queue, links[x]...)
	}
	for _, p := range pages {
		if !inIndex[p.Path] {
			r.Errors = append(r.Errors, Issue{Code: "E_INDEX_COVERAGE", Page: p.Path, Detail: "page not listed in index.md", Fixable: true})
		}
		if !reach[p.Path] {
			r.Errors = append(r.Errors, Issue{Code: "E_ORPHAN", Page: p.Path, Detail: "page not reachable from index.md", Fixable: true})
		}
	}
	// generated facts must match a fresh extraction
	if opt.ExpectedFacts != nil {
		keys := make([]string, 0, len(opt.ExpectedFacts))
		for k := range opt.ExpectedFacts {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			got, err := os.ReadFile(filepath.Join(wikiDir, filepath.FromSlash(k)))
			if err != nil || !bytes.Equal(got, opt.ExpectedFacts[k]) {
				r.Errors = append(r.Errors, Issue{Code: "E_FACTS_STALE", Page: k, Detail: "generated facts differ from current code (run kb compound)"})
			}
		}
	}
	for p := range stale {
		r.StalePages = append(r.StalePages, p)
	}
	sort.Strings(r.StalePages)
	r.OK = len(r.Errors) == 0
	return r
}

// linkTargets returns wiki-relative targets of local markdown links in body.
func linkTargets(from, body string) []string {
	var out []string
	seen := map[string]bool{}
	body = fenced.ReplaceAllString(body, "")
	body = inlineCode.ReplaceAllString(body, "")
	for _, m := range mdLink.FindAllStringSubmatch(body, -1) {
		t := m[1]
		if strings.Contains(t, "://") || strings.HasPrefix(t, "#") || strings.HasPrefix(t, "mailto:") {
			continue
		}
		if i := strings.IndexByte(t, '#'); i >= 0 {
			t = t[:i]
		}
		if t == "" {
			continue
		}
		var res string
		if strings.HasPrefix(t, "/") {
			res = path.Clean(strings.TrimPrefix(t, "/"))
		} else {
			res = path.Clean(path.Join(path.Dir(from), t))
		}
		if !seen[res] {
			seen[res] = true
			out = append(out, res)
		}
	}
	return out
}

// FixIndex regenerates index.md and llms.txt.
func FixIndex(wikiDir string) error {
	pages, _ := LoadPages(wikiDir)
	if err := WriteFileAtomic(filepath.Join(wikiDir, "index.md"), RenderIndex(pages)); err != nil {
		return err
	}
	return WriteFileAtomic(filepath.Join(wikiDir, "llms.txt"), RenderLLMSTxt(pages))
}
