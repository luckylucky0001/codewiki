# AGENTS.md — codewiki 写作规范（schema）

本目录是由 `kb` 维护的 LLM Wiki（Karpathy LLM Wiki 模式：raw sources / wiki pages / schema）。
任何 agent 在写入前必须遵守以下约定；违反约定的写入会被 `kb verify` 拒绝发布。

## 三层结构

| 目录 | 谁写 | 说明 |
|---|---|---|
| `raw/docs/` | `kb ingest` | 旧文档/规格原文，只读、低可信，不得修改 |
| `facts/` | `kb scan`（确定性） | 路由/深链/testID/接口/符号表，**生成文件，禁止手改** |
| `pages/` | LLM（按 skill） | 跨三端的功能(features)、流程(flows)、概念(concepts)、决策(decisions) |
| `index.md` / `log.md` / `llms.txt` | `kb` | 目录、append-only 日志、外部 agent 入口；由 CLI 维护 |

## 页面 frontmatter 契约

```yaml
---
id: features/cart            # = 路径去掉 pages/ 与 .md
title: 购物车
kind: feature                # feature | flow | concept | decision | overview | conflicts
platforms: [android, harmony, ios]
routes: [cart]               # 覆盖的 route_id（与 facts/routes.json 一致）
sources:                     # 锚点：符号 ID + 当前内容 hash（用 kb anchor <id> 获取）
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen
    hash: 3f0c...
source_commit: 8c1d2e4
status: current              # current | stale | outdated-doc
---
```

## 写作规则

1. **只写任务给出的可写集合（write set）**；写集合之外的修改会被自动回滚并记为违规。
2. 每个关于代码行为的断言都要有锚点：在 `sources` 中列出所依据的符号及 hash；正文中引用符号时使用完整符号 ID（反引号包裹）。
3. 不要编造符号、路由、testID、接口；只使用任务上下文和 `facts/` 中出现的事实。代码与旧文档冲突时，**以代码为准**，并在 `pages/_conflicts.md` 记录。
4. 链接使用相对路径（例如 `../overview.md`），不得出现死链；新页面会被 `kb` 自动加入 `index.md`。
5. 不要修改 `facts/`、`raw/`、`index.md`、`log.md`、`.kb/`。
6. 页面正文用中文，代码标识符保持英文原样；简洁、可被 agent 检索（标题、表格、列表）。

## 日志格式

`log.md` 为 append-only，每条记录形如 `## [YYYY-MM-DD] op | subject`，op ∈ init | ingest | compound | verify | fix-index。
