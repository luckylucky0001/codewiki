package facts

import (
	"encoding/xml"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/luckylucky0001/codewiki/internal/model"
)

// UIKit / AppKit screens and navigation edges (NetNewsWire, wikipedia-ios,
// kickstarter). Conservative: a screen is a project class whose superclass
// chain reaches a view-controller base; an edge needs a direct type
// reference (pushViewController(X(...)), present(X(...)), show(X(...))) or a
// literal storyboard identifier (performSegue(withIdentifier: "s"),
// instantiateViewController(withIdentifier: "id")).

var vcBases = map[string]bool{
	"UIViewController": true, "UITableViewController": true, "UICollectionViewController": true,
	"UIHostingController": true, "UIPageViewController": true, "NSViewController": true,
}

// containers and system controllers are not screens of the app
var vcContainers = map[string]bool{
	"UINavigationController": true, "UITabBarController": true, "UISplitViewController": true,
	"UIAlertController": true, "UISearchController": true, "UIActivityViewController": true,
	"UIImagePickerController": true, "UIDocumentPickerViewController": true, "SFSafariViewController": true,
	"NSWindowController": true, "NSSplitViewController": true, "NSTabViewController": true,
}

// superclassOf returns the first inherited type of a Swift class signature
// ("final class A: B<C>, P" -> "B").
func superclassOf(sig string) string {
	head := sig
	if i := strings.IndexByte(head, '{'); i >= 0 {
		head = head[:i]
	}
	// skip a generic parameter clause: class H<V: View>: UIHostingController<V>
	if lt := strings.IndexByte(head, '<'); lt >= 0 && lt < strings.Index(head+":", ":") {
		depth := 0
		for j := lt; j < len(head); j++ {
			if head[j] == '<' {
				depth++
			} else if head[j] == '>' {
				depth--
				if depth == 0 {
					head = head[:lt] + head[j+1:]
					break
				}
			}
		}
	}
	i := strings.Index(head, ":")
	if i < 0 {
		return ""
	}
	rest := strings.TrimSpace(head[i+1:])
	end := len(rest)
	for j, r := range rest {
		if r == ',' || r == '<' || r == ' ' || r == '\n' || r == '{' {
			end = j
			break
		}
	}
	base := rest[:end]
	return lastSeg(base)
}

func (c *ctx) uikit() {
	if c.cfg != nil && !c.cfg.UIKitEnabled() {
		return
	}
	classes := map[string]*model.Symbol{} // platform|name -> class
	for _, s := range c.g.Symbols {
		if s.Lang == "swift" && s.Kind == "class" && s.Parent == "" {
			k := s.Platform + "|" + s.Name
			if prev := classes[k]; prev == nil || (isTestPath(prev.File) && !isTestPath(s.File)) {
				classes[k] = s
			}
		}
	}
	memo := map[string]int{} // 1 = vc, 2 = not
	var isVC func(platform, name string, depth int) bool
	isVC = func(platform, name string, depth int) bool {
		if vcContainers[name] {
			return false
		}
		if vcBases[name] {
			return true
		}
		k := platform + "|" + name
		if v, ok := memo[k]; ok {
			return v == 1
		}
		memo[k] = 2
		cl := classes[k]
		if cl == nil || depth > 12 {
			return false
		}
		ok := isVC(platform, superclassOf(cl.Signature), depth+1)
		if ok {
			memo[k] = 1
		}
		return ok
	}
	// a view controller that two or more project view controllers inherit
	// from is a shared base (ThemeableViewController), not a screen
	subs := map[string]int{}
	for _, cl := range classes {
		if !isTestPath(cl.File) {
			subs[cl.Platform+"|"+superclassOf(cl.Signature)]++
		}
	}
	screens := map[string]*model.Symbol{} // platform|name -> class
	var keys []string
	for k, cl := range classes {
		if subs[k] >= 2 || isTestPath(cl.File) || strings.HasPrefix(cl.Name, "Base") || strings.HasPrefix(cl.Name, "Abstract") || strings.HasSuffix(cl.File, "Previews.swift") || strings.Contains(cl.File, "Preview Content/") {
			continue
		}
		if isVC(cl.Platform, cl.Name, 0) && !vcBases[cl.Name] {
			screens[k] = cl
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	have := map[string]bool{}
	for _, r := range c.f.Routes {
		have[r.File+"|"+r.Symbol] = true
	}
	for _, k := range keys {
		cl := screens[k]
		if have[cl.File+"|"+cl.ID] {
			continue
		}
		rid := screenID(cl.Name)
		c.f.Routes = append(c.f.Routes, model.Route{Platform: cl.Platform, RouteID: rid, Pattern: rid, File: cl.File, Symbol: cl.ID})
	}
	// storyboards: scene id / storyboardIdentifier -> customClass, segue identifier -> (source, destination)
	sb := c.storyboards()
	top := func(id string) *model.Symbol {
		s := c.g.Get(id)
		for s != nil && s.Parent != "" {
			s = c.g.Get(s.Parent)
		}
		return s
	}
	seen := map[string]bool{}
	edge := func(e model.NavEdge) {
		k := e.Platform + "|" + e.From + "|" + e.To + "|" + e.Kind
		if e.From == "" || e.To == "" || e.From == e.To || seen[k] {
			return
		}
		seen[k] = true
		c.f.Navigation = append(c.f.Navigation, e)
	}
	for _, file := range c.sortedFiles() {
		fi := c.g.Files[file]
		if fi.Lang != "swift" {
			continue
		}
		for _, call := range c.res.Calls[file] {
			kind := ""
			switch call.Callee {
			case "pushViewController":
				kind = "push"
			case "present":
				kind = "present"
			case "show", "showDetailViewController":
				kind = "show"
			case "performSegue":
				kind = "segue"
			case "instantiateViewController":
				kind = "storyboard"
			default:
				continue
			}
			if len(call.Args) == 0 {
				continue
			}
			src := top(call.Enclosing)
			if src == nil || screens[fi.Platform+"|"+src.Name] == nil {
				continue
			}
			to := ""
			switch kind {
			case "segue", "storyboard":
				v, ok := c.eval(fi.Platform, call.Args[0].Parts)
				if !ok || v.dynamic {
					continue
				}
				if kind == "segue" {
					to = sb.segues[v.s]
				} else {
					to = sb.ids[v.s]
				}
			default:
				// push(X(...)), push(X.instantiate()), present(UINavigationController(rootViewController: X())),
				// or a local `let vc = X(...)` / `let vc: X = …` in the same function
				arg := strings.TrimRight(strings.TrimSpace(call.Args[0].Text), "!?")
				to = soleScreen(fi.Platform, arg, screens)
				if to == "" && reIdent.MatchString(arg) {
					if fn := c.g.Get(call.Enclosing); fn != nil {
						src := c.symbolSource(fn)
						for _, m := range reLocalAssign.FindAllStringSubmatch(src, -1) {
							if m[1] == arg {
								if to = soleScreen(fi.Platform, m[2]+" "+m[3], screens); to != "" {
									break
								}
							}
						}
					}
				}
			}
			if to == "" || screens[fi.Platform+"|"+to] == nil {
				continue
			}
			edge(model.NavEdge{Platform: fi.Platform, From: screenID(src.Name), To: screenID(to), Kind: kind, File: file, Line: call.Line})
		}
	}
	sort.SliceStable(c.f.Navigation, func(i, j int) bool {
		a, b := c.f.Navigation[i], c.f.Navigation[j]
		if a.From != b.From {
			return a.From < b.From
		}
		if a.To != b.To {
			return a.To < b.To
		}
		return a.Kind < b.Kind
	})
}

var (
	reIdent       = regexp.MustCompile(`^[a-z_]\w*$`)
	reLocalAssign = regexp.MustCompile(`(?m)\b(?:let|var)\s+(\w+)\s*(?::\s*([^=\n]+?))?\s*=\s*([^\n]+)`)
	reTypeName    = regexp.MustCompile(`\b[A-Z]\w*`)
)

// soleScreen returns the only screen class named in expr ("" if none or several).
func soleScreen(platform, expr string, screens map[string]*model.Symbol) string {
	found := ""
	for _, n := range reTypeName.FindAllString(expr, -1) {
		if screens[platform+"|"+n] == nil {
			continue
		}
		if found != "" && found != n {
			return ""
		}
		found = n
	}
	return found
}

// screenID: FeedListViewController -> feed_list.
func screenID(name string) string {
	base := name
	for _, suf := range []string{"ViewController", "Controller", "VC"} {
		if strings.HasSuffix(base, suf) && len(base) > len(suf) {
			base = strings.TrimSuffix(base, suf)
			break
		}
	}
	return Snake(base)
}

type storyboardIndex struct {
	ids    map[string]string // storyboardIdentifier -> customClass
	segues map[string]string // segue identifier -> destination customClass (unique only)
}

func (c *ctx) storyboards() storyboardIndex {
	idx := storyboardIndex{ids: map[string]string{}, segues: map[string]string{}}
	ambiguous := map[string]bool{}
	for _, p := range c.cfg.Platforms {
		root := filepath.Join(c.res.Dir, filepath.FromSlash(p.Root))
		_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				n := d.Name()
				if n == "build" || n == "Pods" || n == "node_modules" || (strings.HasPrefix(n, ".") && path != root) {
					return filepath.SkipDir
				}
				return nil
			}
			if !strings.HasSuffix(d.Name(), ".storyboard") {
				return nil
			}
			b, err := os.ReadFile(path)
			if err != nil {
				return nil
			}
			scene := map[string]string{} // element id -> customClass
			type seg struct{ id, dest string }
			var segs []seg
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
				attr := func(n string) string {
					for _, a := range se.Attr {
						if a.Name.Local == n {
							return a.Value
						}
					}
					return ""
				}
				if se.Name.Local == "segue" {
					if id := attr("identifier"); id != "" {
						segs = append(segs, seg{id, attr("destination")})
					}
					continue
				}
				if cc := attr("customClass"); cc != "" && attr("id") != "" {
					scene[attr("id")] = cc
					if sid := attr("storyboardIdentifier"); sid != "" {
						idx.ids[sid] = cc
					}
				}
			}
			for _, s := range segs {
				dest := scene[s.dest]
				if dest == "" {
					continue
				}
				if prev, ok := idx.segues[s.id]; ok && prev != dest {
					ambiguous[s.id] = true
				}
				idx.segues[s.id] = dest
			}
			return nil
		})
	}
	for id := range ambiguous {
		delete(idx.segues, id)
	}
	return idx
}
