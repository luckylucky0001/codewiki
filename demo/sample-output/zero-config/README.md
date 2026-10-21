# 未初始化仓库中的 skill 行为（真实 claude -p --model haiku）

测试场景：复制一份 `examples/minishop`，不提供 `codewiki.yaml` 和 `wiki/`，只运行 `kb install --agent claude`。
提问："购物车页面（cart 路由）三端分别设置了哪些 testID？请给出出处。"
允许的工具：`Bash(kb:*)`、Read、Glob、Grep、Skill。

| 版本 | 轮数 | 成本 | 做法 | 答案 |
|---|---|---|---|---|
| 改进前 | 12 | $0.0087 | `kb search` 报错后退回 grep 源码，没有用 kb | 正确 |
| 改进后 | 5 | $0.0066 | 先运行 `kb init`，再运行 `kb compound --llm template` 建好 wiki，然后用 `kb get features/cart` 和 `kb lint-tid --pages` 回答 | 正确 |

改进内容：
- 没有配置时，报错信息直接写出完整的初始化步骤。
- `kb install` 写入的 CLAUDE.md / AGENTS.md 指引块，以及 4 个 skill 的 Prerequisite 一节，都写明"wiki 不存在时先 `kb init`，再 `kb compound --llm template`"。
- `kb routes`、`kb lint-tid`、`kb parity`、`kb scan`、`kb anchor` 支持零配置运行。

每种情况只跑了 1 次，样本很小。原始 transcript 见 `before.json.gz` 和 `after.jsonl.gz`。
