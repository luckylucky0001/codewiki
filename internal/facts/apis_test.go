package facts_test

import (
	"sort"
	"strings"
	"testing"

	"github.com/luckylucky0001/codewiki/internal/config"
	"github.com/luckylucky0001/codewiki/internal/model"
)

func apiSet(f *model.Facts) string {
	var out []string
	for _, a := range f.APIs {
		out = append(out, a.Method+" "+a.Path)
	}
	sort.Strings(out)
	return strings.Join(out, ", ")
}

func TestAndroidNetworkingAdapters(t *testing.T) {
	dir := writeTree(t, map[string]string{
		"net/Api.kt": `package app.net

const val BASE_URL = "https://api.example.com"

interface NiaNetworkApi {
    @GET(value = "topics")
    suspend fun getTopics(): List<String>
}

class KtorRepo(private val client: HttpClient) {
    suspend fun profile(id: String) = client.get("/api/users/$id")
    suspend fun login() = client.post("$BASE_URL/api/login") { setBody("x") }
}

class OkRepo(private val ok: OkHttpClient) {
    fun orders() {
        val req = Request.Builder().url("$BASE_URL/api/orders").post(body).build()
        ok.newCall(req).execute()
    }
    fun health() = Request.Builder().url("https://api.example.com/health").build()
}
`,
	})
	got := apiSet(extractTree(t, dir, config.Platform{Name: "android", Root: "."}))
	want := "GET /api/users/{id}, GET /health, GET /topics, POST /api/login, POST /api/orders"
	if got != want {
		t.Fatalf("android apis:\n got %s\nwant %s", got, want)
	}
}

func TestIOSNetworkingAdapters(t *testing.T) {
	dir := writeTree(t, map[string]string{
		"Net.swift": `import Alamofire
import Moya

func loadFeed() {
  AF.request("https://api.example.com/api/feed", method: .get).responseJSON { _ in }
  AF.request("https://api.example.com/api/like", method: .post).response { _ in }
}

enum ShopAPI {
  case login(user: String)
  case product(id: String)
  case orders
}

extension ShopAPI: TargetType {
  var baseURL: URL { URL(string: "https://api.example.com")! }
  var path: String {
    switch self {
    case .login: return "/api/login"
    case .product(let id): return "/api/products/\(id)"
    case .orders: return "/api/orders"
    }
  }
  var method: Moya.Method {
    switch self {
    case .login, .orders: return .post
    default: return .get
    }
  }
}
`,
	})
	got := apiSet(extractTree(t, dir, config.Platform{Name: "ios", Root: "."}))
	want := "GET /api/feed, GET /api/products/{id}, POST /api/like, POST /api/login, POST /api/orders"
	if got != want {
		t.Fatalf("ios apis:\n got %s\nwant %s", got, want)
	}
}

func TestHarmonyNetworkingAdapters(t *testing.T) {
	dir := writeTree(t, map[string]string{
		"entry/src/main/ets/net/Net.ets": `import axios from '@ohos/axios';
import { rcp } from '@kit.RemoteCommunicationKit';
import { http } from '@kit.NetworkKit';

const BASE: string = 'https://api.example.com';

export async function feed(): Promise<void> {
  await axios.get<string>(BASE + '/api/feed');
  await axios.post('/api/like', { id: 1 });
  axios<string>({ url: '/api/report', method: 'post' });
}

export async function viaRcp(): Promise<void> {
  const session = rcp.createSession();
  await session.get(BASE + '/api/profile');
  await session.fetch(new rcp.Request(BASE + '/api/upload', 'PUT'));
}

export function viaHttp(): void {
  let httpRequest = http.createHttp();
  httpRequest.request(BASE + '/api/news', { method: http.RequestMethod.GET });
}
`,
	})
	got := apiSet(extractTree(t, dir, config.Platform{Name: "harmony", Root: "."}))
	want := "GET /api/feed, GET /api/news, GET /api/profile, POST /api/like, POST /api/report, PUT /api/upload"
	if got != want {
		t.Fatalf("harmony apis:\n got %s\nwant %s", got, want)
	}
}

func TestSwiftEndpointEnumImplicitReturn(t *testing.T) {
	dir := writeTree(t, map[string]string{
		"Statuses.swift": `public enum Statuses: Endpoint {
  case status(id: String)
  case favorite(id: String)

  public func path() -> String {
    switch self {
    case .status(let id):
      "statuses/\(id)"
    case .favorite(let id):
      "statuses/\(id)/favourite"
    }
  }
}
`,
		"Client.swift": `func fav(client: MastodonClient, id: String) async throws {
  try await client.post(endpoint: Statuses.favorite(id: id))
}
`,
	})
	got := apiSet(extractTree(t, dir, config.Platform{Name: "ios", Root: "."}))
	if got != "GET /statuses/{id}, POST /statuses/{id}/favourite" {
		t.Fatalf("endpoint enum: %s", got)
	}
}
