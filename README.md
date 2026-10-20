# codewiki — 把三端代码 compound 成可被验证的 LLM Wiki

`codewiki` 是一个 Go CLI（`kb`）加一组 Claude Code skills：它把一个移动端 monorepo 的代码（Android Kotlin/Java、iOS Swift、HarmonyOS ArkTS，另有 JS/TS 支持）和旧文档/规格 **compound**（持续复利式沉淀）成 agent 友好的 LLM Wiki。每次 merge 到 master 都增量更新，而且**知识必须可证明地与当前代码一致**：每个页面通过锚点（符号 ID + 内容 hash）绑定代码，CI 中 `kb verify` 不通过就不发布。

> 设计取向：**确定性交给 CLI，理解交给 LLM，一致性靠硬校验。**

## 为什么

- 代码库的“知识”散落在代码、过时的 wiki、口口相传里；LLM 每次从零读仓库既贵又不稳定。
- 纯 LLM 生成的 wiki 会漂移：代码改了文档没改，没人知道哪页过时。
- codewiki 让 LLM 只写 prose，事实（路由、深链、testID、接口、符号）由 tree-sitter 确定性抽取；页面锚定符号 hash，任何代码变化都能精确定位到受影响页面，并且只重写这些页面。

## 架构

```mermaid
flowchart LR
  subgraph repo[App monorepo]
    A[android/ Kotlin+Java] --- I[ios/ Swift] --- H[harmony/ ArkTS]
    D[docs / specs / ADR / AGENTS.md]
  end
  repo -->|kb scan<br/>tree-sitter| G[(符号图<br/>.kb/graph.json)]
  repo -->|kb scan| F[facts/*.json + facts/&lt;platform&gt;/*.md]
  G -->|kb diff| DF[unchanged/body/signature/<br/>added/deleted/renamed]
  DF -->|kb plan| P[任务 + write set<br/>.kb/plan.json]
  D -->|kb discover-docs / kb ingest| C[claims → verified / conflict / unverifiable]
  P -->|LLM: claude -p 或 template| S[staging wiki]
  C --> S
  S -->|kb verify| V{通过?}
  V -->|是| W[原子替换 wiki/<br/>log.md · state.json · update_record.json]
  V -->|否| X[不发布, exit 1]
```

```
            ┌──────────── kb compound ────────────────────────────────────────┐
 merge ──▶  │ scan ─▶ diff ─▶ plan ─▶ LLM(写集受限) ─▶ verify(staging) ─▶ publish │ ─▶ wiki/
            └─────────────────────────────────────────────────────────────────┘
```

| 层 | 负责 | 产出 |
|---|---|---|
| 事实层 | Go CLI（tree-sitter，确定性） | `facts/{android,ios,harmony}/*.md`、`facts/routes.json`、`testids.json`、`apis.json`、`requirements.json` |
| 理解层 | LLM（`kb-compound` skill，或离线 template writer） | `pages/features/*`、`pages/overview.md`、`pages/_conflicts.md` … |
| 校验层 | `kb verify`（CI 门禁） | 锚点 hash 全部匹配 HEAD、符号存在、无死链、无孤儿页、index 覆盖、facts 新鲜 |

## 安装

需要 Go 1.24 与 C 编译器（tree-sitter 语法通过 cgo 编译）。

```bash
go install github.com/luckylucky0001/codewiki/cmd/kb@latest
# 或从 checkout 构建
git clone https://github.com/luckylucky0001/codewiki && cd codewiki && go build -o kb ./cmd/kb
```

ArkTS 语法以源码形式 vendored 在模块内部（`internal/grammars/arkts`，含 MIT LICENSE 与 VENDORED.md），`go.mod` 不含任何 `replace`，因此远程 `go install …@latest` 可用。

提示：Swift 语法的 C 代码在编译时会打印 `TOKEN_COUNT redefined` 警告，无害；可用 `CGO_CFLAGS="-O2 -w"` 静默。

## 快速开始

```bash
cd your-monorepo                 # 含 android/ ios/ harmony/
kb init                          # 生成 codewiki.yaml、wiki/ 骨架与 wiki/AGENTS.md schema
kb discover-docs --json > /tmp/docs.json
kb ingest --manifest /tmp/docs.json --kinds spec,design,adr,agent-guide,doc   # 文档断言逐条核对
kb compound                      # 首次：全量；之后：增量（默认 template 写作器，离线确定性）
kb compound --llm claude         # 使用真实 LLM（claude -p）写页面
kb verify                        # CI 门禁：exit 0 = wiki 与 HEAD 一致
kb search "购物车 上限"; kb get features/cart; kb context android/.../CartViewModel.kt
```

完整演示：`demo/run.sh`（见 [demo/README.md](demo/README.md)）。PDF 手册：[docs/codewiki-manual.pdf](docs/codewiki-manual.pdf)（源文件 `docs/manual/manual.html`，`docs/build-pdf.sh` 构建）。

## 配置 `codewiki.yaml`

```yaml
version: 1
wiki_dir: wiki
project: minishop
platforms:                       # 平台名会成为符号 ID 的 scheme
  - name: android
    root: android
  - name: ios
    root: ios
  - name: harmony
    root: harmony
  # - name: web                  # JS/TS 仓库（见 axios 案例）
  #   root: .
  #   include: ["lib/**/*.js"]
exclude: ["**/build/**", "**/node_modules/**", "**/Pods/**", "**/oh_modules/**"]
llm:
  cmd: claude -p --permission-mode acceptEdits --allowedTools "Read,Write,Edit,Glob,Grep,Bash(kb anchor:*),Bash(kb get:*),Bash(kb search:*)" --output-format text
  timeout_sec: 600
plan:
  hops: 1                        # 签名变化沿引用边传播的跳数 k
  rebuild_module_ratio: 0.5      # >50% 模块变化 → 全量重建
  rebuild_structural_ratio: 0.3  # >30% 结构变化(增/删/改名/签名) → 全量重建
docs:
  exclude: []
```

`--config <file>` + `--root <repo>` 可以把 wiki 写到仓库之外（只读分析第三方仓库，见 axios 案例）。

## 命令参考

所有命令：`--json`（stdout 输出 JSON）、`--root`、`--config`、`--quiet`；数据 → stdout，日志 → stderr；退出码 **0** 成功、**1** stale/verify 失败、**2** 用法错误、**3** 内部错误；写入类命令支持 `--dry-run`；从不交互；重复运行幂等（无变化时 compound 为 `noop`，不写 log）。

| 命令 | 作用 |
|---|---|
| `kb init [--dry-run]` | 生成 `codewiki.yaml`（自动探测平台目录）、wiki 骨架、`AGENTS.md` schema；不覆盖已有文件 |
| `kb scan [--out graph.json] [--symbols]` | tree-sitter 抽取符号与 facts，报告 `parse_failures` |
| `kb diff [--base <sha>]` | 与上次 compound 的符号图（或 `--base` 版本）按符号 ID 比对：unchanged / body / signature / added / deleted / renamed（含 body 相似度） |
| `kb plan [--base] [--full] [--dry-run]` | 受影响页面 = 自身锚点变化 ∪ 签名变化沿引用边 k 跳传播 ∪ 新路由；每个任务带显式 write set；超阈值全量重建；写 `wiki/.kb/plan.json` |
| `kb compound [--llm template\|claude\|cmd] [--llm-cmd ...] [--fallback] [--max-llm-tasks N] [--full] [--dry-run] [--keep-work]` | scan→diff→plan→LLM→verify→原子发布；更新 `.kb/state.json`（last_sha）、`.kb/update_record.json`、追加 `log.md` |
| `kb verify [--fix-index]` | 锚点 hash 匹配 HEAD、正文提到的符号存在、无死链、无孤儿页、index 覆盖、facts 与重新抽取一致、requirements 锚点新鲜 |
| `kb status` | 列出 stale 页面（exit 1 表示存在） |
| `kb discover-docs [--out f]` | 按业界约定发现并分类文档（spec/design/tasks/adr/agent-guide/readme/doc），记录 path + hash |
| `kb ingest <docs...> \| --manifest f [--kinds ...] [--llm ...] [--dry-run]` | 复制到 `raw/docs/`，抽取断言（EARS、MUST/SHALL、`FR-001`、Kiro 需求编号），逐条核对 → `pages/_conflicts.md` + `facts/requirements.json` |
| `kb search <q>` | 页面 + facts + 符号名检索 |
| `kb get <page-id>` | 输出页面（`features/cart`、`_conflicts`、`facts/ios/routes`） |
| `kb context <file>` | 描述某文件的页面、符号、路由/testID/接口（改代码前给 coding agent 用） |
| `kb anchor <symbol-id...>` | 打印符号当前 hash（LLM 写 frontmatter 时用） |
| `kb lint-tid [--strict]` | testID 覆盖矩阵：路由 × tid × 平台 |
| `kb parity [--strict]` | 功能 × 平台一致性矩阵：路由 / testID / 可达接口是否齐全，以及同名常量的跨平台取值差异；同时生成 `pages/parity.md` |
| `kb install-skills <repo>` | 把 skills 安装到 `<repo>/.claude/skills/` |
| `kb bench [--synthetic N]` | 冷/热扫描基准（合成仓库或 `--root` 指定的真实仓库） |
| `kb eval [--llm …]` | 用人工标注的 golden set 评测断言核对与 plan 影响面（precision/recall） |
| `kb mcp` | stdio MCP server（JSON-RPC 2.0），工具：`kb_search`、`kb_get`、`kb_context`、`kb_anchor`、`kb_status`、`kb_parity` |

## Wiki 布局

```
wiki/
  AGENTS.md            # schema：写作规范（frontmatter 契约、写集规则）
  index.md             # 分层目录（kb 维护；kb verify --fix-index）
  log.md               # append-only："## [YYYY-MM-DD] op | subject"
  llms.txt             # 外部 agent 入口
  raw/docs/            # 旧文档/规格原文（只读、低可信）+ manifest.json
  facts/               # 生成文件，禁止手改（头部有 DO NOT EDIT）
    routes.json testids.json apis.json requirements.json
    android/{routes,testids,apis,symbols}.md  ios/…  harmony/…
  pages/
    overview.md        # 三端路由矩阵
    parity.md          # 三端一致性（生成，verify 检查新鲜度）
    features/<route_id>.md
    concepts/navigation.md         # 路由表 / 路由器 / 深链与测试参数
    concepts/shared-components.md  # 被 ≥3 个路由使用的共享符号
    flows/ concepts/ decisions/
    _conflicts.md      # 文档 vs 代码：conflict / verified / unverifiable
  .kb/graph.json       # 符号图快照（增量基准）
  .kb/state.json       # last_sha、graph/prompt 版本、writer
  .kb/plan.json  .kb/update_record.json  .kb/ingest/verdicts.json
```

### 符号模型

- ID：`<platform>://<相对平台根的路径>#<限定名>`，例如 `android://app/src/main/java/com/minishop/ui/login/LoginViewModel.kt#LoginViewModel.login`、`harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailBuilder`。同名重载追加 `~2`。
- `hash`：去掉注释、空白归一后的 token 序列的 sha256 → **只改注释/格式 = no-op**；容器（class/struct/component）的 hash 只包含自身头部和成员**签名**，成员函数体变化不会让整个类失效。
- `sig_hash`：声明头（body 之前，含注解/装饰器）的 hash → 区分 body 变化与 signature 变化。
- `refs`：函数体内标识符按简单名称解析到已知符号（同平台，优先同文件、父类型被引用者），作为传播边。
- `norm_hash` + `simhash`：去掉自身名字后的 body 指纹，用于识别 rename（完全相同 → similarity 1.0；同目录 simhash ≥ 0.8 → 模糊 rename）。
- 行号只用于展示，不参与 hash。

### 三端 facts 来源

| | 路由 / 页面 | 深链 | testID | 接口 |
|---|---|---|---|---|
| Android | Compose `composable(Routes.X)` / NavHost（解析 `const val`），入口 Screen；Manifest activity | Manifest intent-filter `<data android:scheme>` | `Modifier.testTag("x")` | Retrofit `@GET/@POST/...` |
| iOS | `enum Route: String { case productDetail = "product/{id}" }` + `XxxView`；`navigationDestination` | Info.plist `CFBundleURLSchemes` | `.accessibilityIdentifier("x")` | `send(.post, path: "/api/...")` 类 URLSession 封装 |
| HarmonyOS | `resources/base/profile/router_map.json`（name / pageSourceFile / buildFunction / data.pattern）、`main_pages.json` | `module.json5` skills `uris[].scheme` | `.id('x')`（含 ArkUI 链式属性） | `http.createHttp().request(BASE_URL + '/api/...', {method})` |

动态 testID（`"product_item_${p.id}"`）按字面前缀记录（`product_item_`）。字符串拼接、插值、常量引用都会静态求值（未知部分记为 `{name}`）。

### 互通 schema（与 e2epilot 共享，保持不变）

```json
{"version":1,"routes":[{"platform":"android|ios|harmony|web","route_id":"product_detail","pattern":"product/{id}","deeplink":"minishop://product/{id}","file":"...","symbol":"..."}]}
{"version":1,"testids":[{"platform":"...","tid":"add_to_cart","route_id":"product_detail","file":"...","line":12}]}
{"version":1,"apis":[{"platform":"...","method":"POST","path":"/api/login","file":"...","symbol":"..."}]}
{"version":1,"requirements":[{"id":"FR-001","source":"specs/001-cart/spec.md","text":"...","status":"verified","anchors":[{"sym":"...","hash":"..."}],"route_ids":["cart"]}]}
```

`route_id` 为空表示共享组件（如 `nav_back`）。

## Frontmatter 契约

```yaml
---
id: features/cart                 # = 路径去掉 pages/ 和 .md（verify 强制）
title: 购物车（cart）
kind: feature                     # feature | flow | concept | decision | overview | conflicts
platforms: [android, harmony, ios]
routes: [cart]
sources:                          # 锚点：符号 ID + 当前 hash
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen
    hash: 298d51bd…
source_commit: 02b11f8
status: current                   # current | stale | outdated-doc
---
```

规则：锚点 hash 与 HEAD 不符 → `E_ANCHOR_STALE`；符号消失 → `E_ANCHOR_MISSING`；正文反引号里的符号 ID 必须存在 → `E_SYMBOL_UNKNOWN`；`status: stale` 也会让 verify 失败。

## 增量 compound 的细节

1. **diff**：基准是上次成功 compound 的 `.kb/graph.json`（而不是 commit 链），所以 squash/rebase/积压多次 merge 都能一次追到 HEAD；`--base <sha>` 用 `git archive` 重新扫描任意版本。
2. **plan**：
   - 页面自身锚点 body/signature 变化、删除、改名 → 受影响；
   - signature 变化 / 删除 / 改名的符号，沿**反向引用边**走 k 跳（`plan.hops`），锚定到这些调用方的页面也受影响（RepoAgent 式引用失效）；
   - facts 中出现新 `route_id` → `create pages/features/<id>.md`；路由集合变化 → 更新 overview；
   - 模块（含源码的目录）变化比例 > 50% 或结构变化比例 > 30% → 全量重建。
3. **LLM 执行**：CLI 为每个任务写 prompt（任务、write set、相关 facts、符号源码、现有页面或确定性草稿），以 staging wiki 为 cwd、prompt 走 stdin 调用 `--llm-cmd`。执行后对 staging 做快照 diff，**write set 之外的写入全部回滚**并把任务标记为 `violation`（OpenDeepWiki 式受限写集）。随后 CLI 规范化 frontmatter：强制 id/kind/routes，给 prompt 中出现过的符号重盖当前 hash，拒绝未知符号。
4. **template writer**（`--llm template`）：离线、确定性地从 facts + 符号图生成页面（锚点正确），用于无 key 的 CI、可复现的 demo，也是 `--fallback` 的兜底。
5. **verify → publish**：在 staging 上跑完整 verify；通过才把 `wiki/` 原子替换（rename），否则保留 staging（`--keep-work`）并 exit 1。同时写 `.kb/state.json`、`.kb/update_record.json`，追加 `log.md`。运行期间持有 `.kb-work/lock`。

## 锚点精度：功能页 vs 共享组件

功能页只锚定**路由所属的 screen 及其成员、它的 ViewModel / store（名称与路由同前缀，或被 screen 直接引用的页面组件）、以及 2 跳内可达的接口调用**。被 ≥3 个路由（同平台）引用的符号——返回按钮、顶栏、API client、`TokenStore`——归入 `pages/concepts/shared-components.md`；路由表、路由器、导航栈、深链与测试参数处理（名称匹配 route/router/navigation/deeplink/pathStack/testParams）归入 `pages/concepts/navigation.md`。因此修改 `BackButton` 只会让 shared-components 页失效，不会让所有功能页一起 stale（有单测覆盖）。共享容器（struct/class）只按成员签名计算 hash，所以其成员也一并锚定。

## 三端一致性：`kb parity`

`kb parity` 从 facts 与符号图生成功能 × 平台矩阵：

- 每个 `route_id` 在各平台是否有路由；
- testID 是否齐全（以三端并集为准）；
- 从 screen 出发 3 跳内可达的 HTTP 接口是否齐全；
- 同名常量（`MAX_CART_ITEMS` / `maxCartItems` 归一化为 `max_cart_items`）在各平台的取值差异。

结果同时写入 `pages/parity.md`（生成页，`kb verify` 检查其新鲜度）。demo 的变更集 01 故意只改了 Android 和鸿蒙的购物车上限，parity 立即报告：

| 常量 | android | ios | harmony |
|---|---|---|---|
| `max_cart_items` | `50` | `99` | `50` |

`--strict` 在存在差异时 exit 1，可作为 CI 门禁。

## 与 e2epilot 联动

`kb diff --json` 与 `wiki/.kb/plan.json`（`kb plan` / `kb compound` 写入）都暴露：

```json
{
  "changed_route_ids": ["cart", "product_detail"],
  "changed_routes": [
    {"route_id": "cart", "platforms": ["android", "harmony"], "reasons": ["symbol_changed"],
     "symbols": ["android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.MAX_CART_ITEMS"]}
  ],
  "changed_files": ["android/app/src/main/java/com/minishop/ui/cart/CartViewModel.kt", "..."]
}
```

- `changed_route_ids`：受影响路由（去重排序）。路由被判为受影响的条件（`reasons`）：
  - `symbol_changed`：从 screen 出发 3 跳内可达的符号发生了 body / signature / rename / 增删，或功能页锚定的符号发生变化；新旧两张图都会检查；
  - `route_added` / `route_removed` / `route_changed`：与上一次 `facts/routes.json` 对比，路由增删，或 pattern / deeplink / symbol 变化；
  - `testid_changed`：该路由下的 testID 增删。
- `changed_files`：符号图中内容 hash 变化的源文件，加上 `git diff --name-only base head` 的结果（包含 `router_map.json`、`Info.plist` 等资源文件，排除 wiki 目录）。
- 路由 ID 与 `facts/routes.json`、`testids.json`、`requirements.json` 中的 `route_id` 一致。

e2epilot 侧的典型用法：

```bash
ROUTES=$(kb diff --json | jq -r '.changed_route_ids | join(",")')
e2e graph invalidate --changed-routes "$ROUTES"
e2e impact --changed-routes "$ROUTES" --requirements wiki/facts/requirements.json
```

## 增量扫描缓存与性能

`kb` 在 `wiki/.kb/cache/scan.gob.gz` 中按文件保存解析结果（键 = 仓库相对路径 + 内容 sha256 + 语言/平台；缓存版本由抽取器指纹自动派生：`internal/extract` 的 Go 源码通过 `go:embed` 计入 hash，再加上各语言节点表、语法 ABI 版本与 node kind 数量，因此改了抽取器而忘记手动 bump 也不会读到旧缓存），未变化的文件不再调用 tree-sitter；删除的文件会被清理。解析在 `GOMAXPROCS` 个 goroutine 上并行（每个 worker 自己的 parser），引用解析为索引查找（线性）。缓存目录由 `kb init` 加入 `.gitignore`，CI 模板用 `actions/cache` 持久化；`KB_NO_CACHE=1` 可禁用。

`kb bench` 测量冷/热扫描（4 核容器，Go 1.24，2026-10-20 实测）：

| 仓库 | 文件 | 符号 | 冷扫描（无缓存） | 热扫描（全命中） | 1% 文件变化 |
|---|---|---|---|---|---|
| 合成仓库 `kb bench --synthetic 3000`（Kotlin/Swift/ArkTS 各 1000） | 3000 | 21000 | 3711 ms | 463 ms | 974 ms |
| axios `lib/**/*.js` + `index.js` | 70 | 323 | 191 ms | 25 ms | — |
| axios 全仓（含 tests、`.d.ts`、examples） | 243 | 1009 | 993 ms | 69 ms | — |
| examples/minishop（三端） | 42 | 214 | 91 ms | 8 ms | — |

```bash
kb bench --synthetic 3000                       # 合成仓库，临时目录
kb bench --root /path/to/repo --config cfg.yaml  # 真实仓库；缓存写到临时目录，不修改仓库
```

优化记录：第一版引用解析对常见名字（如上千个 `items`）逐一打分，合成仓库上冷/热都要约 20 s（热扫描瓶颈不在解析）；改为按文件 / 父类型 / 全局三级索引后，热扫描降到 0.5 s。

## 文档发现与断言核对（spec → 知识）

`kb discover-docs` 按业界约定分类：

| 约定 | 路径 |
|---|---|
| GitHub spec-kit | `specs/<feature>/spec.md \| plan.md \| tasks.md`、`.specify/` |
| OpenSpec | `openspec/specs/**/spec.md`、`openspec/changes/**` |
| Kiro | `.kiro/specs/<feature>/requirements.md \| design.md \| tasks.md`、`.kiro/steering/*.md` |
| ADR / RFC | `docs/adr/`、`doc/architecture/decisions/`、`rfcs/` |
| Agent 指南 | `AGENTS.md`、`CLAUDE.md`、`.github/copilot-instructions.md` |
| 其他 | 模块 `README.md`、`docs/**/*.md`、`THREATMODEL.md`、`SECURITY.md` |

`kb ingest` 抽取断言并给出稳定 ID：spec-kit `FR-001`、Kiro `LOGIN-R1.2`（需求 1 的第 2 条验收标准）、其它 EARS / MUST / SHALL / 含代码的陈述为 `<DOC>-<hash6>`。每条断言的结论：

- **verified**：有代码证据，记录锚点（进入 `facts/requirements.json`，供 e2epilot 构建需求→流程追踪矩阵）；
- **conflict**：代码与之矛盾——**以代码为准**，列入 `pages/_conflicts.md`；
- **unverifiable**：没有证据，不提升为知识。

LLM 的判定会写入 `requirements.json` 的 evidence，以 `[llm]` 开头。后续 template 重检时，如果该断言锚定的代码 hash 没有变化，就保留 LLM 的判定，不让确定性检查覆盖掉语义结论。

template 模式做确定性检查：接口 method+path 对 `apis.json`、深链对 `routes.json`、testID、route id/pattern、符号名（含数值常量与文档数字比对）、文件名、代码字面量在符号体中检索。claude 模式做语义核对（例如“用户名为空时弹出短信验证对话框”——testID 存在但行为不存在 → conflict）。`_conflicts.md` 本身锚定所用证据符号，代码变化后会被自动重新核对（例如购物车上限 99→50 后 spec `FR-002` 由 verified 变为 conflict）。

## CI 接入

模板：[`.github/workflows/compound.yml`](.github/workflows/compound.yml)，说明：[examples/ci/README.md](examples/ci/README.md)。

- `on: push` 到 master/main；`concurrency` 串行且不取消；
- 有 `ANTHROPIC_API_KEY` 用 claude，否则 template；`--max-llm-tasks N` 控制成本：按价值排序（feature > flow > concept > 其他，同类按变化锚点数降序；`plan.json` 中的 `priority` 字段），前 N 个交给 LLM，其余用 template；`--fallback` 兜底；
- `kb verify` 失败 → job 失败；wiki 变更以 `[skip ci]` 提交回仓库（或独立 wiki 仓库 / `kb` 分支）。

## 在 Claude Code 中使用 skills

`skills/` 下有 4 个符合 [Agent Skills 规范](https://agentskills.io) 的 skill（frontmatter `name` = 目录名、`description` 说明做什么 + 何时用、正文 < 500 行、`references/` 按需加载）：

| skill | 用途 |
|---|---|
| `kb-compound` | 合并后增量更新 wiki；也是 `kb compound --llm claude` 时单个任务的写作规范 |
| `kb-ingest` | 发现并核对 spec/旧文档，产出 `_conflicts.md` 与 requirements 追踪 |
| `kb-query` | 回答“X 在三端怎么实现”、改代码前 `kb context <file>` |
| `kb-lint` | `kb verify` / `--fix-index` / `kb lint-tid` |

```bash
kb install-skills /path/to/app-repo     # 复制到 /path/to/app-repo/.claude/skills/
# 本仓库内：.claude/skills/* 是指向 skills/* 的符号链接，Claude Code 可直接发现
```

skills 只驱动 CLI，不重新实现逻辑。

实测：在 demo 仓库执行 `kb install-skills .` 后，用 `claude -p --model haiku` 提问。两个问题都在第一步调用了对应的 skill：

- “购物车上限三端分别是多少？引用出处”触发 kb-query，5 轮，$0.008；
- “wiki 是否与代码一致、三端是否对齐”触发 kb-lint，17 轮，$0.016。

agent 用的命令是 `kb parity`、`kb verify --json` 和 `kb lint-tid`，给出的结论都带符号 ID 出处。第一轮运行暴露了 skill 描述的不足，据此做了修正。transcript、摘要和修正记录见 [demo/sample-output/skills/](demo/sample-output/skills/README.md)，复现脚本为 `demo/skills-demo.sh`。

也可以把 wiki 作为 MCP 工具接入任意 agent：

```bash
claude mcp add codewiki -- kb mcp --root /path/to/app-repo
```

## 真实仓库案例：axios（JavaScript）

对 `/home/user/axios`（只读）运行 `kb discover-docs` + `kb scan` + `kb ingest`，wiki 写在仓库外（`--config`）。结果见 [demo/sample-output/axios/](demo/sample-output/axios/SUMMARY.md)：

- 70 个 JS 文件、323 个符号，0 parse failure；发现 149 篇文档（spec-kit/Kiro 风格之外，主要是 `docs/**` 与 3 份 agent 指南）。
- `AGENTS.md` 中 “default adapter preference is `['xhr', 'http', 'fetch']`” 被 **verified**，锚点 `web://lib/defaults/index.js#defaults`（代码字面量检索）+ 文件 `lib/adapters/adapters.js` 存在。
- claude 模式对 `AGENTS.md` 的 48 条断言做了语义核对（结论与证据见案例目录）。

## 评测：`kb eval`

LLM 流水线需要评测。`examples/minishop-eval/golden.yaml` 是一份人工标注的 golden set：

- 33 条断言，每条都有期望结论（verified / conflict / unverifiable），按 base 状态下三端代码人工判断；
- 每个变更集，人工判断应当被重新检查的页面。

`kb eval` 在临时 git 仓库中按 ingest → 首次 compound → 依次合并变更集的顺序回放，然后报告 precision 和 recall。整个过程不修改工作区。

```bash
kb eval                       # template（确定性，也作为单测回归门槛）
kb eval --llm claude          # 仅断言核对使用 LLM（1 次调用）；页面写作仍用 template
```

| 指标 | template | claude（sonnet） |
|---|---|---|
| 断言准确率（33 条） | 0.82 | **0.88** |
| conflict precision / recall | 1.00 / 0.56 | 1.00 / **0.78** |
| verified precision / recall | 0.88 / 0.92 | **0.96** / 0.92 |
| plan 影响页面 precision / recall（micro，3 个变更集） | 0.82 / 1.00 | 同左（plan 是确定性的） |

template 模式出错的地方都是语义类断言：

- 把“空用户名弹出短信对话框”判为 verified，依据只是 testID 存在；
- 把“支持 page/size 分页”判为 verified，依据只是 API 存在；
- 把 `share_button` 判为 unverifiable，没有识别出它不存在；
- 把“密码少于 6 位直接拒绝”判为 unverifiable。

这些正是 claude 模式要补的部分：claude 正确识别了“短信对话框”“分页参数”两条冲突，以及“密码少于 6 位直接拒绝”这条成立。它仍然漏掉的是 `share_button`（判为 unverifiable），以及“三端共享上限常量”（标注者认为三端各自定义、并不共享）。另外，claude 对“测试参数注入”类断言更保守，判为 unverifiable。plan 的 recall 为 1.0，即没有漏掉应该更新的页面。多出来的两页：

- `_conflicts.md`：断言锚点所在的类发生了变化；
- `shared-components.md`：profile 页引入了新的共享符号。

两者都属于保守的重检。

## 真实开源项目验证

在 5 个公开项目上只读运行 scan / facts / bench / compound，详情见 [docs/validation.md](docs/validation.md)：

| 语言 | 文件 | 无错解析率 | 项目 |
|---|---|---|---|
| Kotlin | 311 | 100% | android/nowinandroid |
| Swift | 431 | 99.5% | Dimillian/IceCubesApp |
| ArkTS | 3858 | **99.9%** | HarmonyOS-Cases/Cases、openharmony/applications_app_samples（sparse）、arkTS_universal_starter |
| TS / JS | 1102 | 100% | 同上 |

| 项目 | 符号 | 路由 | testID | 冷 / 热扫描 |
|---|---|---|---|---|
| nowinandroid | 1,748 | 5（Navigation 3 `entry<T>`） | 14 | 690 / 97 ms |
| IceCubesApp | 6,058 | 28（`navigationDestination(for:)` 枚举） | 0 | 2,245 / 274 ms |
| HarmonyOS-Cases | 20,141 | 88（router_map.json） | 1,437 | 9,105 / 853 ms |
| app_samples | 51,342 | 10 | 2,674 | 32,043 / 3,935 ms |

验证中修复了 5 个问题，每个都配了最小片段回归测试：

- Kotlin 类型安全导航，包括 tree-sitter 把 `entry<K> {}` 解析成比较表达式的歧义；
- SwiftUI 带关联值的路由枚举；
- 上游 router_map 中悬空的 buildFunction（这是 HarmonyOS-Cases 仓库自身的 bug，现改为报告 warning，不再阻断发布）；
- `file://` 等非应用 scheme 被误当作深链；
- 符号解析误选测试代码。

ArkTS 的 4 个解析失败都源于 ArkUI 属性调用中的尾逗号。

## 最佳实践

- **事实与叙述分离**：让 CLI 抽取所有可确定的事实（路由、testID、接口），LLM 只写解释；facts 页面加 `DO NOT EDIT`，每次 compound 重新生成（Karpathy LLM Wiki 的 raw / wiki / schema 三层）。
- **按符号而不是按文件增量**：用符号 ID + 归一化 hash 判断变化，注释/格式改动不触发重写；按签名变化沿引用边传播（FSoft CodeWiki 的增量设计、RepoAgent 的引用失效）。
- **受限写集**：每个 LLM 任务只能写自己的页面，写集外修改自动回滚（OpenDeepWiki）。
- **先验证再发布**：staging + verify + 原子 rename；CI 串行化，失败不发布。
- **repo-map 式上下文**：给 LLM 的是精选符号签名与源码片段（Aider repo-map 的思路），而不是整个仓库；`facts/<platform>/symbols.md` 就是一份 repo map。
- **文档是 raw source，不是事实**：spec / 旧文档逐条核对，code wins；需求写成 EARS（`WHEN … THE SYSTEM SHALL …`）或带 `FR-xxx` 编号最容易被追踪（spec-kit / Kiro / OpenSpec 的实践）。
- **skills 保持薄**：skill 只描述何时用、怎么调 CLI，确定性逻辑全部在 CLI 中，便于测试与复现（agentskills 规范）。

## 常见坑

- 在 orchestrator 模式下直接手改 `wiki/` 的 hash 让 verify 变绿——这会破坏“知识与代码一致”的保证；应该跑 `kb compound`。
- 把 `wiki/**` 的提交再次触发 compound → 用 `paths-ignore` 与 `[skip ci]`。
- 路由常量不能静态求值（运行时拼接）时 facts 会缺项；保持路由表为常量/资源文件（Android `object Routes`、iOS `enum Route: String`、鸿蒙 `router_map.json`）。
- 引用解析是“简单名称解析”：同名方法很多时会放弃（>3 个候选），传播可能偏保守；可调大 `plan.hops` 或在页面中锚定更具体的符号。
- claude 模式的单任务耗时约 30–60 秒；大改动请依赖全量重建阈值 + `--max-llm-tasks`。

## 局限

- **cgo**：tree-sitter 语法是 C 代码，需要 C 编译器；交叉编译需相应工具链。
- **ArkTS 语法**：使用 `harmony-contrib/tree-sitter-arkts`（vendored 于 `internal/grammars/arkts`，MIT）。上游报告约 94% 的真实工程文件可无错解析，我们在 3858 个真实 .ets 文件上实测为 99.9%，失败均来自 ArkUI 调用参数中的尾逗号；出错文件记录在 `parse_failures`（仍尽量抽取符号），不会中断扫描。
- Swift 语法来自 `alex-pinkus/tree-sitter-swift`（使用带生成文件的 tag 版本）；Kotlin 为 `tree-sitter-grammars/tree-sitter-kotlin` v1.1.0；Java/JS/TS 为官方语法。
- 引用边为名称级解析，没有类型推断；跨平台不建立边。
- template writer 产出的页面偏“结构化索引”，叙述质量需 claude 模式。
- 断言核对的 template 模式只能判断“可确定性检查”的部分，语义类断言（行为、流程）需要 LLM。

## 参考

- Andrej Karpathy, *LLM Wiki*（raw sources / wiki / schema、index.md、append-only log.md）
- FSoft-AI4Code **CodeWiki**（基于符号图的增量文档更新）
- **OpenDeepWiki**（受限写集）
- **RepoAgent**（引用关系驱动的文档失效与更新）
- **Aider repo-map**（符号签名作为上下文）
- **Agent Skills 规范**（agentskills.io：SKILL.md frontmatter、渐进加载）
- GitHub **spec-kit**、**OpenSpec**、AWS **Kiro** specs/steering、**EARS**（Easy Approach to Requirements Syntax）
- `harmony-contrib/tree-sitter-arkts`、`tree-sitter/go-tree-sitter`

## 开发

```bash
CGO_CFLAGS="-O2 -w" go test ./...      # 单测 + 集成测试（template 流程、写集回滚、失败不发布）
go vet ./... && gofmt -l cmd internal skills
DEMO_LLM=template demo/run.sh           # 端到端 demo
```

目录：`cmd/kb`（入口）、`internal/extract`（tree-sitter 符号/调用点）、`internal/scan`（遍历 + 引用解析）、`internal/facts`（三端事实）、`internal/engine`（diff/plan/compound/claims/docs）、`internal/wiki`（页面/索引/日志/verify）、`internal/cli`、`skills/`、`examples/`、`demo/`、`internal/grammars/arkts`（vendored ArkTS 语法 + cgo binding）。
