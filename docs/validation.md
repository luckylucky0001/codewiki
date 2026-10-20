# 真实开源项目验证

本文记录 codewiki 在 **23 个公开仓库**上的只读验证：`kb init`、`kb scan`（facts）、`kb bench`（冷 / 热扫描）、`kb compound --llm template`、`kb verify`、`kb routes`、`kb lint-tid --top`、`kb parity`、`kb discover-docs` + `kb ingest`（用仓库自带的 README / docs 测假冲突率），以及峰值 RSS 和 wiki 体积。

- 第 1–6 轮在 nowinandroid、IceCubesApp、HarmonyOS-Cases、openharmony app_samples、arkTS_universal_starter、axios 上进行，结论见文末“历史轮次”。
- 第 7 轮（2026-10-20）新增 17 个仓库，覆盖以下类型：
  - Android：Compose、Fragment nav-graph、Appyx 多模块；
  - iOS：UIKit + SwiftUI；
  - HarmonyOS NEXT：社区应用和华为官方模板；
  - KMP。

  修复完成后，用最终代码把**全部 23 个仓库重跑了一遍**，下表数字都来自这次重跑。

所有仓库都以 `--depth 1` 浅克隆到临时目录，wiki 通过 `--config` 写到仓库之外。不修改被测仓库，也不提交第三方代码。测试机为 4 核共享容器，单次计时有约 ±30% 的噪声；同机 A/B 对比见“规模”一节。

## 项目清单

| 项目 | 平台 / 技术栈 | commit |
|---|---|---|
| [android/nowinandroid](https://github.com/android/nowinandroid) | Android，Compose，Navigation 3 | `a49ed25` |
| [android/compose-samples](https://github.com/android/compose-samples) | Android，6 个 Compose 应用（Jetnews / Jetcaster mobile·tv·wear / Reply / Jetchat / Jetsnack） | `0bc770f` |
| [android/sunflower](https://github.com/android/sunflower) | Android，Compose Navigation | `2a357a3` |
| [android/architecture-components-samples](https://github.com/android/architecture-components-samples) | Android，Fragment + nav-graph XML，Java/Kotlin | `e849ce3` |
| [element-hq/element-x-android](https://github.com/element-hq/element-x-android) | Android，大型多模块（4,355 个 .kt），Appyx | `85b63e5` |
| [JetBrains/kotlinconf-app](https://github.com/JetBrains/kotlinconf-app) | KMP，Compose Multiplatform（commonMain）+ iosApp | `907ce23` |
| [touchlab/DroidconKotlin](https://github.com/touchlab/DroidconKotlin) | KMP，android/ + ios/ + shared-ui | `27f3e87` |
| [Dimillian/IceCubesApp](https://github.com/Dimillian/IceCubesApp) | iOS，SwiftUI，多 Swift Package | `98098b9` |
| [apple/sample-food-truck](https://github.com/apple/sample-food-truck) | iOS，纯 SwiftUI，NavigationSplitView / NavigationStack | `3954a76` |
| [nalexn/clean-architecture-swiftui](https://github.com/nalexn/clean-architecture-swiftui) | iOS，SwiftUI NavigationStack(path:) | `9eca97b` |
| [Ranchero-Software/NetNewsWire](https://github.com/Ranchero-Software/NetNewsWire) | iOS + macOS，UIKit / AppKit | `94032d9` |
| [kickstarter/ios-oss](https://github.com/kickstarter/ios-oss) | iOS，UIKit + SwiftUI，URL 深链路由表 | `5f5463c` |
| [wikimedia/wikipedia-ios](https://github.com/wikimedia/wikipedia-ios) | iOS，UIKit + SwiftUI + Objective-C | `427f61d` |
| [HarmonyOS-Cases/Cases](https://github.com/HarmonyOS-Cases/Cases) | HarmonyOS NEXT，router_map，多 HAR/HSP | `f6602bc` |
| [openharmony/applications_app_samples](https://github.com/openharmony/applications_app_samples)（sparse：`code/BasicFeature`、`code/UI`） | OpenHarmony，main_pages + router | `a826ab0` |
| [AppGalleryConnect/agc-template-market-harmonyos-demos](https://github.com/AppGalleryConnect/agc-template-market-harmonyos-demos)（sparse：`NavigationTemplate`、`ShoppingTemplate`） | HarmonyOS NEXT，华为官方模板，多模块 router_map | `3d4b8ed` |
| [erosTeam/NextE](https://github.com/erosTeam/NextE) | HarmonyOS NEXT，Navigation + pushPathByName，HdsNavDestination | `7cc8d63` |
| [Yebingiscn/SweetVideo](https://github.com/Yebingiscn/SweetVideo) | HarmonyOS NEXT，Navigation，ComponentV2 / Repeat | `f0da844` |
| [FishPiOffical/fishpi-harmony](https://github.com/FishPiOffical/fishpi-harmony) | HarmonyOS NEXT，`$profile:route_map` | `591cd12` |
| [ausboyue/Wechat_HarmonyOS](https://github.com/ausboyue/Wechat_HarmonyOS) | HarmonyOS NEXT，router.pushUrl + main_pages | `38a1671` |
| [linwu-hi/open_neteasy_cloud](https://github.com/linwu-hi/open_neteasy_cloud) | HarmonyOS（API 9 风格），router.pushUrl | `b562a70` |
| [liuchao0739/arkTS_universal_starter](https://github.com/liuchao0739/arkTS_universal_starter) | HarmonyOS，ArkTS 脚手架 | `0ca845f` |
| [axios/axios](https://github.com/axios/axios) | JS / TS 库（只验证 ingest 和 API 抽取） | `56a5f1a` |

## 汇总表（最终代码，全部 23 个仓库）

列的含义：

| 列 | 含义 |
|---|---|
| 文件 | 扫描到的源文件数 |
| 无错率 | 语法树中没有 ERROR / MISSING 节点的文件比例 |
| 召回 | 见下一节的逐项对照 |
| 冷 / 热扫描 | 来自 `kb bench` |
| RSS | scan、compound、ingest 三者中的峰值 |
| 页 / index | compound 之后的页面数，以及 `index.md` 的字节数（约等于 token 数 × 4） |
| 断言 / 冲突（假） | 对仓库自带文档运行 `kb ingest` 后得到的断言数和冲突数；括号内是人工判定为**假冲突**的数量 |

| 项目 | 语言构成 | 文件 | 无错率 | 符号 | 路由 | 召回 | testID | API | 冷 / 热扫描 | compound | RSS | 页 / index | verify | 断言 / 冲突（假） |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| nowinandroid | Kotlin | 311 | 100% | 1,748 | 5 | 5/5 | 14 | 4 | 0.8 / 0.09 s | 0.9 s | 58 MB | 10 / 1.2 KB | PASS | 22 / 0 |
| compose-samples | Kotlin | 364 | 98.9% | 2,831 | 30 | 30/30 | 1 | 0 | 1.4 / 0.16 s | 1.3 s | 75 MB | 28 / 2.4 KB | PASS | 34 / 0 |
| sunflower | Kotlin | 66 | 100% | 368 | 3 | 3/3 | 1 | 1 | 0.15 / 0.02 s | 0.2 s | 23 MB | 8 / 1.0 KB | PASS | 0 / 0 |
| architecture-components-samples | Kotlin 208 + Java 88 | 296 | 100% | 1,841 | 19 | 19/19 | 0 | 8 | 0.6 / 0.09 s | 0.7 s | 52 MB | 20 / 2.0 KB | PASS | 11 / 0 |
| element-x-android | Kotlin | 4,355 | 98.6% | 22,161 | 176 | 176/179 | 0 | 2 | 11.0 / 1.7 s | 11.6 s | 667 MB | 181 / 2.8 KB | PASS | 103 / 0 |
| kotlinconf-app（KMP） | Kotlin 261 + Swift 2 | 263 | 95.1% | 1,442 | 25 | 25/25 | 0 | 25 | 0.6 / 0.07 s | 0.8 s | 51 MB | 30 / 3.1 KB | PASS | 22 / 0 |
| DroidconKotlin（KMP） | Kotlin 202 + Swift 7 | 209 | 99.0% | 1,066 | 0 | 不支持 | 0 | 0 | 0.4 / 0.05 s | 0.5 s | 41 MB | 5 / 0.9 KB | PASS | 14 / 0 |
| IceCubesApp | Swift | 432 | 99.5% | 6,058 | 42 | 28 + 14 | 0 | 78 | 1.9 / 0.22 s | 3.9 s | 98 MB | 47 / 4.6 KB | PASS | 22 / 0 |
| sample-food-truck | Swift | 82 | 97.6% | 1,180 | 10 | 10/11 | 0 | 0 | 0.5 / 0.06 s | 0.5 s | 33 MB | 15 / 1.5 KB | PASS | 4 / 1（0） |
| clean-architecture-swiftui | Swift | 63 | 90.5% | 788 | 1 | 1/2 | 0 | 0 | 0.25 / 0.03 s | 0.3 s | 26 MB | 6 / 0.8 KB | PASS | 2 / 0 |
| NetNewsWire | Swift（另有 10 个 .m 未解析） | 728 | 97.9% | 12,528 | 0 | 不支持（UIKit/AppKit） | 0 | 8 | 4.3 / 0.44 s | 4.5 s | 178 MB | 5 / 0.7 KB | PASS | 13 / 0 |
| kickstarter/ios-oss | Swift | 2,080 | 92.5% | 37,731 | 48 | 深链 39/39，另 7 条 | 0 | 19 | 13.9 / 2.2 s | 15.1 s | 524 MB | 43 / 3.7 KB | PASS | 6 / 0 |
| wikipedia-ios | Swift（另有 208 个 .m 未解析） | 1,449 | 98.3% | 31,452 | 0 | 不支持（UIKit 协调器） | 28 | 1 | 12.4 / 1.8 s | 11.6 s | 520 MB | 5 / 0.7 KB | PASS | 150 / 1（0） |
| HarmonyOS-Cases | ArkTS 1,952 + TS 314 | 2,267 | 100% | 20,141 | 191 | 抽查 15/15 | 1,437 | 7 | 6.3 / 0.9 s | 7.0 s | 377 MB | 193 / 1.3 KB（分层） | PASS | 180 / 0 |
| app_samples（sparse） | ArkTS 1,828 + TS/JS 784 | 2,612 | 100% | 51,342 | 416 | 抽查 12/12 | 2,674 | 1 | 18.3 / 3.2 s | 20.1 s | 886 MB | 421 / 4.1 KB（分层） | PASS | 67 / 0 |
| agc 模板（sparse） | ArkTS 2,286 + TS 149 | 2,437 | 99.5% | 18,460 | 252 | router_map 143/143 | 34 | 8 | 7.0 / 1.0 s | 7.7 s | 353 MB | 166 / 3.3 KB（分层） | PASS | 2 / 0 |
| NextE | ArkTS 624 + JS/TS 100 | 725 | 99.7% | 19,921 | 66 | 页面 51/51 | 630 | 0 | 8.1 / 1.0 s | 8.3 s | 386 MB | 71 / 7.0 KB | PASS | 3,351 / 4（3） |
| SweetVideo | ArkTS 268 + TS 15 | 283 | 90.8% | 5,084 | 26 | 页面 24/24 | 25 | 0 | 3.0 / 0.29 s | 3.1 s | 142 MB | 31 / 3.0 KB | PASS | 35 / 0 |
| fishpi-harmony | ArkTS | 80 | 100% | 1,004 | 11 | 11/11 | 0 | 52 | 0.4 / 0.04 s | 0.5 s | 32 MB | 16 / 1.6 KB | PASS | 0 / 0 |
| Wechat_HarmonyOS | ArkTS | 38 | 97.4% | 257 | 4 | 4/4 | 3 | 0 | 0.14 / 0.01 s | 0.2 s | 22 MB | 9 / 1.2 KB | PASS | 0 / 0 |
| open_neteasy_cloud | ArkTS | 18 | 100% | 782 | 3 | 3/3 | 0 | 0 | 0.7 / 0.02 s | 0.7 s | 34 MB | 8 / 1.1 KB | PASS | 0 / 0 |
| arkTS_universal_starter | ArkTS | 80 | 100% | 863 | 17 | 17/17 | 1 | 0 | 0.4 / 0.03 s | 0.4 s | 31 MB | 22 / 2.3 KB | PASS | 27 / 0 |
| axios | JS 194 + TS 29 | 243 | 100% | 1,009 | — | — | — | 105 | 0.9 / 0.06 s | 0.8 s | 55 MB | 5 / 0.7 KB | PASS | 411 / 0 |

注：

- 冷 / 热扫描：IceCubesApp、Cases、app_samples、kickstarter、element-x 这 5 个大仓库取“规模”一节的同机 A/B 测量值，其余仓库取最终重跑的 `kb bench`。
- 23 个仓库全部通过 `kb verify`。每个仓库验证两次：compound 之后一次，ingest 之后一次，结果都是 PASS。
- KMP 仓库的平台根配置：
  - kotlinconf-app：android `.` + ios `app/iosApp`；
  - DroidconKotlin：android `.` + ios `ios`。

  两个根重叠时，每个文件只归属更深的那个根（见调优 #1）。`kb parity` 在 kotlinconf-app 上报告 0 处差异；修复前有 25 处假缺口（见 #9）。
- HarmonyOS-Cases 是 200 多个独立示例的集合，没有一份统一的“页面清单”可以对照。它的 191 条路由来自：
  - 88 条 router_map；
  - main_pages 页面；
  - pushPathByName 名称；
  - NavDestination 组件。

  随机抽查 15 条，全部指向真实页面。app_samples 也是同样的抽查方式。
- testID：`kb lint-tid --top 5` 的结果如下：
  - NextE：101 个不同 testID，出现次数最多的是 `rkit-close`（72 次，分布在 17 个文件）；
  - wikipedia-ios：27 个，来自 `accessibilityIdentifier`。
- 峰值 RSS 都出现在 compound 阶段。最高的两个是 app_samples（5.1 万符号，886 MB）和 element-x（667 MB）。

## 路由召回对照

每个仓库先用 grep 独立列出“应该被识别的屏幕 / 目的地”，再与 `kb routes` 全量对照，不是只抽查 10 条。

| 项目 | 基准（grep / 人工列出） | 识别 | 未识别的原因 |
|---|---|---|---|
| sunflower | 3 处 `composable(...)` | 3 | — |
| architecture-components-samples | 7 个 nav-graph XML 中的 19 个 `<fragment>/<dialog>` 目的地 | 19 | — |
| compose-samples | 30 处 `composable` / `composable<T>` / `entry<T>`（另有 1 处是 wrapper 自己的 `route` 参数，不计入） | 30 | — |
| element-x-android | 179 处 `sealed interface NavTarget` 子类定义 | 176 | 3 处未逐一分析 |
| kotlinconf-app | 25 处 `entry<…Screen>` | 25 | — |
| DroidconKotlin | 自定义 `NavigationController` | 0 | 不支持（见局限） |
| IceCubesApp | 28 个 `RouterDestination` case，加 14 个 `NavigationLink(destination:)` 设置页 | 42 | — |
| sample-food-truck | 9 个 `Panel` case、订单详情、甜甜圈详情 | 10 | 甜甜圈详情的 `navigationDestination` 闭包会构造多个视图，按规则不猜 |
| clean-architecture-swiftui | 国家详情、邻国详情 | 1 | `NavigationLink(destination: self.neighbourDetailsView(...))` 是方法调用 |
| kickstarter/ios-oss | `allRoutes` 路由表中的 39 条 URL（不含 `/`） | 39，另有 7 个 SwiftUI 筛选页 | UIKit `ViewController` 跳转不支持 |
| NetNewsWire / wikipedia-ios | UIKit / AppKit 协调器、storyboard | 0 | 不支持 |
| NextE | 51 个 `NavDestination` / `HdsNavDestination` 页面组件 | 51（共 66 条路由，其中 15 条是只在 pushPathByName 中出现的名称） | — |
| SweetVideo | 24 个 `NavDestination` 页面 | 24 | — |
| fishpi-harmony | `$profile:route_map` 中 10 条，加 1 个 NavDestination 页 | 11 | — |
| Wechat_HarmonyOS | main_pages 中 5 页（`pages/Index` 是 Navigation 宿主，不算路由） | 4 | — |
| open_neteasy_cloud | main_pages 中 3 页 | 3 | — |
| agc 模板 | 143 个唯一 router_map 名称（227 条记录）、7 个 main_pages 页、14 个 pushPathByName 名称 | 252；143 个 router_map 名称全部覆盖 | — |
| arkTS_universal_starter | main_pages 与 NavDestination 共 17 页 | 17 | — |

## 文档核对：假冲突率

用 `kb discover-docs` 找出仓库自带的全部文档并 ingest，包括 README、CLAUDE.md / AGENTS.md、docs/、贡献指南等。每个冲突都经过人工判定。

| 阶段 | 冲突总数（新增 17 个仓库） | 真冲突 | 假冲突 |
|---|---|---|---|
| 修复前（第 7 轮首跑） | 191（NextE 183、wikipedia 4、kickstarter 2、DroidconKotlin 1、food-truck 1） | 4 | 187 |
| 修复后 | 6（NextE 4、wikipedia 1、food-truck 1） | 3 | 3 |

- **真冲突**（3 个）：
  - food-truck 的 README 让读者修改 `AccountManager.swift`，该文件已改名为 `AccountStore`；
  - wikipedia-ios 文档写的是 `.github/workflows/localization-update.yaml`，实际文件是 `localization.yml`；
  - NextE 文档里的 `EhErrorType.sadPanda`，在代码中是 `EhErrorKind.SadPanda`。
- **剩余假冲突**（3 个，均在 NextE）：
  - “存在时的根 `package.json`”，是条件句；
  - HAP 包内的 `module.json`，是构建产物；
  - 一句“不超过 12 字符”被拿去和无关的 `MAX_LLM_*` 常量比较。
- **axios**：修复 #21 之前有 8 个冲突，属于同一类假冲突：`MockAdapter` 来自外部包 axios-mock-adapter，英、中、法、西 4 种语言的文档里各有 2 条。修复后为 0。
- NextE 有 3,351 条断言，修复后冲突率为 0.12%，其中假冲突占 0.09%。

## 调优记录（第 7 轮）

每一项都有最小片段回归测试，不含第三方代码。测试分布在以下文件：

- `internal/facts/realworld2_test.go`
- `internal/engine/engine_test.go`
- `internal/scan/scan_test.go`
- `internal/config/config_test.go`
- `internal/wiki/wiki_test.go`

**1. `kb init` 平台检测与 KMP 重叠根**

- 问题：`kb init` 只认 `android/`、`ios/`、`app/` 等目录。
  - 多模块 Gradle 项目只扫 `app/`；
  - 根目录有 `.xcodeproj` 的 iOS 仓库，以及 HarmonyOS NEXT 单应用仓库，什么都检测不到；
  - KMP 仓库的 android `.` 与 ios `iosApp` 重叠时，文件会被扫两遍。
- 修复：按根目录标记检测平台。
  - `settings.gradle(.kts)` → android `.`；
  - `*.xcodeproj` / `*.xcworkspace` / `Package.swift` → ios `.`，优先于 `iOS/` 子目录；
  - `build-profile.json5` / `AppScope/` / `oh-package.json5` → harmony `.`；
  - KMP 识别 `app/iosApp`；
  - 新增 `Config.Shadowed`：根重叠时，文件只归属最深的根。
- 效果：
  - element-x：20 → 4,355 个文件；
  - NetNewsWire：88 → 728 个文件；
  - wikipedia-ios、kickstarter 和 6 个 HarmonyOS 仓库：从检测不到 → 全部文件。

**2. 升级 kb 后返回旧 facts**

- 问题：查询命令缓存的 facts 只按源码树 stamp 失效，升级 kb 后仍会返回旧 facts。
- 修复：stamp 中加入 kb 二进制的身份。

**3. nav-graph XML 不支持**（architecture-components-samples）

- 修复：`res/navigation/*.xml` 中带 `android:id` 的 `<fragment|dialog|activity|composable>` 都识别为路由。`<argument>` 写入 pattern，`<deepLink>` 写入 deeplink 和 scheme。
- 效果：0 → 19 条路由（19/19）。

**4. Compose 路由引用的几种写法**（compose-samples）

- 问题：
  - `composable(Screen.Discover.route)` 的 route_id 全部变成 `route`；
  - `composable<Route.Inbox>` 不识别；
  - `route =` 具名参数不识别；
  - wrapper 自己的 `route` 参数被当成路由。
- 修复：从引用名推导 id；在 `<`/`>` 歧义下接受限定类型名；只解析常量风格的引用。
- 效果：compose-samples 11 → 27；sunflower 0 → 3。

**5. 多应用仓库中同名屏幕锚错模块**（compose-samples）

- 问题：Jetcaster 的 mobile、tv、wear 都有 `PlayerScreen`，路由会锚到错误的模块；同 id 的路由被全局去重。
- 修复：新增 `findSymNear`，优先选路径前缀最长的候选；按调用点去重。
- 效果：compose-samples 27 → **30/30**。

**6. 清单中的 `@string` scheme**（element-x）

- 问题：`<data android:scheme="@string/x">` 被原样输出为 scheme。
- 修复：从 `res/values/strings.xml` 解析；解析不到就丢弃。
- 效果：`@string/login_redirect_scheme` 不再出现。

**7. HarmonyOS 路由来源不全**

- 问题：
  - `"routerMap": "$profile:route_map"` 指向的文件名不是 `router_map.json` 时，整张表丢失（fishpi）；
  - router.pushUrl 应用的 main_pages 页面没有被当作路由（Wechat、neteasy）；
  - 没有 router_map 的 Navigation 应用产出 0 条路由（NextE、SweetVideo）。
- 修复：
  - 按 module.json5 中的 `$profile:` 读取路由表；
  - main_pages 页面成为路由，锚到 @Entry struct（Navigation 宿主页除外）；
  - `pushPathByName` / `replacePathByName` 的字面量名称成为路由；
  - 局部变量名不再被同名常量误解析。
- 效果：

  | 项目 | 修复前 → 修复后 |
  |---|---|
  | fishpi | 0 → 11 |
  | Wechat | 0 → 4 |
  | neteasy | 0 → 3 |
  | NextE | 0 → 44 |
  | SweetVideo | 0 → 25 |
  | starter | 0 → 17 |
  | Cases | 88 → 176 |
  | app_samples | 10 → 400+ |

**8. 用计算出的名字压栈的页面**（NextE）

- 问题：`pushPathByName(item.route)` 这类写法压栈的页面不可见。
- 修复：`build()` 返回 `NavDestination()` / `HdsNavDestination()` 的组件本身就识别为路由。
- 效果：NextE 35 → **51/51** 页；Cases 176 → 191。

**9. KMP 的 parity 假缺口**（kotlinconf-app）

- 问题：commonMain 中的 Compose Multiplatform 屏幕被 parity 判为“iOS 缺失”。
- 修复：parity 中，commonMain / mobileMain / nonWebMain 里的路由、testID、API 对所有平台生效。
- 效果：kotlinconf-app 的假缺口 25 处 → 0。

**10. SwiftUI 导航的三种写法**（food-truck、IceCubesApp）

- 问题：以下写法都不识别：
  - `navigationDestination(for: Order.ID.self)`（值类型）；
  - `NavigationLink(value: Panel.truck)`（侧栏枚举）；
  - `NavigationLink(destination: XView())`。
- 修复：
  - 值类型：闭包只构造一个项目视图时，识别为路由；路由包装类型和多视图 switch 跳过；
  - `value:` 引用的枚举成为目的地枚举；
  - `destination:` 中的项目视图成为路由。
- 效果：food-truck 0 → 10；IceCubesApp 28 → 42。

**11. URL 路由表**（kickstarter）

- 问题：`["/projects/:id": project]` 这类路由表不识别。
- 修复：名为 `*routes` / `routeTable` / `routeMap` 的顶层属性，如果键是路径，每条都成为深链路由，并锚到处理函数。
- 效果：kickstarter 7 → 48。

**12. Appyx `sealed interface NavTarget`**（element-x）

- 修复：嵌套的 NavTarget 子类识别为目的地，id 带 flow 前缀。
- 效果：element-x 0 → **176/179**。

**13. 规模：热扫描过慢**

- 问题：热扫描耗时几乎是冷扫描的一半。原因在 ResolveRefs：Owner.member 回退对每个引用名都再遍历一遍全部引用名，复杂度 O(R²)，而且单线程。
- 修复：
  - 按成员名查候选，并用引用名集合判断；
  - owner 集合每个符号只算一次；
  - self 判断不再分配内存；
  - 两轮解析并行执行。

  逐符号比对 171,435 条引用，结果完全一致。
- 效果：

  | 项目 / 测试 | 热扫描 修复前 → 修复后 |
  |---|---|
  | kickstarter | 11.6 s → **2.2 s** |
  | element-x | 11.1 s → 1.7 s |
  | app_samples | 10.2 s → 3.2 s |
  | `TestResolveRefsManyRefNamesScales` | 4 s → 0.03 s |

**14. 规模：ingest 过慢**（NextE）

- 问题：`kb ingest` 在 NextE（127 篇文档、3,351 条断言）上耗时 66 s。
- 修复：
  - Checker 的 findSymbols 建索引；
  - 字面量先按文件过滤。normLit 只删除字节，所以这种过滤是精确的；
  - symAtLine 按文件查找；
  - 路由正则做缓存。
- 效果：66 s → **21 s**，`requirements.json` 逐字节一致。

**15. 页面 token 预算**（NextE）

- 问题：`pages/_conflicts.md` 有 2.19 MB，约 55 万 token，其中 frontmatter 锚点就有 5,684 行。
- 修复：verified / unverifiable 段超过 300 条时，只列每篇文档的数量；冲突最多列 1,000 条；汇总后的 verified 段不再锚定页面。
- 效果：2.19 MB → **0.34 MB**。

**16. index.md 过大**（app_samples）

- 问题：app_samples 有 416 条路由，index.md 达到 97 KB（约 2.4 万 token），其中总览一行就有 21 KB。
- 修复：
  - 功能页超过 150 个时，index.md 按模块分组：按路径前缀合并到不超过 40 组，每组链接到 `index/features-<module>.md`；
  - verify 把子索引中的页面视为已索引、可达；
  - 每条索引最多显示 8 个路由 id。
- 效果：app_samples 97 KB → **4.1 KB**；Cases 27.5 KB → 1.3 KB。`llms.txt` 同样改为列出子索引：app_samples 50 KB → 3.5 KB。

**17. wiki 体积**（NextE）

- 问题：`.kb/graph.json` 是缩进 JSON，会随 wiki 一起提交，在 NextE 上有 24 MB。
- 修复：改为 `.kb/graph.json.gz`（紧凑 JSON + gzip），仍能读取旧的 graph.json。
- 效果：24 MB → **3.7 MB**。

**18. 共用的 compound 锁**

- 问题：两个 wiki 位于同一父目录时会共用 `.kb-work/lock`，并行 compound 会互相阻塞。
- 修复：每个 wiki 一把锁，路径为 `.kb-work/lock-<wiki>`。

**19. 符号链接根**

- 问题：`kb --root <符号链接>` 静默扫描 0 个文件，因为 `filepath.WalkDir` 不会进入符号链接根。
- 修复：根目录统一做 `Abs + EvalSymlinks`。
- 效果：0 → 全部文件。

**20. 假冲突**

- 问题：以下情况会被误判为冲突：
  - 计划、归档、调研类文档；
  - “例如 `X`”这类示例名；
  - `.gitignore` 中列出的文件；
  - `.xctestplan`、`.m` 等扩展名未被识别为文件；
  - `./setup.sh` 这种带 `./` 前缀的路径；
  - “Create `X`”这类让读者新建的文件；
  - `vX.Y.Z` 这类路径模板。
- 修复：
  - `docs/plans|archive|completed|research/**` 下的文档不判冲突；
  - 示例名、被忽略的文件、待创建的文件、占位符路径不判冲突；
  - 补全扩展名表；
  - 去掉 `./` 前缀再查找。
- 效果：新仓库的冲突 191 → 6（假冲突 187 → 3）；NetNewsWire 5 → 0。

**21. 外部包中的类名**（axios）

- 问题：文档示例代码 `import MockAdapter from "axios-mock-adapter"` 中导入的 `MockAdapter` 在本仓库找不到，被判为冲突。
- 修复：文档自己的示例代码从外部包导入的名字（ES import / require），不判冲突。从本仓库 package.json 包名导入的名字仍然核对。
- 效果：axios 8 → 0。

**22. Kotlin 单行类体**

- 问题：tree-sitter-kotlin v1.1.0 无法解析“最后一个成员和右花括号在同一行”的类体，例如 `object Routes { const val HOME = "home" }`；而 `{ … ;}` 可以解析。这是在为 compose-samples 写回归片段时发现的。
- 修复：解析前，把这类声明行中最后一个 `}` 前的空格改成 `;`。字节偏移和行号都不变。
- 效果：最小片段从解析失败变为 0 失败。23 个仓库中原有的 78 个 Kotlin 失败属于其他写法（Kotlin 2.x when 守卫等），数量不变。

## 规模

同机、同一时间段，对比修复前（`77c830b`）和修复后的 `kb bench`：

| 项目 | 符号 | 冷扫描 前 → 后 | 热扫描 前 → 后 |
|---|---|---|---|
| IceCubesApp | 6,058 | 2,689 → 1,928 ms | 804 → 220 ms |
| HarmonyOS-Cases | 20,141 | 8,650 → 6,327 ms | 4,006 → 908 ms |
| element-x-android | 22,161 | 19,441 → 10,999 ms | 11,146 → 1,726 ms |
| kickstarter/ios-oss | 37,731 | 22,056 → 13,897 ms | 11,567 → 2,191 ms |
| app_samples | 51,342 | 23,912 → 18,305 ms | 10,248 → 3,160 ms |

- **热扫描**：所有查询命令和 compound 的第一步都要做热扫描。修复后它大致随符号数线性增长，5 万符号约 3 s。
- **峰值 RSS**：也大致线性，约 17 KB / 符号（app_samples 为 886 MB）。在 8 GB 的 CI 机器上，30 万符号以内是安全的。
- **ingest**：

  | 项目 | 断言数 | 耗时 |
  |---|---|---|
  | NextE | 3,351 | 21 s |
  | app_samples | 67 | 8 s |
  | axios | 411 | 1.5 s |
- **wiki 体积**：`.kb/cache/scan.gob.gz` 已加入 gitignore。除它之外，提交到仓库的最大文件曾是 graph.json，见调优 #17。

## 解析成功率（按语言，23 个仓库合计）

| 语言 | 文件 | 失败 | 无错率 |
|---|---|---|---|
| Kotlin | 6,126 | 78 | 98.7% |
| Java | 88 | 0 | 100% |
| Swift | 4,830 | 205 | 95.8% |
| ArkTS | 7,161 | 41 | 99.4% |
| TS / JS | 1,621 | 1 | 99.9% |

失败的主要原因：

- **Kotlin**：Kotlin 2.x 新语法，例如 when 守卫条件 `is X if cond ->`。失败集中在 element-x（59 个）和 kotlinconf（13 个）。
- **Swift**：kickstarter 占 157 个，都是上游 tree-sitter-swift 的限制：
  - 自定义运算符（`|>`、`.~`、`..`）；
  - `associatedtype P: Q where …`；
  - 可选元类型 `Author?.self`。
- **ArkTS**：SweetVideo 占 26 个，写法是：

  ```
  Repeat<T>(…).each((ri) => { Row() { Text(ri.item) }.onClick(() => { this.f(ri.item.index) }) })
  ```

  把这个组合拆开后，各部分单独都能解析。另外 agc 有 12 个。

解析失败的文件仍会抽取符号，只是结果可能不完整。Objective-C 不在支持的语言内，不计入上表（wikipedia-ios 有 208 个 `.m`，NetNewsWire 有 10 个）。

## 不支持 / 局限

- **UIKit / AppKit 导航**：`pushViewController`、storyboard segue、协调器都不产出路由。NetNewsWire、wikipedia-ios 以及 kickstarter 的大部分屏幕属于这种情况。这些仓库的 wiki 只有总览、parity、conflicts 几页，但符号、testID、API 和文档核对仍然可用。
- **自定义导航框架**：DroidconKotlin 的 `NavigationController`、Decompose、Voyager 等不识别。目前支持的导航写法：
  - Navigation 2.8 / 3；
  - nav-graph XML；
  - Appyx `NavTarget`；
  - SwiftUI NavigationStack / NavigationLink / 路由枚举；
  - URL 路由表；
  - HarmonyOS router_map / main_pages / Navigation。
- **动态路由名**：`pushPathByName(name)`、`NavigationLink(destination: self.makeView())` 这类写法的目的地要到运行时才确定，只能靠 NavDestination 组件或视图类型间接覆盖。
- **KMP**：commonMain 的代码按 android 根扫描，在 parity 中视为全平台共享。iosMain / androidMain 的平台差异只按文件所在的根来区分。
- **解析**：Objective-C 不解析。Kotlin 2.x 新语法、Swift 自定义运算符、ArkTS 的 `Repeat.each` 嵌套组合会导致解析失败，详见上一节。
- **假冲突**：以下情况仍会被判为冲突：
  - 外部依赖中的类名，但文档里没有写出 import 语句的情况（#21 只覆盖文档示例代码中 import 过的名字）；
  - 条件句，例如“存在时的 `package.json`”；
  - 构建产物中的文件，例如 HAP 里的 `module.json`。

  反过来，如果文档中的路径相对仓库根写错了、但后缀能匹配到真实文件，会被判为存在。例子是 kickstarter 的 `./Library/Strings.swift`。
- **计时**：数据来自 4 核共享容器，单次测量的噪声约 ±30%。A/B 对比是同机连续运行的结果。

## 历史轮次（第 1–6 轮）

第 1–6 轮在 nowinandroid、IceCubesApp、HarmonyOS-Cases、app_samples、arkTS_universal_starter 和 axios 上进行。下面的数字对应当时的代码，最新数字见汇总表。

1. **Kotlin 类型安全导航**（nowinandroid）
   - 修复：识别 `composable<T>` / `entry<T>`。包括处理 tree-sitter-kotlin 的一个歧义：不带括号的 `entry<Key> { … }` 会被解析成比较表达式。
   - 效果：0 → 5 条路由。
2. **SwiftUI 带关联值的路由枚举**（IceCubesApp）
   - 修复：`navigationDestination(for: RouterDestination.self)` 配合 `case accountDetail(id: String)`，生成 `account_detail/{id}`。
   - 效果：0 → 28 条路由。
3. **router_map.json 引用不存在的 buildFunction**（HarmonyOS-Cases）
   - 这是上游仓库自身的 bug。
   - 修复：改为报告 Extractor warning，不再阻断发布。
4. **非应用 scheme**：`file://` 等不再当作深链。
5. **符号解析优先生产代码**（nowinandroid 的 `InterestsScreen`）。
6. **ArkTS 尾逗号**
   - 修复：给 vendored grammar 打补丁，`arkui_arguments` 允许尾逗号。补丁记录在 `internal/grammars/arkts/VENDORED.md`。
   - 效果：Cases、app_samples、starter 的 3,858 个 ArkTS 文件，无错率从 99.9% 提升到 100%。
7. **Swift 的两个解析失败**（IceCubesApp）
   - 写法：
     - `unsafeBitCast(x, to: (@Sendable (T) -> Void).self)`；
     - `} else if await x.y {`。
   - 上游 `main`（`9e3b87f`）仍未修复，所以没有升级。
8. **API 适配器**
   - 支持的写法：

     | 平台 | 写法 |
     |---|---|
     | Android | Retrofit、Ktor、OkHttp |
     | iOS | `send(.post, path:)`、Alamofire、Moya、自定义 `Endpoint` 枚举 |
     | HarmonyOS | `@kit.NetworkKit` http、`@ohos/axios`、RCP |
     | JS | axios |
   - 效果：nowinandroid 0 → 4；IceCubesApp 0 → 78；Cases 5 → 7。
   - 每种写法都有片段测试（`internal/facts/apis_test.go`）。
9. **ingest 超线性**（app_samples）
   - 修复：断言核对原来是“每个片段 × 每个符号跑一次正则”，改为 token → 候选符号索引。
   - 效果：> 13 分钟 → 26 s。
   - 测试：`TestCheckerScalesWithTokenIndex`、`BenchmarkCheckerClaims`。

## 复现

```bash
O=/tmp/oss; mkdir -p $O/cfg && cd $O
git clone --depth 1 --filter=blob:limit=1m https://github.com/android/compose-samples
cat > cfg/compose-samples.yaml <<'Y'
version: 1
wiki_dir: compose-samples-wiki          # 相对 config 文件所在目录，即 wiki 写在仓库之外
platforms: [{name: android, root: .}]   # 也可以先用 kb init --dry-run 看检测结果
exclude: ["**/build/**", "**/.git/**"]
Y
R="--root compose-samples --config cfg/compose-samples.yaml"
KB_NO_CACHE=1 kb scan $R --json | jq '{files, total_symbols, facts, parse_failures: (.parse_failures|length)}'
kb bench $R && kb compound $R --llm template && kb verify $R
kb routes $R && kb lint-tid --top 5 $R && kb parity $R
kb discover-docs $R --json > docs.json && kb ingest --manifest docs.json $R && kb conflicts $R
```

KMP 仓库要配置两个平台根，例如 `platforms: [{name: android, root: .}, {name: ios, root: app/iosApp}]`。
