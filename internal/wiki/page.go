// Package wiki reads and writes the LLM Wiki: pages with YAML frontmatter,
// the index, the append-only log and the verification gate.
package wiki

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/luckylucky0001/codewiki/internal/model"
)

// Statuses allowed in frontmatter.
const (
	StatusCurrent     = "current"
	StatusStale       = "stale"
	StatusOutdatedDoc = "outdated-doc"
)

// Front is the page frontmatter contract.
type Front struct {
	ID           string         `yaml:"id" json:"id"`
	Title        string         `yaml:"title" json:"title"`
	Kind         string         `yaml:"kind,omitempty" json:"kind,omitempty"`
	Platforms    []string       `yaml:"platforms,omitempty,flow" json:"platforms,omitempty"`
	Routes       []string       `yaml:"routes,omitempty,flow" json:"routes,omitempty"`
	Sources      []model.Anchor `yaml:"sources,omitempty" json:"sources,omitempty"`
	SourceCommit string         `yaml:"source_commit,omitempty" json:"source_commit,omitempty"`
	Status       string         `yaml:"status,omitempty" json:"status,omitempty"`
	Generated    bool           `yaml:"generated,omitempty" json:"generated,omitempty"`
}

// Page is one markdown page of the wiki.
type Page struct {
	Path  string `json:"path"` // wiki-relative, slash separated
	Front Front  `json:"front"`
	Body  string `json:"-"`
	HasFM bool   `json:"-"`
}

// ErrNoFrontmatter is returned when a page lacks a frontmatter block.
var ErrNoFrontmatter = errors.New("missing frontmatter")

// ParsePage parses markdown with optional YAML frontmatter.
func ParsePage(path string, b []byte) (*Page, error) {
	p := &Page{Path: path}
	s := string(b)
	if !strings.HasPrefix(s, "---\n") {
		p.Body = s
		return p, ErrNoFrontmatter
	}
	end := strings.Index(s[4:], "\n---")
	if end < 0 {
		p.Body = s
		return p, ErrNoFrontmatter
	}
	fm := s[4 : 4+end]
	rest := s[4+end+4:]
	rest = strings.TrimPrefix(rest, "\n")
	p.Body = rest
	p.HasFM = true
	if err := yaml.Unmarshal([]byte(fm), &p.Front); err != nil {
		return p, fmt.Errorf("frontmatter: %w", err)
	}
	return p, nil
}

// Render serializes the page.
func (p *Page) Render() []byte {
	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	_ = enc.Encode(p.Front)
	_ = enc.Close()
	out := "---\n" + buf.String() + "---\n" + p.Body
	if !strings.HasSuffix(out, "\n") {
		out += "\n"
	}
	return []byte(out)
}

// IDFromPath derives a page id from its wiki-relative path.
func IDFromPath(rel string) string {
	id := strings.TrimSuffix(rel, ".md")
	return strings.TrimPrefix(id, "pages/")
}

// Special (non-page) files at the wiki root.
var rootFiles = map[string]bool{"AGENTS.md": true, "index.md": true, "log.md": true, "llms.txt": true}

// IsPagePath reports whether a wiki-relative path is a content page that
// must be indexed and verified (pages/** and facts/**/*.md).
func IsPagePath(rel string) bool {
	if !strings.HasSuffix(rel, ".md") {
		return false
	}
	return strings.HasPrefix(rel, "pages/") || strings.HasPrefix(rel, "facts/")
}

// LoadPages loads every page under pages/ and facts/.
func LoadPages(wikiDir string) ([]*Page, []error) {
	var pages []*Page
	var errs []error
	for _, sub := range []string{"pages", "facts"} {
		root := filepath.Join(wikiDir, sub)
		_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}
			rel, _ := filepath.Rel(wikiDir, path)
			rel = filepath.ToSlash(rel)
			if !IsPagePath(rel) {
				return nil
			}
			b, err := os.ReadFile(path)
			if err != nil {
				errs = append(errs, err)
				return nil
			}
			p, err := ParsePage(rel, b)
			if err != nil {
				errs = append(errs, fmt.Errorf("%s: %w", rel, err))
			}
			pages = append(pages, p)
			return nil
		})
	}
	sort.Slice(pages, func(i, j int) bool { return pages[i].Path < pages[j].Path })
	return pages, errs
}

// FindPage resolves a page by id or path.
func FindPage(pages []*Page, q string) *Page {
	q = strings.TrimPrefix(q, "./")
	for _, p := range pages {
		if p.Path == q || p.Front.ID == q || IDFromPath(p.Path) == q || p.Path == q+".md" || p.Path == "pages/"+q+".md" {
			return p
		}
	}
	return nil
}

// WriteFileAtomic writes via a temp file + rename.
func WriteFileAtomic(path string, b []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp~"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
