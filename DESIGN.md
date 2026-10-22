# codewiki 设计文档（v2）

把三端（Android / iOS / HarmonyOS ArkTS）代码与旧文档 **compound** 成 agent-friendly 的 LLM Wiki；
每次 merge 到 master 触发增量 compound，知识必须与当前代码一致。

## 1. 原则：确定性交给 CLI，理解交给 LLM，一致性靠硬校验

| 层 | 负责 | 产出 |
|---|---|---|
| 事实层 | `kb` CLI（TypeScript，web-tree-sitter WASM 抽取，确定性） | `facts/{android,ios,harmony}/`：模块、页面、路由、深链、接口、testID。机器生成，禁止手改 |
| 理解层 | LLM（按 skill） | `pages/{features,flows,concepts,decisions}/`：跨三端功能、流程、设计取舍 |
| 校验层 | `kb verify`（CI 门禁） | 锚点（符号 ID + 内容 hash）全部匹配 HEAD，否则失败 |

## 2. Wiki 布局（Karpathy LLM Wiki 三层）

```
wiki/
  AGENTS.md          # schema：写作规范
  index.md           # 分层目录（链到 platform / module 子目录）
  log.md             # append-only，"## [YYYY-MM-DD] op | subject"
  llms.txt           # 外部 agent 入口
  raw/docs/          # 旧文档（只读、低可信）
  facts/<platform>/  # CLI 生成
  pages/...          # LLM 维护（v1：features / concepts；v2：每个树节点一页，见 §6）
  module_tree.json   # v2：L0 仓库 → L1 项目 → L2 模块 → L3 功能簇
  .kb/graph.json.gz  # 符号图快照（增量基准，gzip）
  .kb/state.json     # last_sha、模型/prompt 版本
  .kb/update_record.json
```

页面 frontmatter：

```yaml
sources:
  - sym: harmony://entry/src/main/ets/pages/Login.ets#Login.onSubmit
    hash: b71e02a...
source_commit: 8c1d2e4
status: current   # current | stale | outdated-doc
```

## 3. Compound 流程（merge → master）

1. `kb scan`：tree-sitter 抽三端符号 + 引用边 → 新符号图；解析失败文件记入 parse_failures。
2. `kb diff`：与 `.kb/graph.json.gz` 按符号 ID 比对 → unchanged / body / signature / added / deleted / renamed；注释、格式变化 = no-op；`--base <sha>` 兼容 squash。
3. `kb plan`：受影响页面 = 自身锚点变化 ∪ 签名变化沿引用边 k 跳；每任务附**可写集合**；>50% 模块或 >30% 结构变化 → 全量重建。
4. LLM 执行：`claude -p`（或 codex / gemini）+ `codewiki` skill（references/compound.md），写入 staging。
5. `kb verify`：锚点 hash、符号存在、死链、孤儿页、index 覆盖。
6. 原子替换发布，写 log.md / update_record；失败不发布。

CI 串行（concurrency group）；积压时从 last_sha 一次追到 HEAD。

## 4. 三端事实抽取

| | 路由/页面 | 深链 | testID |
|---|---|---|---|
| Android | Compose `composable("route")`、Activity/Fragment | Manifest intent-filter | `testTag` |
| iOS | SwiftUI `navigationDestination`、View | Info.plist URL scheme | `accessibilityIdentifier` |
| 鸿蒙 | `router_map.json`（Navigation，API12+ 推荐）、`main_pages.json` | `module.json5` skills.uris | `.id()` |

## 5. CLI / Skills 约定

- 所有命令 `--json`；stdout 数据 / stderr 日志；退出码 0 ok / 1 stale / 2 usage / 3 internal；`--dry-run`；无交互；幂等。
- Skill：只有一个 `codewiki` skill，遵循 agentskills 规范。SKILL.md 负责路由，不超过 500 行；细节放在 `references/{query,ingest,compound,lint,tree,ownership}.md`。
- CLI：只有一个 `kb`，新功能都做成子命令。

## 6. v2：多级目录（详见 docs/tree.md）

- **树的构建与修复**：`kb compound` 每次都会构建或修复 `module_tree.json`，层级为 L1 项目（Gradle settings / SwiftPM / Xcode / hvigor）→ L2 构建模块 → L3 功能簇（Leiden 聚类，簇 id 按 Jaccard 继承）。增量修复走规则链，超过阈值时重聚类或整树重建。
- **页面与 kb 块**：每个节点一页。页面里由 kb 维护的块有 breadcrumb、children、symbols、routes、dependents、diagram（带 hash）和 sources，每次运行都会重算。LLM 只写块外的叙述。
- **自底向上写作**：父页只读子页摘要；子页摘要变化会改变父页的 `children_digest`，父页随之 stale。
- **校验与查询**：verify 检查树的一致性和块的新鲜度。`kb tree show|explain|deps|patch` 用于查询和受校验的人工调整。

## 7. v2：文档所有权 SFK（详见 docs/ownership.md）

- **所有权**：`wiki/` 归 kb 所有；仓库 `docs/` 和各项目的 `<project>/docs/` 由人和 kb 共写。人写的内容不改、不删、不重排，每次写入前由 `checkHumanContentPreserved` 校验。
- **文件状态与写法**：new / managed / skeleton / adopted / frozen，分别对应新建、按 key 替换、去占位后插入、只追加、不动。
- **条目来源**：条目都带 `**Source**` 行，由 kb 确定性生成；也可以由 agent 补写（agent 只有只读工具），kb 校验来源后才合并。
- **归属**：按证据路由到仓库 docs 或项目 docs；specs 只读，Draft spec 只能产出 `[Unconfirmed]` 条目。
- **校验**：`kb verify --docs` 只在 kb 拥有的内容里出现坏引用时失败；人写正文里的坏链作为 `human_review_candidates` 报告，加 `--strict` 才算失败。

## 8. v2：缓存与性能

热扫描复用三层缓存，每层都按全部输入的内容 hash 作为键，任何变化都会整层失效、重新计算，所以结果与无缓存运行逐字节一致：

1. **按文件的解析结果**：call sites 单独存一个文件，只在需要重算 facts 时才加载。
2. **解析好的引用**。
3. **facts 结果**：键里还包括平台根目录下所有文件的 (path, size, mtime) 和配置。

## 参考

Karpathy LLM Wiki gist、FSoft-AI4Code/CodeWiki（符号图 diff）、OpenDeepWiki（受限写集）、RepoAgent（引用边失效）、
Aider repo-map、harmony-contrib/tree-sitter-arkts、agentskills 规范。
