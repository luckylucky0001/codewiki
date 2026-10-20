package engine

import (
	"fmt"
	"sort"
	"strings"

	"github.com/luckylucky0001/codewiki/internal/facts"
	"github.com/luckylucky0001/codewiki/internal/model"
)

// ParityPage is the generated cross-platform parity page.
const ParityPage = "pages/parity.md"

// ParityCell is what one platform implements for one feature.
type ParityCell struct {
	Route   bool     `json:"route"`
	TestIDs []string `json:"testids"`
	APIs    []string `json:"apis"`
}

// ParityRow is one feature (route) across platforms.
type ParityRow struct {
	RouteID        string                `json:"route_id"`
	Cells          map[string]ParityCell `json:"platforms"`
	MissingRoute   []string              `json:"missing_route"`
	MissingTestIDs map[string][]string   `json:"missing_testids"`
	MissingAPIs    map[string][]string   `json:"missing_apis"`
}

// ConstValue is a constant's value on one platform.
type ConstValue struct {
	Value  string `json:"value"`
	Symbol string `json:"symbol"`
}

// ConstDiff is a constant whose value differs across platforms.
type ConstDiff struct {
	Name   string                `json:"name"` // normalized snake_case name
	Values map[string]ConstValue `json:"values"`
}

// Parity is the feature × platform matrix.
type Parity struct {
	Platforms []string    `json:"platforms"`
	Features  []ParityRow `json:"features"`
	Constants []ConstDiff `json:"constant_diffs"`
	Gaps      int         `json:"gaps"`
}

// ComputeParity builds the matrix from facts and the symbol graph.
func ComputeParity(g *model.Graph, f *model.Facts, platforms []string) *Parity {
	p := &Parity{Platforms: platforms, Features: []ParityRow{}, Constants: []ConstDiff{}}
	children := map[string][]string{}
	for _, s := range g.Symbols {
		if s.Parent != "" {
			children[s.Parent] = append(children[s.Parent], s.ID)
		}
	}
	for _, rid := range routeIDs(f) {
		row := ParityRow{RouteID: rid, Cells: map[string]ParityCell{}, MissingRoute: []string{}, MissingTestIDs: map[string][]string{}, MissingAPIs: map[string][]string{}}
		anchors := map[string]bool{}
		for _, r := range f.Routes {
			if r.RouteID == rid {
				for id := range reach(g, children, r.Symbol, parityDepth) {
					anchors[id] = true
				}
			}
		}
		for _, pl := range platforms {
			c := ParityCell{TestIDs: []string{}, APIs: []string{}}
			for _, r := range f.Routes {
				if r.RouteID == rid && r.Platform == pl {
					c.Route = true
				}
			}
			tids := map[string]bool{}
			for _, t := range f.TestIDs {
				if t.RouteID == rid && t.Platform == pl {
					tids[t.Tid] = true
				}
			}
			apis := map[string]bool{}
			for _, a := range f.APIs {
				if a.Platform == pl && anchors[a.Symbol] {
					apis[a.Method+" "+a.Path] = true
				}
			}
			c.TestIDs, c.APIs = sortedKeys(tids), sortedKeys(apis)
			row.Cells[pl] = c
		}
		unionT, unionA := map[string]bool{}, map[string]bool{}
		for _, c := range row.Cells {
			for _, t := range c.TestIDs {
				unionT[t] = true
			}
			for _, a := range c.APIs {
				unionA[a] = true
			}
		}
		for _, pl := range platforms {
			c := row.Cells[pl]
			if !c.Route {
				row.MissingRoute = append(row.MissingRoute, pl)
				p.Gaps++
				continue
			}
			if m := missing(unionT, c.TestIDs); len(m) > 0 {
				row.MissingTestIDs[pl] = m
				p.Gaps += len(m)
			}
			if m := missing(unionA, c.APIs); len(m) > 0 {
				row.MissingAPIs[pl] = m
				p.Gaps += len(m)
			}
		}
		p.Features = append(p.Features, row)
	}
	// constants with the same normalized name on ≥2 platforms but different values
	byName := map[string]map[string]ConstValue{}
	for _, s := range g.Symbols {
		if s.Value == "" || s.Value == "[]" || s.Value == `""` || (s.Kind != "property" && s.Kind != "const") {
			continue
		}
		n := facts.Snake(s.Name)
		if byName[n] == nil {
			byName[n] = map[string]ConstValue{}
		}
		if _, dup := byName[n][s.Platform]; !dup {
			byName[n][s.Platform] = ConstValue{Value: s.Value, Symbol: s.ID}
		}
	}
	for n, vals := range byName {
		if len(vals) < 2 {
			continue
		}
		distinct := map[string]bool{}
		for _, v := range vals {
			distinct[v.Value] = true
		}
		if len(distinct) > 1 {
			p.Constants = append(p.Constants, ConstDiff{Name: n, Values: vals})
			p.Gaps++
		}
	}
	sort.Slice(p.Constants, func(i, j int) bool { return p.Constants[i].Name < p.Constants[j].Name })
	return p
}

func missing(union map[string]bool, have []string) []string {
	h := map[string]bool{}
	for _, x := range have {
		h[x] = true
	}
	var out []string
	for x := range union {
		if !h[x] {
			out = append(out, x)
		}
	}
	sort.Strings(out)
	return out
}

// RenderParity renders pages/parity.md (generated, verified for freshness).
func RenderParity(p *Parity) []byte {
	var b strings.Builder
	b.WriteString("---\nid: parity\ntitle: 三端一致性（parity）\nkind: parity\ngenerated: true\n---\n")
	b.WriteString(facts.GeneratedMarker + "\n\n# 三端一致性矩阵\n\n")
	fmt.Fprintf(&b, "由 `kb parity` 根据 facts 与符号图生成：每个功能（route_id）在各平台是否实现了路由、testID 与接口，以及同名常量在各平台的取值差异。共 **%d** 处差异。\n\n", p.Gaps)
	b.WriteString("| route_id | " + strings.Join(p.Platforms, " | ") + " |\n|---|" + strings.Repeat("---|", len(p.Platforms)) + "\n")
	for _, r := range p.Features {
		cells := make([]string, len(p.Platforms))
		for i, pl := range p.Platforms {
			c := r.Cells[pl]
			if !c.Route {
				cells[i] = "✗ 无路由"
				continue
			}
			mark := "✓"
			if len(r.MissingTestIDs[pl])+len(r.MissingAPIs[pl]) > 0 {
				mark = "⚠"
			}
			cells[i] = fmt.Sprintf("%s %d tid / %d api", mark, len(c.TestIDs), len(c.APIs))
		}
		fmt.Fprintf(&b, "| `%s` | %s |\n", r.RouteID, strings.Join(cells, " | "))
	}
	b.WriteString("\n## 缺口\n\n")
	n := 0
	for _, r := range p.Features {
		if len(r.MissingRoute) > 0 {
			fmt.Fprintf(&b, "- `%s`：%s 缺少该路由\n", r.RouteID, strings.Join(r.MissingRoute, "、"))
			n++
		}
		for _, pl := range p.Platforms {
			if m := r.MissingTestIDs[pl]; len(m) > 0 {
				fmt.Fprintf(&b, "- `%s`：%s 缺少 testID `%s`\n", r.RouteID, pl, strings.Join(m, "`, `"))
				n++
			}
			if m := r.MissingAPIs[pl]; len(m) > 0 {
				fmt.Fprintf(&b, "- `%s`：%s 的功能锚点中未调用 `%s`\n", r.RouteID, pl, strings.Join(m, "`, `"))
				n++
			}
		}
	}
	if n == 0 {
		b.WriteString("（无）\n")
	}
	b.WriteString("\n## 跨平台常量差异\n\n")
	if len(p.Constants) == 0 {
		b.WriteString("（无）\n")
	} else {
		b.WriteString("| 常量 | " + strings.Join(p.Platforms, " | ") + " |\n|---|" + strings.Repeat("---|", len(p.Platforms)) + "\n")
		for _, c := range p.Constants {
			cells := make([]string, len(p.Platforms))
			for i, pl := range p.Platforms {
				if v, ok := c.Values[pl]; ok {
					cells[i] = fmt.Sprintf("`%s`", v.Value)
				} else {
					cells[i] = "—"
				}
			}
			fmt.Fprintf(&b, "| `%s` | %s |\n", c.Name, strings.Join(cells, " | "))
		}
		b.WriteString("\n符号：\n\n")
		for _, c := range p.Constants {
			for _, pl := range p.Platforms {
				if v, ok := c.Values[pl]; ok {
					fmt.Fprintf(&b, "- `%s` (%s) = `%s`\n", v.Symbol, pl, v.Value)
				}
			}
		}
	}
	b.WriteString("\n相关：功能页见 index.md · `kb lint-tid` · `kb parity --json`\n")
	return []byte(b.String())
}

// parityDepth is how many reference hops from a screen an API call may be.
const parityDepth = 3

// reach follows reference edges (no container expansion) from a route symbol
// and its members.
func reach(g *model.Graph, children map[string][]string, root string, depth int) map[string]bool {
	seen := map[string]bool{}
	type item struct {
		id string
		d  int
	}
	q := []item{{root, 0}}
	for _, c := range children[root] {
		q = append(q, item{c, 0})
	}
	// the page component a builder/entry function renders belongs to the screen
	if rs := g.Get(root); rs != nil {
		for _, r := range rs.Refs {
			if c := g.Get(r); c != nil && containerKinds[c.Kind] && c.File == rs.File {
				for _, m := range children[c.ID] {
					q = append(q, item{m, 0})
				}
			}
		}
	}
	for len(q) > 0 {
		it := q[0]
		q = q[1:]
		if seen[it.id] {
			continue
		}
		seen[it.id] = true
		s := g.Get(it.id)
		if s == nil || it.d >= depth {
			continue
		}
		for _, r := range s.Refs {
			if rs := g.Get(r); rs != nil && !containerKinds[rs.Kind] && rs.Platform == s.Platform {
				q = append(q, item{r, it.d + 1})
			}
		}
	}
	return seen
}
