// Package facts derives deterministic, machine-readable facts (routes,
// testIDs, APIs, deep-link schemes, entry points) from a scan result plus
// platform resource files (AndroidManifest.xml, Info.plist, router_map.json,
// main_pages.json, module.json5).
package facts

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"github.com/luckylucky0001/codewiki/internal/config"
	"github.com/luckylucky0001/codewiki/internal/extract"
	"github.com/luckylucky0001/codewiki/internal/model"
	"github.com/luckylucky0001/codewiki/internal/scan"
)

type ctx struct {
	cfg    *config.Config
	res    *scan.Result
	g      *model.Graph
	consts map[string]map[string]string // platform -> name/Parent.Name -> value
	byName map[string][]*model.Symbol   // platform\x00name
	f      *model.Facts
	// main_pages route id -> module, to disambiguate pages/Index across modules
	mainPageIDs map[string]string
	topByFile   map[string][]*model.Symbol // lazily built: file -> top-level symbols
}

// Extract computes all facts for a scan result.
func Extract(cfg *config.Config, res *scan.Result) *model.Facts {
	c := &ctx{cfg: cfg, res: res, g: res.Graph, mainPageIDs: map[string]string{}, consts: map[string]map[string]string{}, byName: map[string][]*model.Symbol{},
		f: &model.Facts{Routes: []model.Route{}, TestIDs: []model.TestID{}, APIs: []model.API{}, Schemes: map[string][]string{}}}
	for _, s := range c.g.Symbols {
		c.byName[s.Platform+"\x00"+s.Name] = append(c.byName[s.Platform+"\x00"+s.Name], s)
		if s.Value != "" {
			m := c.consts[s.Platform]
			if m == nil {
				m = map[string]string{}
				c.consts[s.Platform] = m
			}
			m[s.Name] = s.Value
			if s.Parent != "" {
				if p := c.g.Get(s.Parent); p != nil {
					m[p.Name+"."+s.Name] = s.Value
				}
			}
		}
	}
	for _, p := range cfg.Platforms {
		c.resources(p)
	}
	c.routes()
	c.testIDs()
	c.apis()
	c.sortAll()
	return c.f
}

// ---------- string evaluation ----------

type strVal struct {
	s       string
	dynamic bool
	prefix  string // literal prefix before the first dynamic part
}

func (c *ctx) eval(platform string, parts []extract.Part) (strVal, bool) {
	var b strings.Builder
	v := strVal{}
	any := false
	for _, p := range parts {
		switch {
		case p.Lit != "":
			b.WriteString(p.Lit)
			any = true
		case p.Ref != "":
			if val, ok := c.lookup(platform, p.Ref); ok {
				b.WriteString(val)
				any = true
			} else {
				if !v.dynamic {
					v.prefix = b.String()
				}
				v.dynamic = true
				b.WriteString("{" + lastSeg(p.Ref) + "}")
			}
		default:
			if !v.dynamic {
				v.prefix = b.String()
			}
			v.dynamic = true
			name := p.Param
			if name == "" {
				name = "param"
			}
			b.WriteString("{" + name + "}")
		}
	}
	v.s = b.String()
	if !v.dynamic {
		v.prefix = v.s
	}
	return v, any
}

func (c *ctx) lookup(platform, ref string) (string, bool) {
	m := c.consts[platform]
	if m == nil {
		return "", false
	}
	ref = strings.TrimPrefix(ref, "this.")
	if v, ok := m[ref]; ok {
		return v, true
	}
	segs := strings.Split(ref, ".")
	if len(segs) >= 2 {
		if v, ok := m[segs[len(segs)-2]+"."+segs[len(segs)-1]]; ok {
			return v, true
		}
	}
	return "", false
}

func lastSeg(s string) string {
	if i := strings.LastIndex(s, "."); i >= 0 {
		return s[i+1:]
	}
	return s
}

// Snake converts CamelCase / UPPER_CASE to snake_case.
func Snake(s string) string {
	if strings.ToUpper(s) == s {
		return strings.ToLower(s)
	}
	var b strings.Builder
	rs := []rune(s)
	for i, r := range rs {
		if unicode.IsUpper(r) {
			if i > 0 && (unicode.IsLower(rs[i-1]) || (i+1 < len(rs) && unicode.IsLower(rs[i+1]))) {
				b.WriteByte('_')
			}
			b.WriteRune(unicode.ToLower(r))
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// Pascal converts snake_case to PascalCase.
func Pascal(s string) string {
	var b strings.Builder
	for _, w := range strings.Split(s, "_") {
		if w == "" {
			continue
		}
		b.WriteString(strings.ToUpper(w[:1]) + w[1:])
	}
	return b.String()
}

func slugPattern(p string) string {
	var segs []string
	for _, s := range strings.Split(p, "/") {
		if s == "" || strings.HasPrefix(s, "{") {
			continue
		}
		segs = append(segs, s)
	}
	if strings.Contains(p, "{") {
		segs = append(segs, "detail")
	}
	return strings.Join(segs, "_")
}

// findSymNear is findSym preferring the candidate that shares the longest
// directory prefix with near: a multi-app repo (compose-samples has a
// PlayerScreen in Jetcaster mobile, tv and wear) must anchor each NavHost on
// its own module's screen.
func (c *ctx) findSymNear(platform, name, near string, kinds ...string) *model.Symbol {
	best := c.findSym(platform, name, kinds...)
	if best == nil || len(c.byName[platform+"\x00"+name]) < 2 {
		return best
	}
	bestScore := -1
	for _, s := range c.byName[platform+"\x00"+name] {
		ok := len(kinds) == 0
		for _, k := range kinds {
			if s.Kind == k {
				ok = true
			}
		}
		if !ok {
			continue
		}
		score := commonPrefix(s.File, near) * 4
		if !isTestPath(s.File) {
			score += 2
		}
		if s.Parent == "" {
			score++
		}
		if score > bestScore {
			best, bestScore = s, score
		}
	}
	return best
}

func commonPrefix(a, b string) int {
	n := 0
	for n < len(a) && n < len(b) && a[n] == b[n] {
		n++
	}
	return n
}

func (c *ctx) findSym(platform, name string, kinds ...string) *model.Symbol {
	var best *model.Symbol
	bestScore := -1
	for _, s := range c.byName[platform+"\x00"+name] {
		ok := len(kinds) == 0
		for _, k := range kinds {
			if s.Kind == k {
				ok = true
			}
		}
		if !ok {
			continue
		}
		// prefer production code and top-level declarations
		score := 0
		if !isTestPath(s.File) {
			score += 2
		}
		if s.Parent == "" {
			score++
		}
		if score > bestScore {
			best, bestScore = s, score
		}
	}
	return best
}

func isTestPath(p string) bool {
	l := strings.ToLower(p)
	return strings.Contains(l, "/test/") || strings.Contains(l, "/androidtest/") || strings.Contains(l, "tests/") || strings.Contains(l, "/ohostest/") || strings.HasSuffix(l, "test.kt") || strings.HasSuffix(l, "tests.swift")
}

func (c *ctx) platformOf(file string) string {
	if fi, ok := c.g.Files[file]; ok {
		return fi.Platform
	}
	return ""
}

func (c *ctx) deeplink(platform, pattern string) string {
	if sc := c.f.Schemes[platform]; len(sc) > 0 {
		return sc[0] + "://" + pattern
	}
	return ""
}

func (c *ctx) sortedFiles() []string {
	var files []string
	for f := range c.res.Calls {
		files = append(files, f)
	}
	sort.Strings(files)
	return files
}

// ---------- routes ----------

func (c *ctx) routes() {
	seen := map[string]int{} // key -> index in c.f.Routes
	weak := map[int]bool{}   // routes anchored on the enclosing NavHost, not a screen
	// site separates the same id + pattern registered in two modules
	// (Jetcaster tv and wear both have "episode"); one site reported twice
	// (Kotlin: call + trailing-lambda call) keeps the screen-anchored entry.
	addAt := func(r model.Route, site string, resolved bool) {
		k := r.Platform + "|" + r.RouteID + "|" + r.Pattern + "|" + site
		if i, ok := seen[k]; ok {
			if weak[i] && resolved {
				c.f.Routes[i], weak[i] = r, false
			}
			return
		}
		seen[k] = len(c.f.Routes)
		weak[len(c.f.Routes)] = !resolved
		c.f.Routes = append(c.f.Routes, r)
	}
	add := func(r model.Route) { addAt(r, "", true) }
	for _, file := range c.sortedFiles() {
		fi := c.g.Files[file]
		for _, call := range c.res.Calls[file] {
			if fi.Lang == "kotlin" && len(call.TypeArgs) == 1 && (call.Callee == "composable" || call.Callee == "entry" || call.Callee == "dialog") {
				// type-safe navigation (Navigation 2.8 composable<T>, Navigation 3 entry<T>)
				if r, ok := c.typedRoute(fi.Platform, file, call); ok {
					addAt(r, file, r.Symbol != call.Enclosing)
				}
				continue
			}
			if fi.Lang != "kotlin" || call.Callee != "composable" || len(call.Args) == 0 {
				continue
			}
			a := call.Args[0]
			for _, x := range call.Args {
				if x.Label == "route" {
					a = x
				}
			}
			ref := ""
			if len(a.Parts) == 1 && a.Parts[0].Ref != "" {
				ref = a.Parts[0].Ref
			}
			if ref != "" && !constLikeRef(ref) {
				continue // e.g. a wrapper's own `route` parameter
			}
			v, ok := c.eval(fi.Platform, a.Parts)
			if (!ok || v.dynamic) && ref == "" {
				continue
			}
			if !ok || v.dynamic {
				// composable(Screen.Discover.route) / HomeSections.FEED.route:
				// the value is computed at runtime, the destination is still known
				v = strVal{s: refRouteID(ref)}
			}
			rid := slugPattern(v.s)
			if ref != "" {
				rid = refRouteID(ref)
			}
			sym, sfile := call.Enclosing, file
			for _, in := range call.Inner {
				if strings.HasSuffix(in, "Screen") {
					if s := c.findSymNear(fi.Platform, in, file, "composable", "function"); s != nil {
						sym, sfile = s.ID, s.File
						break
					}
				}
			}
			addAt(model.Route{Platform: fi.Platform, RouteID: rid, Pattern: v.s, Deeplink: c.deeplink(fi.Platform, v.s), File: sfile, Symbol: sym}, file, sym != call.Enclosing)
		}
	}
	// iOS: enums used as navigationDestination(for: X.self) and String-raw-value
	// enums named *Route* (case productDetail = "product/{id}")
	destEnums := map[string]bool{}
	isEnum := func(platform, name string) bool { return c.findSym(platform, name, "enum") != nil }
	for _, file := range c.sortedFiles() {
		fi := c.g.Files[file]
		if fi.Lang != "swift" {
			continue
		}
		for _, call := range c.res.Calls[file] {
			switch call.Callee {
			case "navigationDestination":
				for _, a := range call.Args {
					if a.Label != "for" || !strings.HasSuffix(a.Text, ".self") {
						continue
					}
					t := strings.TrimSuffix(a.Text, ".self")
					if isEnum(fi.Platform, lastSeg(t)) {
						destEnums[lastSeg(t)] = true
						continue
					}
					// navigationDestination(for: Order.ID.self) { id in OrderDetailView(id: id) }:
					// a value type, not a route enum — one route named after the type,
					// anchored on the view the closure builds
					segs := strings.Split(t, ".")
					base := segs[len(segs)-1]
					if (base == "ID" || base == "Id") && len(segs) > 1 {
						base = segs[len(segs)-2]
					}
					switch base {
					case "", "String", "Int", "UUID", "AnyHashable", "Destination", "Route", "Routes", "Path", "Screen", "Page":
						continue // a router's own wrapper type, not a screen
					}
					// only a closure that builds exactly one view is a single destination
					// (a switch over a wrapper type builds many)
					v := c.swiftView(fi.Platform, call.Inner)
					if v == nil {
						continue
					}
					add(model.Route{Platform: fi.Platform, RouteID: Snake(base), Pattern: Snake(base) + "/{" + lowerFirst(base) + "}", File: v.File, Symbol: v.ID})
				}
			case "NavigationLink":
				for _, a := range call.Args {
					switch a.Label {
					case "value":
						// NavigationLink(value: Panel.truck): Panel is a destination enum
						if segs := strings.Split(strings.TrimPrefix(a.Text, "."), "."); len(segs) == 2 && isEnum(fi.Platform, segs[0]) {
							destEnums[segs[0]] = true
						}
					case "destination":
						// NavigationLink(destination: CountryDetailsView(country: c))
						name, _, ok := strings.Cut(a.Text, "(")
						if !ok || name == "" || !unicode.IsUpper([]rune(name)[0]) || strings.ContainsAny(name, ". ") {
							continue
						}
						v := c.findSym(fi.Platform, name, "struct", "class")
						if v == nil {
							continue
						}
						rid := name
						for _, suf := range []string{"View", "Screen", "ViewController"} {
							if strings.HasSuffix(rid, suf) && len(rid) > len(suf) {
								rid = strings.TrimSuffix(rid, suf)
								break
							}
						}
						add(model.Route{Platform: fi.Platform, RouteID: Snake(rid), Pattern: Snake(rid), File: v.File, Symbol: v.ID})
					}
				}
			}
		}
	}
	for _, s := range c.g.Symbols {
		if s.Lang != "swift" || s.Kind != "case" || s.Parent == "" {
			continue
		}
		p := c.g.Get(s.Parent)
		if p == nil || p.Kind != "enum" {
			continue
		}
		isRouteEnum := s.Value != "" && strings.Contains(strings.ToLower(p.Name), "route")
		if !isRouteEnum && !destEnums[p.Name] {
			continue
		}
		if s.Value == "" {
			rid := Snake(s.Name)
			sym, file := s.ID, s.File
			if v := c.findSym(s.Platform, Pascal(rid)+"View", "struct", "class"); v != nil {
				sym, file = v.ID, v.File
			}
			add(model.Route{Platform: s.Platform, RouteID: rid, Pattern: rid + caseParams(s.Signature), File: file, Symbol: sym})
			continue
		}
		rid := Snake(s.Name)
		sym, file := s.ID, s.File
		if v := c.findSym(s.Platform, Pascal(rid)+"View", "struct", "class"); v != nil {
			sym, file = v.ID, v.File
		}
		add(model.Route{Platform: s.Platform, RouteID: rid, Pattern: s.Value, Deeplink: c.deeplink(s.Platform, s.Value), File: file, Symbol: sym})
	}
	// URL route tables: let allRoutes: [String: Handler] = ["/projects/:id": project, …]
	// (kickstarter/ios-oss) or mapOf("/projects/:id" to ::project): each
	// path key is a deep-link route anchored on its handler function.
	for _, sym := range c.g.Symbols {
		if (sym.Lang != "swift" && sym.Lang != "kotlin") || sym.Parent != "" || !reRouteTableName.MatchString(sym.Name) {
			continue
		}
		switch sym.Kind {
		case "property", "variable", "constant", "val", "var":
		default:
			continue
		}
		for _, m := range reRouteTableEntry.FindAllStringSubmatch(c.symbolSource(sym), -1) {
			path, handler := strings.TrimPrefix(m[1], "/"), m[2]
			if path == "" {
				continue
			}
			pattern := reColonParam.ReplaceAllString(path, "{$1}")
			r := model.Route{Platform: sym.Platform, RouteID: Snake(handler), Pattern: pattern, File: sym.File, Symbol: sym.ID}
			if h := c.findSymNear(sym.Platform, handler, sym.File, "function", "method"); h != nil {
				r.File, r.Symbol = h.File, h.ID
			}
			add(r)
		}
	}
	// HarmonyOS router_map entries were collected in resources(); Navigation
	// apps without a router_map resolve names in a navDestination builder, so
	// names pushed with NavPathStack.pushPathByName('X') are routes too.
	known := map[string]bool{}
	for _, r := range c.f.Routes {
		known[r.Platform+"|"+r.RouteID] = true
	}
	for _, file := range c.sortedFiles() {
		fi := c.g.Files[file]
		if fi.Lang != "arkts" && fi.Lang != "typescript" {
			continue
		}
		for _, call := range c.res.Calls[file] {
			if (call.Callee != "pushPathByName" && call.Callee != "replacePathByName" && call.Callee != "pushDestinationByName") || len(call.Args) == 0 {
				continue
			}
			parts := call.Args[0].Parts
			if len(parts) == 1 && parts[0].Ref != "" && !constLikeRef(parts[0].Ref) {
				continue // pushPathByName(name): a variable, not a route name
			}
			v, ok := c.eval(fi.Platform, parts)
			if !ok || v.dynamic || v.s == "" || strings.ContainsAny(v.s, "\"' /") || known[fi.Platform+"|"+v.s] {
				continue
			}
			known[fi.Platform+"|"+v.s] = true
			r := model.Route{Platform: fi.Platform, RouteID: v.s, Pattern: v.s}
			for _, cand := range []string{v.s, v.s + "Page", v.s + "View", Pascal(v.s), Pascal(v.s) + "Page"} {
				if sym := c.findSym(fi.Platform, cand, "component", "struct", "class"); sym != nil {
					r.Symbol, r.File = sym.ID, sym.File
					break
				}
			}
			if r.Symbol == "" {
				// destination not resolvable statically; keep the name, point at the push site
				r.File = file
			}
			add(r)
		}
	}
}

var (
	reValParam  = regexp.MustCompile(`\b(?:val|var)\s+([A-Za-z_]\w*)\s*:`)
	reCaseParam = regexp.MustCompile(`([A-Za-z_]\w*)\s*:`)
)

// typedRoute builds a route from a type-safe destination: route_id from the
// key type name, pattern from the key's constructor properties.
func (c *ctx) typedRoute(platform, file string, call extract.Call) (model.Route, bool) {
	t := lastSeg(call.TypeArgs[0]) // composable<Route.Inbox>
	base := t
	for _, suf := range []string{"NavKey", "Route", "Destination", "Screen", "Key"} {
		if strings.HasSuffix(base, suf) && len(base) > len(suf) {
			base = strings.TrimSuffix(base, suf)
			break
		}
	}
	rid := Snake(base)
	pattern := rid
	if ks := c.findSym(platform, t, "class", "object"); ks != nil {
		for _, m := range reValParam.FindAllStringSubmatch(ks.Signature, -1) {
			pattern += "/{" + m[1] + "}"
		}
	}
	sym, sfile := call.Enclosing, file
	for _, in := range call.Inner {
		if strings.HasSuffix(in, "Screen") || strings.HasSuffix(in, "Route") {
			if s := c.findSymNear(platform, in, file, "composable", "function"); s != nil {
				sym, sfile = s.ID, s.File
				break
			}
		}
	}
	return model.Route{Platform: platform, RouteID: rid, Pattern: pattern, File: sfile, Symbol: sym}, true
}

// constLikeRef reports whether a bare reference names a constant / static
// member (Routes.HOME, HOME_ROUTE, Screen.Home.route) rather than a local
// variable or parameter, which must not be resolved against same-named
// constants elsewhere in the project.
func constLikeRef(ref string) bool {
	if ref == "" {
		return false
	}
	if strings.Contains(ref, ".") {
		return true
	}
	return strings.ToUpper(ref) == ref || unicode.IsUpper([]rune(ref)[0])
}

// refRouteID names a route from a reference: Screen.Discover.route and
// HomeSections.FEED.route -> discover / feed; HOME_ROUTE -> home_route.
func refRouteID(ref string) string {
	segs := strings.Split(ref, ".")
	last := segs[len(segs)-1]
	switch strings.ToLower(last) {
	case "route", "navroute", "path", "routename", "name", "destination":
		if len(segs) > 1 {
			last = segs[len(segs)-2]
		}
	}
	return Snake(last)
}

var (
	reRouteTableName  = regexp.MustCompile(`(?i)routes?$|routeTable$|routeMap$`)
	reRouteTableEntry = regexp.MustCompile(`"(/[\w\-./:{}]*)"\s*(?::|to)\s*(?:::)?([A-Za-z_]\w*)`)
	reColonParam      = regexp.MustCompile(`:([A-Za-z_]\w*)`)
)

// swiftView returns the single project view a navigationDestination closure
// builds, or nil when it builds none or several.
func (c *ctx) swiftView(platform string, inner []string) *model.Symbol {
	var found *model.Symbol
	for _, in := range inner {
		if in == "" || !unicode.IsUpper([]rune(in)[0]) {
			continue
		}
		v := c.findSym(platform, in, "struct", "class")
		if v == nil || !(strings.HasSuffix(in, "View") || strings.HasSuffix(in, "Screen") || strings.HasSuffix(in, "Details") || strings.HasSuffix(in, "Detail")) {
			continue
		}
		if found != nil && found.ID != v.ID {
			return nil
		}
		found = v
	}
	return found
}

func lowerFirst(s string) string {
	if s == "" {
		return s
	}
	r := []rune(s)
	r[0] = unicode.ToLower(r[0])
	return string(r)
}

// caseParams turns "case accountDetail(id: String)" into "/{id}".
func caseParams(sig string) string {
	i := strings.Index(sig, "(")
	if i < 0 {
		return ""
	}
	out := ""
	for _, m := range reCaseParam.FindAllStringSubmatch(sig[i:], -1) {
		out += "/{" + m[1] + "}"
	}
	return out
}

// ---------- testIDs ----------

func (c *ctx) routeByFile() map[string]string {
	m := map[string]string{}
	for _, r := range c.f.Routes {
		m[r.File] = r.RouteID
	}
	return m
}

func (c *ctx) testIDs() {
	rbf := c.routeByFile()
	seen := map[string]bool{}
	for _, file := range c.sortedFiles() {
		fi := c.g.Files[file]
		for _, call := range c.res.Calls[file] {
			if len(call.Args) == 0 {
				continue
			}
			ok := false
			switch fi.Lang {
			case "kotlin", "java":
				ok = call.Callee == "testTag"
			case "swift":
				ok = call.Callee == "accessibilityIdentifier"
			case "arkts":
				ok = call.Callee == "id" && strings.HasSuffix(call.CalleeText, ".id")
			case "javascript", "typescript", "tsx":
				ok = call.Callee == "getByTestId"
			}
			if !ok {
				continue
			}
			v, any := c.eval(fi.Platform, call.Args[0].Parts)
			if !any {
				continue
			}
			tid := v.s
			if v.dynamic {
				tid = v.prefix
			}
			if tid == "" {
				continue
			}
			k := fi.Platform + "|" + tid + "|" + file + "|" + itoa(call.Line)
			if seen[k] {
				continue
			}
			seen[k] = true
			c.f.TestIDs = append(c.f.TestIDs, model.TestID{Platform: fi.Platform, Tid: tid, RouteID: rbf[file], File: file, Line: call.Line})
		}
	}
}

// ---------- resources ----------

func (c *ctx) resources(p config.Platform) {
	root := filepath.Join(c.res.Dir, filepath.FromSlash(p.Root))
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			n := d.Name()
			if n == "build" || n == "node_modules" || n == "oh_modules" || n == "Pods" || (strings.HasPrefix(n, ".") && path != root) {
				return filepath.SkipDir
			}
			return nil
		}
		rel, _ := filepath.Rel(c.res.Dir, path)
		rel = filepath.ToSlash(rel)
		if c.cfg.Shadowed(p, rel) {
			return nil
		}
		switch d.Name() {
		case "AndroidManifest.xml":
			c.manifest(p.Name, path, rel)
		case "Info.plist":
			c.plist(p.Name, path)
		case "module.json5":
			c.moduleJSON5(p.Name, path, rel)
		case "router_map.json":
			c.routerMap(p, path)
		default:
			if strings.HasSuffix(d.Name(), ".xml") && strings.HasSuffix(filepath.ToSlash(filepath.Dir(path)), "/res/navigation") {
				c.navGraph(p.Name, path, rel)
			}
		case "main_pages.json":
			c.mainPages(p.Name, path, rel)
		}
		return nil
	})
}

// nonAppSchemes are URI schemes that are not app deep links.
var nonAppSchemes = map[string]bool{"http": true, "https": true, "file": true, "content": true, "mailto": true, "tel": true, "data": true, "geo": true, "sms": true}

func (c *ctx) addScheme(platform, s string) {
	if nonAppSchemes[strings.ToLower(s)] {
		return
	}
	for _, x := range c.f.Schemes[platform] {
		if x == s {
			return
		}
	}
	c.f.Schemes[platform] = append(c.f.Schemes[platform], s)
}

func (c *ctx) manifest(platform, path, rel string) {
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	dec := xml.NewDecoder(strings.NewReader(string(b)))
	for {
		tok, err := dec.Token()
		if err != nil {
			break
		}
		se, ok := tok.(xml.StartElement)
		if !ok {
			continue
		}
		attr := func(name string) string {
			for _, a := range se.Attr {
				if a.Name.Local == name {
					return a.Value
				}
			}
			return ""
		}
		switch se.Name.Local {
		case "data":
			s := attr("scheme")
			if strings.HasPrefix(s, "@string/") {
				s = androidString(path, strings.TrimPrefix(s, "@string/"))
			}
			if s != "" && !strings.HasPrefix(s, "@") && !strings.HasPrefix(s, "$") {
				c.addScheme(platform, s)
			}
		case "activity":
			c.f.Entries = append(c.f.Entries, model.Entry{Platform: platform, Kind: "activity", Name: attr("name"), File: rel})
		}
	}
}

func (c *ctx) plist(platform, path string) {
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	dec := xml.NewDecoder(strings.NewReader(string(b)))
	var lastKey, cur string
	inSchemes := false
	depth := 0
	for {
		tok, err := dec.Token()
		if err != nil {
			break
		}
		switch t := tok.(type) {
		case xml.StartElement:
			cur = t.Name.Local
			if cur == "array" && lastKey == "CFBundleURLSchemes" {
				inSchemes = true
				depth = 0
			} else if inSchemes && cur == "array" {
				depth++
			}
		case xml.EndElement:
			if t.Name.Local == "array" && inSchemes {
				if depth == 0 {
					inSchemes = false
				} else {
					depth--
				}
			}
			cur = ""
		case xml.CharData:
			s := strings.TrimSpace(string(t))
			if s == "" {
				continue
			}
			if cur == "key" {
				lastKey = s
			} else if cur == "string" && inSchemes {
				c.addScheme(platform, s)
			}
		}
	}
}

var (
	json5Comment = regexp.MustCompile(`(?m)^\s*//.*$|/\*[\s\S]*?\*/`)
	json5Key     = regexp.MustCompile(`([{,]\s*)([A-Za-z_$][\w$]*)\s*:`)
	json5Trail   = regexp.MustCompile(`,(\s*[}\]])`)
)

// JSON5 converts the JSON5 subset used by HarmonyOS configs to JSON.
func JSON5(b []byte) []byte {
	s := json5Comment.ReplaceAllString(string(b), "")
	s = json5Key.ReplaceAllString(s, `$1"$2":`)
	s = json5Trail.ReplaceAllString(s, "$1")
	s = strings.ReplaceAll(s, "'", `"`)
	return []byte(s)
}

func (c *ctx) moduleJSON5(platform, path, rel string) {
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var m struct {
		Module struct {
			Name      string `json:"name"`
			RouterMap string `json:"routerMap"`
			Abilities []struct {
				Name   string `json:"name"`
				Skills []struct {
					URIs []struct {
						Scheme string `json:"scheme"`
					} `json:"uris"`
				} `json:"skills"`
			} `json:"abilities"`
		} `json:"module"`
	}
	if err := json.Unmarshal(JSON5(b), &m); err != nil {
		c.f.Warnings = append(c.f.Warnings, rel+": "+err.Error())
		return
	}
	// "routerMap": "$profile:route_map" — the file name is free; router_map.json
	// files are also picked up by name in resources().
	if prof, ok := strings.CutPrefix(m.Module.RouterMap, "$profile:"); ok && prof != "router_map" {
		rm := filepath.Join(filepath.Dir(path), "resources", "base", "profile", prof+".json")
		if _, err := os.Stat(rm); err == nil {
			for _, p := range c.cfg.Platforms {
				if p.Name == platform {
					c.routerMap(p, rm)
					break
				}
			}
		}
	}
	for _, a := range m.Module.Abilities {
		c.f.Entries = append(c.f.Entries, model.Entry{Platform: platform, Kind: "ability", Name: a.Name, File: rel})
		for _, sk := range a.Skills {
			for _, u := range sk.URIs {
				if u.Scheme != "" && u.Scheme != "http" && u.Scheme != "https" {
					c.addScheme(platform, u.Scheme)
				}
			}
		}
	}
}

// moduleDir returns the HarmonyOS module dir (parent of "src") for a resource path.
func moduleDir(path string) string {
	p := filepath.ToSlash(path)
	if i := strings.Index(p, "/src/main/"); i >= 0 {
		return p[:i]
	}
	return filepath.Dir(path)
}

func (c *ctx) routerMap(p config.Platform, path string) {
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var m struct {
		RouterMap []struct {
			Name           string            `json:"name"`
			PageSourceFile string            `json:"pageSourceFile"`
			BuildFunction  string            `json:"buildFunction"`
			Data           map[string]string `json:"data"`
		} `json:"routerMap"`
	}
	if err := json.Unmarshal(JSON5(b), &m); err != nil {
		c.f.Warnings = append(c.f.Warnings, path+": "+err.Error())
		return
	}
	mod := moduleDir(path)
	proot := filepath.ToSlash(filepath.Join(c.res.Dir, filepath.FromSlash(p.Root)))
	modRel := strings.TrimPrefix(strings.TrimPrefix(mod, proot), "/")
	for _, r := range m.RouterMap {
		pattern := r.Data["pattern"]
		if pattern == "" {
			pattern = r.Name
		}
		srcRel := strings.TrimPrefix(r.PageSourceFile, "./")
		pfile := srcRel
		if modRel != "" {
			pfile = modRel + "/" + srcRel
		}
		file := strings.TrimPrefix(p.Root+"/"+pfile, "./")
		sym := p.Name + "://" + pfile + "#" + r.BuildFunction
		if c.g.Get(sym) == nil {
			c.f.Warnings = append(c.f.Warnings, fmt.Sprintf("%s: route %q buildFunction %s not found in %s", strings.TrimPrefix(filepath.ToSlash(path), c.res.Dir+"/"), r.Name, r.BuildFunction, file))
			sym = ""
		}
		c.f.Routes = append(c.f.Routes, model.Route{Platform: p.Name, RouteID: r.Name, Pattern: pattern, Deeplink: "", File: file, Symbol: sym})
	}
	// deeplinks are filled after schemes are known (sortAll)
}

func (c *ctx) mainPages(platform, path, rel string) {
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var m struct {
		Src []string `json:"src"`
	}
	if json.Unmarshal(JSON5(b), &m) == nil {
		// <module>/src/main/resources/base/profile/main_pages.json -> <module>/src/main/ets/<page>.ets
		srcMain := filepath.ToSlash(filepath.Dir(filepath.Dir(filepath.Dir(filepath.Dir(rel)))))
		mod := filepath.ToSlash(moduleDir(rel))
		for _, s := range m.Src {
			c.f.Entries = append(c.f.Entries, model.Entry{Platform: platform, Kind: "main_page", Name: s, File: rel})
			// router.pushUrl({url: 'pages/Detail'}) targets: one route per page,
			// anchored on the page's @Entry struct
			file := strings.TrimPrefix(srcMain+"/ets/"+s+".ets", "./")
			var segs []string
			for _, seg := range strings.Split(path2id(s), "/") {
				segs = append(segs, Snake(seg))
			}
			rid := strings.Join(segs, "_")
			if c.mainPageIDs[rid] != "" && c.mainPageIDs[rid] != mod {
				var ms []string
				for _, seg := range strings.Split(mod, "/") {
					ms = append(ms, Snake(strings.NewReplacer("-", "_", ".", "_").Replace(seg)))
				}
				rid = strings.Join(ms, "_") + "_" + rid
			}
			c.mainPageIDs[rid] = mod
			sym := ""
			if c.topByFile == nil {
				c.topByFile = map[string][]*model.Symbol{}
				for _, x := range c.g.Symbols {
					if x.Parent == "" {
						c.topByFile[x.File] = append(c.topByFile[x.File], x)
					}
				}
			}
			for _, x := range c.topByFile[file] {
				if x.Kind == "component" || x.Kind == "struct" {
					sym = x.ID
					if strings.Contains(x.Signature, "@Entry") {
						break
					}
				}
			}
			if sym == "" || c.hostsNavigation(file) {
				continue // a Navigation() host is a container; its NavDestinations are the routes
			}
			c.f.Routes = append(c.f.Routes, model.Route{Platform: platform, RouteID: rid, Pattern: s, File: file, Symbol: sym})
		}
	}
}

func (c *ctx) hostsNavigation(file string) bool {
	for _, call := range c.res.Calls[file] {
		if call.Callee == "Navigation" {
			return true
		}
	}
	return false
}

// path2id drops the conventional "pages/" prefix: pages/Index -> Index,
// pages/user/Profile -> user/Profile.
func path2id(s string) string {
	return strings.TrimPrefix(s, "pages/")
}

// androidString resolves @string/name for a manifest from the module's
// res/values/strings.xml; "" when not found.
func androidString(manifest, name string) string {
	b, err := os.ReadFile(filepath.Join(filepath.Dir(manifest), "res", "values", "strings.xml"))
	if err != nil {
		return ""
	}
	dec := xml.NewDecoder(strings.NewReader(string(b)))
	for {
		tok, err := dec.Token()
		if err != nil {
			return ""
		}
		if se, ok := tok.(xml.StartElement); ok && se.Name.Local == "string" {
			for _, a := range se.Attr {
				if a.Name.Local == "name" && a.Value == name {
					var v string
					if dec.DecodeElement(&v, &se) == nil {
						return strings.TrimSpace(v)
					}
					return ""
				}
			}
		}
	}
}

// navGraph reads a Jetpack Navigation XML graph (res/navigation/*.xml): every
// <fragment>/<dialog>/<activity>/<composable> destination with an android:id
// is a route (arguments become pattern params, <deepLink app:uri> its deep
// link), anchored on the destination class.
func (c *ctx) navGraph(platform, path, rel string) {
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	type dest struct {
		r    model.Route
		args []string
	}
	var stack []*dest
	dec := xml.NewDecoder(strings.NewReader(string(b)))
	for {
		tok, err := dec.Token()
		if err != nil {
			break
		}
		switch t := tok.(type) {
		case xml.StartElement:
			attr := func(name string) string {
				for _, a := range t.Attr {
					if a.Name.Local == name {
						return a.Value
					}
				}
				return ""
			}
			switch t.Name.Local {
			case "fragment", "dialog", "activity", "composable":
				id := attr("id")
				id = id[strings.LastIndex(id, "/")+1:]
				if id == "" {
					stack = append(stack, nil)
					continue
				}
				rid := Snake(id)
				d := &dest{r: model.Route{Platform: platform, RouteID: rid, File: rel}}
				if cls := attr("name"); cls != "" {
					if s := c.findSym(platform, lastSeg(cls), "class", "object", "function", "composable"); s != nil {
						d.r.Symbol, d.r.File = s.ID, s.File
					}
				}
				stack = append(stack, d)
			case "argument":
				if len(stack) > 0 && stack[len(stack)-1] != nil {
					stack[len(stack)-1].args = append(stack[len(stack)-1].args, attr("name"))
				}
			case "deepLink":
				if len(stack) > 0 && stack[len(stack)-1] != nil {
					if u := attr("uri"); u != "" {
						stack[len(stack)-1].r.Deeplink = u
						if i := strings.Index(u, "://"); i > 0 {
							c.addScheme(platform, u[:i])
						}
					}
				}
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "fragment", "dialog", "activity", "composable":
				if len(stack) == 0 {
					continue
				}
				d := stack[len(stack)-1]
				stack = stack[:len(stack)-1]
				if d == nil {
					continue
				}
				d.r.Pattern = d.r.RouteID
				for _, a := range d.args {
					d.r.Pattern += "/{" + a + "}"
				}
				c.f.Routes = append(c.f.Routes, d.r)
			}
		}
	}
}

func (c *ctx) sortAll() {
	for i := range c.f.Routes {
		r := &c.f.Routes[i]
		if r.Deeplink == "" {
			r.Deeplink = c.deeplink(r.Platform, r.Pattern)
		}
	}
	// harmony testIDs were attributed before router_map routes existed? No:
	// resources() runs first, so routeByFile already includes them.
	sort.SliceStable(c.f.Routes, func(i, j int) bool {
		a, b := c.f.Routes[i], c.f.Routes[j]
		if a.Platform != b.Platform {
			return a.Platform < b.Platform
		}
		return a.RouteID < b.RouteID
	})
	sort.SliceStable(c.f.TestIDs, func(i, j int) bool {
		a, b := c.f.TestIDs[i], c.f.TestIDs[j]
		if a.Platform != b.Platform {
			return a.Platform < b.Platform
		}
		if a.Tid != b.Tid {
			return a.Tid < b.Tid
		}
		if a.File != b.File {
			return a.File < b.File
		}
		return a.Line < b.Line
	})
	sort.SliceStable(c.f.APIs, func(i, j int) bool {
		a, b := c.f.APIs[i], c.f.APIs[j]
		if a.Platform != b.Platform {
			return a.Platform < b.Platform
		}
		if a.Path != b.Path {
			return a.Path < b.Path
		}
		return a.Method < b.Method
	})
	sort.SliceStable(c.f.Entries, func(i, j int) bool {
		a, b := c.f.Entries[i], c.f.Entries[j]
		return a.Platform+a.Kind+a.Name < b.Platform+b.Kind+b.Name
	})
	for k := range c.f.Schemes {
		sort.Strings(c.f.Schemes[k])
	}
}

func itoa(i int) string {
	b, _ := json.Marshal(i)
	return string(b)
}
