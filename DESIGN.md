# codewiki 设计文档（v0）

把三端（Android / iOS / HarmonyOS ArkTS）代码与旧文档 **compound** 成 agent-friendly 的 LLM Wiki；
每次 merge 到 master 触发增量 compound，知识必须与当前代码一致。

## 1. 原则：确定性交给 CLI，理解交给 LLM，一致性靠硬校验

| 层 | 负责 | 产出 |
|---|---|---|
| 事实层 | Go CLI（tree-sitter 抽取，确定性） | `facts/{android,ios,harmony}/`：模块、页面、路由、深链、接口、testID。机器生成，禁止手改 |
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
  pages/...          # LLM 维护
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
- Skill：单一 `codewiki` skill（agentskills 规范：SKILL.md 作路由 < 500 行，细节在 `references/{query,ingest,compound,lint}.md`）。CLI 只有一个 `kb`，新功能都是子命令。

## 参考

Karpathy LLM Wiki gist、FSoft-AI4Code/CodeWiki（符号图 diff）、OpenDeepWiki（受限写集）、RepoAgent（引用边失效）、
Aider repo-map、harmony-contrib/tree-sitter-arkts、agentskills 规范。
