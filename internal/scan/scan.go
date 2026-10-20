// Package scan walks the configured platform roots, parses every supported
// source file and builds the symbol graph with resolved reference edges.
package scan

import (
	"crypto/sha256"
	"encoding/hex"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/luckylucky0001/codewiki/internal/config"
	"github.com/luckylucky0001/codewiki/internal/extract"
	"github.com/luckylucky0001/codewiki/internal/model"
)

// Result is the outcome of a scan.
type Result struct {
	Graph *model.Graph
	Calls map[string][]extract.Call // repo-relative file -> call sites
	Dir   string                    // scanned directory (absolute)
}

// Scan parses the source tree at dir according to cfg.
func Scan(cfg *config.Config, dir string) (*Result, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	g := &model.Graph{Version: model.GraphVersion, Files: map[string]model.FileInfo{}, ParseFailures: []model.ParseFailure{}, Symbols: []*model.Symbol{}}
	res := &Result{Graph: g, Calls: map[string][]extract.Call{}, Dir: abs}
	ps := extract.NewParsers()
	defer ps.Close()
	excl := compileGlobs(append(append([]string{}, cfg.Exclude...), cfg.WikiDir+"/**"))
	for _, p := range cfg.Platforms {
		proot := filepath.Join(abs, filepath.FromSlash(p.Root))
		incl := compileGlobs(p.Include)
		if _, err := os.Stat(proot); err != nil {
			continue
		}
		err := filepath.WalkDir(proot, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			rel, _ := filepath.Rel(abs, path)
			rel = filepath.ToSlash(rel)
			if d.IsDir() {
				if rel != "." && (matchAny(excl, rel+"/") || matchAny(excl, rel) || strings.HasPrefix(d.Name(), ".")) && path != proot {
					return filepath.SkipDir
				}
				return nil
			}
			lang := extract.LangForPath(path)
			if lang == "" || matchAny(excl, rel) {
				return nil
			}
			prel, _ := filepath.Rel(proot, path)
			prel = filepath.ToSlash(prel)
			if len(incl) > 0 && !matchAny(incl, prel) {
				return nil
			}
			src, err := os.ReadFile(path)
			if err != nil {
				g.ParseFailures = append(g.ParseFailures, model.ParseFailure{File: rel, Error: err.Error()})
				return nil
			}
			if len(src) > 2<<20 {
				g.ParseFailures = append(g.ParseFailures, model.ParseFailure{File: rel, Error: "file too large (>2MiB), skipped"})
				return nil
			}
			fr := extract.ParseFile(ps, lang, p.Name, prel, rel, src)
			if fr.Failure != nil {
				g.ParseFailures = append(g.ParseFailures, *fr.Failure)
			}
			g.Symbols = append(g.Symbols, fr.Symbols...)
			res.Calls[rel] = fr.Calls
			h := sha256.Sum256(src)
			g.Files[rel] = model.FileInfo{Platform: p.Name, Lang: lang, Hash: hex.EncodeToString(h[:]), Symbols: len(fr.Symbols)}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	sort.Slice(g.Symbols, func(i, j int) bool { return g.Symbols[i].ID < g.Symbols[j].ID })
	sort.Slice(g.ParseFailures, func(i, j int) bool { return g.ParseFailures[i].File < g.ParseFailures[j].File })
	g.Index()
	ResolveRefs(g)
	return res, nil
}

// ResolveRefs turns identifier names into symbol ids using simple name
// resolution: same platform, prefer same file, then candidates whose parent
// name also appears among the referenced names.
func ResolveRefs(g *model.Graph) {
	byName := map[string][]*model.Symbol{}
	for _, s := range g.Symbols {
		byName[s.Platform+"\x00"+s.Name] = append(byName[s.Platform+"\x00"+s.Name], s)
	}
	for _, s := range g.Symbols {
		names := map[string]bool{}
		for _, n := range s.RefNames {
			names[n] = true
		}
		refs := map[string]bool{}
		for _, n := range s.RefNames {
			cands := byName[s.Platform+"\x00"+n]
			if len(cands) == 0 {
				continue
			}
			best, bestScore, ties := []*model.Symbol{}, -1, 0
			for _, c := range cands {
				if c.ID == s.ID || c.ID == s.Parent || c.Parent == s.ID || strings.HasPrefix(s.ID, c.ID+".") {
					continue
				}
				score := 0
				if c.File == s.File {
					score += 3
				}
				if c.Parent != "" {
					if p := g.Get(c.Parent); p != nil && names[p.Name] {
						score += 2
					}
					if c.Parent == s.Parent {
						score += 2
					}
				} else {
					score++
				}
				switch {
				case score > bestScore:
					best, bestScore, ties = []*model.Symbol{c}, score, 1
				case score == bestScore:
					best = append(best, c)
					ties++
				}
			}
			if ties > 3 {
				continue // too ambiguous (e.g. common method names)
			}
			for _, b := range best {
				refs[b.ID] = true
			}
		}
		s.Refs = s.Refs[:0]
		for r := range refs {
			s.Refs = append(s.Refs, r)
		}
		sort.Strings(s.Refs)
		if len(s.Refs) == 0 {
			s.Refs = nil
		}
	}
}

type glob struct{ re *regexp.Regexp }

func compileGlobs(pats []string) []glob {
	var out []glob
	for _, p := range pats {
		if p == "" {
			continue
		}
		var b strings.Builder
		b.WriteString("^")
		for i := 0; i < len(p); i++ {
			ch := p[i]
			switch ch {
			case '*':
				if i+1 < len(p) && p[i+1] == '*' {
					i++
					if i+1 < len(p) && p[i+1] == '/' {
						i++
						b.WriteString("(?:.*/)?")
					} else {
						b.WriteString(".*")
					}
				} else {
					b.WriteString("[^/]*")
				}
			case '?':
				b.WriteString("[^/]")
			default:
				b.WriteString(regexp.QuoteMeta(string(ch)))
			}
		}
		b.WriteString("$")
		out = append(out, glob{regexp.MustCompile(b.String())})
	}
	return out
}

func matchAny(gs []glob, s string) bool {
	for _, g := range gs {
		if g.re.MatchString(s) {
			return true
		}
	}
	return false
}

// MatchGlob reports whether path matches the glob pattern (supports **).
func MatchGlob(pattern, path string) bool { return matchAny(compileGlobs([]string{pattern}), path) }
