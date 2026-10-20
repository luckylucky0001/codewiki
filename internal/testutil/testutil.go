// Package testutil holds helpers shared by tests.
package testutil

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/luckylucky0001/codewiki/internal/config"
)

// RepoRoot returns the codewiki repository root.
func RepoRoot() string {
	_, f, _, _ := runtime.Caller(0)
	return filepath.Clean(filepath.Join(filepath.Dir(f), "..", ".."))
}

// Minishop returns the path of examples/minishop.
func Minishop() string { return filepath.Join(RepoRoot(), "examples", "minishop") }

// CopyDir copies src into dst.
func CopyDir(t testing.TB, src, dst string) {
	t.Helper()
	err := filepath.Walk(src, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(target, b, 0o644)
	})
	if err != nil {
		t.Fatal(err)
	}
}

// MinishopConfig returns a config for a copy of minishop rooted at dir.
func MinishopConfig(dir string) *config.Config {
	c := config.Default()
	c.Root = dir
	c.Platforms = []config.Platform{{Name: "android", Root: "android"}, {Name: "ios", Root: "ios"}, {Name: "harmony", Root: "harmony"}}
	return c
}

// Git runs git in dir with a fixed identity.
func Git(t testing.TB, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"}, args...)...)
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}

// ApplyChange overlays examples/minishop-changes/<name>/files onto dir.
func ApplyChange(t testing.TB, dir, name string) {
	t.Helper()
	CopyDir(t, filepath.Join(RepoRoot(), "examples", "minishop-changes", name, "files"), dir)
}
