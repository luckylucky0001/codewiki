// Generic recognisers added for held-out generalisation (bench/accuracy/GENERALIZATION.md), checked on
// small synthetic repos written here (no benchmark labels or clones involved).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { detectedConfig } from '../../src/config/config.js';
import { scan } from '../../src/scan/scan.js';
import { extractFacts } from '../../src/facts/facts.js';
import { concatPaths, decomposeConfigNames, decomposeMapping, objcAPIs, objcInterfaces, objcTestIDs, paramNames, objectConsts, bindingName } from '../../src/facts/general.js';

const tmps: string[] = [];
afterAll(() => {
  for (const t of tmps) fs.rmSync(t, { recursive: true, force: true });
});

async function factsOf(files: Record<string, string>) {
  return (await factsAndGraph(files)).facts;
}

async function factsAndGraph(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-gen-'));
  tmps.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  const cfg = detectedConfig(dir);
  const res = await scan(cfg, cfg.root, {});
  return { facts: extractFacts(cfg, res), graph: res.graph };
}

describe('Decompose navigation', () => {
  it('helpers: config names and component mapping', () => {
    const host = `class RootComponent(ctx: ComponentContext) {
  private val navigation = StackNavigation<Config>()
  val stack: Value<ChildStack<*, Child>> = childStack(source = navigation, serializer = Config.serializer(), initialConfiguration = Config.List, childFactory = ::createChild)
  private fun createChild(config: Config, ctx: ComponentContext): Child = when (config) {
    is Config.List -> Child.List(DefaultListComponent(ctx))
    is Config.Details -> Child.Details(
      DefaultDetailsComponent(ctx, config.id)
    )
  }
}`;
    expect(decomposeConfigNames(host)).toEqual(['Config']);
    expect(decomposeMapping(host, 'Config', 'List')).toBe('DefaultListComponent');
    expect(decomposeMapping(host, 'Config', 'Details')).toBe('DefaultDetailsComponent');
  });
  it('emits one route per sealed config subclass', async () => {
    const f = await factsOf({
      'android/app/src/main/kotlin/a/Root.kt': `package a
import com.arkivanov.decompose.router.stack.*
class RootComponent(ctx: ComponentContext) : ComponentContext by ctx {
  private val navigation = StackNavigation<Config>()
  val stack = childStack(source = navigation, serializer = Config.serializer(), initialConfiguration = Config.List, childFactory = ::createChild)
  private fun createChild(config: Config, ctx: ComponentContext): Child = when (config) {
    is Config.List -> Child.List(DefaultListComponent(ctx))
    is Config.Details -> Child.Details(DefaultDetailsComponent(ctx, config.id))
  }
  @Serializable
  private sealed interface Config {
    @Serializable data object List : Config
    @Serializable data class Details(val id: Long) : Config
  }
}
class DefaultListComponent(ctx: ComponentContext)
class DefaultDetailsComponent(ctx: ComponentContext, id: Long)
`,
    });
    const ids = f.routes!.map((r) => r.route_id).sort();
    expect(ids).toEqual(['Details', 'List']);
    expect(f.routes!.find((r) => r.route_id === 'Details')!.symbol).toMatch(/#DefaultDetailsComponent$/);
  });
});

describe('Objective-C', () => {
  it('helpers', () => {
    expect(objcInterfaces('@interface FooViewController : UITableViewController <UITableViewDelegate>\n@interface Foo ()\n')).toEqual([{ name: 'FooViewController', sup: 'UITableViewController', line: 1 }]);
    expect(objcTestIDs('self.button.accessibilityIdentifier = @"login_button";\n[cell setAccessibilityIdentifier:@"row"];').map((t) => t.tid)).toEqual(['login_button', 'row']);
    const m = `- (void)load:(NSString *)uid {
  NSString *s = [NSString stringWithFormat:@"https://api.example.com/v1/users/%@", uid];
  NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:s]];
  req.HTTPMethod = @"POST";
  [[[NSURLSession sharedSession] dataTaskWithRequest:req] resume];
}
- (void)help {
  [self open:@"https://example.com/help/page"];
}`;
    expect(objcAPIs(m)).toEqual([{ method: 'POST', path: '/v1/users/{param}', line: 2 }]);
  });
  it('screens with UIKit exclusions, testIDs and APIs', async () => {
    const f = await factsOf({
      'ios/App/Info.plist': '<plist><dict><key>UILaunchStoryboardName</key><string>Launch</string></dict></plist>',
      'ios/App/Main.swift': 'import UIKit\nfinal class HomeViewController: UIViewController {}\n',
      'ios/App/SettingsViewController.h': '#import <UIKit/UIKit.h>\n@interface SettingsViewController : UITableViewController\n@end\n',
      'ios/App/SettingsViewController.m': '@implementation SettingsViewController\n- (void)viewDidLoad {\n  self.tableView.accessibilityIdentifier = @"settings_table";\n}\n@end\n',
      'ios/App/BaseViewController.h': '@interface BaseViewController : UIViewController\n@end\n',
      'ios/App/PhotoCellController.h': '@interface PhotoCellController : UIViewController\n@end\n',
      'ios/Pods/X/XViewController.h': '@interface XViewController : UIViewController\n@end\n',
    });
    const ios = f.routes!.filter((r) => r.platform === 'ios').map((r) => r.route_id).sort();
    expect(ios).toContain('settings');
    expect(ios).not.toContain('base');
    expect(ios).not.toContain('photo_cell');
    expect(ios).not.toContain('x');
    expect(f.testids!.map((t) => t.tid)).toContain('settings_table');
    // file-only anchor: no dangling symbol id (kb verify E_SYMBOL_UNKNOWN), class name kept as `name`
    const st = f.routes!.find((r) => r.route_id === 'settings') as { symbol: string; name?: string; file: string };
    expect(st.symbol).toBe('');
    expect(st.name).toBe('SettingsViewController');
    expect(st.file).toBe('ios/App/SettingsViewController.h');
  });
});

describe('Swift String-enum testIDs', () => {
  it('resolves explicit and implicit raw values', async () => {
    const f = await factsOf({
      'ios/App/Ids.swift': `enum LoginID: String {
  case email = "login_email"
  case password
}
`,
      'ios/App/LoginView.swift': `import SwiftUI
struct LoginView: View {
  var body: some View {
    VStack {
      TextField("e", text: $e).accessibilityIdentifier(LoginID.email.rawValue)
      SecureField("p", text: $p).testID(.password)
    }
  }
}
final class LoginVC: UIViewController {
  func setup() { field.accessibilityIdentifier = LoginID.password.rawValue }
}
`,
    });
    const tids = f.testids!.map((t) => t.tid);
    expect(tids).toContain('login_email');
    expect(tids).toContain('password');
  });
});

describe('ViewBinding ids in tests', () => {
  it('binding.fooBar in a test ↔ @+id/foo_bar', async () => {
    expect(bindingName('foo_bar_baz')).toBe('fooBarBaz');
    const f = await factsOf({
      'android/app/src/main/res/layout/activity_main.xml': '<LinearLayout>\n  <Button android:id="@+id/submit_button"/>\n  <TextView android:id="@+id/unused_label"/>\n</LinearLayout>\n',
      'android/app/src/main/java/a/Main.kt': 'class MainActivity : AppCompatActivity() {}\n',
      'android/app/src/androidTest/java/a/MainTest.kt': 'class MainTest {\n  fun t() {\n    val binding = ActivityMainBinding.inflate(inflater)\n    binding.submitButton.performClick()\n  }\n}\n',
    });
    const tids = f.testids!.map((t) => t.tid);
    expect(tids).toContain('submit_button');
    expect(tids).not.toContain('unused_label');
  });
});

describe('HTTP: concatenation and ArkTS wrappers', () => {
  it('concatenated paths', () => {
    expect(concatPaths('val u = baseUrl + "api/v1/items"')).toEqual(['api/v1/items']);
    expect(concatPaths('client.get("$BASE_URL/users/$id")')).toEqual(['/users/{id}']);
    expect(concatPaths('let u = URL(string: "\\(baseURL)/login")')).toEqual(['/login']);
    expect(concatPaths('label = name + "/x"')).toEqual([]);
  });
  it('kotlin / swift concatenation with the call method', async () => {
    const f = await factsOf({
      'android/app/src/main/java/a/Api.kt': `class Api(private val client: OkHttpClient) {
  fun login(body: RequestBody) {
    val req = Request.Builder().url(Config.baseUrl + "api/v1/login").post(body).build()
    client.newCall(req).execute()
  }
}
`,
      'ios/App/Net.swift': `import Foundation
final class Net {
  func upload() {
    var request = URLRequest(url: URL(string: baseURL + "/files")!)
    request.httpMethod = "PUT"
    URLSession.shared.dataTask(with: request).resume()
  }
}
`,
    });
    const apis = f.apis!.map((a) => a.method + ' ' + a.path);
    expect(apis).toContain('POST /api/v1/login');
    expect(apis).toContain('PUT /files');
  });
  it('helpers: params and object tables', () => {
    expect(paramNames('static post<T>(url: string, data?: Record<string, Object>): Promise<T>')).toEqual(['url', 'data']);
    expect([...objectConsts('API', "const API = {\n  LOGIN: '/user/login',\n  LIST: `/list`,\n}")]).toEqual([['API.LOGIN', '/user/login'], ['API.LIST', '/list']]);
  });
  it('ArkTS wrappers followed to call sites; unresolved arguments skipped', async () => {
    const f = await factsOf({
      'harmony/entry/src/main/module.json5': '{ module: { name: "entry", type: "entry", abilities: [] } }',
      'harmony/entry/src/main/ets/net/Http.ets': `import http from '@ohos.net.http';
const BASE_URL = 'https://api.example.com/app';
export const API = {
  LOGIN: '/user/login',
  LIST: '/goods/list',
}
function request<T>(url: string, method: http.RequestMethod, data?: Object): Promise<T> {
  const req = http.createHttp();
  return req.request(BASE_URL + url, { method: method, extraData: data });
}
export function get<T>(url: string): Promise<T> {
  return request(url, http.RequestMethod.GET);
}
export function post<T>(url: string, data: Object): Promise<T> {
  return request(url, http.RequestMethod.POST, data);
}
`,
      'harmony/entry/src/main/ets/pages/Index.ets': `import { get, post, API } from '../net/Http';
@Entry
@Component
struct Index {
  aboutToAppear() {
    post(API.LOGIN, {});
    get(API.LIST);
    get('/static/banner');
    get(this.dynamicUrl);
    AppStorage.get('token');
  }
  build() {}
}
`,
    });
    const apis = f.apis!.map((a) => a.method + ' ' + a.path).sort();
    expect(apis).toContain('POST /app/user/login');
    expect(apis).toContain('GET /app/goods/list');
    expect(apis).toContain('GET /app/static/banner');
    expect(apis.some((a) => a.includes('{url}') || a.includes('dynamicUrl') || a.includes('token'))).toBe(false);
  });
});

describe('precision', () => {
  it('nav-graph placeholder destinations without class or layout are dropped', async () => {
    const f = await factsOf({
      'android/app/src/main/res/navigation/nav.xml': `<navigation xmlns:android="x" xmlns:app="y" xmlns:tools="z" android:id="@+id/nav">
  <fragment android:id="@+id/homeFragment" android:name="a.HomeFragment"/>
  <fragment android:id="@+id/placeholder"/>
  <fragment android:id="@+id/emptyDestination"/>
</navigation>`,
      'android/app/src/main/java/a/HomeFragment.kt': 'class HomeFragment : Fragment()\n',
    });
    const ids = f.routes!.map((r) => r.route_id);
    expect(ids).toContain('home_fragment');
    expect(ids).not.toContain('placeholder');
    expect(ids).not.toContain('empty_destination');
  });
  it('a scheme declared by one app is not derived for screens of another app', async () => {
    const f = await factsOf({
      'harmony/appA/src/main/module.json5': '{ module: { name: "a", type: "entry", abilities: [{ name: "A", skills: [{ uris: [{ scheme: "appa" }] }] }] } }',
      'harmony/appB/src/main/module.json5': '{ module: { name: "b", type: "entry", abilities: [] } }',
      'harmony/appA/src/main/ets/pages/Home.ets': "@Entry\n@Component\nstruct Home {\n  build() { Button('x').onClick(() => { this.pathStack.pushPathByName('Detail', null) }) }\n}\n",
      'harmony/appB/src/main/ets/pages/Other.ets': "@Component\nstruct Other {\n  build() { Button('x').onClick(() => { this.pathStack.pushPathByName('OtherDetail', null) }) }\n}\n",
    });
    const byId = new Map(f.routes!.map((r) => [r.route_id, r]));
    expect(byId.get('OtherDetail')?.deeplink ?? '').toBe('');
    expect(byId.get('Detail')?.deeplink).toBe('appa://Detail');
  });
  it('ArkTS …NavDestination wrapper components are not pages', async () => {
    const f = await factsOf({
      'harmony/entry/src/main/ets/common/AppNavDestination.ets': '@Component\nexport struct AppNavDestination {\n  @BuilderParam content: () => void\n  build() { NavDestination() { this.content() } }\n}\n',
      'harmony/entry/src/main/ets/pages/Detail.ets': '@Component\nexport struct DetailPage {\n  build() { AppNavDestination() { Text("x") } }\n}\n',
    });
    const ids = f.routes!.map((r) => r.route_id);
    expect(ids).toContain('DetailPage');
    expect(ids).not.toContain('AppNavDestination');
  });
});

describe('round 2: more call shapes', () => {
  it('testIDs: SwiftUI .accessibility(identifier:), ArkTS .key(), interpolated UIKit ids by prefix', async () => {
    const f = await factsOf({
      'ios/App/V.swift': `import SwiftUI
struct V: View {
  var body: some View { Text("x").accessibility(identifier: "legacy_id") }
}
final class C: UIViewController {
  func cell(i: Int) { label.accessibilityIdentifier = "row_\\(i)"; other.accessibilityIdentifier = "\\(name)" }
}
`,
      'harmony/entry/src/main/ets/pages/P.ets': "@Entry\n@Component\nstruct P {\n  build() { Column() { Button('ok').key('ok_button') } }\n}\n",
    });
    const tids = f.testids!.map((t) => t.tid);
    expect(tids).toContain('legacy_id');
    expect(tids).toContain('ok_button');
    expect(tids).toContain('row_');
    expect(tids).not.toContain('');
  });
  it('APIs: unresolved base stripped, Retrofit @HTTP, Volley, appending(path:), path+method endpoint types', async () => {
    const f = await factsOf({
      'android/app/src/main/java/a/Svc.kt': `interface Svc {
  @HTTP(method = "DELETE", path = "items/{id}", hasBody = true)
  suspend fun remove(@Path("id") id: String, @Body b: Body)
}
class Repo(private val client: HttpClient) {
  suspend fun list() = client.get("$baseUrl/catalog/list")
}
`,
      'android/app/src/main/java/a/V.java': `class V {
  void send(RequestQueue q) {
    StringRequest r = new StringRequest(Request.Method.POST, BASE_URL + "/feedback", l, e);
    q.add(r);
  }
}
`,
      'ios/App/E.swift': `import Foundation
enum ProfileAPI {
  case me, avatar
  var path: String {
    switch self {
    case .me: return "/profile/me"
    case .avatar: return "/profile/avatar"
    }
  }
  var method: String {
    switch self {
    case .me: return .get
    case .avatar: return .post
    }
  }
}
final class N {
  func fetch() async throws {
    let url = apiBaseURL.appending(path: "v2/feed")
    _ = try await URLSession.shared.data(from: url)
  }
}
`,
    });
    const apis = f.apis!.map((a) => a.method + ' ' + a.path);
    expect(apis).toContain('DELETE /items/{id}');
    expect(apis).toContain('GET /catalog/list');
    expect(apis.some((a) => a.includes('{baseUrl}'))).toBe(false);
    expect(apis).toContain('POST /feedback');
    expect(apis).toContain('GET /v2/feed');
    expect(apis).toContain('GET /profile/me');
    expect(apis).toContain('POST /profile/avatar');
  });
});

describe('round 3: screen libraries', () => {
  it('Voyager screens / tabs, Compose Destinations, ArkTS router decorators with pageUrl / constants', async () => {
    const f = await factsOf({
      'android/app/src/main/kotlin/a/Screens.kt': `package a
import cafe.adriel.voyager.core.screen.Screen
import cafe.adriel.voyager.navigator.tab.Tab
class DetailsScreen(val id: Int) : Screen {
  @Composable override fun Content() {}
}
object HomeTab : Tab {
  @Composable override fun Content() {}
}
`,
      'android/app/src/main/kotlin/a/Profile.kt': `package a
import com.ramcosta.composedestinations.annotation.Destination
@Destination
@Composable
fun ProfileScreen(nav: DestinationsNavigator) {}
@Composable
fun NotAScreen() {}
`,
      'harmony/entry/src/main/ets/pages/Detail.ets': "const PAGE_SETTINGS = 'settings/Settings';\n@HMRouter({ pageUrl: 'detail/Detail' })\n@Component\nexport struct DetailPage {\n  build() {}\n}\n@HMRouter({ pageUrl: PAGE_SETTINGS })\n@Component\nexport struct SettingsPage {\n  build() {}\n}\n",
    });
    const ids = f.routes!.map((r) => r.route_id);
    expect(ids).toEqual(expect.arrayContaining(['DetailsScreen', 'HomeTab', 'ProfileScreen', 'detail/Detail', 'settings/Settings']));
    expect(ids).not.toContain('NotAScreen');
  });
});

describe('round 4: native HTTP wrappers', () => {
  it('Swift and Kotlin helpers taking a path are followed to literal call sites', async () => {
    expect(paramNames('func request<T: Decodable>(_ path: String, method: HTTPMethod = .get) async throws -> T')).toEqual(['path', 'method']);
    expect(paramNames('public Call get(@Path("id") String path, int page)')).toEqual(['path', 'page']);
    const f = await factsOf({
      'ios/App/Client.swift': `import Foundation
final class APIClient {
  func request(_ path: String, method: String = "GET") async throws -> Data {
    var r = URLRequest(url: baseURL.appendingPathComponent(path))
    r.httpMethod = method
    return try await URLSession.shared.data(for: r).0
  }
}
final class FeedService {
  let api = APIClient()
  func load() async throws { _ = try await api.request("/feed/home") }
  func like(id: String) async throws { _ = try await api.request("/feed/like", method: "POST") }
  func other(p: String) async throws { _ = try await api.request(p) }
}
`,
      'android/app/src/main/java/a/Http.kt': `class Http(private val client: HttpClient) {
  suspend fun post(path: String, body: Any) = client.post(BASE + path) { setBody(body) }
}
class Repo(private val http: Http) {
  suspend fun send() = http.post("/messages/send", Msg())
}
`,
    });
    const apis = f.apis!.map((a) => a.method + ' ' + a.path);
    expect(apis).toContain('GET /feed/home');
    expect(apis).toContain('POST /feed/like');
    expect(apis).toContain('POST /messages/send');
    expect(apis.some((a) => a.includes('{p}') || a.includes('{path}'))).toBe(false);
  });
});

describe('round 5: testID sources', () => {
  it('storyboard / xib identifiers, bare UIKit assignment, Compose testId wrappers', async () => {
    const f = await factsOf({
      'ios/App/Main.storyboard': '<document>\n<button id="a1">\n  <accessibility key="accessibilityConfiguration" identifier="sb_login"/>\n</button>\n</document>\n',
      'ios/App/Badge.swift': 'import UIKit\nfinal class BadgeView: UIView {\n  init() {\n    super.init(frame: .zero)\n    accessibilityIdentifier = "badge_view"\n  }\n}\n',
      'android/app/src/main/java/a/Ui.kt': '@Composable\nfun Ui() {\n  Text("x", modifier = Modifier.testId("ui_text"))\n}\n',
    });
    const tids = f.testids!.map((t) => t.tid);
    expect(tids).toEqual(expect.arrayContaining(['sb_login', 'badge_view', 'ui_text']));
  });
});

describe('facts symbol ids resolve in the graph (kb verify gate)', () => {
  it('every non-empty route / API symbol emitted by the new recognisers exists', async () => {
    const { facts, graph } = await factsAndGraph({
      'ios/App/Info.plist': '<plist><dict><key>UILaunchStoryboardName</key><string>Launch</string></dict></plist>',
      'ios/App/AboutViewController.h': '@interface AboutViewController : UIViewController\n@end\n',
      'ios/App/AboutViewController.m': '@implementation AboutViewController\n- (void)load {\n  NSURLRequest *r = [NSURLRequest requestWithURL:[NSURL URLWithString:@"https://x.org/api/about"]];\n  [[NSURLSession sharedSession] dataTaskWithRequest:r];\n}\n@end\n',
      'android/app/src/main/kotlin/a/Root.kt': 'class Root {\n  private val nav = StackNavigation<Config>()\n  val stack = childStack(source = nav, serializer = Config.serializer(), childFactory = ::child)\n  private fun child(c: Config, ctx: ComponentContext): Child = when (c) {\n    is Config.Home -> Child.Home(HomeComponent(ctx))\n  }\n  @Serializable sealed class Config {\n    @Serializable data object Home : Config()\n  }\n}\nclass HomeComponent(ctx: ComponentContext)\n',
    });
    const ids = new Set(graph.symbols.map((s) => s.id));
    const syms = [...facts.routes!.map((r) => r.symbol), ...facts.apis!.map((a) => a.symbol)].filter(Boolean);
    expect(facts.routes!.map((r) => r.route_id)).toEqual(expect.arrayContaining(['about', 'Home']));
    for (const s of syms) expect(ids.has(s), s).toBe(true);
  });
});
