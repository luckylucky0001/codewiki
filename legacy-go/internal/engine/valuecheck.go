package engine

import (
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

// Conservative, deterministic value and behaviour rules for template mode.
// Each rule only fires when the claim says something specific (a number with a
// recognised quantity phrase, an explicit testID, a parameter list next to an
// API, a "shared constant", a well-known feature keyword) and the code gives an
// unambiguous answer. Anything in doubt is left alone, so precision stays high.

// ruleOut collects what the rules found.
type ruleOut struct {
	conflict, verified bool
	evidence           []string
	anchors            []string
}

func (r *ruleOut) conflictf(format string, a ...any) {
	r.conflict = true
	r.evidence = append(r.evidence, fmt.Sprintf(format, a...))
}

func (r *ruleOut) verifiedf(format string, a ...any) {
	r.verified = true
	r.evidence = append(r.evidence, fmt.Sprintf(format, a...))
}

// reNegation guards behaviour rules: "MUST NOT show …", "不再支持 …" are
// statements about absence and must not be turned into conflicts.
var reNegation = regexp.MustCompile(`(?i)\b(not|never|no|without|removed|deprecated)\b|不|没有|无需|禁止|移除|废弃|取消`)

// ---------------------------------------------------------------- quantities

type quantityRule struct {
	kind  string         // limit | min | timeout | retry
	re    *regexp.Regexp // group "n" = number, optional group "unit"
	names *regexp.Regexp // constant names this quantity is about
}

var quantityRules = []quantityRule{
	{"limit", regexp.MustCompile(`(?i)(?:最多|至多|上限(?:为|是)?|不超过|不能超过|at most|up to|no more than|maximum of|max(?:imum)?(?: is| of)?)[^0-9，。,.;；:：\n]{0,6}?(?P<n>\d+)`), regexp.MustCompile(`(?i)max|limit|cap(?:acity)?\b`)},
	{"min", regexp.MustCompile(`(?i)(?:至少|最少|不少于|不能少于|少于|短于|at least|minimum of|min(?:imum)?(?: is| of)?|shorter than|fewer than|less than)[^0-9，。,.;；:：\n]{0,6}?(?P<n>\d+)`), regexp.MustCompile(`(?i)min`)},
	{"timeout", regexp.MustCompile(`(?i)(?:超时(?:时间)?|time ?out)\D{0,8}?(?P<n>\d+)\s*(?P<unit>ms|毫秒|秒|s\b|sec(?:ond)?s?|分钟|min(?:ute)?s?)`), regexp.MustCompile(`(?i)time_?out`)},
	{"retry", regexp.MustCompile(`(?i)(?:重试|retry|retries)\D{0,6}?(?P<n>\d+)`), regexp.MustCompile(`(?i)retr(y|ies)`)},
}

// zhDomain maps common Chinese domain words to the identifier fragments used in code.
var zhDomain = map[string][]string{
	"购物车": {"cart"}, "商品": {"product", "item"}, "订单": {"order"}, "密码": {"password", "pwd"},
	"用户名": {"username", "user"}, "登录": {"login"}, "图片": {"image", "img"}, "请求": {"request"},
	"上传": {"upload"}, "下载": {"download"}, "缓存": {"cache"}, "验证码": {"code"}, "地址": {"address"},
}

var reWord = regexp.MustCompile(`[A-Za-z][A-Za-z]{2,}`)

var domainStop = map[string]bool{}

func init() {
	for _, w := range strings.Fields("the and that when then with shall must should system user users app all from into have has are for not than least most more less items item characters character seconds second minutes minute times time max maximum min minimum limit hold calling call without before after only each per can will may this its") {
		domainStop[w] = true
	}
}

// domainWords returns the lower-case words of a claim that can disambiguate a constant.
func domainWords(text string) []string {
	set := map[string]bool{}
	for _, w := range reWord.FindAllString(reCode.ReplaceAllString(text, " "), -1) {
		w = strings.ToLower(w)
		if !domainStop[w] {
			set[w] = true
		}
	}
	for zh, en := range zhDomain {
		if strings.Contains(text, zh) {
			for _, e := range en {
				set[e] = true
			}
		}
	}
	return sortedKeys(set)
}

func toMillis(n int, unit string) int {
	switch strings.ToLower(unit) {
	case "ms", "毫秒":
		return n
	case "分钟", "min", "mins", "minute", "minutes":
		return n * 60000
	default:
		return n * 1000
	}
}

// constMatches reports whether a constant's value agrees with the claimed number.
func constMatches(kind string, s *model.Symbol, n int, unit string) bool {
	v, err := strconv.Atoi(s.Value)
	if err != nil {
		return false
	}
	if kind != "timeout" {
		return v == n
	}
	want := toMillis(n, unit)
	// A timeout constant may be in ms or s; accept either reading of it.
	return v == want || v*1000 == want || strings.Contains(strings.ToLower(s.Name), "sec") && v*1000 == want
}

var reSizeUnit = regexp.MustCompile(`^\s*(?i:[kmgt]i?b\b|bytes?\b|b\b|ms\b|s\b|sec|秒|毫秒|分钟|小时|天|px|dp|pt\b|%|x\d|×)`)

var reCompare = regexp.MustCompile(`(?:length|count|size|count\(\)|length\(\))(<=|>=|<|>|===|==)(\d+)`)

// quantityRules checks "最多 10 件 / 超时 30 秒 / shorter than 6" style claims
// against numeric constants (and, for verification only, literal comparisons).
func (k *Checker) quantityRules(text string, out *ruleOut) {
	words := domainWords(text)
	for _, q := range quantityRules {
		for _, loc := range q.re.FindAllStringSubmatchIndex(text, -1) {
			m := make([]string, len(loc)/2)
			for g := range m {
				if loc[2*g] >= 0 {
					m[g] = text[loc[2*g]:loc[2*g+1]]
				}
			}
			// counts and lengths only: "不超过 200KB", "800x800", "30%" are sizes / ratios
			if (q.kind == "limit" || q.kind == "min") && reSizeUnit.MatchString(text[loc[1]:]) {
				continue
			}
			n, _ := strconv.Atoi(m[q.re.SubexpIndex("n")])
			unit := ""
			if i := q.re.SubexpIndex("unit"); i > 0 {
				unit = m[i]
			}
			var all, scoped []*model.Symbol
			for _, s := range k.G.Symbols {
				if s.Value == "" || !q.names.MatchString(s.Name) {
					continue
				}
				if _, err := strconv.Atoi(s.Value); err != nil {
					continue
				}
				all = append(all, s)
				ln := strings.ToLower(s.Name)
				for _, w := range words {
					if strings.Contains(ln, w) {
						scoped = append(scoped, s)
						break
					}
				}
			}
			cands := scoped
			if len(cands) == 0 && len(all) == 1 && len(words) == 0 {
				cands = all
			}
			if len(cands) > 0 {
				var same, diff []string
				for _, s := range cands {
					out.anchors = append(out.anchors, s.ID)
					if constMatches(q.kind, s, n, unit) {
						same = append(same, fmt.Sprintf("%s=%s（%s）", s.Name, s.Value, s.Platform))
					} else {
						diff = append(diff, fmt.Sprintf("%s=%s（%s）", s.Name, s.Value, s.Platform))
					}
				}
				label := strings.TrimSpace(m[0])
				switch {
				case len(diff) == 0:
					out.verifiedf("「%s」与常量一致：%s", label, strings.Join(same, ", "))
				case len(same) == 0:
					out.conflictf("文档写「%s」，代码常量为 %s", label, strings.Join(diff, ", "))
				default:
					out.conflictf("「%s」只在部分平台成立：一致 %s；不一致 %s", label, strings.Join(same, ", "), strings.Join(diff, ", "))
				}
				continue
			}
			// No constant: a literal comparison on a field the claim names can verify (never refute).
			if q.kind != "limit" && q.kind != "min" {
				continue
			}
			for _, s := range k.G.Symbols {
				if containerKinds[s.Kind] {
					continue
				}
				body := strings.ToLower(k.symbolText(s))
				hit := false
				for _, w := range words {
					if len(w) >= 4 && strings.Contains(body, w) {
						hit = true
						break
					}
				}
				if !hit {
					continue
				}
				for _, cm := range reCompare.FindAllStringSubmatch(body, -1) {
					if cm[2] == strconv.Itoa(n) {
						out.anchors = append(out.anchors, s.ID)
						out.verifiedf("「%s」对应代码中的比较 `%s`（%s）", strings.TrimSpace(m[0]), cm[0], s.ID)
						break
					}
				}
			}
		}
	}
}

// ---------------------------------------------------------------- testIDs

var (
	reTidMention = regexp.MustCompile(`(?i)test ?id|testTag|accessibilityIdentifier`)
	reSnake      = regexp.MustCompile(`^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$`)
)

// missingTestID: the claim explicitly calls `x` a testID, the project has
// testID facts, and `x` appears nowhere in the code.
func (k *Checker) missingTestID(text, span string) bool {
	return len(k.F.TestIDs) > 0 && reTidMention.MatchString(text) && reSnake.MatchString(span) && k.tokenSearch(span) == ""
}

// ---------------------------------------------------------------- API parameters

var reParamMention = regexp.MustCompile(`(?i)参数|字段|\bparam(?:eter)?s?\b|\bquery\b`)
var reParamName = regexp.MustCompile(`^[a-z][A-Za-z0-9_]{1,30}$`)

// apiParamRules: "接口 GET /api/x 支持 `page` 与 `size` 参数" — every named
// parameter must appear at some call site of that API, or as a quoted key
// anywhere in the code. Otherwise the documented parameter does not exist.
func (k *Checker) apiParamRules(text string, out *ruleOut) {
	if !reParamMention.MatchString(text) || strings.Contains(text, "返回") || regexp.MustCompile(`(?i)\breturn`).MatchString(text) {
		return
	}
	var paths []string
	for _, m := range reAPIPath.FindAllStringSubmatch(text, -1) {
		paths = append(paths, normAPIPath(m[1]))
	}
	if len(paths) != 1 {
		return // ambiguous: which API do the parameters belong to?
	}
	var sites []*model.Symbol
	for _, a := range k.F.APIs {
		if normAPIPath(a.Path) == paths[0] {
			if s := k.G.Get(a.Symbol); s != nil {
				sites = append(sites, s)
			}
		}
	}
	if len(sites) == 0 {
		return
	}
	for _, m := range reCode.FindAllStringSubmatch(text, -1) {
		p := strings.TrimSpace(m[1])
		if !reParamName.MatchString(p) {
			continue
		}
		found := false
		re := regexp.MustCompile(`(^|[^A-Za-z0-9_$])` + regexp.QuoteMeta(p) + `([^A-Za-z0-9_$]|$)`)
		for _, s := range sites {
			if re.MatchString(k.symbolText(s)) {
				found = true
				break
			}
		}
		if !found && k.quotedKeyAnywhere(p) {
			found = true
		}
		if !found {
			plats := map[string]bool{}
			for _, s := range sites {
				plats[s.Platform] = true
				out.anchors = append(out.anchors, s.ID)
			}
			out.conflictf("接口 `%s` 的调用处（%s）没有参数 `%s`", paths[0], strings.Join(sortedKeys(plats), ", "), p)
		}
	}
}

func (k *Checker) quotedKeyAnywhere(p string) bool {
	needles := []string{"'" + p + "'", "'" + p + "=", "&" + p + "=", "?" + p + "="}
	for _, s := range k.G.Symbols {
		t := k.symbolText(s)
		for _, n := range needles {
			if strings.Contains(t, n) {
				return true
			}
		}
	}
	return false
}

// ---------------------------------------------------------------- shared constants

var (
	reSharedConst = regexp.MustCompile(`(?i)(三端|多端|跨端|跨平台|各端|各平台|all platforms|across platforms|cross-platform)[^。.;；]{0,10}(共享|共用|统一使用同一|shared?)[^。.;；]{0,10}(常量|constant)|(共享|shared)[^。.;；]{0,4}(常量|constant)`)
	reMaxWord     = regexp.MustCompile(`上限|最大|最多|(?i)\b(max|limit)`)
	reMinWord     = regexp.MustCompile(`下限|最小|最少|(?i)\bmin`)
	reTimeoutWord = regexp.MustCompile(`超时|(?i)time ?out`)
)

func constKey(name string) string {
	return strings.ToLower(strings.ReplaceAll(name, "_", ""))
}

// sharedConstRules: a claim that platforms share one constant, while each
// platform's code declares its own copy, is a conflict (nothing is shared;
// the values can drift independently).
func (k *Checker) sharedConstRules(text string, out *ruleOut) {
	if !reSharedConst.MatchString(text) {
		return
	}
	var nameRe *regexp.Regexp
	named := map[string]bool{}
	for _, m := range reCode.FindAllStringSubmatch(text, -1) {
		if span := strings.TrimSpace(m[1]); reIdentLike.MatchString(span) {
			named[constKey(span)] = true
		}
	}
	switch {
	case len(named) > 0:
	case reMaxWord.MatchString(text):
		nameRe = regexp.MustCompile(`(?i)max|limit`)
	case reMinWord.MatchString(text):
		nameRe = regexp.MustCompile(`(?i)min`)
	case reTimeoutWord.MatchString(text):
		nameRe = regexp.MustCompile(`(?i)time_?out`)
	default:
		return
	}
	groups := map[string][]*model.Symbol{}
	for _, s := range k.G.Symbols {
		if s.Value == "" {
			continue
		}
		key := constKey(s.Name)
		if (nameRe != nil && nameRe.MatchString(s.Name)) || named[key] {
			groups[key] = append(groups[key], s)
		}
	}
	keys := make([]string, 0, len(groups))
	for key := range groups {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		syms := groups[key]
		plats := map[string]bool{}
		var desc []string
		for _, s := range syms {
			plats[s.Platform] = true
			desc = append(desc, fmt.Sprintf("%s=%s（%s）", s.Name, s.Value, s.Platform))
			out.anchors = append(out.anchors, s.ID)
		}
		if len(plats) >= 2 {
			sort.Strings(desc)
			out.conflictf("文档说常量是共享的，但各平台分别定义：%s", strings.Join(desc, ", "))
		}
	}
}

// ---------------------------------------------------------------- behaviours

type behaviourConcept struct {
	name string
	doc  *regexp.Regexp // how documents talk about it
	code *regexp.Regexp // any trace of it in code (deliberately broad)
}

var behaviourConcepts = []behaviourConcept{
	{"短信 / 验证码", regexp.MustCompile(`(?i)\bSMS\b|短信|验证码|\bOTP\b|verification code`), regexp.MustCompile(`(?i)sms|otp|verif\w*code|captcha|验证码|短信`)},
	{"优惠券", regexp.MustCompile(`(?i)\bcoupons?\b|优惠券|折扣码|promo code`), regexp.MustCompile(`(?i)coupon|promo|voucher|discount|优惠`)},
	{"分享", regexp.MustCompile(`(?i)\bshare\b|分享`), regexp.MustCompile(`(?i)share|ACTION_SEND|UIActivityViewController|分享`)},
	{"生物识别", regexp.MustCompile(`(?i)biometric|face ?id|touch ?id|指纹|面容`), regexp.MustCompile(`(?i)biometric|LAContext|userAuth|fingerprint|faceid|touchid`)},
	{"扫码", regexp.MustCompile(`(?i)\bQR\b|二维码|扫码|barcode`), regexp.MustCompile(`(?i)qr|barcode|scan`)},
	{"推送通知", regexp.MustCompile(`(?i)push notifications?|推送通知|消息推送`), regexp.MustCompile(`(?i)notification|push`)},
	{"支付", regexp.MustCompile(`(?i)\bpayments?\b|支付`), regexp.MustCompile(`(?i)pay`)},
	{"第三方登录", regexp.MustCompile(`(?i)\boauth\b|微信登录|wechat login|sign in with apple|google sign-?in`), regexp.MustCompile(`(?i)oauth|wechat|ASAuthorization|GoogleSignIn`)},
}

// behaviourRules: the claim requires a well-known feature (SMS codes, coupons,
// sharing…) and there is no trace of it anywhere in the code — not in any
// symbol body, API path, testID or route. Negated claims are skipped.
func (k *Checker) behaviourRules(text string, out *ruleOut) {
	if reNegation.MatchString(text) {
		return
	}
	plain := reCode.ReplaceAllString(text, " ")
	for _, bc := range behaviourConcepts {
		if !bc.doc.MatchString(plain) {
			continue
		}
		if k.codeHas(bc.code) {
			continue
		}
		out.conflictf("文档要求「%s」相关行为，但代码中没有任何相关实现（符号、接口、testID、路由均未出现）", bc.name)
	}
}

func (k *Checker) codeHas(re *regexp.Regexp) bool {
	if k.codeHits == nil {
		k.codeHits = map[string]bool{}
	}
	if v, ok := k.codeHits[re.String()]; ok {
		return v
	}
	hit := false
	for _, a := range k.F.APIs {
		if re.MatchString(a.Path) {
			hit = true
		}
	}
	for _, t := range k.F.TestIDs {
		if hit {
			break
		}
		hit = re.MatchString(t.Tid)
	}
	for _, r := range k.F.Routes {
		if hit {
			break
		}
		hit = re.MatchString(r.RouteID) || re.MatchString(r.Pattern)
	}
	for _, s := range k.G.Symbols {
		if hit {
			break
		}
		hit = re.MatchString(s.Name) || re.MatchString(k.symbolText(s))
	}
	k.codeHits[re.String()] = hit
	return hit
}

// valueRules runs every rule; numericChecked suppresses the quantity rule when
// a named constant in the claim was already compared. The behaviour rule only
// applies to requirement-style claims (spec-kit / Kiro / EARS / MUST) in
// projects with UI facts: a passing mention of "OAuth" in an incident runbook is
// not a requirement that the app implements OAuth.
func (k *Checker) valueRules(c *Claim, numericChecked bool) ruleOut {
	text := c.Text
	var out ruleOut
	if !numericChecked {
		k.quantityRules(text, &out)
	}
	k.apiParamRules(text, &out)
	k.buildConfigRules(text, &out)
	k.sharedConstRules(text, &out)
	if c.Style != "statement" && len(k.F.Routes)+len(k.F.TestIDs) > 0 {
		k.behaviourRules(text, &out)
	}
	return out
}

// ---------------------------------------------------------------- build config

var (
	reBuildCfgLine = regexp.MustCompile(`^\s*"?([A-Za-z_][A-Za-z0-9_.]*)"?\s*(?:=|:)?\s*["']?(\d+)["']?\s*,?\s*(?://.*)?$`)
	buildCfgFile   = regexp.MustCompile(`(^|/)(build\.gradle(\.kts)?|[A-Za-z0-9_-]+\.json5|[A-Za-z0-9_-]+\.xcconfig)$`)
)

type cfgValue struct{ File, Value string }

// buildConfig collects `key = 123` / `"key": 123` lines from Gradle, json5
// and xcconfig files (compileSdk, minSdk, targetSdk, compatibleSdkVersion …):
// build settings are not symbols, so documents about them were unverifiable.
func (k *Checker) buildConfig() map[string][]cfgValue {
	if k.buildCfg != nil {
		return k.buildCfg
	}
	k.buildCfg = map[string][]cfgValue{}
	_ = filepath.WalkDir(k.Dir, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			switch d.Name() {
			case ".git", "node_modules", "oh_modules", "build", "wiki", ".kb-work", "Pods":
				return filepath.SkipDir
			}
			return nil
		}
		rel, _ := filepath.Rel(k.Dir, p)
		rel = filepath.ToSlash(rel)
		if !buildCfgFile.MatchString(rel) {
			return nil
		}
		b, err := os.ReadFile(p)
		if err != nil || len(b) > 1<<20 {
			return nil
		}
		// one-liners such as `defaultConfig { applicationId = "x"; minSdk = 26 }`
		for _, line := range strings.FieldsFunc(string(b), func(r rune) bool { return r == '\n' || r == ';' || r == '{' || r == '}' }) {
			if m := reBuildCfgLine.FindStringSubmatch(line); m != nil {
				k.buildCfg[m[1]] = append(k.buildCfg[m[1]], cfgValue{rel, m[2]})
			}
		}
		return nil
	})
	return k.buildCfg
}

// buildConfigRules: "`compileSdk` 为 34" is compared with the build files.
func (k *Checker) buildConfigRules(text string, out *ruleOut) {
	nums := reNumber.FindAllString(reCode.ReplaceAllString(text, " "), -1)
	if len(nums) == 0 {
		return
	}
	for _, m := range reCode.FindAllStringSubmatch(text, -1) {
		key := strings.TrimSpace(m[1])
		if !reIdentLike.MatchString(key) || len(k.findSymbols(key)) > 0 {
			continue
		}
		vals := k.buildConfig()[key]
		if len(vals) == 0 {
			continue
		}
		var same, desc []string
		for _, v := range vals {
			desc = append(desc, fmt.Sprintf("%s=%s（%s）", key, v.Value, v.File))
			if containsStr(nums, v.Value) {
				same = append(same, v.File)
			}
		}
		if len(same) > 0 {
			out.verifiedf("构建配置与文档一致：%s", strings.Join(desc, ", "))
		} else {
			out.conflictf("文档写 `%s` 为 %s，构建配置为 %s", key, strings.Join(nums, "/"), strings.Join(desc, ", "))
		}
	}
}

// ---------------------------------------------------------------- missing types

var reTypeSuffix = regexp.MustCompile(`(Builder|ViewModel|View|Screen|Page|Store|Manager|Service|Repository|Activity|Fragment|Controller|Ability|Client|Adapter|Presenter|Router|Provider|Handler|Helper)$`)

// missingProjectType: a backticked PascalCase name such as
// `ProductDetailPageBuilder` that appears nowhere in the code, while the
// project names its own types with the same suffix (ProductDetailBuilder).
// Framework names without a project-style suffix (SharedPreferences) and
// built-ins are left alone.
func (k *Checker) missingProjectType(text, span string) bool {
	if strings.Contains(text, "/"+span+")") || strings.Contains(text, "/"+span+"/") || strings.Contains(text, "("+span+")") {
		return false // the name is a link target (README index of samples / modules), not a code claim
	}
	if strings.ContainsAny(span, ".()") || !isPascal(span) || builtinTypes[span] {
		return false
	}
	humps := 0
	for _, r := range span {
		if r >= 'A' && r <= 'Z' {
			humps++
		}
	}
	suf := reTypeSuffix.FindString(span)
	if humps < 2 || suf == "" || suf == span {
		return false
	}
	if k.pathParts()[span] {
		return false // a module / sample / directory name (README indexes link to them)
	}
	for _, s := range k.G.Symbols {
		if s.Name != span && strings.HasSuffix(s.Name, suf) && isPascal(s.Name) {
			return k.tokenSearch(span) == "" && len(k.findSymbols(span)) == 0
		}
	}
	return false
}

// pathParts is the set of directory and file-stem names of scanned files.
func (k *Checker) pathParts() map[string]bool {
	if k.parts != nil {
		return k.parts
	}
	k.parts = map[string]bool{}
	add := func(f string) {
		for _, p := range strings.Split(f, "/") {
			k.parts[strings.TrimSuffix(p, path.Ext(p))] = true
		}
	}
	for f := range k.G.Files {
		add(f)
	}
	for _, s := range k.G.Symbols {
		add(s.File)
	}
	return k.parts
}
