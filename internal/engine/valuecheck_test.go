package engine

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/luckylucky0001/codewiki/internal/model"
	"github.com/luckylucky0001/codewiki/internal/testutil"
)

// Claims written for the rules, not taken from the minishop docs or the eval
// golden set. Each rule has positive cases and "must stay quiet" cases.
func TestValueRulesOnMinishop(t *testing.T) {
	cfg := testutil.MinishopConfig(testutil.Minishop())
	g, f := scanDir(t, cfg, cfg.Root)
	ck := &Checker{G: g, F: f, Dir: cfg.Root}
	cases := []struct {
		style, text, want string
	}{
		// quantities without a named constant
		{"must", "购物车最多 99 件商品，必须在加入时校验。", ClaimVerified},
		{"must", "购物车最多 20 件商品，必须在加入时校验。", ClaimConflict},
		{"ears", "WHEN the cart holds at most 5 items THE SYSTEM SHALL disable add.", ClaimConflict},
		{"ears", "WHEN the password is fewer than 6 characters THE SYSTEM SHALL keep the submit disabled.", ClaimVerified},
		// explicit testIDs
		{"statement", "收藏按钮 testID 为 `favorite_button`。", ClaimConflict},
		{"statement", "商品列表 testID 为 `product_list`。", ClaimVerified},
		{"statement", "旧版本使用 `favorite_button` 组件。", ClaimUnverifiable}, // not called a testID
		// API parameters
		{"statement", "商品列表接口 `GET /api/products` 支持 `cursor` 参数。", ClaimConflict},
		{"statement", "下单接口 `POST /api/orders` 返回 `orderId` 字段。", ClaimVerified}, // response field, not a parameter
		// shared constants
		{"statement", "各平台共享同一个上限常量。", ClaimConflict},
		{"statement", "上限常量由各平台分别定义。", ClaimUnverifiable},
		// behaviours
		{"ears", "WHEN checkout starts THE SYSTEM SHALL let the user apply a coupon.", ClaimConflict},
		{"must", "The login page MUST NOT offer SMS codes.", ClaimUnverifiable}, // negated
		{"statement", "运维手册：泄露时撤销所有 OAuth token。", ClaimUnverifiable},           // statement, not a requirement
	}
	for _, tc := range cases {
		c := Claim{ID: "T", Text: tc.text, Style: tc.style}
		ck.Check(&c)
		if c.Status != tc.want {
			t.Errorf("%q: got %s want %s (%v)", tc.text, c.Status, tc.want, c.Evidence)
		}
	}
}

func TestTimeoutAndRetryConstants(t *testing.T) {
	dir := t.TempDir()
	src := "object Net {\n  const val REQUEST_TIMEOUT_MS = 30000\n  const val MAX_RETRIES = 3\n}\n"
	if err := os.WriteFile(filepath.Join(dir, "Net.kt"), []byte(src), 0o644); err != nil {
		t.Fatal(err)
	}
	g := &model.Graph{Symbols: []*model.Symbol{
		{ID: "android://Net.kt#Net.REQUEST_TIMEOUT_MS", Platform: "android", File: "Net.kt", Kind: "const", Name: "REQUEST_TIMEOUT_MS", Qual: "Net.REQUEST_TIMEOUT_MS", Value: "30000", StartLine: 2, EndLine: 2},
		{ID: "android://Net.kt#Net.MAX_RETRIES", Platform: "android", File: "Net.kt", Kind: "const", Name: "MAX_RETRIES", Qual: "Net.MAX_RETRIES", Value: "3", StartLine: 3, EndLine: 3},
	}}
	ck := &Checker{G: g, F: &model.Facts{}, Dir: dir}
	for text, want := range map[string]string{
		"网络请求超时 30 秒，必须提示重试。":                    ClaimVerified,
		"Requests MUST time out after 30000 ms.": ClaimVerified,
		"网络请求超时 10 秒，必须提示用户。":                    ClaimConflict,
		"失败后必须重试 3 次。":                           ClaimVerified,
		"失败后必须重试 5 次。":                           ClaimConflict,
	} {
		c := Claim{ID: "T", Text: text, Style: "must"}
		ck.Check(&c)
		if c.Status != want {
			t.Errorf("%q: got %s want %s (%v)", text, c.Status, want, c.Evidence)
		}
		if want == ClaimConflict && !strings.Contains(strings.Join(c.Evidence, " "), "代码常量") {
			t.Errorf("%q: evidence should cite the constant: %v", text, c.Evidence)
		}
	}
}
