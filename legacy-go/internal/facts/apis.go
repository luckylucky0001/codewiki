package facts

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/luckylucky0001/codewiki/internal/extract"
	"github.com/luckylucky0001/codewiki/internal/model"
)

// HTTP API extraction adapters:
//
//	Android  Retrofit @GET/@POST…, Ktor client.get("/x"), OkHttp Request.Builder().url(…).post(…)
//	iOS      send(.post, path:), Alamofire AF.request(url, method:), Moya/Endpoint enums (path/method)
//	Harmony  http.createHttp().request / httpRequest.request, @ohos/axios (axios.get, axios({url, method})),
//	         Remote Communication Kit (session.get/post, new rcp.Request(url, method))
//	JS/TS    axios.get/post…, axios({url, method})

var (
	hostRe        = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9+.-]*://[^/]*`)
	leadParamRe   = regexp.MustCompile(`^\{[A-Za-z_][\w]*\}(/|$)`)
	clientRecvRe  = regexp.MustCompile(`(?i)(client|http|axios|session|instance|ktor|request|api)\w*(\(\))?$`)
	httpVarRecvRe = regexp.MustCompile(`(?i)http\w*$`)
	swiftCaseRe   = regexp.MustCompile(`case\s+((?:\.\w+[^:]*?,?\s*)+):\s*(?:return\s+)?(\.\w+|"(?:[^"\\]|\\.)*")`)
	staticAssetRe = regexp.MustCompile(`(?i)\.(png|jpe?g|gif|webp|svg|bmp|ico|mp3|mp4|m4a|wav|webm|mov|ttf|otf|woff2?|css|js|zip|apk|hap|pdf)$`)
	endpointArgRe = regexp.MustCompile(`^\.?(?:(\w+)\.)?(\w+)`)
	swiftCaseName = regexp.MustCompile(`\.(\w+)`)
	swiftInterpRe = regexp.MustCompile(`\\\((?:[^()]*\.)?(\w+)[^()]*\)`)
	swiftDefault  = regexp.MustCompile(`default:\s*return\s+(\.\w+)`)
)

var httpMethods = map[string]bool{"GET": true, "POST": true, "PUT": true, "DELETE": true, "PATCH": true, "HEAD": true}

// normPath turns a URL / path expression into "/a/{id}".
func normPath(s string) (string, bool) {
	s = hostRe.ReplaceAllString(s, "")
	// strip a leading base-url placeholder: {BASE_URL}/x, {baseUrl}/x
	for leadParamRe.MatchString(s) {
		s = leadParamRe.ReplaceAllString(s, "/")
	}
	if i := strings.IndexAny(s, "?#"); i >= 0 {
		s = s[:i]
	}
	s = strings.ReplaceAll(s, "//", "/")
	if !strings.HasPrefix(s, "/") || len(s) < 2 {
		return "", false
	}
	return s, true
}

func (c *ctx) apis() {
	seen := map[string]bool{}
	add := func(a model.API) {
		if staticAssetRe.MatchString(a.Path) {
			return // downloads of images/media are not API endpoints
		}
		k := a.Platform + "|" + a.Method + "|" + a.Path + "|" + a.Symbol
		if !seen[k] {
			seen[k] = true
			c.f.APIs = append(c.f.APIs, a)
		}
	}
	evalPath := func(platform string, a extract.Arg, relativeOK bool) (string, bool) {
		v, ok := c.eval(platform, a.Parts)
		if !ok {
			return "", false
		}
		s := v.s
		if relativeOK && s != "" && !strings.Contains(s, "://") && !strings.HasPrefix(s, "/") && !strings.HasPrefix(s, "{") {
			s = "/" + s
		}
		return normPath(s)
	}
	for _, file := range c.sortedFiles() {
		fi := c.g.Files[file]
		calls := c.res.Calls[file]
		okhttp := map[string]string{} // receiver text containing .url(...) -> method
		for _, call := range calls {
			lc := strings.ToLower(call.Callee)
			M := strings.ToUpper(call.Callee)
			api := func(method, p string) {
				add(model.API{Platform: fi.Platform, Method: method, Path: p, File: file, Symbol: call.Enclosing})
			}
			switch fi.Lang {
			case "kotlin", "java":
				switch {
				case strings.HasPrefix(call.Callee, "@") && httpMethods[strings.TrimPrefix(call.Callee, "@")] && len(call.Args) > 0:
					// Retrofit: paths may be relative to the base URL
					if p, ok := evalPath(fi.Platform, call.Args[0], true); ok {
						api(strings.TrimPrefix(call.Callee, "@"), p)
					}
				case httpMethods[M] && len(call.Args) > 0 && strings.Contains(call.Receiver, ".url("):
					okhttp[call.Receiver] = M // OkHttp builder .post(body) after .url(...)
				case httpMethods[M] && len(call.Args) > 0 && clientRecvRe.MatchString(call.Receiver):
					// Ktor: client.get("/x") / httpClient.post("…") { … }
					if p, ok := evalPath(fi.Platform, call.Args[0], false); ok {
						api(M, p)
					}
				}
			case "swift":
				var pathArg *extract.Arg
				method := ""
				for i := range call.Args {
					a := &call.Args[i]
					switch a.Label {
					case "path":
						pathArg = a
					case "method", "httpMethod":
						method = strings.ToUpper(strings.Trim(lastSeg(a.Text), `."`))
					case "":
						if strings.HasPrefix(a.Text, ".") && httpMethods[strings.ToUpper(a.Text[1:])] {
							method = strings.ToUpper(a.Text[1:])
						}
					}
				}
				// Alamofire: AF.request("https://…/x", method: .post) / session.request(url)
				if pathArg == nil && call.Callee == "request" && len(call.Args) > 0 && call.Args[0].Label == "" &&
					(call.Receiver == "AF" || strings.HasSuffix(call.Receiver, "Session.default") || clientRecvRe.MatchString(call.Receiver)) {
					pathArg = &call.Args[0]
				}
				if pathArg == nil {
					continue
				}
				if p, ok := evalPath(fi.Platform, *pathArg, false); ok {
					if !httpMethods[method] {
						method = "GET"
					}
					api(method, p)
				}
			case "arkts", "typescript", "javascript", "tsx":
				switch {
				case call.Callee == "request" && len(call.Args) > 0 && !strings.HasPrefix(call.Args[0].Text, "{") &&
					(strings.Contains(call.Receiver+call.CalleeText, "createHttp") || httpVarRecvRe.MatchString(call.Receiver)):
					// @kit.NetworkKit http: http.createHttp().request(url, {method}) / httpRequest.request(url)
					if p, ok := evalPath(fi.Platform, call.Args[0], false); ok {
						method := "GET"
						if len(call.Args) > 1 && call.Args[1].Props != nil {
							if m := strings.ToUpper(lastSeg(call.Args[1].Props["method"])); httpMethods[m] {
								method = m
							}
						}
						api(method, p)
					}
				case (lc == "axios" || lc == "request") && len(call.Args) > 0 && call.Args[0].Props != nil && call.Args[0].Props["url"] != "":
					// axios({url, method}) / axios.request({url, method})
					m := strings.ToUpper(strings.Trim(call.Args[0].Props["method"], `'"`+"`"))
					if !httpMethods[m] {
						m = "GET"
					}
					if p, ok := normPath(strings.Trim(call.Args[0].Props["url"], `'"`+"`")); ok {
						api(m, p)
					}
				case call.Callee == "Request" && strings.Contains(call.CalleeText, "rcp") && len(call.Args) > 0:
					// Remote Communication Kit: new rcp.Request(url, 'POST')
					if p, ok := evalPath(fi.Platform, call.Args[0], false); ok {
						m := "GET"
						if len(call.Args) > 1 {
							if mm := strings.ToUpper(strings.Trim(call.Args[1].Text, `'"`+"`")); httpMethods[mm] {
								m = mm
							}
						}
						api(m, p)
					}
				case httpMethods[M] && len(call.Args) > 0 && clientRecvRe.MatchString(call.Receiver):
					// @ohos/axios / axios: axios.get('/x'); rcp: session.post(url, body); instance.put(...)
					if p, ok := evalPath(fi.Platform, call.Args[0], false); ok {
						api(M, p)
					}
				}
			}
		}
		// OkHttp: Request.Builder().url("…") [.post(body)] .build()
		if fi.Lang == "kotlin" || fi.Lang == "java" {
			for _, call := range calls {
				if call.Callee != "url" || len(call.Args) == 0 || !strings.Contains(call.Receiver, "Builder") {
					continue
				}
				if p, ok := evalPath(fi.Platform, call.Args[0], false); ok {
					m := "GET"
					for recv, mm := range okhttp {
						if strings.Contains(recv, call.Args[0].Text) {
							m = mm
						}
					}
					add(model.API{Platform: fi.Platform, Method: m, Path: p, File: file, Symbol: call.Enclosing})
				}
			}
		}
	}
	c.endpointEnums(add)
}

// endpointEnums reads Moya `TargetType` / custom `Endpoint` enums:
//
//	var path: String { switch self { case .login: return "/login" … } }
//	var method: Moya.Method { switch self { case .login: return .post; default: return .get } }
func (c *ctx) endpointEnums(add func(model.API)) {
	// call-site methods: client.post(endpoint: Statuses.favorite(id: id))
	callMethod := map[string]string{}
	for _, file := range c.sortedFiles() {
		if c.g.Files[file].Lang != "swift" {
			continue
		}
		for _, call := range c.res.Calls[file] {
			M := strings.ToUpper(call.Callee)
			if !httpMethods[M] {
				continue
			}
			for _, a := range call.Args {
				if a.Label == "endpoint" || a.Label == "target" {
					if m := endpointArgRe.FindStringSubmatch(a.Text); m != nil {
						callMethod[m[1]+"."+m[2]] = M
						callMethod["."+m[2]] = M
					}
				}
			}
		}
	}
	byParent := map[string]map[string]*model.Symbol{}
	for _, s := range c.g.Symbols {
		if s.Lang == "swift" && s.Parent != "" && (s.Name == "path" || s.Name == "method") {
			if byParent[s.Parent] == nil {
				byParent[s.Parent] = map[string]*model.Symbol{}
			}
			byParent[s.Parent][s.Name] = s
		}
	}
	for parent, m := range byParent {
		ps := m["path"]
		owner := c.g.Get(parent)
		if ps == nil || owner == nil || !(strings.Contains(owner.Signature, "TargetType") || strings.Contains(owner.Signature, "Endpoint")) {
			continue
		}
		body := c.symbolSource(ps)
		methods := map[string]string{}
		defMethod := "GET"
		if ms := m["method"]; ms != nil {
			mb := c.symbolSource(ms)
			for _, mm := range swiftCaseRe.FindAllStringSubmatch(mb, -1) {
				for _, cn := range swiftCaseName.FindAllStringSubmatch(mm[1], -1) {
					methods[cn[1]] = strings.ToUpper(strings.TrimPrefix(mm[2], "."))
				}
			}
			if d := swiftDefault.FindStringSubmatch(mb); d != nil {
				defMethod = strings.ToUpper(strings.TrimPrefix(d[1], "."))
			}
		}
		base := strings.TrimSuffix(owner.Name, "+ext")
		for _, mm := range swiftCaseRe.FindAllStringSubmatch(body, -1) {
			if !strings.HasPrefix(mm[2], `"`) {
				continue
			}
			raw := strings.Trim(mm[2], `"`)
			raw = swiftInterpRe.ReplaceAllString(raw, "{$1}")
			if !strings.HasPrefix(raw, "/") && !strings.Contains(raw, "://") {
				raw = "/" + raw
			}
			p, ok := normPath(raw)
			if !ok {
				continue
			}
			for _, cn := range swiftCaseName.FindAllStringSubmatch(mm[1], -1) {
				method := defMethod
				if v, ok := methods[cn[1]]; ok {
					method = v
				} else if v, ok := callMethod[base+"."+cn[1]]; ok && m["method"] == nil {
					method = v
				}
				if !httpMethods[method] {
					method = "GET"
				}
				sym := ps.ID
				if cs := c.findSym(owner.Platform, cn[1], "case"); cs != nil && strings.HasPrefix(cs.Qual, base+".") {
					sym = cs.ID
				}
				add(model.API{Platform: owner.Platform, Method: method, Path: p, File: ps.File, Symbol: sym})
			}
		}
	}
}

func (c *ctx) symbolSource(s *model.Symbol) string {
	b, err := os.ReadFile(filepath.Join(c.res.Dir, filepath.FromSlash(s.File)))
	if err != nil {
		return ""
	}
	lines := strings.Split(string(b), "\n")
	lo, hi := s.StartLine-1, s.EndLine
	if lo < 0 || hi > len(lines) || lo >= hi {
		return ""
	}
	return strings.Join(lines[lo:hi], "\n")
}
