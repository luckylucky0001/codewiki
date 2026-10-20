// Package config loads codewiki.yaml.
package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// FileName is the config file name looked up at the repo root.
const FileName = "codewiki.yaml"

// Platform is one platform source root.
type Platform struct {
	Name    string   `yaml:"name" json:"name"`
	Root    string   `yaml:"root" json:"root"`
	Include []string `yaml:"include,omitempty" json:"include,omitempty"`
}

// Config is the codewiki.yaml schema.
type Config struct {
	Version   int        `yaml:"version" json:"version"`
	WikiDir   string     `yaml:"wiki_dir" json:"wiki_dir"`
	Project   string     `yaml:"project" json:"project"`
	Platforms []Platform `yaml:"platforms" json:"platforms"`
	Exclude   []string   `yaml:"exclude" json:"exclude"`
	LLM       struct {
		Cmd        string `yaml:"cmd" json:"cmd"`
		Agent      string `yaml:"agent,omitempty" json:"agent,omitempty"` // claude | codex | gemini | generic: backend adapter used by --llm cmd (overrides cmd unless generic)
		Model      string `yaml:"model,omitempty" json:"model,omitempty"` // optional model passed to the agent adapter
		TimeoutSec int    `yaml:"timeout_sec" json:"timeout_sec"`
	} `yaml:"llm" json:"llm"`
	Plan struct {
		Hops                 int     `yaml:"hops" json:"hops"`
		RebuildModuleRatio   float64 `yaml:"rebuild_module_ratio" json:"rebuild_module_ratio"`
		RebuildStructuralPct float64 `yaml:"rebuild_structural_ratio" json:"rebuild_structural_ratio"`
	} `yaml:"plan" json:"plan"`
	Docs struct {
		Exclude []string `yaml:"exclude" json:"exclude"`
	} `yaml:"docs" json:"docs"`

	Root string `yaml:"-" json:"root"` // absolute repo root
}

// DefaultLLMCmd is the default non-interactive LLM invocation. The prompt is
// passed on stdin and the working directory is the staging wiki.
const DefaultLLMCmd = `claude -p --permission-mode acceptEdits --allowedTools "Read,Write,Edit,Glob,Grep,Bash(kb anchor:*),Bash(kb get:*),Bash(kb search:*)" --output-format text`

// Default returns the default configuration.
func Default() *Config {
	c := &Config{Version: 1, WikiDir: "wiki", Project: "project"}
	c.Exclude = []string{"**/build/**", "**/node_modules/**", "**/.git/**", "**/Pods/**", "**/oh_modules/**", "**/.gradle/**", "**/.kb-work/**"}
	c.LLM.Cmd = DefaultLLMCmd
	c.LLM.TimeoutSec = 600
	c.Plan.Hops = 1
	c.Plan.RebuildModuleRatio = 0.5
	c.Plan.RebuildStructuralPct = 0.3
	return c
}

// ErrNotFound is returned when no codewiki.yaml exists.
var ErrNotFound = errors.New("codewiki.yaml not found (run `kb init` first)")

// Load reads <root>/codewiki.yaml, filling defaults.
func Load(root string) (*Config, error) {
	abs, err := AbsRoot(root)
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(filepath.Join(abs, FileName))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	c := Default()
	if err := yaml.Unmarshal(b, c); err != nil {
		return nil, fmt.Errorf("parse %s: %w", FileName, err)
	}
	if c.WikiDir == "" {
		c.WikiDir = "wiki"
	}
	if c.Plan.Hops == 0 {
		c.Plan.Hops = 1
	}
	if c.LLM.Cmd == "" {
		c.LLM.Cmd = DefaultLLMCmd
	}
	c.Root = abs
	return c, nil
}

// WikiPath returns the absolute wiki directory.
func (c *Config) WikiPath() string {
	if filepath.IsAbs(c.WikiDir) {
		return c.WikiDir
	}
	return filepath.Join(c.Root, c.WikiDir)
}

// AbsRoot is filepath.Abs plus symlink resolution. filepath.WalkDir does not
// descend into a root that is itself a symlink, so `kb --root <link>` (a repo
// reached through a symlinked checkout, macOS /tmp -> /private/tmp) used to
// scan zero files without any error.
func AbsRoot(p string) (string, error) {
	abs, err := filepath.Abs(p)
	if err != nil {
		return "", err
	}
	if real, err := filepath.EvalSymlinks(abs); err == nil {
		return real, nil
	}
	return abs, nil
}

// Detect guesses platforms from the directory layout of root.
//
// Conventional platform dirs (android/, ios/, harmony/ …) win. Otherwise the
// repo root itself is a platform root when it carries that platform's build
// marker: settings.gradle(.kts) for a multi-module Gradle build (android "."
// rather than just app/), an Xcode project/workspace or Package.swift (ios
// "."), build-profile.json5 / AppScope/ / oh-package.json5 (harmony "."). A
// KMP repo thus gets android "." plus ios "iosApp" — overlapping roots are
// fine, each file belongs to the most specific one (see Shadowed).
func Detect(root string) []Platform {
	var out []Platform
	isDir := func(d string) bool {
		st, err := os.Stat(filepath.Join(root, d))
		return err == nil && st.IsDir()
	}
	exists := func(f string) bool {
		_, err := os.Stat(filepath.Join(root, f))
		return err == nil
	}
	glob := func(pat string) bool {
		m, _ := filepath.Glob(filepath.Join(root, pat))
		return len(m) > 0
	}
	dirs := func(name string, ds ...string) bool {
		for _, d := range ds {
			if isDir(d) {
				out = append(out, Platform{Name: name, Root: d})
				return true
			}
		}
		return false
	}
	atRoot := map[string]bool{}
	if !dirs("android", "android", "Android") {
		switch {
		case exists("settings.gradle") || exists("settings.gradle.kts"):
			out = append(out, Platform{Name: "android", Root: "."})
			atRoot["android"] = true
		default:
			dirs("android", "app")
		}
	}
	if !dirs("ios", "ios", "iOS", "iosApp", "app/iosApp") {
		if glob("*.xcodeproj") || glob("*.xcworkspace") || exists("Package.swift") {
			out = append(out, Platform{Name: "ios", Root: "."})
			atRoot["ios"] = true
		}
	}
	if !dirs("harmony", "harmony", "harmonyos", "ohos", "HarmonyOS") {
		if exists("build-profile.json5") || exists("oh-package.json5") || isDir("AppScope") {
			out = append(out, Platform{Name: "harmony", Root: "."})
			atRoot["harmony"] = true
		}
	}
	if len(atRoot) == 0 || isDir("web") {
		dirs("web", "web", "src", "lib")
	}
	return out
}

// Render serializes the config as YAML with a header comment.
func (c *Config) Render() ([]byte, error) {
	b, err := yaml.Marshal(c)
	if err != nil {
		return nil, err
	}
	head := "# codewiki configuration. See README.md (\"配置\").\n"
	return append([]byte(head), b...), nil
}

func cleanRoot(root string) string {
	r := strings.Trim(filepath.ToSlash(filepath.Clean(filepath.FromSlash(root))), "/")
	if r == "." {
		return ""
	}
	return r
}

func rootContains(r, rel string) bool {
	return r == "" || rel == r || strings.HasPrefix(rel, r+"/")
}

// Shadowed reports whether rel (slash-separated, relative to Root) lies under
// p's root but also under a strictly deeper root of another platform. When
// roots overlap — e.g. a KMP repo configured as android "." plus ios
// "iosApp" — each file then belongs to exactly one platform: the most
// specific root. Platforms sharing the same root (split by include globs) are
// not affected.
func (c *Config) Shadowed(p Platform, rel string) bool {
	pr := cleanRoot(p.Root)
	for _, q := range c.Platforms {
		if q.Name == p.Name {
			continue
		}
		qr := cleanRoot(q.Root)
		if len(qr) > len(pr) && rootContains(qr, rel) && rootContains(pr, qr) {
			return true
		}
	}
	return false
}
