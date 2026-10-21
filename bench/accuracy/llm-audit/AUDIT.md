# LLM 补充事实（`--llm-facts`）精度审计

- 输入：`heldout2-runs/llmfacts/runs-L/<repo>/wiki/facts/{routes,apis}.json` 中 `"source":"llm"` 的条目
- 代码：`heldout3/repos/<repo>`（未读取 `heldout3/labels`，盲审）
- 数量：日志中 "accepted 24+30+13+26 route / 4+0+15+4 api"（共 116）里，大部分与规则结果冲突后被规则项吸收（rule conflicts 23/28/3/2），**最终落盘的 LLM 条目共 60 条**（40 route + 20 api），因此全量审计，没有抽样。
- 逐条判定见 `items.tsv`（repo / kind / id / file:line / verdict / note）。

## 判定标准

| 判定 | 含义 |
|---|---|
| correct | 真实页面/路由，或真实 HTTP 端点且 method+path 正确，且不与已有条目重复 |
| duplicate | 指向真实页面，但与规则项或其他 LLM 项是同一页面（id 写法不同导致去重失败） |
| partial | 方向对但不完整：例如路由只是子组件/内联目的地，或端点对但 method 错 |
| wrong | 不是页面/不是 API 端点/幻觉 |

精度（严格）= correct / total；精度（宽松）= (correct + duplicate) / total，即“内容真实但可能重复”。

## 精度表

| 仓库 | 类型 | 总数 | correct | duplicate | partial | wrong | 严格精度 | 宽松精度 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Dimillian_MovieSwiftUI (iOS) | route | 1 | 0 | 0 | 1 | 0 | 0% | 0% |
| Dimillian_MovieSwiftUI (iOS) | api | 4 | 0 | 0 | 0 | 4 | 0% | 0% |
| razaghimahdi_Shopping-By-KMP (Android/KMP) | route | 2 | 0 | 2 | 0 | 0 | 0% | 100% |
| razaghimahdi_Shopping-By-KMP | api | 0 | – | – | – | – | – | – |
| seasonZhu_HarmonyStudy (ArkTS) | route | 12 | 12 | 0 | 0 | 0 | 100% | 100% |
| seasonZhu_HarmonyStudy | api | 13 | 13 | 0 | 0 | 0 | 100% | 100% |
| Ashinch_ReadYou (Android) | route | 25 | 22 | 3 | 0 | 0 | 88% | 100% |
| Ashinch_ReadYou | api | 3 | 0 | 0 | 0 | 3 | 0% | 0% |
| **合计 route** | | 40 | 34 | 5 | 1 | 0 | **85.0%** | 97.5% |
| **合计 api** | | 20 | 13 | 0 | 0 | 7 | **65.0%** | 65.0% |
| **总计** | | **60** | **47** | **5** | **1** | **7** | **78.3%** | **86.7%** |

要点：
- 路由几乎没有幻觉：40 条里 39 条指向真实页面；问题主要是**重复**（5 条）和**id 规范不一致**。
- API 的错误全部是同一类：**把静态资源 URL 当成 API 端点**（7/20）。HarmonyStudy 的 13 条 API 全对（method、path、路径参数都正确）。
- 所有 60 条的 `confidence` 均为 `verified-evidence`，包括 7 条错误项和 5 条重复项 —— 当前“证据验证”只检查了所引行包含该 token，没有做语义判断。

## 错误类型与示例

### 1. 静态资源/第三方站点 URL 被当成 API（wrong，7 条）
- `GET /t/p/w154/{poster_path}` 等 4 条 — `MovieSwift/Packages/Backend/Sources/Backend/services/ImageService.swift:18-21`。这是 `enum Size: String` 中 `https://image.tmdb.org/t/p/w154/` 之类的图片 CDN 前缀，和 API host（`api.themoviedb.org`，规则已抽到 `/movie/popular` 等 11 条）不同，不是业务端点。
- `GET /favicon.ico`、`GET /apple-touch-icon.png`、`GET /apple-touch-icon-precomposed.png` — `app/src/main/java/me/ash/reader/infrastructure/rss/BestIconFinder.kt:62,73,74`。这是对**任意用户订阅站点**拼接的图标探测路径（`URL(baseUrl, it)`，`baseUrl` 来自 `siteUrl` 参数），不是应用后端的 API。

### 2. 重复（duplicate，5 条）
- 与规则项重复（id 写法不同）：
  - `AppNavigation.Splash` — `app/shared/src/commonMain/kotlin/com/razzaghi/shopingbykmp/presentation/App.kt:61`；规则已有 `Splash`（symbol `AppNavigation.Splash`，AppNavigation.kt）。
  - `CartNavigation.Detail` — `.../presentation/ui/main/cart/CartNav.kt:73`；规则已有 `Detail`（symbol `CartNavigation.Detail`）。
- LLM 批次内部重复（使用点 vs 注册点）：
  - `Startup` / `Feeds` / `Reading` — `app/src/main/java/me/ash/reader/infrastructure/android/MainActivity.kt:110,127,120`，这是 `startDestination` 中对 `Route.X` 的**引用**，`symbol` 为空；同一页面在 `ui/page/nav3/AppEntry.kt:174,112,127` 以 `Route.Startup/Route.Feeds/Route.Reading` 已经收录。

### 3. 子组件/内联目的地（partial，1 条）
- `peoplesListView` — `MovieSwift/MovieSwift/views/components/movieDetail/rows/MovieCrosslinePeopleRow.swift:29`。它确实是 `NavigationLink(destination:)` 的目标（“See all” 演员列表，带 `navigationBarTitle`），但实现为 `private var peoplesListView: some View`（第 17 行），不是独立 View 类型；route_id 是属性名，不适合作为路由标识。

### 4. 正确但标识不规范（计为 correct，提示评分匹配风险）
- HarmonyStudy 的路由 id 混用两种写法：8 条用未解析的枚举表达式 `RouterName.Hotkey`（`pages/HotKey.ets:13` 的 `@Entry({routeName: RouterName.Hotkey})`，实际值 `"HotKey"`），4 条用 `PagesConstant` 字符串 `pages/TreeDetail` 等（`router/PagesConstant.ets:12-17`）。都对应 `main_pages.json` 中真实注册的页面，但 `pattern` 未解析到实际 routeName，评分器若按名字匹配可能漏配。
- ReadYou 的 `Route.X` 带 sealed interface 前缀（`ui/page/nav3/key/NavKey.kt`），与 KMP 规则项去掉前缀的写法不一致。

## 对验证规则的建议

1. **API 必须有 HTTP 调用证据**：所引行（或同一函数内）需出现 HTTP 客户端调用（`httpClient.get/post`、Retrofit/Ktor 注解、`URLSession`/`AF.request` 等）或已知 endpoint 枚举的 `path`。只在字符串常量/enum rawValue 中出现的 URL 一律拒绝或降级为 `low`。
2. **静态资源过滤**：path 以 `.png/.jpg/.jpeg/.gif/.webp/.ico/.svg/.css/.js/.woff` 结尾，或包含 `/t/p/`、`/images/`、`/static/` 等资源前缀时拒绝。
3. **host 一致性**：若 URL 是绝对地址，且 host 与该仓库已识别的 API baseURL（规则抽到的或 `baseURL:` 配置）不同，拒绝；以函数参数（如 `siteUrl`）为 base 拼接的 URL 视为第三方探测，拒绝。
4. **路由 id 规范化后再去重**：去掉 `Route.`、`AppNavigation.`、`CartNavigation.`、`RouterName.`、`pages/` 等限定前缀；把枚举/常量解析为实际值（`RouterName.Hotkey` → `HotKey`，结合 `main_pages.json`）；按“规范化 id + 目标页面 symbol/文件”与规则项及 LLM 批内项去重。本次 5 条重复全部可由此消除。
5. **只收注册点，不收使用点**：`listOf(Route.Startup)`、`navigate(...)`、`backStack.add(...)` 这类引用不应单独产生路由；`symbol` 为空的 LLM 路由应拒绝或强制与已有项合并。
6. **路由目标必须是页面级声明**：目标 symbol 应为 `*Page/*Screen` Composable、SwiftUI `struct ...: View`、`@Entry` struct 等；`private var ...: some View` 这类内联属性降级为 `partial/low`，不作为独立路由。
7. **confidence 分级**：`verified-evidence` 应保留给通过以上语义检查的条目；仅“行内含 token”的条目标 `token-match`，以便下游（e2e 生成器、评分）区别对待。

按建议 1–3 可去掉全部 7 条错误 API；按 4–5 可去掉 5 条重复；预计严格精度可从 78.3% 提升到约 47/48 ≈ 98%（剩余 partial 1 条），且不损失本次任何 correct 项。
