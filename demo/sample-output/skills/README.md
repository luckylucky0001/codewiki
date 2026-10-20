# Skills 实测：真实 agent 使用 kb skills

步骤：

1. 对 demo 产出的仓库（`demo/run.sh` 生成的 `repo/`，wiki 已经 compound 过）执行 `kb install-skills .`，把 4 个 skill 装进 `.claude/skills/`，然后提交。
2. 用 `claude -p --model haiku` 提两个问题。允许的工具只有 `Skill`、`Read`、`Glob`、`Grep` 和 `Bash(kb:*)`。
3. 记录完整的 stream-json transcript（`*.jsonl`），并整理一份可读摘要（`*.md`）。

复现命令：`demo/skills-demo.sh <demo-repo> [outdir]`（`SKILLS_MODEL=haiku`）。

| 问题 | 触发的 skill | 主要命令 | 轮数 / 成本 / 耗时 | 结果 |
|---|---|---|---|---|
| [q1](q1-kb-query.md)：购物车上限三端分别是多少？引用出处 | `kb-query` | `kb status`、`kb search`、`kb parity --json`、`kb get features/cart` | 5 轮 / $0.0078 / 16 s | 答出 50 / 99 / 50，给出 3 个符号 ID 和 wiki 页面，指出 `CART-43567f`、`FR-002`、`PLAN-3e24ef` 三处文档冲突 |
| [q2](q2-kb-lint.md)：wiki 是否与代码一致？三端 testID 与功能是否对齐 | `kb-lint` | `kb verify --json`、`kb lint-tid`、`kb parity --json`、`kb status` | 17 轮 / $0.0156 / 43 s | verify 通过；testID 无缺口；指出 parity 有 1 处常量差异；列出 6 条文档冲突，并给出建议 |

两次运行后 `git status` 都为空（[99-git-status-after.txt](99-git-status-after.txt)），说明 agent 遵守了只读要求。

## 第一轮暴露的问题与 skill 修正（[round1/](round1/)）

第一轮用的是修正前的 skill：

- **q1 有一次没有触发任何 skill**，直接 `Grep`。另一次虽然触发了 kb-query，但因为 skill 里没提到 `kb parity`，HarmonyOS 的上限只能靠 grep 源码补出来。
  - 原因：功能页只锚定 screen 能到达的符号，鸿蒙购物车页并不引用 `MAX_CART_ITEMS`。
- **q2 在 kb-lint 中反复执行 `kb verify`**（exit 1 / exit 0 混淆），并且是自己找到 `parity.md` 的。

修正内容：

- `kb-query` 的 description 加入跨平台取值类问法（例如“购物车上限三端分别是多少”“引用出处”），正文加入 `kb parity --json`（constant_diffs）的用法，并说明功能页锚点的范围。
- `kb-lint` 的 description 和正文加入 `kb parity`，并写明三点：
  - `kb verify` 只需运行一次，然后读 JSON 里的 `errors`；
  - verify 通过不代表文档与代码一致；
  - 还要看 `_conflicts.md` 和 parity。

修正后的第二轮：两个问题都在第一步就调用了对应的 skill，并且都用到了 `kb parity`。
