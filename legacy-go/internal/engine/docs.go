package engine

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/luckylucky0001/codewiki/internal/config"
	"github.com/luckylucky0001/codewiki/internal/model"
	"github.com/luckylucky0001/codewiki/internal/wiki"
)

// DocEntry is one discovered / ingested document.
type DocEntry struct {
	Path       string `json:"path"` // repo-relative (or absolute when outside the repo)
	Kind       string `json:"kind"` // spec | design | tasks | adr | agent-guide | readme | doc
	Convention string `json:"convention"`
	Hash       string `json:"hash"`
	Title      string `json:"title,omitempty"`
	Bytes      int    `json:"bytes"`
	Raw        string `json:"raw,omitempty"` // wiki-relative raw copy (after ingest)
}

// DocsManifest is the output of kb discover-docs and the raw/docs index.
type DocsManifest struct {
	Version int        `json:"version"`
	Root    string     `json:"root,omitempty"`
	Docs    []DocEntry `json:"docs"`
}

// ClassifyDoc applies industry conventions to a repo-relative path.
func ClassifyDoc(rel string) (kind, convention string, ok bool) {
	p := strings.ToLower(rel)
	base := path.Base(p)
	if !strings.HasSuffix(p, ".md") && !strings.HasSuffix(p, ".mdx") {
		return "", "", false
	}
	has := func(seg string) bool { return strings.HasPrefix(p, seg) || strings.Contains(p, "/"+seg) }
	switch {
	case has(".specify/"):
		return "agent-guide", "spec-kit", true
	case has("specs/") && !has("openspec/") && !has(".kiro/"):
		switch base {
		case "spec.md":
			return "spec", "spec-kit", true
		case "plan.md", "research.md", "data-model.md", "quickstart.md":
			return "design", "spec-kit", true
		case "tasks.md":
			return "tasks", "spec-kit", true
		}
		return "doc", "spec-kit", true
	case has("openspec/"):
		switch {
		case base == "spec.md":
			return "spec", "openspec", true
		case base == "proposal.md" || base == "design.md":
			return "design", "openspec", true
		case base == "tasks.md":
			return "tasks", "openspec", true
		case base == "project.md" || base == "agents.md":
			return "agent-guide", "openspec", true
		}
		return "doc", "openspec", true
	case has(".kiro/specs/"):
		switch base {
		case "requirements.md":
			return "spec", "kiro", true
		case "design.md":
			return "design", "kiro", true
		case "tasks.md":
			return "tasks", "kiro", true
		}
		return "doc", "kiro", true
	case has(".kiro/steering/"):
		return "agent-guide", "kiro", true
	case has("docs/adr/") || has("doc/adr/") || has("adr/") || has("architecture/decisions/") || has("docs/decisions/"):
		return "adr", "adr", true
	case has("rfcs/") || has("rfc/"):
		return "design", "rfc", true
	case base == "agents.md" || base == "claude.md" || base == "gemini.md" || p == ".github/copilot-instructions.md":
		return "agent-guide", "agents-md", true
	case base == "threatmodel.md" || base == "security.md":
		return "design", "security", true
	case base == "readme.md":
		return "readme", "readme", true
	case has("docs/") || has("doc/"):
		return "doc", "docs", true
	case base == "contributing.md":
		return "doc", "docs", true
	}
	return "", "", false
}

var skipDirs = map[string]bool{".git": true, "node_modules": true, "dist": true, "build": true, "vendor": true, "third_party": true, ".kb-work": true, "Pods": true, "oh_modules": true, ".gradle": true, ".idea": true, "coverage": true}

// DiscoverDocs walks root and classifies documentation files.
func DiscoverDocs(root string, exclude []string) (*DocsManifest, error) {
	abs, err := config.AbsRoot(root)
	if err != nil {
		return nil, err
	}
	m := &DocsManifest{Version: 1, Root: abs, Docs: []DocEntry{}}
	excl := map[string]bool{}
	for _, e := range exclude {
		excl[strings.TrimSuffix(e, "/")] = true
	}
	err = filepath.WalkDir(abs, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(abs, p)
		rel = filepath.ToSlash(rel)
		if d.IsDir() {
			if p != abs && (skipDirs[d.Name()] || excl[rel]) {
				return filepath.SkipDir
			}
			if strings.HasPrefix(d.Name(), ".") && p != abs && d.Name() != ".kiro" && d.Name() != ".specify" && d.Name() != ".github" {
				return filepath.SkipDir
			}
			return nil
		}
		kind, conv, ok := ClassifyDoc(rel)
		if !ok {
			return nil
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return nil
		}
		h := sha256.Sum256(b)
		m.Docs = append(m.Docs, DocEntry{Path: rel, Kind: kind, Convention: conv, Hash: hex.EncodeToString(h[:]), Title: firstHeading(b), Bytes: len(b)})
		return nil
	})
	sort.Slice(m.Docs, func(i, j int) bool { return m.Docs[i].Path < m.Docs[j].Path })
	return m, err
}

func firstHeading(b []byte) string {
	for _, l := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(l, "# ") {
			return strings.TrimSpace(l[2:])
		}
	}
	return ""
}

// RawManifestPath is where ingested docs are tracked (wiki-relative).
const RawManifestPath = "raw/docs/manifest.json"

// LoadRawManifest reads raw/docs/manifest.json from a wiki dir.
func LoadRawManifest(wikiDir string) *DocsManifest {
	m := &DocsManifest{Version: 1, Docs: []DocEntry{}}
	b, err := os.ReadFile(filepath.Join(wikiDir, filepath.FromSlash(RawManifestPath)))
	if err == nil {
		_ = json.Unmarshal(b, m)
	}
	m.Root = ""
	return m
}

// CopyDocs copies docs into <wikiDir>/raw/docs and updates the manifest.
func CopyDocs(repoRoot, wikiDir string, docs []DocEntry) ([]DocEntry, error) {
	man := LoadRawManifest(wikiDir)
	byPath := map[string]int{}
	for i, d := range man.Docs {
		byPath[d.Path] = i
	}
	var copied []DocEntry
	for _, d := range docs {
		src := d.Path
		if !filepath.IsAbs(src) {
			src = filepath.Join(repoRoot, filepath.FromSlash(d.Path))
		}
		b, err := os.ReadFile(src)
		if err != nil {
			return copied, fmt.Errorf("read %s: %w", d.Path, err)
		}
		rel := d.Path
		if filepath.IsAbs(rel) || strings.HasPrefix(rel, "..") {
			rel = filepath.Base(rel)
		}
		rel = strings.TrimPrefix(filepath.ToSlash(rel), "./")
		d.Raw = "raw/docs/" + rel
		if d.Kind == "" {
			if k, c, ok := ClassifyDoc(rel); ok {
				d.Kind, d.Convention = k, c
			} else {
				d.Kind, d.Convention = "doc", "legacy"
			}
		}
		h := sha256.Sum256(b)
		d.Hash = hex.EncodeToString(h[:])
		d.Bytes = len(b)
		if d.Title == "" {
			d.Title = firstHeading(b)
		}
		if err := wiki.WriteFileAtomic(filepath.Join(wikiDir, filepath.FromSlash(d.Raw)), b); err != nil {
			return copied, err
		}
		if i, ok := byPath[d.Path]; ok {
			man.Docs[i] = d
		} else {
			byPath[d.Path] = len(man.Docs)
			man.Docs = append(man.Docs, d)
		}
		copied = append(copied, d)
	}
	sort.Slice(man.Docs, func(i, j int) bool { return man.Docs[i].Path < man.Docs[j].Path })
	b, _ := json.MarshalIndent(man, "", "  ")
	return copied, wiki.WriteFileAtomic(filepath.Join(wikiDir, filepath.FromSlash(RawManifestPath)), append(b, '\n'))
}

// AllClaims extracts the claims of every ingested doc in wikiDir.
func AllClaims(wikiDir string) []Claim {
	man := LoadRawManifest(wikiDir)
	var out []Claim
	for _, d := range man.Docs {
		b, err := os.ReadFile(filepath.Join(wikiDir, filepath.FromSlash(d.Raw)))
		if err != nil {
			continue
		}
		out = append(out, ExtractClaims(d.Path, d.Raw, b)...)
	}
	return out
}

// Verdicts is the LLM/template output for a conflicts task.
type Verdicts struct {
	Version int     `json:"version"`
	Claims  []Claim `json:"claims"`
}

// Page budget for pages/_conflicts.md: sections with more rows than this are
// summarized per document (conflicts are listed up to their own, larger cap).
var (
	ConflictsPageMaxRows         = 300
	ConflictsPageMaxConflictRows = 1000
)

// RenderConflicts renders pages/_conflicts.md and facts/requirements.json from checked claims.
func RenderConflicts(claims []Claim, g *model.Graph, commit string) (*wiki.Page, []model.Requirement) {
	var reqs []model.Requirement
	anchorSet := map[string]bool{}
	nVerified := 0
	for _, c := range claims {
		if c.Status == ClaimVerified {
			nVerified++
		}
	}
	// a summarized verified section does not anchor the page on every
	// verified claim's symbols (thousands of frontmatter lines); claims are
	// re-checked on every ingest / compound anyway
	bigVerified := nVerified > ConflictsPageMaxRows
	bySrc := map[string][]Claim{}
	var srcs []string
	counts := map[string]int{}
	for _, c := range claims {
		if _, ok := bySrc[c.Source]; !ok {
			srcs = append(srcs, c.Source)
		}
		bySrc[c.Source] = append(bySrc[c.Source], c)
		counts[c.Status]++
		r := model.Requirement{ID: c.ID, Source: c.Source, Line: c.Line, Text: c.Text, Status: c.Status, Anchors: []model.Anchor{}, RouteIDs: c.RouteIDs, Evidence: c.Evidence}
		if r.RouteIDs == nil {
			r.RouteIDs = []string{}
		}
		for _, a := range c.Anchors {
			if s := g.Get(a); s != nil {
				r.Anchors = append(r.Anchors, model.Anchor{Sym: s.ID, Hash: s.Hash})
				if c.Status == ClaimConflict || (c.Status == ClaimVerified && !bigVerified) {
					anchorSet[s.ID] = true
				}
			}
		}
		reqs = append(reqs, r)
	}
	sort.Strings(srcs)
	var b strings.Builder
	fmt.Fprintf(&b, "# 文档核对：冲突与已验证断言\n\n> 代码为准（code wins）。本页由 `kb ingest` / `kb compound` 根据 `raw/docs/` 中的文档逐条核对生成；机器可读版本见 [facts/requirements.json](../facts/requirements.json)。\n\n")
	fmt.Fprintf(&b, "| 状态 | 数量 |\n|---|---|\n| conflict（与代码冲突） | %d |\n| verified（有代码锚点） | %d |\n| unverifiable（无证据，不提升为知识） | %d |\n", counts[ClaimConflict], counts[ClaimVerified], counts[ClaimUnverifiable])
	section := func(title, status string) {
		var rows []string
		perDoc := map[string]int{}
		for _, s := range srcs {
			for _, c := range bySrc[s] {
				if c.Status != status {
					continue
				}
				perDoc[s]++
				ev := strings.Join(c.Evidence, "；")
				rows = append(rows, fmt.Sprintf("- **%s** （[%s](../%s) L%d）%s\n  - 证据：%s", c.ID, s, c.Raw, c.Line, inertLinks(c.Text), ev))
			}
		}
		fmt.Fprintf(&b, "\n## %s\n\n", title)
		if len(rows) == 0 {
			b.WriteString("（无）\n")
			return
		}
		limit := ConflictsPageMaxRows
		if status == ClaimConflict {
			limit = ConflictsPageMaxConflictRows
		}
		if len(rows) <= limit {
			b.WriteString(strings.Join(rows, "\n") + "\n")
			return
		}
		// Page token budget: on large doc sets (NextE: 3,351 claims, a 2.2 MB
		// page) only a per-document summary is rendered; every claim stays in
		// facts/requirements.json and `kb conflicts`.
		if status == ClaimConflict {
			b.WriteString(strings.Join(rows[:limit], "\n") + "\n")
			fmt.Fprintf(&b, "\n…另有 %d 条冲突未列出（页面预算）。完整列表：`kb conflicts` 或 facts/requirements.json。\n", len(rows)-limit)
			return
		}
		fmt.Fprintf(&b, "共 %d 条，超过页面预算（%d），只列每篇文档的数量；逐条内容见 facts/requirements.json（`kb conflicts --all --json`、`kb search`）。\n\n| 文档 | 数量 |\n|---|---|\n", len(rows), limit)
		for _, s := range srcs {
			if perDoc[s] > 0 {
				fmt.Fprintf(&b, "| %s | %d |\n", s, perDoc[s])
			}
		}
	}
	var sus []string
	for _, s := range srcs {
		for _, c := range bySrc[s] {
			if c.Suspicious != "" {
				sus = append(sus, fmt.Sprintf("- **%s** （[%s](../%s) L%d）匹配 `%s` —— 内容未展示，未提升", c.ID, s, c.Raw, c.Line, c.Suspicious))
			}
		}
	}
	if len(sus) > 0 {
		fmt.Fprintf(&b, "\n## ⚠ 可疑内容（疑似 prompt injection）\n\n以下断言包含针对 AI 的指令性文字，已从 LLM 输入中隐去，且不会被核对或提升为知识。请人工检查原文。\n\n%s\n", strings.Join(sus, "\n"))
	}
	section("冲突 conflicts（文档已过时，以代码为准）", ClaimConflict)
	section("已验证 verified", ClaimVerified)
	section("无法验证 unverifiable", ClaimUnverifiable)
	page := &wiki.Page{Path: ConflictsPage, HasFM: true, Body: b.String()}
	page.Front = wiki.Front{ID: wiki.IDFromPath(ConflictsPage), Title: "文档核对（冲突与已验证断言）", Kind: "conflicts", SourceCommit: commit, Status: wiki.StatusCurrent}
	for _, id := range sortedKeys(anchorSet) {
		page.Front.Sources = append(page.Front.Sources, model.Anchor{Sym: id, Hash: g.Get(id).Hash})
	}
	return page, reqs
}

var reMdLink = regexp.MustCompile(`!?\[([^\]]*)\]\(([^)\s]+)[^)]*\)`)

// inertLinks turns markdown links quoted from a source document into plain
// text. Their targets are relative to the original document, not to the wiki
// page, so keeping them would create dead links (and verify would refuse to
// publish); a quoted doc must also not be able to inject links into the wiki.
func inertLinks(s string) string {
	return reMdLink.ReplaceAllString(s, "$1（`$2`）")
}
