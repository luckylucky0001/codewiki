# codewiki `kb` 留出集盲测基准 v3（最终泛化）

用于在**全新**仓库上衡量 `kb` 抽取器的最终泛化能力。4 个仓库与 `../accuracy/`（16 个）、`../heldout2/`（10 个）以及任务排除清单
（AntennaPod、tivi、mastodon-ios、isowords、KaMPKit、nowinandroid、compose-samples、sunflower、element-x-android、ios-oss、
NetNewsWire、wikipedia-ios、HarmonyOS-Cases、NextE、fishpi-harmony、kotlinconf-app、IceCubesApp、arkTS_universal_starter、
app_samples、sample-food-truck、clean-architecture-swiftui、DroidconKotlin、pocket-casts-android、iosched、Simple-Calendar、
simplenote-ios、damus、swift-composable-architecture、Confetti、HarmoneyOpenEye、CoolMallArkTS、FinVideo）**均不重合**。

**盲标声明**：标注时未打开抽取器源码（`/home/user/codewiki*`、`src/`、`legacy-go/`）。所有标签来自对目标仓库源码的直接阅读，
并由 `tools/mk.py: check()` 自动核对每条标签引用的文件（含 `alt_files`）在克隆中存在。

```
heldout3/
├── README.md               本文件
├── score.mjs               官方打分器（与 ../heldout2/score.mjs 完全相同）
├── score-harmonized.mjs    协调版打分器（与 ../heldout2-runs/score-harmonized.mjs 完全相同；与训练数字可比，优先报告它）
├── labels/<owner_repo>.json  4 份标签（格式与 heldout2 完全相同；claims: []）
├── tools/mk.py, *.py       生成标签的脚本（标签“源文件”；修改后 cd tools && python3 -I <x>.py）
└── repos/                  4 个浅克隆（git clone --depth 1 --filter=blob:limit=2m），共约 169MB
```

协议同 heldout2（screens / not_screens / deeplinks / testids / apis，**不标 claims**）。

## 1. 仓库、固定提交与数量

括号含义：screens (optional)、not_screens (borderline)、deeplinks (optional)、apis (optional / expect=false)。

| 仓库 | commit | 平台 | screens | not_screens | deeplinks | testids | apis |
|---|---|---|---|---|---|---|---|
| Ashinch/ReadYou | `d2b979ccad9a` | android (Compose Navigation 3) | 18 (2) | 5 (2) | 2 (2) | 0 | 13 (0/1) |
| Dimillian/MovieSwiftUI | `72eb4ae7117f` | ios (SwiftUI) | 15 (1) | 6 (2) | 0 | 0 | 20 (0/0) |
| razaghimahdi/Shopping-By-KMP | `df8d034585f3` | kmp (Compose Multiplatform) | 23 (5) | 4 (0) | 0 | 0 | 20 (0/0) |
| seasonZhu/HarmonyStudy | `b55e58c962e9` | harmony (main_pages + named routes) | 19 (3) | 5 (1) | 0 | 1 | 18 (4/0) |
| **合计** | | | **75 (11)** | **20 (5)** | **2 (2)** | **1** | **71 (4/1)** |

完整 40 位 SHA：
- ReadYou `d2b979ccad9a3e54b9499929a9dc2824578b0fd9`
- MovieSwiftUI `72eb4ae7117fbf893be533c9a277c47a7287d87e`
- Shopping-By-KMP `df8d034585f3fd26f7ad78b04b452eefd8100383`
- HarmonyStudy `b55e58c962e9b39d5211337590bdd45f2c2349b3`

**0 条的类别都是源码中确实没有**（已 grep 确认），可用于测误报：四个仓库均无 Info.plist URL scheme / 非 MIME 深链 /
`skills.uris`；ReadYou、MovieSwiftUI、Shopping-By-KMP 无 `testTag` / `accessibilityIdentifier`；HarmonyStudy 只有 1 处 `.id()`。
因此本集**深链与 testID 的召回基本不可测**（深链 0 条必需、testID 1 条），主要衡量 routes 与 apis，以及负例误报。

穷尽标注：HarmonyStudy 的 main_pages（19）与 HTTP（全部 18 处）、MovieSwiftUI 的 TMDB `Endpoint.path()`（全部 20 个）、
Shopping-By-KMP 客户端 Ktor 调用（全部 20 个）、ReadYou 的 GoogleReader 端点（Nav3 `Route` key 共 22 个，抽样标 16 个）。

## 2. 每仓要点与难例

* **ReadYou**（Android）：**Navigation 3**——`sealed interface Route : NavKey`（`ui/page/nav3/key/NavKey.kt`）+ `AppEntry.kt` 中
  `when (key) { Route.X -> NavEntry(key) { XPage() } }`；route_id = `Route.<Case>`，screen_fn = Page。`Route.Reading` 渲染
  `ArticleListReaderPage`，它定义在名字不同的 `ArticleListReadingPage.kt`。**负例**：`ui/page/common/RouteName.kt` 的字符串常量
  （`STARTUP = "startup"` 等）已全仓无引用（陈旧，borderline）；`FlowPage`（`Route.Flow` 已注释）；`animatedComposable` 帮助函数。
  深链只有 MIME 驱动的 `http/https host=*`（optional）；`SEND` filter 不是深链。API：GoogleReader/FreshRSS 用裸 OkHttp
  `"$serverUrl$query?output=json"`、`"${serverUrl}accounts/ClientLogin"`；Fever 是单端点 `?api&...`（未标）；Retrofit 只有 `@Url`（must-not）。
* **MovieSwiftUI**（iOS SwiftUI + flux）：`TabbarView` 的 4 个 tab + `NavigationLink(destination: X(...))` + `.sheet { XForm() }`；
  route_id = View struct。`MoviesCrewList` 只在自己的 PreviewProvider 中实例化（死代码，borderline 负例）；`TabbarView` 是外壳（borderline）。
  `GenresList` 嵌在 MoviesHome 的 `TabView(PageTabViewStyle)` 与 iPad `OutlineMenu` 中（optional）。API：`enum Endpoint` 的
  `path()` switch 返回字面量与 `"movie/\(String(movie))/videos"` 插值，经 `baseURL.appendingPathComponent`，全部 GET。
  `MovieSwiftTV` target 未标注。
* **Shopping-By-KMP**（KMP/Compose Multiplatform）：类型安全导航 `@Serializable sealed interface XNavigation { data object/class }` +
  各 `*Nav.kt` 中 `composable<XNavigation.Y> { YScreen(...) }`；route_id = `XNavigation.Y`。同名 case 分布在多个图里
  （`Settings`、`Address`、`AddAddress`、`Detail`），如 `HomeNavigation.Settings` 与 `ProfileNavigation.Settings` 都渲染 `SettingsScreen`。
  **难例**：`ProfileNavigation.MyWallet` 调用的 `MyWalletScreen(...)` **在全仓没有定义**（断引用，optional）；底栏用字符串路由
  `BottomNavigation.X.route` 承载嵌套 NavHost（optional）。负例：`FailedNetworkScreen` / `LoadingWithLogoScreen`（名为 *Screen 的状态组件）。
  API：Ktor `url { takeFrom(BASE_URL); encodedPath += MainService.CONST; encodedPath += "/$id" }`，路径来自 companion `const val`；
  仓内还有 Ktor **服务端** `server/`（`get("/product/{id}/like")` 等，未标注，属 server 侧）。
* **HarmonyStudy**（HarmonyOS Next，WanAndroid 客户端）：main_pages 19 页；`Router.push({url: PagesConstant.X})` 包装 + `@Entry({routeName: RouterName.X})`
  命名路由 + `import("entry/ets/pages/...")` 动态导入；route_id = main_pages 路径。**负例**：`TabsDetail` 带 `@Entry` 但不在 main_pages
  （作为 Tabs 内容嵌入，borderline）；`Home.ets` 内的 `SearchIcon`、`MyCoin.ets` 内的 `MyCoinCell`。API：axios `httpClient.get/post(api)`，
  `api` 多为 `'article/list/' + page + '/json'` 拼接或在 `switch(contentType)` 中赋值（后者 optional）；baseURL `https://www.wanandroid.com/`。

## 3. 打分

```bash
node score-harmonized.mjs --labels-dir labels --runs runs/     # runs/<标签文件名去掉 .json>/[wiki/facts/]*.json（推荐，与训练可比）
node score.mjs            --labels-dir labels --runs runs/     # 官方
node score-harmonized.mjs --labels labels/Ashinch_ReadYou.json --facts /path/to/facts -v
node score.mjs --labels-dir labels --selftest
```

自检（两个打分器均已运行）：4 份标签全部 **PASS**——完美伪输出 → 所有非空类别 recall=100%、负例 FP=0；空输出 → 0%。

```
PASS Ashinch_ReadYou.json               perfect=[1,null,null,1] fp=0
PASS Dimillian_MovieSwiftUI.json        perfect=[1,null,null,1] fp=0
PASS razaghimahdi_Shopping-By-KMP.json  perfect=[1,null,null,1] fp=0
PASS seasonZhu_HarmonyStudy.json        perfect=[1,null,1,1]    fp=0
```
（数组顺序 routes / deeplinks / testids / apis；null = 该类别无必需标签。）

## 4. 已知局限

* 只有 4 个仓库，且深链/testID 几乎为空：本集主要用于 routes、apis 与负例误报的泛化测量。
* routes 为大部分穷尽、少量抽样；“未覆盖抽取数”不能直接当误报，精确率只由负例估计。
* Shopping-By-KMP 标签平台为 `kmp`（`platform_aliases` 允许 android/ios/desktop/common）；未标 server 侧路由。
* HarmonyStudy 的 `librarySDK` 模块未标注。
