package wiki

import (
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

// AgentsMD is the wiki schema: the contract every writer (human or LLM) follows.
const AgentsMD = `# AGENTS.md — codewiki 写作规范（schema）

本目录是由 ` + "`kb`" + ` 维护的 LLM Wiki（Karpathy LLM Wiki 模式：raw sources / wiki pages / schema）。
任何 agent 在写入前必须遵守以下约定；违反约定的写入会被 ` + "`kb verify`" + ` 拒绝发布。

## 三层结构

| 目录 | 谁写 | 说明 |
|---|---|---|
| ` + "`raw/docs/`" + ` | ` + "`kb ingest`" + ` | 旧文档/规格原文，只读、低可信，不得修改 |
| ` + "`facts/`" + ` | ` + "`kb scan`" + `（确定性） | 路由/深链/testID/接口/符号表，**生成文件，禁止手改** |
| ` + "`pages/`" + ` | LLM（按 skill） | 跨三端的功能(features)、流程(flows)、概念(concepts)、决策(decisions) |
| ` + "`index.md` / `log.md` / `llms.txt`" + ` | ` + "`kb`" + ` | 目录、append-only 日志、外部 agent 入口；由 CLI 维护 |

## 页面 frontmatter 契约

` + "```yaml" + `
---
id: features/cart            # = 路径去掉 pages/ 与 .md
title: 购物车
kind: feature                # feature | flow | concept | decision | overview | conflicts
platforms: [android, harmony, ios]
routes: [cart]               # 覆盖的 route_id（与 facts/routes.json 一致）
sources:                     # 锚点：符号 ID + 当前内容 hash（用 kb anchor <id> 获取）
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen
    hash: 3f0c...
source_commit: 8c1d2e4
status: current              # current | stale | outdated-doc
---
` + "```" + `

## 写作规则

1. **只写任务给出的可写集合（write set）**；写集合之外的修改会被自动回滚并记为违规。
2. 每个关于代码行为的断言都要有锚点：在 ` + "`sources`" + ` 中列出所依据的符号及 hash；正文中引用符号时使用完整符号 ID（反引号包裹）。
3. 不要编造符号、路由、testID、接口；只使用任务上下文和 ` + "`facts/`" + ` 中出现的事实。代码与旧文档冲突时，**以代码为准**，并在 ` + "`pages/_conflicts.md`" + ` 记录。
4. 链接使用相对路径（例如 ` + "`../overview.md`" + `），不得出现死链；新页面会被 ` + "`kb`" + ` 自动加入 ` + "`index.md`" + `。
5. 不要修改 ` + "`facts/`、`raw/`、`index.md`、`log.md`、`.kb/`" + `。
6. 页面正文用中文，代码标识符保持英文原样；简洁、可被 agent 检索（标题、表格、列表）。

## 日志格式

` + "`log.md`" + ` 为 append-only，每条记录形如 ` + "`## [YYYY-MM-DD] op | subject`" + `，op ∈ init | ingest | compound | verify | fix-index。
`

// Init creates the wiki skeleton. Existing files are never overwritten.
// It returns the list of created paths (wiki-relative).
func Init(wikiDir string, dryRun bool) ([]string, error) {
	var created []string
	files := map[string]string{
		"AGENTS.md":                AgentsMD,
		"log.md":                   "# Log\n\nappend-only；格式：`## [YYYY-MM-DD] op | subject`\n",
		"raw/docs/.gitkeep":        "",
		"pages/features/.gitkeep":  "",
		"pages/flows/.gitkeep":     "",
		"pages/concepts/.gitkeep":  "",
		"pages/decisions/.gitkeep": "",
		"facts/.gitkeep":           "",
		".kb/.gitkeep":             "",
	}
	keys := make([]string, 0, len(files))
	for k := range files {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, rel := range keys {
		p := filepath.Join(wikiDir, filepath.FromSlash(rel))
		if _, err := os.Stat(p); err == nil {
			continue
		}
		created = append(created, rel)
		if dryRun {
			continue
		}
		if err := WriteFileAtomic(p, []byte(files[rel])); err != nil {
			return created, err
		}
	}
	idx := filepath.Join(wikiDir, "index.md")
	if _, err := os.Stat(idx); err != nil {
		created = append(created, "index.md")
		if !dryRun {
			pages, _ := LoadPages(wikiDir)
			if err := WriteFileAtomic(idx, RenderIndex(pages)); err != nil {
				return created, err
			}
			if err := WriteFileAtomic(filepath.Join(wikiDir, "llms.txt"), RenderLLMSTxt(pages)); err != nil {
				return created, err
			}
		}
	}
	return created, nil
}

var sectionOrder = []struct{ prefix, title string }{
	{"pages/overview", "总览"},
	{"pages/parity", "三端一致性 parity（生成）"},
	{"pages/features/", "功能 features"},
	{"pages/flows/", "流程 flows"},
	{"pages/concepts/", "概念 concepts"},
	{"pages/decisions/", "决策 decisions"},
	{"pages/_", "文档核对 conflicts"},
	{"pages/", "其他页面"},
	{"facts/", "事实 facts（生成）"},
}

func section(path string) int {
	for i, s := range sectionOrder {
		if strings.HasPrefix(path, s.prefix) {
			return i
		}
	}
	return len(sectionOrder) - 1
}

// FeatureIndexMax: with more feature pages than this, index.md lists one line
// per module and links a sub-index index/features-<module>.md that lists the
// pages (openharmony app_samples: 416 routes made a 97 KB, ~24k-token
// index.md — the entry page every agent reads first).
var FeatureIndexMax = 150

// IndexMaxRoutesPerLine caps the route ids shown after one index entry.
var IndexMaxRoutesPerLine = 8

// SubIndexMaxGroups caps the module lines of a hierarchical index.md.
var SubIndexMaxGroups = 40

// SubIndexDir holds the generated per-module sub-indexes.
const SubIndexDir = "index"

// RenderIndex renders a deterministic, layered index of all pages.
func RenderIndex(pages []*Page) []byte { return RenderIndexFiles(pages)["index.md"] }

// pageModule groups a page by the module of its first anchor: the path before
// /src/ (Gradle / HarmonyOS modules), else its first two directories.
func pageModule(p *Page) string {
	if len(p.Front.Sources) == 0 {
		return "other"
	}
	f := p.Front.Sources[0].Sym
	if i := strings.Index(f, "://"); i >= 0 {
		f = f[i+3:]
	}
	if i := strings.IndexByte(f, '#'); i >= 0 {
		f = f[:i]
	}
	if i := strings.Index(f, "/src/"); i > 0 {
		return f[:i]
	}
	d := strings.Split(path.Dir(f), "/")
	if len(d) > 2 {
		d = d[:2]
	}
	if m := strings.Join(d, "/"); m != "." && m != "" {
		return m
	}
	return "root"
}

func moduleSlug(m string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(m) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else {
			b.WriteByte('-')
		}
	}
	return strings.Trim(b.String(), "-")
}

func indexLine(p *Page, prefix string) string {
	title := p.Front.Title
	if title == "" {
		title = IDFromPath(p.Path)
	}
	status := ""
	if p.Front.Status != "" && p.Front.Status != StatusCurrent {
		status = " ⚠ " + p.Front.Status
	}
	extra := ""
	if rs := p.Front.Routes; len(rs) > 0 {
		more := ""
		if len(rs) > IndexMaxRoutesPerLine {
			// the overview page lists every route (416 on app_samples: a 21 KB line)
			more = fmt.Sprintf(" … +%d", len(rs)-IndexMaxRoutesPerLine)
			rs = rs[:IndexMaxRoutesPerLine]
		}
		extra = " — routes: `" + strings.Join(rs, "`, `") + "`" + more
	}
	return fmt.Sprintf("- [%s](%s%s)%s%s\n", title, prefix, p.Path, extra, status)
}

// RenderIndexFiles renders index.md plus, for large wikis, the per-module
// feature sub-indexes (wiki-relative path -> content).
func RenderIndexFiles(pages []*Page) map[string][]byte {
	out := map[string][]byte{}
	var b strings.Builder
	b.WriteString("# Index\n\n<!-- maintained by kb (kb verify --fix-index); do not edit by hand -->\n\n")
	b.WriteString("入口：[AGENTS.md](AGENTS.md)（写作规范） · [log.md](log.md)（变更日志） · `facts/*.json`（机器可读事实）\n")
	groups := map[int][]*Page{}
	for _, p := range pages {
		groups[section(p.Path)] = append(groups[section(p.Path)], p)
	}
	for i, s := range sectionOrder {
		ps := groups[i]
		if len(ps) == 0 {
			continue
		}
		fmt.Fprintf(&b, "\n## %s\n\n", s.title)
		if s.prefix == "facts/" {
			// one line per platform sub dir, root-level facts files first
			var order []string
			links := map[string][]string{}
			for _, p := range ps {
				parts := strings.SplitN(strings.TrimPrefix(p.Path, "facts/"), "/", 2)
				group := "(root)"
				if len(parts) == 2 {
					group = parts[0]
				}
				if _, ok := links[group]; !ok {
					order = append(order, group)
				}
				links[group] = append(links[group], fmt.Sprintf("[%s](%s)", strings.TrimSuffix(filepath.Base(p.Path), ".md"), p.Path))
			}
			for _, g := range order {
				fmt.Fprintf(&b, "- **%s**: %s\n", g, strings.Join(links[g], " "))
			}
			continue
		}
		if s.prefix == "pages/features/" && len(ps) > FeatureIndexMax {
			// hierarchical: one line per module, pages in index/features-<module>.md
			// group by module; with too many modules, by a coarser path prefix
			// (app_samples: 142 modules -> code/BasicFeature, code/UI, …)
			var mods []string
			var byMod map[string][]*Page
			for depth := 0; depth <= 3; depth++ {
				mods, byMod = nil, map[string][]*Page{}
				for _, p := range ps {
					m := pageModule(p)
					if depth > 0 {
						if seg := strings.Split(m, "/"); len(seg) > 4-depth {
							m = strings.Join(seg[:4-depth], "/")
						}
					}
					if _, ok := byMod[m]; !ok {
						mods = append(mods, m)
					}
					byMod[m] = append(byMod[m], p)
				}
				if len(mods) <= SubIndexMaxGroups {
					break
				}
			}
			sort.Strings(mods)
			fmt.Fprintf(&b, "%d 个功能页，按模块分组（每组一个子索引）：\n\n", len(ps))
			used := map[string]bool{}
			for _, m := range mods {
				slug := moduleSlug(m)
				if slug == "" {
					slug = "root"
				}
				for base, i := slug, 2; used[slug]; i++ {
					slug = fmt.Sprintf("%s-%d", base, i)
				}
				used[slug] = true
				sub := SubIndexDir + "/features-" + slug + ".md"
				var sb strings.Builder
				fmt.Fprintf(&sb, "# Index · 功能 · %s\n\n<!-- maintained by kb (kb verify --fix-index); do not edit by hand -->\n\n[← index.md](../index.md)\n\n", m)
				last := ""
				for _, p := range byMod[m] {
					if fm := pageModule(p); fm != m && fm != last {
						fmt.Fprintf(&sb, "\n### %s\n\n", fm)
						last = fm
					}
					sb.WriteString(indexLine(p, "../"))
				}
				out[sub] = []byte(sb.String())
				fmt.Fprintf(&b, "- [%s](%s) — %d\n", m, sub, len(byMod[m]))
			}
			continue
		}
		for _, p := range ps {
			b.WriteString(indexLine(p, ""))
		}
	}
	out["index.md"] = []byte(b.String())
	return out
}

// RenderLLMSTxt renders llms.txt, the entry point for external agents.
func RenderLLMSTxt(pages []*Page) []byte {
	var b strings.Builder
	b.WriteString("# codewiki\n\n> Code-anchored knowledge base. Every page lists `sources` (symbol id + hash) verified against HEAD by `kb verify`.\n\n")
	b.WriteString("## Docs\n\n- [index.md](index.md): layered table of contents\n- [AGENTS.md](AGENTS.md): writing schema\n- [facts/routes.json](facts/routes.json), [facts/testids.json](facts/testids.json), [facts/apis.json](facts/apis.json), [facts/requirements.json](facts/requirements.json): machine-readable facts\n\n## Pages\n\n")
	files := RenderIndexFiles(pages)
	hier := len(files) > 1 // large wiki: feature pages are listed in index/*.md
	for _, p := range pages {
		if strings.HasPrefix(p.Path, "pages/") && !(hier && strings.HasPrefix(p.Path, "pages/features/")) {
			fmt.Fprintf(&b, "- [%s](%s)\n", p.Front.Title, p.Path)
		}
	}
	if hier {
		var subs []string
		for rel := range files {
			if rel != "index.md" {
				subs = append(subs, rel)
			}
		}
		sort.Strings(subs)
		b.WriteString("\n## Feature indexes (one per module)\n\n")
		for _, rel := range subs {
			fmt.Fprintf(&b, "- [%s](%s)\n", strings.TrimSuffix(strings.TrimPrefix(rel, SubIndexDir+"/features-"), ".md"), rel)
		}
	}
	return []byte(b.String())
}

// AppendLog appends one entry to log.md.
func AppendLog(wikiDir, date, op, subject string, bullets []string) error {
	p := filepath.Join(wikiDir, "log.md")
	b, err := os.ReadFile(p)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	s := string(b)
	if s == "" {
		s = "# Log\n\nappend-only；格式：`## [YYYY-MM-DD] op | subject`\n"
	}
	if !strings.HasSuffix(s, "\n") {
		s += "\n"
	}
	s += fmt.Sprintf("\n## [%s] %s | %s\n", date, op, subject)
	if len(bullets) > 0 {
		s += "\n"
		for _, l := range bullets {
			s += "- " + l + "\n"
		}
	}
	return WriteFileAtomic(p, []byte(s))
}
