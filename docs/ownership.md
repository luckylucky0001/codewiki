# docs 所有权模型（SFK Compound 风格）

> 适用范围：`docs/`（仓库级）与 `<project>/docs/`（项目级）这两类**人机共写**的文档。`wiki/` 由 kb 全权拥有，不在本文范围内。
> 实现：`src/docs/`（纯函数，测试在 `test/docs/`）。设计依据：[research/design-v2.md](research/design-v2.md) §4、[research/sfk-compound-mapping.md](research/sfk-compound-mapping.md)。

核心承诺只有一句：**人写的内容一个字节都不改、不删、不重排。** kb 只改动带所有权标记的条目；任何拿不准的情况都转为"需人工复核"，而不是写入。

## 1. 作用域：repository + project targets

一次运行 = 一个 `repository` 作用域 + 若干 `project` 作用域（`src/docs/scope.ts`，`discoverScopes()`）。

| 字段 | repository | project |
|---|---|---|
| `docsRoot` | `docs` | `<root>/docs` |
| `specsRoots` | `['specs']` | `['specs', '<root>/specs']`（根 specs 永远是输入） |
| `docsReadEnabled` | 默认 true | — |
| `writeEnabled` | 默认 true；`--no-root-write` 时 false（根 docs 仍可读、可被交叉引用） | 恒可写自己的 docs |

项目发现顺序：

1. **显式路径**（位置参数）：容器目录 `apps/ services/ packages/ libs/ modules/` 展开为直接子目录；其他路径取**最近的含构建标记的祖先**（`settings.gradle(.kts)`、`build.gradle(.kts)`、`Package.swift`、`*.xcodeproj/*.xcworkspace`、`Podfile`、`build-profile.json5`、`oh-package.json5`、`package.json`、`go.mod`、`Cargo.toml`、`pom.xml`、`pyproject.toml`，`src/` 为弱标记）。路径为仓库根 → 只有 repository。
2. **配置**：`codewiki.yaml scopes.projects`（id 固定）。
3. **自动**：容器目录的直接子目录 + 根下带构建标记的移动端目录 `android/ ios/ harmony/`（`harmonyos/ ohos/` 同义）。
4. 都没有 → 单根仓库（`singleRoot=true`），**不再重复建 project**。

忽略：隐藏目录、symlink、`node_modules build dist out target vendor Pods Carthage oh_modules DerivedData generated …` 与 `exclude`。
`id` = 根目录名 slug；冲突按根路径排序追加 `-2`、`-3`；`repo` 保留；配置里写过的 id 优先（稳定）。`--project <id>` 只保留指定项目，未知 id 进入 `unresolved`。

**归属规则**（`route.ts`，`routeByEvidence()`）：

- 有根证据（根 specs、根构建文件、共享包）→ 根 docs。
- 来自 **≥2 个选中项目**的匹配证据（同一 parity key 值一致；无 key 时视为匹配）→ 根 docs；各项目 docs 只写一行交叉引用（`xref:` 行，`xrefRow()`），不复制正文。
- ≥2 个项目同 key 但值不同 → 仍归根 docs，标记 `parityDiff`（写进"跨端差异"）。
- 只有一个项目的证据 → 该项目 docs。
- 未选中项目的证据不计入；根写入关闭时返回 `dest=null` 并说明原因。

写入守卫（`isWritableDocPath()`）：repository 只写 `docs/**`，project 只写 `<root>/docs/**`，**任何 specs 根下永不写入**，只写 `.md`。

## 2. 文件状态机

`classifyFile(text, dimensionEnabled)`（`ownership.ts`）：

| 状态 | 判定 | 写入动作（每个文件一次决策） |
|---|---|---|
| `disabled` | 维度未启用 | 不写 |
| `new` | 文件不存在 | 只用**已验证**条目创建（`[Pending]`、无验证状态的条目丢弃）；没有条目 → 不建文件（null passthrough） |
| `managed` | frontmatter 有合法日期 `last_compound_scan` | 按 key 原地替换 / 追加 owned 条目；源已删除的旧条目改标 `[Pending]`（不删） |
| `skeleton` | 去掉 frontmatter 后只剩标题和客观占位符：空行、`TODO`、`TBD`、`待补充`、`[DESCRIPTION]` / `[大写占位]`、`{CONTENT}` / `{大写占位}`、纯模板 HTML 注释、空列表项、分隔线 | 删除占位行，保留全部标题（含文件标题），按节插入条目 |
| `adopted` | 其余（有任何真实的人类内容，包括 `TODO: 具体说明`） | **只追加**带来源的条目和目录链接行；已存在的 key 一律不动；`[Pending]` 不插入 |

frontmatter：kb 只拥有 `last_compound_scan`、`compound_scan_mode`、`compound_source_commit`（codewiki 扩展），其他键逐字保留。**只有真的写了内容才刷新**（noop 不刷新）。

**知识层文件**（SFK 定义，`isKnowledgeLayerFile(path, docsRoots)`）只有两类：`<docs_root>/adr/**`（ADR）与 `<docs_root>/tech-debt.md`。它们由各自的生成器维护（§6），永远不加 frontmatter。

`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`.github/copilot-instructions.md`、`llms*.txt`、`.cursor/rules` 等是 `kb install` 写的**指针文件**，不属于知识层，也不在 docs 作用域内：它们被排除在 docs 清单之外（`isInstallPointerFile()`）；只有当它们位于某个 docs_root 之下时，才作为普通人类文档对待。

行数预算（`lineBudget()`）：`new`/`skeleton` 首次写入 ≤150 行，`managed`/`adopted` 追加 ≤100 行；超出时在条目边界截断并报告 `truncated`。

## 2.5 维度 schema 与激活

内置 schema（`src/docs/schema.ts` 的 `DefaultSchema`，可用 `mergeSchema()` 按 id 覆盖或追加）面向移动端 monorepo。`output_path` 相对 owner 根（仓库根或项目根），开头的 `docs/` 映射到该作用域的 docs_root：

| id | 文件 | 作用域 | requirement-oriented（允许 Draft） | 说明 |
|---|---|---|---|---|
| `architecture` | `docs/architecture.md` | repo, project | 否 | 架构总览 / 模块图 |
| `design-patterns` | `docs/design-patterns.md` | repo, project | 否 | MVVM、Repository、Coordinator、DI 等 |
| `coding-standards` | `docs/coding-standards.md` | repo, project | 否 | lint / format 配置所体现的规范 |
| `navigation` | `docs/navigation.md` | project | 否 | 页面 / 路由 / 深链（来自 facts） |
| `api-contracts` | `docs/contracts.md` | repo, project | 否 | 接口契约、共享模型、错误码 |
| `testing` | `docs/testing.md` | repo, project | 否 | 测试布局、testID 约定 |
| `product-specs` | `docs/product-specs.md` | repo, project | 是 | spec 索引（只链接，不复制正文） |
| `features` | `docs/features.md` | repo, project | 是 | 功能目录 |
| `requirements` | `docs/requirements.md` | repo, project | 是 | 需求模式 / 业务规则 |
| `constitution` | `docs/constitution.md` | repo, project | 否 | **constitution 例外**：owned 块 + Evidence，只接受可信证据 |
| `service-topology` | `docs/service-topology.md` | repo, project | 否 | 仅在有后端时激活（`detectBackend()`） |

每个维度还声明 `probe_paths`（激活探针）和 `evidence`（允许的证据种类）。

**激活**（`activateDimensions()`，每个作用域一次）：用户 `disable` 优先 → 作用域不匹配则不激活 → `force`、已存在的输出文件、探针命中、本次产生了条目，任一满足即激活。`service-topology` 没有后端且没有已存在文件时不激活。

**null passthrough**（`planDimensionWrites()`）：激活但没有条目 → 已存在的文件 `leave`（不动），不存在的文件 `skip-null`（不建文件、不写标题、不写 TODO）。

**额外 schema 登记**（`.kb/docs-schema-extra.yaml`）：
- `discoverExtraDocs()` 找出 docs_root 下没有被任何维度覆盖的 `.md`，知识层文件除外。docs_root 下的指针文件也会被收录。
- 每条记录为 `target_root`、`output_path`（相对 target_root）、`target`（取首个标题，否则取首段，≤120 字符）、`enabled`。
- `updateExtraSchema()` 只追加新条目、只补空的 `target`，保留用户的修改与注释。
- `enabled: false` 表示该文件**逐字节不动**：`isFrozenDoc()` 返回 true，既不合并也不写入。未登记的未知文件同样视为冻结。

## 3. 条目所有权标记

`parseDocument()`（`markers.ts`）是一个自写的行级 Markdown 块解析器（围栏代码块、ATX 标题、HTML 注释标记），保持字节偏移精确。代码块里的一切都是人类内容。

| 条目 | 形式 | 合并 key |
|---|---|---|
| 通用条目 | 标题 + 正文，以 `` **Source**: `path` [Code Direct] `` 或 `[AI Inferred]` 行结束，可加 `[Verified]`/`[Pending]`/`[Unconfirmed]` 与锚点 `<!-- a=<id>@<hash> -->` | `[Code Direct]`：`src:<规范化路径>::<标题>`；`[AI Inferred]`：`dim:<维度>::<标题>` |
| constitution 块 | `<!-- compound:owned:start key="rule:…" -->` … `Evidence: …` … `<!-- compound:owned:end -->` | key 属性 |
| 索引行 | 行内 `<!-- compound:owned key="index:…" -->` | key |
| 交叉引用行 | `<!-- compound:owned key="xref:…" -->` | key |
| 技术债行 | `<!-- compound:owned key="debt:…" -->` | key |
| ADR 提案 | 文件首行 `<!-- compound:proposed key="adr:…" -->` | key |

**其他一切都是人类内容。** 以下情况一律按人类内容处理并写入 `review`：同一节里多个 `**Source**` 行、`**Source**` 行在任何标题之前、owned 块缺 `Evidence:` 或缺结束标记、孤立的结束标记、重复 key（所有副本都降为人类内容）。

条目跨度 = 标题行 … `**Source**` 行；`**Source**` 之后到下一个标题之间的文字仍属于人类。`[AI Inferred]` 条目升级为 `[Code Direct]` 时按 (维度, 标题) 找到旧条目原地替换。

## 4. 合并与人类内容不变量

`mergeDocument(input)`（`merge.ts`）→ `{ action: write | skip | noop | review, text?, inserted, replaced, unchanged, markedPending, dropped, truncated, review, linesAdded }`。

- 插入位置：目标节（`section` 标题）内最后一个 owned 条目之后；节内没有 owned 条目时放在节末尾最后一个非空行之后；索引/债务行紧跟同前缀的 owned 行或节内最后一个列表项/表格行。节不存在 → 文件末尾新建 `## 节名`。
- **歧义 → `review`，不写**：目标节标题出现多次、要写的 key 在文件中重复、同 key 类型不一致。
- 输入校验：条目正文不得含标题、`**Source**` 行、`compound:` 标记或未闭合围栏；标题/节名必须能逐字往返解析，否则丢弃（保证幂等）。
- 换行风格：插入行沿用文件主流 EOL（CRLF 文件仍是 CRLF）；BOM、无结尾换行均安全。

**不变量**：`assertHumanContentPreserved(before, after)` 把两边解析成"连续的非空人类行块"（围栏内空行算块内），要求序列逐字节相等（块内行尾也比较），并要求非 kb 的 frontmatter 行不变。只允许：在块与块之间增删空行、改动 owned 条目、skeleton 状态删除占位行、合并器自己新建的节标题（`addedChunks`）。`mergeDocument` 在返回 `write` 前必跑此检查，失败即转为 `review`。测试覆盖：标题与条目同名、表格、含假标记的代码块、CRLF、CJK、无结尾换行、setext 标题与 HTML、BOM、引用块里的 Source、150 组随机文档。

## 5. 来源验证与 spec 信任

`verifyEntrySources()`（`sources.ts`）：

- `[Code Direct]` 源存在 → `[Verified]`；缺失 → `[Pending]`（`new`/`adopted`/`skeleton` 文件不插入）。
- 仅来自 Draft spec → `[Unconfirmed]`，且只允许 requirement-oriented 维度。
- `[AI Inferred]` → 调用注入的证据搜索：找到 → 升级为 `[Code Direct]` + 锚点；找不到 → 丢弃。

`specs.ts`：`parseSpecMeta()` 读 `**Status**:` / `**Created**:`（缺省 Draft）。`Implemented/Verified/Archived` 可信；Draft 只能产出 requirement 维度的 `[Unconfirmed]`，永远不进 constitution / ADR / 技术债。`trustDecision(status, verdict)` 叠加 ingest 的 verified / conflict / unverifiable。`detectStaleSpecs()`（git 查询以函数注入）：Draft 超过 30 天无提交（无提交时用 Created 日期）、Draft 无任何历史、Implemented 从未 Verified、Implemented 但与代码冲突。

## 6. ADR 与技术债

- `planAdrs()`：每个 adr 目录内 `max(NNNN)+1`；按 key、标题、或"同一 related spec 且标题相近"去重；只接受可信 spec；生成 `docs/adr/NNNN-<kebab>.md`（中文标题无 ASCII 时用 `decision-<hash>`），首行 proposed 标记，`**Status**: Proposed`，Context / Decision / Consequences / Evidence。**既有 ADR 永不编辑**；对自己的输出重跑是幂等的。
- `applyDebt()`：`TD-NNN` 续号（人工行也计入）；新行只追加到表尾；owned 行只在 Status 为 `Open` 时刷新 Description / Source / Location；人把 Status 改成别的值后永不再动；证据消失 → Status 追加 `[Pending]`，不删行；文件不存在且没有新条目 → 不建文件。`extractDebtComments()` 只收 `TODO/FIXME/HACK` 且带 ≥4 个词（或 ≥6 个汉字）解释的注释。

## 7. 链接检查

`checkLinks()`（`links.ts`）只报告，**从不自动删除人写的链接**：

- Markdown 链接 / 图片 / 引用式定义（跳过外链、行内代码、代码块），`#anchor` 按 GitHub slug 规则校验（含中文、重复标题 `-1` 后缀、`#L10` 行号锚点放行）。
- 反引号内的 `./`、`../` 路径：相对文件所在目录解析。
- 反引号内的仓库路径（首段是已知顶层目录）与 `**Source**` 路径：从文件目录逐级向上到仓库根解析。
- 断链给出建议：同一路径按正确的 `../` 深度重新计算（例如 `services/x/docs/arch/y.md` 中应写 `../../../../docs/architecture.md`），以及同名文件。

## 8. 增量与运行状态

- **增量基准（codewiki 扩展 `.kb/docs-state.json`）**：`{ "<scope_id>": { "last_scan_commit": "<sha>", "last_scan_date": "YYYY-MM-DD" } }`。每次成功运行（包括没有写任何内容的 noop 运行）后由 `recordScopeScan()` 记录；`resolveScanBase()` 优先使用它。原因：SFK 的基准只来自 frontmatter，而 frontmatter 只在写入内容时刷新，noop 运行永远推进不了基准。文件不存在或该作用域没有记录时，回退到 SFK 规则：
- `earliestScanBase()`：作用域内 managed 文件中最早的 `last_compound_scan`（及其 `compound_source_commit`）。
- `computeScopeChanges(git, scopes)`：git 以函数注入。有 commit 基准 → `git diff --name-status -M <base> HEAD`；否则 `git log --since=<date> --name-status -M`；再并上 `git diff`、`git diff --cached`、`git status --porcelain`；rename 两端都计入。文件按最深项目根归属，否则归 repository；根 `specs/` 变更对所有作用域都可见。非 git、浅克隆且缺基准、无 managed 文件 → `full`。
- `.kb/run-state.json`（`runstate.ts`）：`decideResume()` —— 同一 HEAD 且未完成 → resume；`--restart` 或 HEAD 变化 → restart；上次已完成 → fresh。agent 结果契约（`contract.ts`）：按 `=== <目标文件> [维度] ===` 分组的条目 + 末行 `COMPOUND_META {"status":"done|continuation","remaining_scope":[…]}`；`routeAgentResult()` 保证仓库级结果只写根 docs、项目级结果只写本项目 docs、来源在 agent 白名单之外的条目被拒绝、按 150/100 行预算在条目边界截断。

## 9. `kb docs …` 子命令

> 已实现（`src/engine/docsflow.ts` + `src/cli/cli.ts`，用法以 `kb help docs` 为准）。与下表原设计的差异：`kb docs scope` 为新增；`compound` 另有 `--no-root-read`、`--agent …|--llm template`，不接受路径参数，也没有 `--full` / `--write-adr` / `--write-debt`（ADR 与技术债走独立的 `kb docs adr|debt --write`）；`kb links` 只接受路径和 `--json`，有断链时 exit 1。


| 命令 | 作用 | 退出码 |
|---|---|---|
| `kb docs compound [<path>...] [--project id]... [--no-root-write] [--full] [--write-adr] [--write-debt] [--resume\|--restart] [--dry-run] [--json]` | 作用域发现 → 维度激活 → 增量变更集 → 派发 A（项目代码）/B（项目 spec）/R（仓库综合）→ 来源验证 → 路由 → 所有权合并 → 链接检查（仅本次写入的文件） | 0；1 = 有 review 或断链；2 = 用法错误；3 = 内部错误 |
| `kb docs status [--json]` | 每个 docs 文件的状态、扫描基准、stale / Pending 条目、review 项 | 0 / 1 |
| `kb docs stale-specs [--days 30] [--json]` | Draft 超期、Implemented 未 Verified、Implemented 与代码冲突 | 0 / 1 |
| `kb docs adr [--write] [--json]` | ADR 提案；默认 dry-run，`--write` 才创建文件（确认 = 再次带 `--write` 运行或在 PR 中审阅） | 0 |
| `kb docs debt [--write] [--json]` | 技术债登记提案；默认 dry-run | 0 |
| `kb links [paths...] [--docs] [--wiki] [--json]` | 链接检查；`--exit-code-broken 3` 兼容 SFK | 0 / 1 |
| `kb verify --docs [--strict]` | 只校验 kb 拥有的内容（条目的 Source、条目 / 索引行 / kb 块里的链接）。人写正文中的坏链作为 `human_review_candidates` 报告，不算失败；加 `--strict` 才算失败 | 0 / 1 |

kb 从不交互：所有"需要用户确认"的动作都默认 dry-run，确认方式是带 `--write` 重跑或在 CI 中通过 PR 审阅。
