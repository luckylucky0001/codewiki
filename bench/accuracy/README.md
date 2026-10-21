# codewiki `kb` 准确率基准（实现无关）

本目录是一套**与实现无关**的人工标注基准，用来衡量代码知识抽取器（codewiki `kb`）在
路由/页面、深链、testID、HTTP API、文档声明核验五类事实上的准确率。标注者**没有阅读抽取器源码**
（`/home/user/codewiki*/internal`、`src` 均未打开），全部标签都来自对目标仓库源码的直接阅读。

```
accuracy/
├── README.md          本文件
├── score.mjs          打分器（Node ≥18，零依赖）
├── labels/<repo>.json 每个仓库一份标签（16 份）
├── tools/*.py, mk.py  生成标签 JSON 的脚本（标签的“源文件”，改标签请改这里再运行 python3 -I tools/<x>.py）
├── examples/          两个手写的假输出，演示打分器用法
└── repos/             5 个新仓库的浅克隆（--depth 1 --filter=blob:limit=2m），其余复用 oss2 只读克隆
```

## 1. 仓库与固定提交

| 仓库 | commit | 平台 | screens (其中 optional) | not_screens | deeplinks (optional) | testids | apis (optional/不应抽取) | claims (verified/conflict/unverifiable) |
|---|---|---|---|---|---|---|---|---|
| AntennaPod/AntennaPod **(新)** | `3d105d598dfa` | android | 26 (0) | 6 | 11 (2) | 10 | 11 (1) | 10 (10/0/0) |
| FishPiOffical/fishpi-harmony | `591cd1254817` | harmony | 13 (2) | 6 | 3 (3) | 0 | 12 (1) | 10 (7/1/2) |
| HarmonyOS-Cases/Cases | `f6602bc2970a` | harmony | 29 (0) | 6 | 1 (1) | 11 | 4 (1) | 10 (7/3/0) |
| JetBrains/kotlinconf-app | `907ce238e1ff` | kmp | 24 (0) | 6 | 0 | 0 | 13 (2) | 10 (9/0/1) |
| Ranchero-Software/NetNewsWire | `94032d95fe04` | ios/macos | 23 (0) | 8 | 11 (3) | 0 | 10 (0) | 10 (10/0/0) |
| android/compose-samples | `0bc770fd2851` | android | 16 (0) | 6 | 4 (1) | 0 | 0 | 10 (7/3/0) |
| android/sunflower | `2a357a31551b` | android | 9 (2) | 6 | 0 | 1 | 1 (0) | 10 (7/0/3) |
| chrisbanes/tivi **(新)** | `a0c62c2c763c` | kmp(标为 android) | 19 (0) | 6 | 2 (0) | 10 | 2 (1) | 10 (9/0/1) |
| element-hq/element-x-android | `85b63e571afc` | android | 20 (1) | 6 | 9 (0) | 10 | 2 (0) | 10 (9/1/0) |
| erosTeam/NextE | `7cc8d638458b` | harmony | 22 (0) | 5 | 4 (0) | 10 | 10 (1) | 10 (8/1/1) |
| kickstarter/ios-oss | `5f5463cfb830` | ios | 23 (0) | 7 | 48 (1) | 0 | 13 (1) | 10 (5/4/1) |
| mastodon/mastodon-ios **(新)** | `cd37d472213a` | ios | 21 (0) | 6 | 7 (0) | 0 | 10 (0) | 10 (9/1/0) |
| android/nowinandroid | `a49ed253d75e` | android | 12 (1) | 6 | 2 (1) | 11 | 4 (0) | 10 (9/1/0) |
| pointfreeco/isowords **(新)** | `c727d3a7c49c` | ios (TCA) | 21 (0) | 6 | 6 (3) | 0 | 12 (0) | 10 (9/1/0) |
| touchlab/KaMPKit **(新)** | `4af02006be4b` | kmp | 3 (0) | 7 | 0 | 0 | 1 (0) | 10 (9/0/1) |
| wikimedia/wikipedia-ios | `427f61dbf958` | ios | 18 (0) | 6 | 14 (2) | 10 | 10 (1) | 10 (7/2/1) |
| **合计** | | | **299** | **99** | **122** | **73** | **115** | **160** |

完整 SHA 见各 `labels/*.json` 的 `commit` 字段。注：“testids = 0” 的仓库是**源码中确实没有** testID
（已全仓 grep 确认），这些仓库用来测 testID 的误报（抽出来的都算可疑）。

## 2. 标注协议

通用原则：每一条标签都在固定 commit 的源码里**打开文件核对过**；样本不追求穷尽（kickstarter 深链表、
tivi Circuit Screen、kotlinconf Routes.kt 例外，是穷尽的）。

### 2.1 screens / routes
* 一条 = 一个可导航的“页面”。`route_id` 取**代码里用于导航的标识**：
  * 字符串路由（navigation-compose / Jetcaster / sunflower）→ 路由字符串原文，如 `plantDetail/{plantId}`；
  * 类型安全路由 / Nav3 NavKey / Circuit Screen / KMP `AppRoute` → 类名（`TopicNavKey`、`ShowDetailsScreen`）；
    kotlinconf 另有 `@SerialName`，放在 `aliases`；
  * UIKit / AppKit → ViewController 类名（Mastodon 另附 `scene_case`）；SwiftUI/TCA → View struct 名；
  * HarmonyOS `router_map`/`route_map` → `name` 字段（可能是中文），`symbol` = `buildFunction`，`struct` = 组件名；
  * HarmonyOS `@AppRouter({name})`（HarmonyOS-Cases 自定义装饰器）→ `name`，`symbol` = 被装饰 struct；
  * HarmonyOS `main_pages.json` → 页面路径 `pages/Index`；
  * NextE 这类**代码内分发**（`pushPathByName('X')` → 映射表 → `wrapBuilder(IndexXRoute)` → `XPage`）→ `name`，
    `symbol` = 最终 Page struct，`builder` = 中间 Builder；
  * Appyx（element-x）→ 叶子 `Node` 类名（`@ContributesNode`）。
* `kind` 记录声明形式：`compose-route | nav3-navkey | circuit-screen | activity | fragment | uikit-vc |
  swiftui-destination | swiftui-root | appkit-window | router_map | main_pages | NavDestination |
  app-router-decorator | appyx-node | compose-dialog | pager-page | embedded-root …`
* 同一页面的“路由键”和“页面 Composable”都标注时，后者带 `alt_of: <路由键 route_id>`，打分时两者算**同一个**页面。
* `optional: true`：是否算页面有争议（HorizontalPager 子页、Dialog、Activity 外壳等），**不进分母**，命中单独报告。
* `not_screens`：每仓 5~8 条“看起来像页面但不是”的负例——基类/sealed 基类、`@Preview`/`PreviewProvider`、
  嵌入式子 VC、行/卡片组件、测试类、占位 NavTarget、与真实页面**同名**但在别的文件里的组件等。
  `borderline: true` 的负例不参与误报率。

### 2.2 deeplinks
`{platform, scheme, host, path, file, source}`。来源：AndroidManifest `intent-filter <data>`（同一 filter 的
scheme×host 组合展开）、iOS `CFBundleURLSchemes` 与 entitlements `applinks:`、HarmonyOS `module.json5 skills.uris`、
代码中的路由表（kickstarter `Navigation.swift`，`kind: route-pattern`）、URL 分发代码（Mastodon/NetNewsWire/Wikipedia 的
`url.host == ...`）、Nav3 `DeepLinkPattern`。
* `${applicationId}` / `@string/login_redirect_scheme` 之类占位 scheme 额外给 `resolved_scheme`；
* 只在应用内解析、未在系统注册的 URL（NetNewsWire `nnw://` widget、fishpi `pushToAppUrl`、Jetsnack `navDeepLink`）
  标 `optional`；mime-type 驱动的文件打开 filter 也标 `optional`；
* Wear `wear://` MESSAGE_RECEIVED filter **不是**深链，未标注。

### 2.3 testids
`{platform, tid, file, line}`，每仓抽样约 10 条，来源：Compose `Modifier.testTag("…")`、ArkTS `.id('…')`、
iOS `accessibilityIdentifier`、Android `android:id`（AntennaPod 无 testTag，标的是 Espresso 实际使用的 resource-id，`kind: resource-id`）。
* 字符串模板（`"topic:${viewModel.topicId}"`）标 `dynamic: true`；纯变量（`testTag(item.tag)`）标 `expect: false`。
* **集中定义**的情况（element-x `TestTags.kt` 的 `TestTag("…")`、wikipedia `AccessibilityIdentifiers.swift`）：
  `file/line` = 定义处，`alt_files/use_line` = 赋值处，两处都算命中；`tid` 是**字符串值**而不是常量名。
* ohosTest 里的 `ON.id('…')` 是查找而非声明，不标。

### 2.4 apis
`{method, path, file}`，每仓抽样约 10 条。`path` 写成“相对 base URL 的路径 + 参数占位 `{x}`”，
已知前缀（如 `/api/v1`、`/{year}`、`/v2`）照实写出（打分器会剥掉通用前缀，见下）。
* URL 完全由运行时变量构成 → `dynamic: true, expect: false`（**不应**被抽出；抽到计入 must-not）；
* 服务端路由（kotlinconf backend）标 `side: server`，optional；
* isowords 的 API 由 swift-url-routing 的 Parser DSL 声明（`Path { "api"; "push-tokens" }` + `Method.post`），
  没有 URL 字面量——这是刻意放入的高难样本。

### 2.5 claims（文档声明核验）
每仓 10 条，从 README / AGENTS.md / CLAUDE.md / docs/ 摘录（中文仓库原文保留），标签：
* `verified`：代码中能找到直接证据（`evidence` 给出 file[:line]）；
* `conflict`：文档与代码矛盾（路径失效、数量过时、依赖已移除、目录名不同……）；
* `unverifiable`：工具链/运行时/外部事实，无法从源码判定。
少数 README 过于空洞的仓库加了 1 条 `synthetic: true` 的标注者合成声明，可用 `--no-synthetic` 排除。

## 3. 打分器用法

```bash
# 单仓：facts 目录里放 routes.json / testids.json / apis.json / requirements.json
#      （也可直接给仓库根目录，自动查找 wiki/facts/）
node score.mjs --labels labels/android_sunflower.json --facts /path/to/sunflower        [-v] [--json]

# 批量：runs/<标签文件名去掉 .json>/[wiki/facts/]*.json
node score.mjs --labels-dir labels --runs runs/ [--json]

# 单独指定文件
node score.mjs --labels labels/x.json --routes a.json --testids b.json --apis c.json --requirements d.json

# 自检：用标签伪造“完美输出”和“空输出”，检查完美=100%、空=0%、负例不误伤
node score.mjs --labels-dir labels --selftest
```
其它选项：`--strict-platform`（平台族必须完全一致）、`--claim-threshold 0.35`、`--no-synthetic`、`--verbose`（列出每条漏报/误报）。
缺失的输出文件该类记为 “no output file”，不报错。输入既接受文档规定的 `{"version":1,"routes":[…]}`，也接受裸数组。

输出指标：
* routes：recall（按逻辑页面分组计），optional 命中数，命中方式（id/file/basename），抽取总数，未被标签覆盖的抽取数（仅供参考，不算误报）；
* not_screen：误报率 = 被抽成 route 的负例数 / 非 borderline 负例数；
* deeplinks：recall（optional 另计）；
* testids：recall（tid+file）、仅 tid 命中数、行号精确命中数、must-not 命中数；标签为空的仓库提示“抽出的都可疑”；
* apis：recall（method+规范化 path），方法通配命中数，optional，must-not；
* claims：匹配覆盖率、匹配上的准确率、整体准确率（未匹配算错）、conflict 召回、混淆矩阵；
* 批量模式另给 micro/macro 汇总。

## 4. 匹配规则

**平台**：先归一到平台族（android/kotlin/java→android；ios/swift/swiftui/uikit/macos/apple→ios；
harmony/harmonyos/ohos/arkts→harmony；kmp/common/shared→kmp）。kmp 与 android/ios/desktop/web 互认；
标签可用 `platform_aliases` 扩展（tivi、kotlinconf）。抽取结果没给 platform 时不扣分。

**路由**（label ↔ routes.json 一条）：任一条件成立即命中——
1. **标识匹配**：标签侧 {route_id, symbol, aliases, serial_name, screen_fn, struct, builder, pattern} 与
   抽取侧 {route_id, symbol, pattern} 归一后有交集。归一：小写；去掉 `()`；`Screen.Home` 同时生成 `screen.home` 与 `home`；
   路由串里 `{x}` `:x` `<x>` `${x}` `\(x)` `%s` 统一成 `{}`，去 scheme://host、query、首尾 `/`。
   若同一 `route_id` 在标签中出现多次（compose-samples 的 `home`），还要求文件处于同一模块目录；
2. **文件匹配**：标签文件在标签集中唯一，且抽取的 `file` 与之“路径后缀相容”（按路径段，从任一方向 endsWith）；
3. **basename 匹配**：同上但只比文件名，且文件名在标签中唯一、不是 `Index.ets`/`FeatureComponent.ets` 这类泛名。
已被判为负例命中的抽取项不能再通过 2/3 给正例“记功”。

**负例**：抽取项的 id 键与负例 symbol（去掉括号注释）相同，且双方都有文件时文件需相容 → 误报。
因此 “测试文件里同名的 `InterestsScreen`” 不会因真实页面被抽到而误判。

**深链**：抽取侧从每条 route 的 `deeplink`（字符串 / 数组 / `{scheme,host,path…}` 对象）、`deeplinks`、`uri`，
以及含 `://` 或以 `/` 开头的 `pattern` 收集。命中条件：scheme 相等（标签 scheme 是占位符或 `resolved_scheme` 相等也算）；
host 相等（标签 host 为空=只要求 scheme；`route-pattern`/`in-app-url` 类允许抽取侧无 scheme/host）；
path 规范化后相等，或抽取 path 以标签 path 为前缀（对应 pathPrefix/pathStartWith 语义）。

**testID**：`tid` 相等（模板占位统一成 `*` 后做通配比较）且抽取 `file` 与标签 `file` 或 `alt_files` 路径后缀相容
（抽取侧无 file 时不要求）。行号只做附加统计。

**API**：method 大写比较（抽取侧缺失/ANY/* 视为通配并单独计数）；path 规范化：去 scheme+host、query，
参数占位统一为 `{}`，再**剥掉开头的通用段** `api|rest|w|rest.php|rest_vN|vN|纯数字|{}`（至少保留一段），然后全等比较。
因此 `/api/v1/bookmarks` ≡ `bookmarks`，`/{year}/conference` ≡ `conference`，`%s/api/2/devices/%s.json` ≡ `{baseFolder}/api/2/devices/{username}.json`。

**声明**：标签 `text` 与 requirements 的 `text` 计算相似度 = max(Dice, 0.85·包含率·长度惩罚)，分词为英文词 + 中日韩字二元组，
同 source 文件名 +0.05；≥阈值(默认 0.35) 的候选按分数贪心一对一匹配。状态映射：
conflict/contradicted/mismatch/outdated/stale/fail… → `conflict`；unverified/unknown/no_evidence… → `unverifiable`；
verified/pass/ok/consistent/implemented… → `verified`。

## 5. 已知歧义与困难样本

* **“页面”的粒度**：Appyx FlowNode、TCA Destination、HorizontalPager 子页、Dialog、Activity 外壳、Mac 窗口里的 pane
  都可能被认为是/不是页面；有争议的标 `optional` 或 `borderline`，不进主分数。
* **同名不同物**：kotlinconf `data object ScheduleScreen`（路由）与 `fun ScheduleScreen`（Composable）；
  HarmonyOS-Cases `addressexchange/AddressExchangeView` 路由装饰在 `FeatureComponent.ets` 的同名 struct 上，而 `view/AddressExchangeView.ets` 里另有同名组件（负例）；
  NextE 的 `ReaderSettingsPage` 既是 routerMap 分支也被别处嵌入。
* **配置文件名变体**：`route_map.json` vs `router_map.json`（Cases、fishpi），只能通过 `module.json5` 的 `routerMap: $profile:xxx` 找到；
  fishpi 的 `.navDestination()` 回调是空实现，真实路由全部走系统 routerMap。
* **间接分发**：NextE `pushPathByName` 名 → `IndexRouteCoordinator` 字符串表 → `wrapBuilder` 表 → Builder → Page，四跳。
* **集中常量的 testID**：element-x / wikipedia 的 testID 值定义在常量对象里，使用处只有常量名；值是自然语言（"Article View"）。
* **完全没有 testID 的仓库**（Mastodon、isowords、kickstarter、NetNewsWire、KaMPKit、kotlinconf、fishpi、compose-samples main）：
  Mastodon UI 测试用的是本地化文案 `app.buttons["Log In"]`，**不是** testID。
* **API 难例**：isowords 的 Parser-DSL 路由；Mastodon/NetNewsWire/Wikipedia 的 `appendingPathComponent`/`additionalPathComponents` 拼接；
  AntennaPod `String.format` + `new URI`；kickstarter 部分字面量缺少前导 `/`；NextE `${EhConstants.baseUrl(isEx)}/uconfig.php`；
  Element 几乎所有请求经 matrix-rust-sdk，不可见。
* **深链难例**：kickstarter 42 条路由模式在代码表里而非 plist；NetNewsWire `nnw://` 未注册但可用；Element `@string/` 占位 scheme；
  tivi `${applicationId}`；Wikipedia `*.wikipedia.org` 通配 host（打分器按字面比较）。
* **文档声明**：“86 modules”“nearly 600 screenshots”“3 stores” 等**数量过时**；README 链接路径失效（compose-samples Jetcaster/app、
  kickstarter Library/ViewModels、HarmonyOS-Cases 的 harInit 文档）；“Never use android.util.Log” 在 Element 中有一处 import（判 conflict，但可争议）；
  tivi `app.tivi.debug` 回调（gradle 无 applicationIdSuffix，仅 fastlane 提到）判 unverifiable。
* 只标了样本：routes 的“未覆盖抽取数”不能当误报；精确率只通过负例估计。
* tivi 的 Screen 定义在 commonMain，标签平台写 android 并通过 `platform_aliases` 允许 kmp/ios/desktop。

## 6. 复现

5 个新仓库在 `repos/` 下用 `git clone --depth 1 --filter=blob:limit=2m` 获取；其余 11 个复用
`/tmp/claude-0/-home-user-axios/f608cc50-0c09-5f4c-8195-0e8da779e294/scratchpad/oss2/` 下的只读克隆（未修改）。
运行抽取器前请 `git checkout <commit>` 到标签中的 SHA。
