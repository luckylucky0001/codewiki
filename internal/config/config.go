// Package config loads codewiki.yaml.
package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

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
	abs, err := filepath.Abs(root)
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

// Detect guesses platforms from the directory layout of root.
func Detect(root string) []Platform {
	var out []Platform
	try := func(name string, dirs ...string) {
		for _, d := range dirs {
			if st, err := os.Stat(filepath.Join(root, d)); err == nil && st.IsDir() {
				out = append(out, Platform{Name: name, Root: d})
				return
			}
		}
	}
	try("android", "android", "Android", "app")
	try("ios", "ios", "iOS", "iosApp")
	try("harmony", "harmony", "harmonyos", "ohos", "HarmonyOS")
	try("web", "web", "src", "lib")
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
