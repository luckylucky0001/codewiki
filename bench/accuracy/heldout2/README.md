# codewiki `kb` 留出集（held-out）盲测基准 v2

用于衡量 `kb` 抽取器在**未参与调参**的仓库上的泛化能力。抽取器刚在 `../accuracy/` 的 16 个仓库上调过，
本目录的 10 个仓库与那 16 个、以及任务列出的排除清单（IceCubesApp、arkTS_universal_starter、openharmony app_samples、
sample-food-truck、clean-architecture-swiftui、DroidconKotlin、agc templates、SweetVideo、Wechat_HarmonyOS、
open_neteasy_cloud）**均不重合**。

**盲标声明**：标注过程中未打开抽取器源码（`/home/user/codewiki*`、`src/`、`legacy-go/`），所有标签都来自对目标仓库源码的
直接阅读，并由 `tools/mk.py: check()` 自动核对每条标签引用的文件在克隆中存在。

```
heldout2/
├── README.md           本文件
├── score.mjs           打分器（复制自 ../accuracy/score.mjs，有 2 处小补丁，见 §4）
├── labels/<owner_repo>.json  10 份标签（格式与 ../accuracy 完全相同）
├── tools/*.py, mk.py   生成标签的脚本（标签“源文件”；改完运行 cd tools && python3 -I <x>.py）
├── examples/pc, examples/empty  打分器演示用的假输出
└── repos/              10 个浅克隆（git clone --depth 1 --filter=blob:limit=2m），共约 680MB
```

协议与 `../accuracy/README.md` §2 一致（screens / not_screens / deeplinks / testids / apis），**本轮按要求不标 claims**
（`claims: []`，打分器对 claims 输出 n/a）。

## 1. 仓库、固定提交与数量

括号含义：screens (optional)、not_screens (borderline)、deeplinks (optional)、apis (optional / expect=false)。

| 仓库 | commit | 平台 | screens | not_screens | deeplinks | testids | apis |
|---|---|---|---|---|---|---|---|
| Automattic/pocket-casts-android | `87dc00b7bd31` | android | 26 (3) | 5 (0) | 25 (3) | 1 | 11 (1/1) |
| google/iosched | `738e1e008096` | android | 20 (4) | 5 (1) | 1 (0) | 6 | 3 (2/1) |
| SimpleMobileTools/Simple-Calendar | `599985c678bd` | android | 24 (8) | 5 (0) | 2 (2) | 0 | 0 |
| Automattic/simplenote-ios | `29bd22351aaa` | ios (ObjC+Swift UIKit) | 22 (4) | 6 (1) | 7 (0) | 7 | 6 (4/0) |
| damus-io/damus | `4a94f666d7e1` | ios (SwiftUI) | 22 (0) | 5 (0) | 8 (3) | 10 | 10 (1/0) |
| pointfreeco/swift-composable-architecture (Examples/) | `bc2db5ba8ad3` | ios (TCA) | 21 (1) | 6 (1) | 1 (1) | 7 | 2 (0/0) |
| joreilly/Confetti | `c517e458e032` | kmp (+android/wear) | 23 (3) | 6 (1) | 4 (2) | 1 (expect=false) | 1 |
| WinWang/HarmoneyOpenEye | `57f054279533` | harmony (API9 router) | 17 (7) | 6 (1) | 0 | 0 | 9 |
| Joker-x-dev/CoolMallArkTS | `17b6899086a5` | harmony (Navigation 注册表) | 38 (1) | 6 (1) | 0 | 0 | 10 |
| OHPG/FinVideo | `669916b3581c` | harmony (main_pages + pushUrl) | 19 (4) | 6 (1) | 0 | 6 | 0 |
| **合计** | | | **232 (35)** | **56** | **48 (11)** | **38** | **52** |

完整 40 位 SHA 见各标签 `commit` 字段。0 条的类别是**源码里确实没有**（已 grep 确认），用于测误报：
Simple-Calendar 无 HTTP API / testID、FinVideo 的 API 在未克隆的 git submodule 里、OpenEye/CoolMall 无 `.id()` 与 `skills.uris`。

穷尽标注：CoolMall 37 条 RouteBuild 路由、FinVideo/OpenEye 的 main_pages、simplenote 与 FinVideo 的 testID、
pocket-casts 非 MIME 深链（基本穷尽）、damus Info.plist scheme。其余为抽样。

## 2. 每仓要点与难例

* **pocket-casts-android**：Fragment + 多模块 manifest 的 Activity；`MainActivity_1..18` 是 `<activity-alias>`（换图标）→ 负例；
  同名 `SettingsFragment` 出现在 `features/settings` 与 `features/filters/playlists` 两个模块（都是页面）；
  深链里多个 intent-filter 把 scheme/host/path 拆在**不同的 `<data>` 标签**上（需做笛卡尔积）；`wear://` MESSAGE_RECEIVED 不是深链；
  唯一的 testTag 是 Kotlin 模板 `"option_$index"`；Retrofit 路径多数以 `/` 开头且分属不同 baseUrl，`@Url` 动态 URL 为 must-not。
* **google/iosched**：Navigation XML（3 张图），目的地用 `@id/`（不是 `@+id/`）声明，route_id 取目的地 id、symbol 取 Fragment 类；
  `navigation_placeholder`（`androidx.fragment.app.Fragment`）与 `<action>` id 是负例；`navigation_map_sublevel` 复用 MapFragment（borderline）。
  深链只有 manifest 里的 `iosched://sessions`；testID 取 Espresso 实际使用的 resource-id。注意：androidTest 还引用了
  `filter_fab`/`recyclerview_filter` 等**在 res 中已不存在**的 id（陈旧），未标注。HTTP 只经 BuildConfig URL（optional）。
* **Simple-Calendar**：纯 Activity；视图模式是 MainActivity 内切换的 `*FragmentsHolder`，ViewPager 子页 optional；
  `AboutActivity`/`CustomizationActivity` 以 FQCN 声明、类在外部 commons 库（optional）；大量 `SplashActivity.<Color>` alias 负例；
  只有 MIME 驱动的 intent-filter（全部 optional）。
* **simplenote-ios**：ObjC（`.h/.m`）+ Swift 混合 UIKit；ObjC VC 以 `.m` 为 file。深链 `simplenote://` 的 host 分发散落在
  `SPAppDelegate.m`（`new`/`widgetNew`）、`NSURL+Links.swift`（`note`/`list`）、`MagicLinkAuthenticator`（`login`）+ applinks。
  真正的网络层在外部 SPM 包 `SimplenoteEndpoints` 与 Simperium，仓内只有 share extension 的 `String(format:"%@/%@/%@/i/%@")`；
  `SimplenoteConstants` 里的 `/account/...` 常量仓内无调用（optional）。
* **damus**：SwiftUI `enum Route`（~50 case）+ `func view()` switch 映射到 View；route_id = `Route.Case`、screen_fn = View。
  `FollowersView` 定义在 `FollowingView.swift`；`Profile`/`ProfileByKey` 共用 `ProfileView`；`Thread` 映射到 `ChatroomThreadView`
  （旧 `ThreadView` 被注释）。testID 集中定义在 `enum AppAccessibilityIdentifiers: String`（rawValue=case 名），
  使用处是 `.accessibilityIdentifier(X.rawValue)`（file=定义处，alt_files=使用处）。API 多为 `appendingPathComponent` 拼接。
* **swift-composable-architecture / Examples**（只 sparse-checkout 了 `Examples/`）：SyncUps 的 `StackState<Path.State>` +
  `@Reducer enum Path { detail, meeting, record }`，`@Reducer enum Destination { add/edit(SyncUpForm), alert }` 以 sheet 呈现
  （alert 不是页面）；CaseStudies 的 `NavigationLink("…") { Demo(store:) { XView(store:) } }`。`AppView` 在 SyncUps/Todos/TicTacToe 重名。
* **Confetti (KMP)**：Decompose 导航，每个 Component 内 `private sealed class Config`；`Config.Settings / SessionDetails /
  Conferences / Home / Bookmarks / Loading` 在 shared 与 wearApp 中**同名**，按模块目录区分；`mobileMain/navigation/*Key.kt`
  只是普通 data class（未被使用），**不是**路由（负例）。唯一 testTag 是变量 `testTag(conference.id)`（expect=false）；API 只有 Apollo `/graphql`。
* **HarmoneyOpenEye**：API9 `router.pushUrl` 经包装 `Router.push(RoutePath.X)`；`RoutePath.CategoryPage = "pages/CategoryPage"` 是
  **陈旧常量**（不在 main_pages，文件实际在 `pages/find/category/`）→ borderline 负例；Tabs 子组件 optional；
  API 为 `baseUrl + "api/v4/..."` 拼接，`wanAndroidUrl + "/banner/json"` 出现双斜杠。
* **CoolMallArkTS**：自研 Navigation 注册表：`core/navigation/*/XRoutes.ts` 常量 → `feature/*/navigation/XGraph.ets` 中
  `RouteBuild.register(XRoutes.Key, wrapBuilder(XNav))` → `@Builder XNav(){ XPage() }`；无 router_map、无 `@Entry`（除 EntryPage）。
  route_id = 路由字符串（如 `goods/detail`），symbol/struct = Page，builder = Nav。注意 `goods/category` 与 `main/category`、
  `order/detail` 与 `goods/detail` 等 key 同名（`Category`/`Detail`/`Comment`/`List`）。API 的 BASE_URL 已以 `/app/` 结尾，
  反馈接口相对路径又写了 `app/feedback/...`。
* **FinVideo**：main_pages 15 页 + `getUIContext().getRouter().pushUrl({url:"pages/..."})` 字面量；`ShowEpisodePage` 名为 Page、
  位于 `pages/` 下，但非 `@Entry`、被 sheet 嵌入 → 负例；播放页与 Jellyfin API 都在**未初始化的 git submodule**（`framewrok/`、`sdk/` 为空目录）。
  testID 8 处 `.id()`，`episode_cover`/`episode_name` 在两个文件重复。

## 3. 打分

```bash
node score.mjs --labels-dir labels --runs runs/          # runs/<标签文件名去掉 .json>/[wiki/facts/]*.json
node score.mjs --labels labels/google_iosched.json --facts /path/to/iosched -v
node score.mjs --labels-dir labels --selftest            # 自检
```
自检结果（本目录 10 份 + `../accuracy` 16 份均 PASS）：完美伪输出 → 所有非空类别 recall=100%、负例 FP=0；空输出 → 0%。
`examples/empty` 实测全 0%；`examples/pc` 演示了同名 `SettingsFragment` 只记 1 次、alias 负例命中、`option_$index` 模板匹配、`@Url` must-not 计数。

## 4. 对打分器的两处补丁（相对 ../accuracy/score.mjs）

1. `tidNorm`：除 `${x}`、`\(x)`、`{x}`、`%s` 外，Kotlin 无花括号模板 `$ident` 也归一为 `*`（pocket-casts `"option_$index"`）。
2. 重复 route_id 的模块判定：原实现只比较路径**第一段**，无法区分 `modules/features/settings` 与 `modules/features/filters`；
   现改为“所有同 id 标签的公共路径前缀 + 1 段”。对旧 16 份标签自检结果不变。

## 5. 已知局限

* 抽样标注：routes 的“未覆盖抽取数”不能当误报；精确率只由负例估计。
* 平台族：Confetti 标签同时含 `kmp`（shared）与 `android`（wearApp），已加 `platform_aliases`。
* TCA 仓只检出 `Examples/`；对整个仓库运行时库源码 `Sources/` 的抽取项不在标签覆盖范围内。
* Simple-Calendar 的 MIME 深链 host 为空，仅要求 scheme，且全部 optional。
