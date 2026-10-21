// Package skills embeds the Agent Skills shipped with kb so that
// `kb install-skills` works from a single binary.
package skills

import (
	"embed"
	"io/fs"
	"sort"
)

//go:embed kb-compound kb-ingest kb-query kb-lint
var content embed.FS

// File is one embedded skill file.
type File struct {
	Path string
	Data []byte
}

// Files lists all embedded skill files (paths relative to skills/).
func Files() ([]File, error) {
	var out []File
	err := fs.WalkDir(content, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		b, err := content.ReadFile(p)
		if err != nil {
			return err
		}
		out = append(out, File{Path: p, Data: b})
		return nil
	})
	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	return out, err
}
