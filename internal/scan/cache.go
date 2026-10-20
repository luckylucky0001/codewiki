package scan

import (
	"compress/gzip"
	"crypto/sha256"
	"encoding/gob"
	"encoding/hex"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/luckylucky0001/codewiki/internal/config"
	"github.com/luckylucky0001/codewiki/internal/extract"
	"github.com/luckylucky0001/codewiki/internal/model"
)

// cacheFormat is bumped only when the cache file layout itself changes.
const cacheFormat = "scan-cache/6"

// CacheVersion is derived automatically from the extractor fingerprint (its
// embedded sources, node tables and grammar ABI) plus the graph version, so a
// forgotten manual bump can never serve stale parse results.
var CacheVersion = fmt.Sprintf("%s/g%d/%s", cacheFormat, model.GraphVersion, extract.Fingerprint()[:16])

// CacheFile is the cache location relative to the wiki dir (gitignored).
const CacheFile = ".kb/cache/scan.gob.gz"

type cacheEntry struct {
	Hash     string
	Lang     string
	Platform string
	Symbols  []*model.Symbol
	Calls    []extract.Call
	Failure  *model.ParseFailure
	Package  string
	Imports  []string
}

// Cache maps repo-relative files (by content hash) to their parse results so
// unchanged files are not re-parsed. Safe for concurrent use.
type Cache struct {
	mu      sync.Mutex
	Version string
	Graph   int
	Entries map[string]cacheEntry
	dirty   bool
}

// NewCache returns an empty cache.
func NewCache() *Cache {
	return &Cache{Version: CacheVersion, Graph: model.GraphVersion, Entries: map[string]cacheEntry{}}
}

// LoadCache reads a cache file; a missing or incompatible file yields an empty cache.
func LoadCache(path string) *Cache {
	f, err := os.Open(path)
	if err != nil {
		return NewCache()
	}
	defer f.Close()
	zr, err := gzip.NewReader(f)
	if err != nil {
		return NewCache()
	}
	c := NewCache()
	if err := gob.NewDecoder(zr).Decode(c); err != nil || c.Version != CacheVersion || c.Graph != model.GraphVersion {
		return NewCache()
	}
	if c.Entries == nil {
		c.Entries = map[string]cacheEntry{}
	}
	return c
}

// Save writes the cache if it changed.
func (c *Cache) Save(path string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.dirty {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp~"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	zw := gzip.NewWriter(f)
	if err := gob.NewEncoder(zw).Encode(c); err != nil {
		f.Close()
		return err
	}
	if err := zw.Close(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	c.dirty = false
	return os.Rename(tmp, path)
}

// Len returns the number of cached files.
func (c *Cache) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.Entries)
}

func (c *Cache) get(rel, hash, lang, platform string) (extract.FileResult, bool) {
	c.mu.Lock()
	e, ok := c.Entries[rel]
	c.mu.Unlock()
	if !ok || e.Hash != hash || e.Lang != lang || e.Platform != platform {
		return extract.FileResult{}, false
	}
	// copy symbols: callers mutate Refs during resolution
	syms := make([]*model.Symbol, len(e.Symbols))
	for i, s := range e.Symbols {
		cp := *s
		cp.Refs = nil
		cp.RefNames = append([]string(nil), s.RefNames...)
		cp.CallNames = append([]string(nil), s.CallNames...)
		syms[i] = &cp
	}
	return extract.FileResult{Symbols: syms, Calls: e.Calls, Failure: e.Failure, Package: e.Package, Imports: e.Imports}, true
}

func (c *Cache) put(rel, hash, lang, platform string, fr extract.FileResult) {
	syms := make([]*model.Symbol, len(fr.Symbols))
	for i, s := range fr.Symbols {
		cp := *s
		cp.Refs = nil
		cp.RefNames = append([]string(nil), s.RefNames...)
		cp.CallNames = append([]string(nil), s.CallNames...)
		syms[i] = &cp
	}
	c.mu.Lock()
	c.Entries[rel] = cacheEntry{Hash: hash, Lang: lang, Platform: platform, Symbols: syms, Calls: fr.Calls, Failure: fr.Failure, Package: fr.Package, Imports: fr.Imports}
	c.dirty = true
	c.mu.Unlock()
}

func (c *Cache) prune(seen map[string]bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for k := range c.Entries {
		if !seen[k] {
			delete(c.Entries, k)
			c.dirty = true
		}
	}
}

// ScanRepo scans cfg.Root using the wiki's scan cache unless KB_NO_CACHE is
// set. The cache is saved only when the wiki directory exists.
func ScanRepo(cfg *config.Config) (*Result, error) {
	if os.Getenv("KB_NO_CACHE") != "" {
		return Scan(cfg, cfg.Root)
	}
	wiki := cfg.WikiPath()
	path := filepath.Join(wiki, filepath.FromSlash(CacheFile))
	c := LoadCache(path)
	res, err := ScanWith(cfg, cfg.Root, Options{Cache: c})
	if err != nil {
		return nil, err
	}
	if st, err := os.Stat(wiki); err == nil && st.IsDir() {
		_ = c.Save(path)
	}
	return res, nil
}

// TreeStamp is a cheap no-change check for query commands: a hash of the
// config, the cache version and (path, size, mtime) of every non-excluded file
// under the platform roots — sources and the manifests / router_map / json5
// files the fact extractors read. No file contents are read.
func TreeStamp(cfg *config.Config) (string, error) {
	abs, err := config.AbsRoot(cfg.Root)
	if err != nil {
		return "", err
	}
	h := sha256.New()
	fmt.Fprintf(h, "%s\n%+v\n%v\n%s\n", CacheVersion, cfg.Platforms, cfg.Exclude, cfg.WikiDir)
	excl := compileGlobs(append(append([]string{}, cfg.Exclude...), cfg.WikiDir+"/**"))
	for _, p := range cfg.Platforms {
		proot := filepath.Join(abs, filepath.FromSlash(p.Root))
		err := filepath.WalkDir(proot, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			rel, _ := filepath.Rel(abs, path)
			rel = filepath.ToSlash(rel)
			if d.IsDir() {
				if rel != "." && path != proot && (strings.HasPrefix(d.Name(), ".") || matchAny(excl, rel+"/") || matchAny(excl, rel)) {
					return filepath.SkipDir
				}
				return nil
			}
			if matchAny(excl, rel) {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return nil
			}
			fmt.Fprintf(h, "%s\x00%d\x00%d\n", rel, info.Size(), info.ModTime().UnixNano())
			return nil
		})
		if err != nil {
			return "", err
		}
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
