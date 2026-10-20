# 真实开源项目验证

本文记录 `kb scan`、facts、`kb bench` 和 `kb compound`（template 模式）在 5 个公开项目上的运行结果。所有项目都以只读方式浅克隆到临时目录，wiki 通过 `--config` 写到项目目录之外，不修改被测仓库。测试于 2026-10-20 进行，机器为 4 核容器。

| 项目 | 平台 | commit | 说明 |
|---|---|---|---|
| [android/nowinandroid](https://github.com/android/nowinandroid) | Android（Kotlin、Compose、Navigation 3） | `a49ed25` | Google 官方示例应用 |
| [Dimillian/IceCubesApp](https://github.com/Dimillian/IceCubesApp) | iOS（SwiftUI，多 Swift Package） | `98098b9` | 真实上架的 Mastodon 客户端 |
| [HarmonyOS-Cases/Cases](https://github.com/HarmonyOS-Cases/Cases) | HarmonyOS NEXT（ArkTS、Navigation、router_map.json） | `f6602bc` | 华为官方案例集 |
| [openharmony/applications_app_samples](https://github.com/openharmony/applications_app_samples)（sparse：`code/BasicFeature`、`code/UI`） | OpenHarmony（ArkTS） | `a826ab0` | OpenHarmony 官方示例 |
| [liuchao0739/arkTS_universal_starter](https://github.com/liuchao0739/arkTS_universal_starter) | HarmonyOS（ArkTS） | `0ca845f` | 社区 ArkTS 脚手架 |

## 解析成功率（tree-sitter，按语言统计）

只要文件的语法树中出现 ERROR 或 MISSING 节点，就记为 `parse_failure`。这类文件仍会尽量抽取符号，扫描不会中断。

| 语言 | 文件数 | 失败 | 无错解析率 | 来源 |
|---|---|---|---|---|
| Kotlin | 311 | 0 | **100%** | nowinandroid |
| Swift | 431 | 2 | **99.5%** | IceCubesApp |
| ArkTS (.ets) | 3858（1952 + 1828 + 78） | 0（修补前 4） | **100%**（修补前 99.9%） | Cases、app_samples、starter |
| TypeScript | 978 | 0 | 100% | Cases、app_samples、starter |
| JavaScript | 124 | 0 | 100% | 同上 |

失败原因如下，都属于语法本身的限制，不是抽取器 bug：

- **ArkTS（修补前 4 个文件）**：ArkUI 属性方法调用的参数里带尾逗号，例如 `.tabBar(this.TabBarBuilder(...),)`，或者 `),\n )`。上游语法不支持这种写法。我们给 vendored 的 `grammar.js` 打了补丁（`arkui_arguments` 允许尾逗号），并用 tree-sitter-cli 0.24.4（ABI 14）重新生成 `parser.c`。补丁之后 3858 个 ArkTS 文件**全部无错解析**。补丁内容见 `internal/grammars/arkts/VENDORED.md`，回归测试见 `TestTrailingCommaInArkUIArguments`。
- **Swift（2 个文件）**：用最小样例逐一复现后确认是两种写法：
  1. `NotificationService.swift`：`unsafeBitCast(x, to: (@Sendable (T) -> Void).self)`，带属性的函数类型作为元类型表达式；
  2. `TimelineViewModel.swift`：`} else if await datasource.isEmpty {`。`if await x.y {` 中条件后面的 `{` 被当成 `y` 的 trailing closure（`if await x {`、`if (await x.y) {` 都能解析）。之前把原因记成了 `if let marker {`，这是误判：单独测试时这种写法能正常解析。

  **上游复查（第 5 轮，限时 25 分钟）**：本仓库固定的是 `with-generated-files` 分支的最新提交 `82bb3a5`（0.7.4）。上游 `main` 已到 `9e3b87f`（2026-10-13），0.7.4 之后有 7 个提交，内容是 switch case 里后续语句的属性、修饰符、`open` 标识符，以及编译指令越界读取。我们用 tree-sitter-cli 0.24.4 从 `main` 重新生成 parser，两个真实文件和上面两个最小样例**仍然失败**。所以不升级，等上游修复。这两个文件仍会抽取符号，只是抽取结果可能不完整。

ArkTS 语法的上游 README 给出的真实工程无错解析率约为 94%。在这次 3858 个 HarmonyOS NEXT / OpenHarmony 文件上，实测为 99.9%；打上尾逗号补丁后为 100%。

## 抽取结果与耗时

| 项目 | 文件 | 符号 | 路由 | 深链 scheme | testID | API（第 4 轮适配器后） | 冷扫描 | 热扫描 |
|---|---|---|---|---|---|---|---|---|
| nowinandroid | 311 | 1,748 | 5 | —（只有 https App Links） | 14 | 4 | 690 ms | 97 ms |
| IceCubesApp | 432 | 6,058 | 28 | `icecubesapp` | 0 | 78 | 2,245 ms | 274 ms |
| HarmonyOS-Cases | 2,267 | 20,141 | 88 | — | 1,437 | 7 | 9,105 ms | 853 ms |
| app_samples（sparse） | 2,612 | 51,342 | 10 | — | 2,674 | 1 | 32,043 ms | 3,935 ms |
| arkTS_universal_starter | 80 | 863 | 0 | — | 1 | 0 | 399 ms | 33 ms |

在 nowinandroid、IceCubesApp 和 HarmonyOS-Cases 上都跑了完整的 `kb compound`（template 模式），`kb verify` 均通过：

| 项目 | 页面 | 锚点 |
|---|---|---|
| IceCubesApp | 36 | 217 |
| HarmonyOS-Cases | 95 | 618 |

几点说明：

- **API 适配器（第 4 轮新增）**：

  | 平台 | 已支持的写法 |
  |---|---|
  | Android | Retrofit（含相对路径 `@GET(value = "topics")`）、Ktor `client.get("/x")`、OkHttp `Request.Builder().url(…).post(…)` |
  | iOS | `send(.post, path:)`、Alamofire `AF.request(url, method:)`、Moya `TargetType` 和自定义 `Endpoint` 枚举（`path` / `method` 的 switch，包括 Swift 5.9 的隐式 return；HTTP 方法按调用点 `client.post(endpoint: X.y)` 推断） |
  | HarmonyOS | `http.createHttp().request`、`httpRequest.request`、`@ohos/axios`（`axios.get<T>(…)`、`axios({url, method})`）、RCP（`session.get/post`、`new rcp.Request(url, 'PUT')`） |

  结果变化：
  - nowinandroid：0 → 4，Retrofit 相对路径；
  - IceCubesApp：0 → **78**，`Endpoint` 枚举 + 调用点方法，覆盖 GET / POST / PUT / PATCH / DELETE；
  - HarmonyOS-Cases：5 → 7，并过滤了图片和媒体下载；
  - app_samples：0 → 1。

  每种写法都有最小片段测试（`internal/facts/apis_test.go`）。另外两个修复：
  - 抽取器之前把 Kotlin 字符串里的 `"$BASE_URL/x"` 当作字面量，现在改为常量引用；
  - ArkTS 的 `await x.get<T>(…)` 现在能正确识别接收者。
- **app_samples 冷扫描慢的原因**：sparse 子集里有一些大的生成 TS/JS 文件，而且 5 万多个符号在引用解析阶段占了较多时间。热扫描只需 3.9 s。

## ingest（断言核对）耗时：大仓库上的超线性问题（第 6 轮）

在 app_samples（51,342 个符号，71 篇文档，67 条断言）上，`kb ingest` 运行超过 13 分钟仍未结束，最后被手动终止。用 `KB_CPUPROFILE=cpu.prof KB_CPUPROFILE_SECS=80 kb ingest …` 采样，再用 `go tool pprof -top -cum` 查看，结果如下：

| 阶段 | 热点 | 原因 |
|---|---|---|
| 修复前 | `Checker.tokenSearch` 占 68%，其中 regexp 占 58% | 每个反引号片段都要对**每个符号**的函数体跑一次正则，复杂度是 O(片段数 × 符号数)；`symbolText` 还会为每个符号重新读一遍文件 |
| 第一版索引 | `tokenIndex` 占 91% | 嵌套符号（类包含方法）把同一段文本重复分词了很多次 |
| 修复后 | 断言核对不再是热点，剩下的时间主要花在扫描（`ResolveRefs`）上 | 见下 |

修复方式：

- 每个文件只分词一次。每一行映射到覆盖它的**最小符号**，建立“token → 候选符号”索引。带点的名字只在候选符号上再用正则确认。
- 文件内容按文件缓存，不再按符号重复读取。
- `normLit` 改为逐字节处理，不再用 `strings.Fields`。

| app_samples（71 篇文档） | 耗时 |
|---|---|
| 修复前 | > 13 分钟（手动终止） |
| 修复后，扫描缓存已就绪 | **26 s** |
| 修复后，冷启动（含约 70 s 的全量扫描） | 83 s |
| Cases（180 条断言，冷启动） | 17 s |
| axios（411 条断言） | 2 s |

回归测试：`TestCheckerScalesWithTokenIndex` 用 500 条断言对 15,300 个符号做核对，要求在 30 s 内完成，实测约 2 s。基准测试是 `BenchmarkCheckerClaims`：200 条断言、15,300 个符号，每次约 0.8 s，其中包括建索引。

## 验证中发现并修复的问题（均已加最小片段回归测试）

回归测试位于 `internal/facts/realworld_test.go`，只包含最小代码片段，不含第三方代码。

1. **Kotlin 类型安全导航没有被识别为路由**（nowinandroid）
   - 现象：Navigation 2.8 的 `composable<T>` 和 Navigation 3 的 `entry<T>` 都没有产出路由。
   - 修复：
     - 抽取泛型实参，`route_id` 取自 key 类型名（去掉 `NavKey`、`Route`、`Destination` 后缀），pattern 取自 key 的构造参数，例如 `topic/{id}`。
     - 补上一个 tree-sitter-kotlin 的歧义：不带括号的 `entry<Key> { … }` 会被解析成 `(entry < Key) > {lambda}` 这样的比较表达式，现已单独识别。
   - 效果：0 → 5 条路由，全部指向正确的 `*Screen`。
2. **SwiftUI 带关联值的路由枚举没有被识别**（IceCubesApp）
   - 现象：`navigationDestination(for: RouterDestination.self)` 配合 `case accountDetail(id: String)` 时没有产出路由。
   - 修复：识别这种写法，生成 `account_detail/{id}`，并关联到 `AccountDetailView`。
   - 效果：0 → 28 条路由。
3. **router_map.json 引用了不存在的 buildFunction**（HarmonyOS-Cases）
   - 现象：`test/performance/web_import/.../router_map.json` 中的 `pageOne` 指向 `Second.ets#PageOneBuilder`，但该文件里只有 `PageTwoBuilder`，这是上游仓库自身的 bug。这导致 verify 因 `E_SYMBOL_UNKNOWN` 拒绝发布。
   - 修复：改为在 facts 的 “Extractor warnings” 中报告，路由的 `symbol` 置空。
4. **非应用 scheme 被当作深链**（HarmonyOS-Cases）
   - 现象：`module.json5` 中的 `file://` 被记成了深链 scheme。
   - 修复：现在会忽略 `http/https/file/content/mailto/tel/data/geo/sms`。
5. **符号解析误选测试代码**（nowinandroid）
   - 现象：`InterestsScreen` 被解析到了 `androidTest` 里的同名成员。
   - 修复：同名候选优先选生产代码和顶层声明。

## 复现

```bash
O=/tmp/oss; mkdir -p $O/cfg && cd $O
git clone --depth 1 https://github.com/android/nowinandroid
cat > cfg/nowinandroid.yaml <<'Y'
version: 1
wiki_dir: ../cfg/nowinandroid-wiki
platforms: [{name: android, root: .}]
exclude: ["**/build/**", "**/.git/**"]
Y
KB_NO_CACHE=1 kb scan  --root nowinandroid --config cfg/nowinandroid.yaml --json | jq '{files, total_symbols, facts}'
kb bench --root nowinandroid --config cfg/nowinandroid.yaml
(cd nowinandroid && kb --root . --config ../cfg/nowinandroid.yaml compound && kb --root . --config ../cfg/nowinandroid.yaml verify)
```
