package extract

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"sync"

	sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/luckylucky0001/codewiki/internal/grammars/arkts"
)

// The extractor's own source is embedded so that any code change — not only a
// remembered version bump — changes the fingerprint and invalidates caches.
//
//go:embed *.go
var sources embed.FS

var (
	fpOnce sync.Once
	fp     string
)

// Fingerprint identifies the extractor build: a hash of its Go sources, the
// per-language node tables (langSpec) and each grammar's ABI version and
// node-kind count. Caches keyed by it can never serve results produced by a
// different extractor.
func Fingerprint() string {
	fpOnce.Do(func() { fp = fingerprint(sources, specs) })
	return fp
}

func fingerprint(src fs.FS, sp map[string]*langSpec) string {
	h := sha256.New()
	var names []string
	_ = fs.WalkDir(src, ".", func(p string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() && !strings.HasSuffix(p, "_test.go") {
			names = append(names, p)
		}
		return nil
	})
	sort.Strings(names)
	for _, n := range names {
		b, _ := fs.ReadFile(src, n)
		fmt.Fprintf(h, "file %s %d\n", n, len(b))
		h.Write(b)
	}
	fmt.Fprintf(h, "arkts-grammar %s\n", arkts.GrammarHash)
	var langs []string
	for l := range sp {
		langs = append(langs, l)
	}
	sort.Strings(langs)
	for _, l := range langs {
		s := sp[l]
		fmt.Fprintf(h, "lang %s\n", l)
		for _, tbl := range []set{s.comments, s.containers, s.transparent, s.bodies, s.idents, s.calls, s.strings} {
			fmt.Fprintf(h, "%v\n", sortedSet(tbl))
		}
		var dk []string
		for k, v := range s.decls {
			dk = append(dk, k+"="+v)
		}
		sort.Strings(dk)
		fmt.Fprintf(h, "%v\n", dk)
		if s.ptr != nil {
			lang := sitter.NewLanguage(s.ptr())
			fmt.Fprintf(h, "abi %d kinds %d\n", lang.AbiVersion(), lang.NodeKindCount())
		}
	}
	return hex.EncodeToString(h.Sum(nil))
}

func sortedSet(s set) []string {
	out := make([]string, 0, len(s))
	for k := range s {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
