package engine

import (
	"fmt"
	"sort"
	"strings"

	"github.com/luckylucky0001/codewiki/internal/model"
	"github.com/luckylucky0001/codewiki/internal/wiki"
)

// routeTitles gives friendly Chinese names to common route ids.
var routeTitles = map[string]string{
	"login": "登录", "products": "商品列表", "product_detail": "商品详情", "cart": "购物车",
	"checkout": "结算", "order_detail": "订单详情", "profile": "个人中心", "home": "首页", "settings": "设置", "search": "搜索",
}

// RouteTitle returns a page title for a route id.
func RouteTitle(rid string) string {
	if t, ok := routeTitles[rid]; ok {
		return t + "（" + rid + "）"
	}
	return rid
}

func platformsOf(f *model.Facts, rid string) []string {
	m := map[string]bool{}
	for _, r := range f.Routes {
		if r.RouteID == rid {
			m[r.Platform] = true
		}
	}
	return sortedKeys(m)
}

// TemplateFeature deterministically renders a feature page from facts.
func TemplateFeature(g *model.Graph, f *model.Facts, rid, commit string) *wiki.Page {
	syms := FeatureSymbols(g, f, rid)
	symSet := map[string]bool{}
	for _, s := range syms {
		symSet[s] = true
	}
	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\n", RouteTitle(rid))
	fmt.Fprintf(&b, "> 由 `kb compound --llm template` 根据 facts 与符号图确定性生成；使用 claude 模式可获得更完整的叙述。锚点见 frontmatter `sources`。\n\n")
	b.WriteString("## 路由与深链\n\n| 平台 | pattern | deeplink | 入口符号 |\n|---|---|---|---|\n")
	for _, r := range f.Routes {
		if r.RouteID == rid {
			fmt.Fprintf(&b, "| %s | `%s` | `%s` | `%s` |\n", r.Platform, r.Pattern, r.Deeplink, r.Symbol)
		}
	}
	b.WriteString("\n测试注入参数：`?token=<t>&cart=<sku,sku>`（见各端 deeplink 处理代码）。\n")
	// testIDs
	var tids []string
	for _, t := range f.TestIDs {
		if t.RouteID == rid {
			tids = append(tids, fmt.Sprintf("| %s | `%s` | `%s:%d` |", t.Platform, t.Tid, t.File, t.Line))
		}
	}
	b.WriteString("\n## testID\n\n")
	if len(tids) == 0 {
		b.WriteString("（无归属于该路由的 testID；共享组件的 testID 见 facts）\n")
	} else {
		b.WriteString("| 平台 | tid | 位置 |\n|---|---|---|\n" + strings.Join(tids, "\n") + "\n")
	}
	// APIs reachable from anchored symbols
	var apis []string
	for _, a := range f.APIs {
		if symSet[a.Symbol] {
			apis = append(apis, fmt.Sprintf("| %s | %s | `%s` | `%s` |", a.Platform, a.Method, a.Path, a.Symbol))
		}
	}
	b.WriteString("\n## 接口\n\n")
	if len(apis) == 0 {
		b.WriteString("（该功能的锚点符号未直接调用 HTTP 接口）\n")
	} else {
		b.WriteString("| 平台 | 方法 | 路径 | 调用符号 |\n|---|---|---|---|\n" + strings.Join(apis, "\n") + "\n")
	}
	// constants
	var consts []string
	for _, id := range syms {
		if s := g.Get(id); s != nil && s.Value != "" && s.Kind != "case" {
			consts = append(consts, fmt.Sprintf("- `%s` = `%s`（%s）", s.Qual, s.Value, s.Platform))
		}
	}
	if len(consts) > 0 {
		b.WriteString("\n## 关键常量\n\n" + strings.Join(consts, "\n") + "\n")
	}
	b.WriteString("\n## 相关代码\n\n")
	byPlat := map[string][]string{}
	for _, id := range syms {
		s := g.Get(id)
		byPlat[s.Platform] = append(byPlat[s.Platform], fmt.Sprintf("- `%s` — %s `%s`", s.ID, s.Kind, s.Signature))
	}
	var plats []string
	for p := range byPlat {
		plats = append(plats, p)
	}
	sort.Strings(plats)
	for _, p := range plats {
		fmt.Fprintf(&b, "**%s**\n\n%s\n\n", p, strings.Join(byPlat[p], "\n"))
	}
	b.WriteString("## 相关页面\n\n- [总览](../overview.md)\n- [导航与深链](../concepts/navigation.md) · [共享组件](../concepts/shared-components.md)\n")
	for _, p := range plats {
		fmt.Fprintf(&b, "- [%s routes facts](../../facts/%s/routes.md)\n", p, p)
	}
	pg := &wiki.Page{Path: FeaturePage(rid), HasFM: true, Body: b.String()}
	pg.Front = wiki.Front{ID: wiki.IDFromPath(FeaturePage(rid)), Title: RouteTitle(rid), Kind: "feature", Platforms: platformsOf(f, rid),
		Routes: []string{rid}, SourceCommit: commit, Status: wiki.StatusCurrent}
	for _, id := range syms {
		pg.Front.Sources = append(pg.Front.Sources, model.Anchor{Sym: id, Hash: g.Get(id).Hash})
	}
	return pg
}

// TemplateOverview renders pages/overview.md (routes matrix).
func TemplateOverview(f *model.Facts, platforms []string, commit string) *wiki.Page {
	rids := routeIDs(f)
	var b strings.Builder
	b.WriteString("# 总览：三端路由矩阵\n\n> 由 facts 确定性生成（`kb compound`）。每个功能页覆盖一个 `route_id`，三端共享同一 pattern 与 deeplink。\n\n")
	b.WriteString("| route_id | pattern | " + strings.Join(platforms, " | ") + " | 页面 |\n|---|---|" + strings.Repeat("---|", len(platforms)) + "---|\n")
	for _, rid := range rids {
		pattern := ""
		cells := make([]string, len(platforms))
		for i, p := range platforms {
			cells[i] = "—"
			for _, r := range f.Routes {
				if r.RouteID == rid && r.Platform == p {
					cells[i] = "✓"
					pattern = r.Pattern
				}
			}
		}
		fmt.Fprintf(&b, "| `%s` | `%s` | %s | [%s](features/%s.md) |\n", rid, pattern, strings.Join(cells, " | "), RouteTitle(rid), rid)
	}
	schemes := map[string]bool{}
	for _, sc := range f.Schemes {
		for _, s := range sc {
			schemes[s] = true
		}
	}
	if len(schemes) > 0 {
		fmt.Fprintf(&b, "\n深链 scheme：`%s`；测试态注入：`?token=<t>&cart=<sku,sku>`。\n", strings.Join(sortedKeys(schemes), "`, `"))
	}
	fmt.Fprintf(&b, "\n规模：%d 条路由、%d 个 testID、%d 个接口调用点。机器可读：[routes.json](../facts/routes.json) · [testids.json](../facts/testids.json) · [apis.json](../facts/apis.json)\n", len(f.Routes), len(f.TestIDs), len(f.APIs))
	pg := &wiki.Page{Path: OverviewPage, HasFM: true, Body: b.String()}
	pg.Front = wiki.Front{ID: wiki.IDFromPath(OverviewPage), Title: "总览", Kind: "overview", Platforms: platforms, Routes: rids, SourceCommit: commit, Status: wiki.StatusCurrent}
	return pg
}

// TemplateConcept renders the navigation / shared-components concept pages.
func TemplateConcept(g *model.Graph, f *model.Facts, page, commit string) *wiki.Page {
	as := ComputeAnchors(g, f)
	ids, title, intro := as.Shared, "共享组件", fmt.Sprintf("被 ≥%d 个路由引用的符号（返回按钮、顶栏、API 客户端等）。它们不计入单个功能页的锚点，改动它们只会让本页失效，而不会让所有功能页一起变 stale。", SharedThreshold)
	if page == NavigationPage {
		ids, title, intro = as.Navigation, "导航与深链", "路由表、路由器、导航栈与深链/测试参数处理代码（三端）。路由事实见 facts/*/routes.md。"
	}
	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\n> %s\n\n", title, intro)
	byPlat := map[string][]string{}
	for _, id := range ids {
		s := g.Get(id)
		used := ""
		if u := as.UsedBy[id]; len(u) > 0 {
			used = "（routes: " + strings.Join(u, ", ") + "）"
		}
		byPlat[s.Platform] = append(byPlat[s.Platform], fmt.Sprintf("| %s | `%s` | `%s` | %s |", s.Kind, s.ID, esc(s.Signature), used))
	}
	plats := sortedKeys(func() map[string]bool {
		m := map[string]bool{}
		for p := range byPlat {
			m[p] = true
		}
		return m
	}())
	if len(plats) == 0 {
		b.WriteString("（无）\n")
	}
	for _, p := range plats {
		fmt.Fprintf(&b, "## %s\n\n| kind | 符号 | 签名 | 使用方 |\n|---|---|---|---|\n%s\n\n", p, strings.Join(byPlat[p], "\n"))
	}
	b.WriteString("## 相关页面\n\n- [总览](../overview.md)\n")
	pg := &wiki.Page{Path: page, HasFM: true, Body: b.String()}
	pg.Front = wiki.Front{ID: wiki.IDFromPath(page), Title: title, Kind: "concept", Platforms: plats, SourceCommit: commit, Status: wiki.StatusCurrent}
	for _, id := range ids {
		pg.Front.Sources = append(pg.Front.Sources, model.Anchor{Sym: id, Hash: g.Get(id).Hash})
	}
	return pg
}

func esc(s string) string { return strings.ReplaceAll(s, "|", "\\|") }
