package extract

import (
	"strings"
	"testing"

	"github.com/luckylucky0001/codewiki/internal/model"
)

func parse(t *testing.T, lang, path, src string) FileResult {
	t.Helper()
	ps := NewParsers()
	defer ps.Close()
	r := ParseFile(ps, lang, "p", path, "root/"+path, []byte(src))
	return r
}

func byQual(r FileResult) map[string]*model.Symbol {
	m := map[string]*model.Symbol{}
	for _, s := range r.Symbols {
		m[s.Qual] = s
	}
	return m
}

func TestKotlinSymbols(t *testing.T) {
	src := `package a
/** doc */
class CartViewModel : ViewModel() {
    fun addItem(sku: String): Boolean {
        if (items.size >= MAX_CART_ITEMS) return false
        return true
    }
    companion object {
        const val MAX_CART_ITEMS = 99
    }
}
interface Api {
    @GET("/api/products")
    suspend fun list(): List<String>
}
object Routes {
    const val CART = "cart"
}
`
	r := parse(t, "kotlin", "Cart.kt", src)
	if r.Failure != nil {
		t.Fatalf("unexpected failure: %+v", r.Failure)
	}
	m := byQual(r)
	for _, q := range []string{"CartViewModel", "CartViewModel.addItem", "CartViewModel.MAX_CART_ITEMS", "Api", "Api.list", "Routes", "Routes.CART"} {
		if m[q] == nil {
			t.Fatalf("missing symbol %s; got %v", q, keys(m))
		}
	}
	if m["Api"].Kind != "interface" || m["Routes"].Kind != "object" {
		t.Errorf("kinds: Api=%s Routes=%s", m["Api"].Kind, m["Routes"].Kind)
	}
	if m["CartViewModel.MAX_CART_ITEMS"].Value != "99" || m["Routes.CART"].Value != "cart" {
		t.Errorf("values: %q %q", m["CartViewModel.MAX_CART_ITEMS"].Value, m["Routes.CART"].Value)
	}
	if id := m["CartViewModel.addItem"].ID; id != "p://Cart.kt#CartViewModel.addItem" {
		t.Errorf("id = %s", id)
	}
	if !contains(m["CartViewModel.addItem"].RefNames, "MAX_CART_ITEMS") {
		t.Errorf("refs = %v", m["CartViewModel.addItem"].RefNames)
	}
	// annotation call site for Retrofit
	found := false
	for _, c := range r.Calls {
		if c.Callee == "@GET" && len(c.Args) == 1 && c.Args[0].Parts[0].Lit == "/api/products" && strings.HasSuffix(c.Enclosing, "#Api.list") {
			found = true
		}
	}
	if !found {
		t.Errorf("Retrofit @GET call site not found: %+v", r.Calls)
	}
}

func TestJavaSymbols(t *testing.T) {
	src := `package a;
public final class TokenStore {
    private String token;
    public void save(String token) { this.token = token; }
}`
	m := byQual(parse(t, "java", "TokenStore.java", src))
	if m["TokenStore"] == nil || m["TokenStore.save"] == nil || m["TokenStore.token"] == nil {
		t.Fatalf("java symbols: %v", keys(m))
	}
	if m["TokenStore.save"].Kind != "method" {
		t.Errorf("kind %s", m["TokenStore.save"].Kind)
	}
}

func TestSwiftSymbols(t *testing.T) {
	src := `import SwiftUI
enum Route: String { case productDetail = "product/{id}" }
struct CartView: View {
    var body: some View {
        Text("x").accessibilityIdentifier("item_\(id)")
    }
}
final class VM { static let maxCartItems = 99
  func addItem(sku: String) -> Bool { return true } }
`
	r := parse(t, "swift", "A.swift", src)
	m := byQual(r)
	if m["Route"] == nil || m["Route"].Kind != "enum" || m["Route.productDetail"].Value != "product/{id}" {
		t.Fatalf("enum: %v", keys(m))
	}
	if m["CartView"].Kind != "struct" || m["CartView.body"] == nil || m["VM.maxCartItems"].Value != "99" || m["VM.addItem"] == nil {
		t.Fatalf("swift symbols: %v", keys(m))
	}
	var tid *Call
	for i, c := range r.Calls {
		if c.Callee == "accessibilityIdentifier" {
			tid = &r.Calls[i]
		}
	}
	if tid == nil || tid.Args[0].Parts[0].Lit != "item_" || tid.Args[0].Parts[1].Param != "id" {
		t.Fatalf("accessibilityIdentifier call: %+v", tid)
	}
}

func TestArkTSSymbols(t *testing.T) {
	src := `import { Api } from './Api';
export const MAX_CART_ITEMS: number = 99;
@Builder
export function CartBuilder() {
  CartPage()
}
@Component
export struct CartPage {
  @State n: number = 0;
  build() {
    Column() {
      Button('Checkout').id('cart_checkout')
      ListItem() { Text('x') }.id(` + "`item_${p.id}`" + `)
    }
  }
}`
	r := parse(t, "arkts", "CartPage.ets", src)
	m := byQual(r)
	if m["MAX_CART_ITEMS"].Value != "99" || m["CartBuilder"].Kind != "function" || m["CartPage"].Kind != "component" || m["CartPage.build"] == nil || m["CartPage.n"] == nil {
		t.Fatalf("arkts symbols: %v", keys(m))
	}
	if !strings.Contains(m["CartBuilder"].Signature, "@Builder") {
		t.Errorf("decorator not part of signature: %q", m["CartBuilder"].Signature)
	}
	ids := map[string]bool{}
	for _, c := range r.Calls {
		if c.Callee == "id" && len(c.Args) > 0 && len(c.Args[0].Parts) > 0 {
			ids[c.Args[0].Parts[0].Lit] = true
		}
	}
	if !ids["cart_checkout"] || !ids["item_"] {
		t.Fatalf("ArkUI .id() calls: %v", ids)
	}
}

func TestJavaScriptSymbols(t *testing.T) {
	src := `const defaults = { adapter: ['xhr', 'http', 'fetch'] };
export function getAdapter(adapters) { return adapters; }
class Axios { request(config) { return dispatchRequest(config); } }`
	m := byQual(parse(t, "javascript", "lib/a.js", src))
	if m["defaults"] == nil || m["getAdapter"] == nil || m["Axios.request"] == nil {
		t.Fatalf("js symbols: %v", keys(m))
	}
}

func TestHashIgnoresCommentsAndWhitespace(t *testing.T) {
	a := `class A {
    fun f(x: Int): Int {
        return x + 1
    }
}`
	b := `class A {
    /** a new doc comment */
    fun f(x: Int): Int {
        // explain
        return   x +
            1   // trailing
    }
}`
	c := `class A {
    fun f(x: Int): Int {
        return x + 2
    }
}`
	d := `class A {
    fun f(x: Long): Int {
        return x + 1
    }
}`
	ha, hb, hc, hd := byQual(parse(t, "kotlin", "A.kt", a)), byQual(parse(t, "kotlin", "A.kt", b)), byQual(parse(t, "kotlin", "A.kt", c)), byQual(parse(t, "kotlin", "A.kt", d))
	if ha["A.f"].Hash != hb["A.f"].Hash || ha["A"].Hash != hb["A"].Hash {
		t.Fatalf("comment/whitespace-only change altered hash")
	}
	if ha["A.f"].Hash == hc["A.f"].Hash {
		t.Fatalf("body change not detected")
	}
	if ha["A.f"].SigHash != hc["A.f"].SigHash {
		t.Fatalf("body-only change altered sig_hash")
	}
	if ha["A"].Hash != hc["A"].Hash {
		t.Fatalf("member body change must not change container hash")
	}
	if ha["A.f"].SigHash == hd["A.f"].SigHash || ha["A"].Hash == hd["A"].Hash {
		t.Fatalf("signature change not detected")
	}
}

func TestSwiftAndArkTSCommentOnly(t *testing.T) {
	for _, tc := range []struct{ lang, a, b string }{
		{"swift", "func f() -> Int { return 1 }", "/// doc\nfunc f() -> Int {\n  // c\n  return 1\n}"},
		{"arkts", "function f(): number { return 1; }", "/* doc */\nfunction f(): number {\n  // c\n  return 1;\n}"},
		{"java", "class A { int f() { return 1; } }", "class A {\n /** d */ int f() { /* c */ return 1; } }"},
	} {
		ha, hb := byQual(parse(t, tc.lang, "x", tc.a)), byQual(parse(t, tc.lang, "x", tc.b))
		for q, s := range ha {
			if hb[q] == nil || hb[q].Hash != s.Hash {
				t.Errorf("%s: %s hash changed on comment-only edit", tc.lang, q)
			}
		}
	}
}

func TestParseFailureRecorded(t *testing.T) {
	r := parse(t, "kotlin", "Bad.kt", "class A { fun f( { ")
	if r.Failure == nil {
		t.Fatalf("expected parse failure")
	}
	r = parse(t, "cobol", "x.cbl", "x")
	if r.Failure == nil || !strings.Contains(r.Failure.Error, "unsupported") {
		t.Fatalf("expected unsupported failure: %+v", r.Failure)
	}
}

func TestSimilarity(t *testing.T) {
	if Similarity("ffffffffffffffff", "ffffffffffffffff") != 1 {
		t.Fatal("identical simhash must be 1")
	}
	if Similarity("0000000000000000", "ffffffffffffffff") != 0 {
		t.Fatal("opposite simhash must be 0")
	}
}

func TestLangForPath(t *testing.T) {
	cases := map[string]string{"a.kt": "kotlin", "a.java": "java", "a.swift": "swift", "a.ets": "arkts", "a.js": "javascript", "a.ts": "typescript", "build.gradle.kts": "", "a.md": ""}
	for p, want := range cases {
		if got := LangForPath(p); got != want {
			t.Errorf("%s: %s != %s", p, got, want)
		}
	}
}

func keys(m map[string]*model.Symbol) []string {
	var out []string
	for k := range m {
		out = append(out, k)
	}
	return out
}

func contains(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
}

// tree-sitter-kotlin rejects a class body closed on the line of its last
// member (`object Routes { const val HOME = "home" }`); kb rewrites the space
// before that brace to ';' (offsets and lines unchanged). Seen in
// compose-samples, kotlinconf-app, element-x.
func TestKotlinOneLineClassBody(t *testing.T) {
	src := "package a\n\nobject Routes { const val HOME = \"home\" }\n\ndata class P(val a: Int) { override fun toString() = \"p\" }\n\nclass Empty { }\n\nfun f() { if (x) { g() } }\n"
	r := parse(t, "kotlin", "A.kt", src)
	if r.Failure != nil {
		t.Fatalf("parse failure: %+v", r.Failure)
	}
	m := byQual(r)
	if m["Routes.HOME"] == nil || m["Routes.HOME"].Value != "home" || m["P.toString"] == nil || m["f"] == nil {
		t.Fatalf("symbols: %v", keys(m))
	}
	if m["f"].StartLine != 9 {
		t.Fatalf("line numbers must not move: f at %d", m["f"].StartLine)
	}
	if string(kotlinOneLineBodies([]byte("val s = \"{ x }\"\n"))) != "val s = \"{ x }\"\n" {
		t.Fatal("only type declarations are rewritten")
	}
}
