// Package scan walks the configured platform roots, parses every supported
// source file and builds the symbol graph with resolved reference edges.
package scan

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/luckylucky0001/codewiki/internal/config"
	"github.com/luckylucky0001/codewiki/internal/extract"
	"github.com/luckylucky0001/codewiki/internal/model"
)

// Result is the outcome of a scan.
type Result struct {
	Graph *model.Graph
	Calls map[string][]extract.Call // repo-relative file -> call sites
	Dir   string                    // scanned directory (absolute)
	Stats Stats
}

// Stats reports scan performance counters.
type Stats struct {
	Files      int   `json:"files"`
	Parsed     int   `json:"parsed"`
	CacheHits  int   `json:"cache_hits"`
	Workers    int   `json:"workers"`
	DurationMs int64 `json:"duration_ms"`
}

// Options tunes a scan.
type Options struct {
	Cache   *Cache // optional per-file parse cache (content-hash keyed)
	Workers int    // 0 = GOMAXPROCS
}

type job struct {
	platform, lang, rel, prel, path string
}

type jobResult struct {
	job
	src  []byte
	hash string
	fr   extract.FileResult
	err  error
	hit  bool
}

// Scan parses the source tree at dir according to cfg (no cache).
func Scan(cfg *config.Config, dir string) (*Result, error) {
	return ScanWith(cfg, dir, Options{})
}

// ScanWith parses the source tree at dir with options.
func ScanWith(cfg *config.Config, dir string, opt Options) (*Result, error) {
	start := time.Now()
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	g := &model.Graph{Version: model.GraphVersion, Files: map[string]model.FileInfo{}, ParseFailures: []model.ParseFailure{}, Symbols: []*model.Symbol{}}
	res := &Result{Graph: g, Calls: map[string][]extract.Call{}, Dir: abs}
	excl := compileGlobs(append(append([]string{}, cfg.Exclude...), cfg.WikiDir+"/**"))
	var jobs []job
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
			jobs = append(jobs, job{platform: p.Name, lang: lang, rel: rel, prel: prel, path: path})
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	workers := opt.Workers
	if workers <= 0 {
		workers = runtime.GOMAXPROCS(0)
	}
	if workers > len(jobs) {
		workers = max(1, len(jobs))
	}
	results := make([]jobResult, len(jobs))
	idx := make(chan int)
	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ps := extract.NewParsers()
			defer ps.Close()
			for i := range idx {
				results[i] = runJob(ps, jobs[i], opt.Cache)
			}
		}()
	}
	for i := range jobs {
		idx <- i
	}
	close(idx)
	wg.Wait()
	seen := map[string]bool{}
	for _, r := range results {
		if r.err != nil {
			g.ParseFailures = append(g.ParseFailures, model.ParseFailure{File: r.rel, Error: r.err.Error()})
			continue
		}
		if r.fr.Failure != nil {
			g.ParseFailures = append(g.ParseFailures, *r.fr.Failure)
		}
		g.Symbols = append(g.Symbols, r.fr.Symbols...)
		res.Calls[r.rel] = r.fr.Calls
		g.Files[r.rel] = model.FileInfo{Platform: r.platform, Lang: r.lang, Hash: r.hash, Symbols: len(r.fr.Symbols), Package: r.fr.Package, Imports: r.fr.Imports}
		res.Stats.Files++
		if r.hit {
			res.Stats.CacheHits++
		} else {
			res.Stats.Parsed++
		}
		seen[r.rel] = true
		if opt.Cache != nil && !r.hit {
			opt.Cache.put(r.rel, r.hash, r.lang, r.platform, r.fr)
		}
	}
	if opt.Cache != nil {
		opt.Cache.prune(seen)
	}
	sort.Slice(g.Symbols, func(i, j int) bool { return g.Symbols[i].ID < g.Symbols[j].ID })
	sort.Slice(g.ParseFailures, func(i, j int) bool { return g.ParseFailures[i].File < g.ParseFailures[j].File })
	g.Index()
	ResolveRefs(g)
	res.Stats.Workers = workers
	res.Stats.DurationMs = time.Since(start).Milliseconds()
	return res, nil
}

func runJob(ps *extract.Parsers, j job, c *Cache) jobResult {
	r := jobResult{job: j}
	src, err := os.ReadFile(j.path)
	if err != nil {
		r.err = err
		return r
	}
	h := sha256.Sum256(src)
	r.hash = hex.EncodeToString(h[:])
	if len(src) > 2<<20 {
		r.err = errTooLarge
		return r
	}
	if c != nil {
		if fr, ok := c.get(j.rel, r.hash, j.lang, j.platform); ok {
			r.fr, r.hit = fr, true
			return r
		}
	}
	r.fr = extract.ParseFile(ps, j.lang, j.platform, j.prel, j.rel, src)
	return r
}

var errTooLarge = errors.New("file too large (>2MiB), skipped")

// ResolveRefs turns identifier names into symbol ids. Resolution is scope
// aware: same-file declarations first, then explicit imports (Kotlin/Java
// fully qualified imports, ArkTS/TS `import {X} from './file'`; imports of
// external packages shadow project symbols), then members of types that are
// visible in the file (or reached through a referenced property's type), then
// top-level symbols visible by package (Kotlin/Java same package or wildcard
// import) or module (Swift). Ambiguous names are dropped.
func ResolveRefs(g *model.Graph) {
	type key struct{ a, b, c string }
	byName := map[key][]*model.Symbol{}   // platform, name
	byFile := map[key][]*model.Symbol{}   // file, name
	byParent := map[key][]*model.Symbol{} // platform, parent name, name
	fileScope := map[string]map[string]bool{}
	projectPkgs := map[string]bool{}
	imports := map[string]map[string]string{} // file -> name -> source
	wild := map[string][]string{}             // file -> wildcard packages / modules
	for f, fi := range g.Files {
		if fi.Package != "" {
			projectPkgs[fi.Package] = true
		}
		m := map[string]string{}
		for _, imp := range fi.Imports {
			name, src, _ := strings.Cut(imp, "|")
			if name == "*" {
				wild[f] = append(wild[f], src)
				continue
			}
			m[name] = src
		}
		imports[f] = m
		sc := map[string]bool{}
		for n := range m {
			sc[n] = true
		}
		fileScope[f] = sc
	}
	for _, s := range g.Symbols {
		byName[key{s.Platform, s.Name, ""}] = append(byName[key{s.Platform, s.Name, ""}], s)
		byFile[key{s.File, s.Name, ""}] = append(byFile[key{s.File, s.Name, ""}], s)
		if s.Parent != "" {
			if p := g.Get(s.Parent); p != nil {
				k := key{s.Platform, p.Name, s.Name}
				byParent[k] = append(byParent[k], s)
			}
		}
		sc := fileScope[s.File]
		if sc == nil {
			sc = map[string]bool{}
			fileScope[s.File] = sc
		}
		for _, n := range s.RefNames {
			sc[n] = true
		}
	}
	pkgOf := func(file string) string { return g.Files[file].Package }
	langOf := func(file string) string { return g.Files[file].Lang }
	isES := func(l string) bool { return l == "arkts" || l == "typescript" || l == "tsx" || l == "javascript" }

	// resolveImport returns (candidates, handled). handled=true with no
	// candidates means the name refers to an external package.
	resolveImport := func(s *model.Symbol, n string) ([]*model.Symbol, bool) {
		src, ok := imports[s.File][n]
		if !ok {
			return nil, false
		}
		lang := langOf(s.File)
		switch {
		case lang == "kotlin" || lang == "java":
			pkg := src
			if i := strings.LastIndex(src, "."); i >= 0 {
				pkg = src[:i]
			}
			orig := src[strings.LastIndex(src, ".")+1:]
			var out []*model.Symbol
			for _, c := range byName[key{s.Platform, orig, ""}] {
				if pkgOf(c.File) == pkg && c.Parent == "" {
					out = append(out, c)
				}
			}
			if len(out) == 0 && !projectPkgs[pkg] {
				// maybe Outer.Inner import; otherwise external
				outerPkg := pkg
				if i := strings.LastIndex(pkg, "."); i >= 0 {
					outerPkg = pkg[:i]
				}
				if !projectPkgs[outerPkg] {
					return nil, true
				}
			}
			return out, true
		case isES(lang):
			orig := n
			if i := strings.Index(src, "#"); i >= 0 {
				src, orig = src[:i], src[i+1:]
			}
			if !strings.HasPrefix(src, ".") {
				return nil, true // package import (@kit.ArkUI, react, …)
			}
			base := path.Clean(path.Join(path.Dir(s.File), src))
			var out []*model.Symbol
			for _, ext := range []string{"", ".ets", ".ts", ".js", ".tsx", ".mjs", "/index.ets", "/index.ts", "/index.js"} {
				for _, c := range byFile[key{base + ext, orig, ""}] {
					if c.Parent == "" {
						out = append(out, c)
					}
				}
			}
			return out, true
		}
		return nil, false
	}

	pass := func(s *model.Symbol, scope map[string]bool) []string {
		self := func(c *model.Symbol) bool {
			return c.ID == s.ID || c.ID == s.Parent || c.Parent == s.ID || strings.HasPrefix(s.ID, c.ID+".")
		}
		called := map[string]bool{}
		for _, n := range s.CallNames {
			called[n] = true
		}
		lang := langOf(s.File)
		refs := map[string]bool{}
		for _, n := range s.RefNames {
			var pick []*model.Symbol
			for _, c := range byFile[key{s.File, n, ""}] {
				if !self(c) {
					pick = append(pick, c)
				}
			}
			if len(pick) == 0 {
				cands, handled := resolveImport(s, n)
				if handled {
					for _, c := range cands {
						if !self(c) {
							pick = append(pick, c)
						}
					}
					if len(pick) == 0 {
						continue // external import shadows project symbols
					}
				}
			}
			if len(pick) == 0 {
				var preferred []*model.Symbol
				for _, pn := range s.RefNames {
					owners := map[string]bool{}
					if imp, ok := resolveImport(s, pn); ok {
						for _, o := range imp {
							owners[o.ID] = true
						}
					}
					for _, o := range byFile[key{s.File, pn, ""}] {
						owners[o.ID] = true
					}
					for _, c := range byParent[key{s.Platform, pn, n}] {
						if self(c) {
							continue
						}
						pick = append(pick, c)
						if owners[c.Parent] {
							preferred = append(preferred, c)
						}
					}
				}
				if len(preferred) > 0 {
					pick = preferred // Owner.member where Owner is imported / local
				}
			}
			if len(pick) == 0 {
				var vis []*model.Symbol
				for _, c := range byName[key{s.Platform, n, ""}] {
					if self(c) {
						continue
					}
					if c.Parent != "" {
						p := g.Get(c.Parent)
						if p != nil && (scope[p.Name] || fileScope[s.File][p.Name]) {
							vis = append(vis, c)
						}
						continue
					}
					switch {
					case lang == "kotlin" || lang == "java":
						if pkgOf(c.File) == pkgOf(s.File) || containsStr(wild[s.File], pkgOf(c.File)) {
							vis = append(vis, c)
						}
					case isES(lang):
						// top-level ES symbols must be imported (handled above)
					default:
						vis = append(vis, c)
					}
				}
				if len(vis) <= 3 {
					var top []*model.Symbol
					for _, c := range vis {
						if c.Parent == "" {
							top = append(top, c)
						}
					}
					if len(top) == 0 {
						top = vis
						if len(top) > 1 {
							// several members with this name: if the name is called,
							// prefer the single callable candidate, otherwise the single
							// non-callable one
							var fit []*model.Symbol
							for _, c := range top {
								isFn := c.Kind == "function" || c.Kind == "method" || c.Kind == "constructor"
								if isFn == called[n] {
									fit = append(fit, c)
								}
							}
							top = nil
							if len(fit) == 1 {
								top = fit
							}
						}
					}
					pick = top
				}
			}
			if len(pick) > 3 {
				continue
			}
			for _, c := range pick {
				refs[c.ID] = true
			}
		}
		out := make([]string, 0, len(refs))
		for r := range refs {
			out = append(out, r)
		}
		sort.Strings(out)
		return out
	}
	// pass 1: file scope; pass 2: widen the scope with the type names used by
	// the referenced properties (vm -> CartViewModel, service -> ApiService)
	first := make([][]string, len(g.Symbols))
	for i, s := range g.Symbols {
		first[i] = pass(s, map[string]bool{})
	}
	for i, s := range g.Symbols {
		scope := map[string]bool{}
		for _, r := range first[i] {
			if rs := g.Get(r); rs != nil {
				scope[rs.Name] = true
				for _, n := range rs.RefNames {
					scope[n] = true
				}
			}
		}
		s.Refs = pass(s, scope)
		if len(s.Refs) == 0 {
			s.Refs = nil
		}
	}
}

func containsStr(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
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
