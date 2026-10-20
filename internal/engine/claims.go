package engine

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/luckylucky0001/codewiki/internal/model"
)

// Claim statuses.
const (
	ClaimVerified     = "verified"
	ClaimConflict     = "conflict"
	ClaimUnverifiable = "unverifiable"
)

// Claim is one checkable statement extracted from a document.
type Claim struct {
	ID       string   `json:"id"`
	Source   string   `json:"source"` // original doc path (repo-relative)
	Raw      string   `json:"raw"`    // wiki-relative raw copy
	Line     int      `json:"line"`
	Text     string   `json:"text"`
	Style    string   `json:"style"` // spec-kit | kiro | ears | must | statement
	Status   string   `json:"status,omitempty"`
	Anchors  []string `json:"anchors,omitempty"`
	RouteIDs []string `json:"route_ids,omitempty"`
	Evidence []string `json:"evidence,omitempty"`
}

var (
	reFR        = regexp.MustCompile(`\b((?:FR|NFR|SC|REQ)-\d{1,4})\b`)
	reKiroReq   = regexp.MustCompile(`(?i)^#{2,4}\s*Requirement\s+(\d+)`)
	reNumItem   = regexp.MustCompile(`^\s*(\d+)\.\s+(.+)$`)
	reBullet    = regexp.MustCompile(`^\s*(?:[-*+]|\d+\.)\s+(.+)$`)
	reEARS      = regexp.MustCompile(`(?i)\b(WHEN|WHILE|IF|WHERE)\b.*\b(SHALL|MUST)\b|\bTHE SYSTEM SHALL\b`)
	reMust      = regexp.MustCompile(`\b(MUST|SHALL|SHOULD|MUST NOT|SHALL NOT)\b|必须|应当|不得`)
	reCode      = regexp.MustCompile("`([^`]+)`")
	reAPI       = regexp.MustCompile(`\b(GET|POST|PUT|DELETE|PATCH)\s+` + "`?" + `(/[A-Za-z0-9_/{}:\-.]+)`)
	reAPIPath   = regexp.MustCompile(`(/api/[A-Za-z0-9_/{}:\-.]+)`)
	reDeeplink  = regexp.MustCompile(`\b([a-z][a-z0-9+.-]{1,20})://([A-Za-z0-9_/{}<>.-]*)`)
	reNumber    = regexp.MustCompile(`\b\d+\b`)
	reIdentLike = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*(?:\(\))?$`)
	reMdStrip   = regexp.MustCompile(`\*\*|__`)
)

func shortHash(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])[:6]
}

func docSlug(p string) string {
	base := strings.TrimSuffix(path.Base(p), path.Ext(p))
	dir := path.Base(path.Dir(p))
	s := base
	if base == "spec" || base == "requirements" || base == "design" || base == "tasks" || base == "README" || base == "readme" {
		s = dir + "-" + base
	}
	s = strings.ToUpper(regexp.MustCompile(`[^A-Za-z0-9]+`).ReplaceAllString(s, "-"))
	return strings.Trim(s, "-")
}

// ExtractClaims parses requirement-style statements out of a markdown doc.
// source is the original repo-relative path, raw the wiki-relative copy.
func ExtractClaims(source, raw string, content []byte) []Claim {
	var out []Claim
	seen := map[string]bool{}
	slug := docSlug(source)
	feature := strings.ToUpper(path.Base(path.Dir(source)))
	kiroReq := ""
	inCode := false
	for i, line := range strings.Split(string(content), "\n") {
		t := strings.TrimSpace(line)
		if strings.HasPrefix(t, "```") {
			inCode = !inCode
			continue
		}
		if inCode || t == "" || strings.HasPrefix(t, "|---") {
			continue
		}
		if m := reKiroReq.FindStringSubmatch(t); m != nil {
			kiroReq = m[1]
			continue
		}
		if strings.HasPrefix(t, "#") || strings.HasPrefix(t, ">") {
			continue
		}
		text := strings.TrimSpace(reMdStrip.ReplaceAllString(t, ""))
		if m := reBullet.FindStringSubmatch(text); m != nil {
			text = m[1]
		}
		var c Claim
		switch {
		case reFR.MatchString(text) && strings.Index(text, reFR.FindString(text)) < 4:
			id := reFR.FindString(text)
			body := strings.TrimSpace(strings.TrimLeft(strings.TrimPrefix(text, id), ":： "))
			c = Claim{ID: id, Text: body, Style: "spec-kit"}
		case kiroReq != "" && reNumItem.MatchString(t) && reEARS.MatchString(t):
			m := reNumItem.FindStringSubmatch(t)
			c = Claim{ID: fmt.Sprintf("%s-R%s.%s", feature, kiroReq, m[1]), Text: strings.TrimSpace(reMdStrip.ReplaceAllString(m[2], "")), Style: "kiro"}
		case reEARS.MatchString(text):
			c = Claim{Text: text, Style: "ears"}
		case reMust.MatchString(text):
			c = Claim{Text: text, Style: "must"}
		case reBullet.MatchString(t) && (strings.Contains(text, "`") || reAPIPath.MatchString(text) || reAPI.MatchString(text)):
			c = Claim{Text: text, Style: "statement"}
		default:
			continue
		}
		if c.ID == "" {
			c.ID = slug + "-" + shortHash(strings.Join(strings.Fields(c.Text), " "))
		}
		if seen[c.ID] {
			c.ID = fmt.Sprintf("%s-%d", c.ID, i+1)
		}
		seen[c.ID] = true
		c.Source, c.Raw, c.Line = source, raw, i+1
		out = append(out, c)
	}
	return out
}

// Checker verifies claims deterministically against facts and symbols.
type Checker struct {
	G     *model.Graph
	F     *model.Facts
	Dir   string // scanned source dir (for literal search)
	norms map[string]string
}

func normAPIPath(p string) string {
	p = strings.TrimRight(p, ".,;:)")
	p = regexp.MustCompile(`\{[^}]*\}|:[A-Za-z_]+`).ReplaceAllString(p, "{}")
	return strings.TrimSuffix(p, "/")
}

func normLit(s string) string {
	s = strings.ReplaceAll(s, `"`, "'")
	return strings.Join(strings.Fields(s), "")
}

func (k *Checker) symbolText(s *model.Symbol) string {
	if k.norms == nil {
		k.norms = map[string]string{}
	}
	if v, ok := k.norms[s.ID]; ok {
		return v
	}
	b, err := os.ReadFile(filepath.Join(k.Dir, filepath.FromSlash(s.File)))
	if err != nil {
		k.norms[s.ID] = ""
		return ""
	}
	lines := strings.Split(string(b), "\n")
	lo, hi := s.StartLine-1, s.EndLine
	if lo < 0 {
		lo = 0
	}
	if hi > len(lines) {
		hi = len(lines)
	}
	v := normLit(strings.Join(lines[lo:hi], "\n"))
	k.norms[s.ID] = v
	return v
}

var reFileName = regexp.MustCompile(`^[\w./-]+\.(json5?|ets|kt|kts|java|swift|xml|plist|md|ya?ml|js|ts|gradle)$`)

func (k *Checker) findFile(name string) string {
	found := ""
	_ = filepath.WalkDir(k.Dir, func(p string, d os.DirEntry, err error) error {
		if err != nil || found != "" {
			return filepath.SkipDir
		}
		if d.IsDir() && (d.Name() == ".git" || d.Name() == "node_modules" || d.Name() == "wiki" || d.Name() == ".kb-work") {
			return filepath.SkipDir
		}
		if !d.IsDir() && (d.Name() == path.Base(name)) {
			rel, _ := filepath.Rel(k.Dir, p)
			if strings.HasSuffix(filepath.ToSlash(rel), name) {
				found = filepath.ToSlash(rel)
			}
		}
		return nil
	})
	return found
}

func (k *Checker) symAtLine(file string, line int) string {
	best := ""
	span := 1 << 30
	for _, s := range k.G.Symbols {
		if s.File == file && s.StartLine <= line && line <= s.EndLine && s.EndLine-s.StartLine < span {
			best, span = s.ID, s.EndLine-s.StartLine
		}
	}
	return best
}

func (k *Checker) findSymbols(name string) []*model.Symbol {
	name = strings.TrimSuffix(name, "()")
	var out []*model.Symbol
	for _, s := range k.G.Symbols {
		if s.Name == name || s.Qual == name || strings.HasSuffix(s.Qual, "."+name) {
			out = append(out, s)
		}
	}
	return out
}

// Check fills Status/Anchors/Evidence/RouteIDs of c.
func (k *Checker) Check(c *Claim) {
	anchors := map[string]bool{}
	routes := map[string]bool{}
	var evidence []string
	conflict, verified := false, false
	text := c.Text
	addRouteForSym := func(id string) {
		s := k.G.Get(id)
		if s == nil {
			return
		}
		for _, r := range k.F.Routes {
			if r.File == s.File {
				routes[r.RouteID] = true
			}
		}
	}
	// 1. APIs
	apiSeen := map[string]bool{}
	for _, m := range reAPI.FindAllStringSubmatch(text, -1) {
		apiSeen[normAPIPath(m[2])] = true
		k.checkAPI(m[1], m[2], anchors, &evidence, &conflict, &verified)
	}
	for _, m := range reAPIPath.FindAllStringSubmatch(text, -1) {
		if !apiSeen[normAPIPath(m[1])] {
			apiSeen[normAPIPath(m[1])] = true
			k.checkAPI("", m[1], anchors, &evidence, &conflict, &verified)
		}
	}
	// 2. deeplinks
	for _, m := range reDeeplink.FindAllStringSubmatch(text, -1) {
		if m[1] == "http" || m[1] == "https" {
			continue
		}
		pat := strings.SplitN(m[2], "?", 2)[0]
		if strings.ContainsAny(pat, "<>") {
			continue // placeholder such as scheme://<pattern>
		}
		found := false
		for _, r := range k.F.Routes {
			if strings.HasPrefix(r.Deeplink, m[1]+"://") && (normAPIPath(r.Pattern) == normAPIPath(pat) || (pat == "" && r.Pattern != "")) {
				found = true
				anchors[r.Symbol] = true
				routes[r.RouteID] = true
			}
		}
		if found {
			verified = true
			evidence = append(evidence, fmt.Sprintf("deeplink `%s://%s` 存在", m[1], pat))
		} else {
			conflict = true
			evidence = append(evidence, fmt.Sprintf("代码中没有 deeplink `%s://%s`", m[1], pat))
		}
	}
	// 3. code spans
	nums := reNumber.FindAllString(reCode.ReplaceAllString(text, ""), -1)
	for _, m := range reCode.FindAllStringSubmatch(text, -1) {
		span := strings.TrimSpace(m[1])
		if span == "" || reAPIPath.MatchString(span) || strings.Contains(span, "://") || apiSeen[normAPIPath(span)] {
			continue
		}
		if strings.HasPrefix(span, "GET ") || strings.HasPrefix(span, "POST ") {
			continue
		}
		// testID
		matchedTid := false
		for _, t := range k.F.TestIDs {
			if t.Tid == span || (strings.HasSuffix(t.Tid, "_") && strings.HasPrefix(span, t.Tid)) {
				matchedTid = true
				if id := k.symAtLine(t.File, t.Line); id != "" {
					anchors[id] = true
				}
				if t.RouteID != "" {
					routes[t.RouteID] = true
				}
			}
		}
		if matchedTid {
			verified = true
			evidence = append(evidence, fmt.Sprintf("testID `%s` 存在", span))
			continue
		}
		// route id / pattern
		matchedRoute := false
		for _, r := range k.F.Routes {
			if r.RouteID == span || r.Pattern == span {
				matchedRoute = true
				anchors[r.Symbol] = true
				routes[r.RouteID] = true
			}
		}
		if matchedRoute {
			verified = true
			evidence = append(evidence, fmt.Sprintf("路由 `%s` 存在", span))
			continue
		}
		if reFileName.MatchString(span) {
			if f := k.findFile(span); f != "" {
				verified = true
				evidence = append(evidence, fmt.Sprintf("文件 `%s` 存在（%s）", span, f))
			} else {
				conflict = true
				evidence = append(evidence, fmt.Sprintf("文件 `%s` 在仓库中不存在", span))
			}
			continue
		}
		if reIdentLike.MatchString(span) {
			syms := k.findSymbols(span)
			if len(syms) == 0 {
				if looksLikeCodeIdent(span) {
					conflict = true
					evidence = append(evidence, fmt.Sprintf("符号 `%s` 在代码中不存在", span))
				}
				continue
			}
			valueChecked := false
			for _, s := range syms {
				anchors[s.ID] = true
				addRouteForSym(s.ID)
				if s.Value != "" && len(nums) > 0 {
					if _, err := strconv.Atoi(s.Value); err == nil {
						valueChecked = true
						if containsStr(nums, s.Value) {
							evidence = append(evidence, fmt.Sprintf("`%s` = %s（%s）与文档一致", s.Qual, s.Value, s.Platform))
						} else {
							conflict = true
							evidence = append(evidence, fmt.Sprintf("代码中 `%s` = %s（%s），文档写的是 %s", s.Qual, s.Value, s.Platform, strings.Join(nums, "/")))
						}
					}
				}
			}
			if !valueChecked {
				evidence = append(evidence, fmt.Sprintf("符号 `%s` 存在（%d 处）", span, len(syms)))
			}
			verified = true
			continue
		}
		// literal: search normalized symbol bodies
		lit := normLit(span)
		if len(lit) < 4 {
			continue
		}
		var hits []string
		for _, s := range k.G.Symbols {
			if containerKinds[s.Kind] {
				continue
			}
			if strings.Contains(k.symbolText(s), lit) {
				hits = append(hits, s.ID)
			}
		}
		sort.Strings(hits)
		if len(hits) > 0 {
			if len(hits) > 3 {
				hits = hits[:3]
			}
			for _, h := range hits {
				anchors[h] = true
				addRouteForSym(h)
			}
			verified = true
			evidence = append(evidence, fmt.Sprintf("字面量 `%s` 出现在 %s", span, strings.Join(hits, ", ")))
		}
	}
	for _, r := range k.F.Routes {
		if len(r.RouteID) > 3 && regexp.MustCompile(`\b`+regexp.QuoteMeta(r.RouteID)+`\b`).MatchString(text) {
			routes[r.RouteID] = true
		}
	}
	switch {
	case conflict:
		c.Status = ClaimConflict
	case verified:
		c.Status = ClaimVerified
	default:
		c.Status = ClaimUnverifiable
		evidence = append(evidence, "没有可确定性校验的锚点（需要 LLM 语义核对）")
	}
	c.Anchors = sortedKeys(anchors)
	c.RouteIDs = sortedKeys(routes)
	c.Evidence = evidence
}

func (k *Checker) checkAPI(method, p string, anchors map[string]bool, evidence *[]string, conflict, verified *bool) {
	np := normAPIPath(p)
	var same, other []model.API
	for _, a := range k.F.APIs {
		if normAPIPath(a.Path) == np {
			if method == "" || a.Method == method {
				same = append(same, a)
			} else {
				other = append(other, a)
			}
		}
	}
	label := strings.TrimSpace(method + " " + p)
	switch {
	case len(same) > 0:
		*verified = true
		plats := map[string]bool{}
		for _, a := range same {
			anchors[a.Symbol] = true
			plats[a.Platform] = true
		}
		*evidence = append(*evidence, fmt.Sprintf("接口 `%s` 存在（%s）", label, strings.Join(sortedKeys(plats), ", ")))
	case len(other) > 0:
		*conflict = true
		*evidence = append(*evidence, fmt.Sprintf("接口 `%s` 在代码中的方法是 %s", p, other[0].Method))
	default:
		*conflict = true
		*evidence = append(*evidence, fmt.Sprintf("接口 `%s` 在代码中不存在", label))
	}
}

func looksLikeCodeIdent(s string) bool {
	if strings.Contains(s, "_") || strings.Contains(s, ".") || strings.HasSuffix(s, "()") {
		return true
	}
	hasLower, hasUpper := false, false
	for i, r := range s {
		if r >= 'a' && r <= 'z' {
			hasLower = true
		}
		if r >= 'A' && r <= 'Z' && i > 0 {
			hasUpper = true
		}
	}
	return hasLower && hasUpper
}

func containsStr(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
