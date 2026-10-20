# Agent A/B 基准：wiki + skills 对 agent 有没有用

这个基准回答一个问题：同一个 agent、同一个模型、同一个问题，**有** codewiki（wiki + kb skills）和**没有**它，结果差多少？

```bash
demo/run.sh                                    # 先得到 compound 过的 minishop 仓库
bench/agent-qa/run.sh demo/output/<run>/repo   # 默认 haiku，每题 A/B 各跑 1 次
AGENT_REPS=3 AGENT_PAR=6 bench/agent-qa/run.sh demo/output/<run>/repo out/
AGENT_RESCORE=1 bench/agent-qa/run.sh demo/output/<run>/repo out/   # 只重新打分，不调 claude
```

## 设置

| | A：有 wiki | B：无 wiki |
|---|---|---|
| 工作区 | demo 仓库的 clone，含 `wiki/`，用 `kb install-skills` 装好 skills | 同一份源码树（`git archive`），删掉 `wiki/`、`.claude/`、`codewiki.yaml`，新建 git 历史 |
| 工具 | `Skill, Read, Glob, Grep, Bash(kb:*)` | `Read, Glob, Grep` |
| 模型 | `claude -p --model haiku` | 同左 |
| 提示词 | `questions.json` 中的问题 + 统一后缀（只读、简洁、给依据） | 同左 |

问题（10 个，`questions.json`）都有可以机器核对的答案：三端购物车上限、结算调用的接口、订单详情 deeplink、购物车页 testID、旧文档里过时的说法、改登录要动哪些文件、鸿蒙端加载商品的函数名（改名之后）、profile 页的实现文件、测试注入参数、三端不一致。

打分：对最终回答（换行折成空格）跑 `must` / `must_not` 正则（`grep -Ei`）。`must` 至少命中 `min` 条（默认全部），并且 `must_not` 一条都不命中，才算通过。每次运行的 turns、tokens、费用、耗时都取自 stream-json 的 `result` 事件。

## 结果（haiku，每题每组 3 次，共 60 次运行，总费用 $0.54）

| | 通过 | 检查点命中 | 平均 turns | 平均输入 / 输出 tokens | 总费用 | 平均耗时 |
|---|---|---|---|---|---|---|
| **A 有 wiki + skills** | 30/30 | 81/81 | **9.0** | 259k / **4.5k** | **$0.249** | **30 s** |
| B 只有源码 | 30/30 | 81/81 | 12.7 | 274k / 6.6k | $0.290 | 39 s |

逐题明细见 [`demo/sample-output/agent-bench/results.md`](../../demo/sample-output/agent-bench/results.md)，原始 transcript 在同目录的 `transcripts/*.jsonl.gz`。

**结论如实写：**

- **准确率没有差别。** minishop 三端一共只有 49 个源文件（含配置），haiku 靠 grep 加读文件，10 个问题全都能答对。这个规模的仓库上，wiki 的价值不体现在准确率上。
- **效率有差别。** A 平均 turns 少 29%（9.0 vs 12.7），费用少 14%，耗时少 23%，输出 tokens 少 31%。差别集中在需要跨三端汇总的问题上：
  - `q10-parity`（三端有哪些不一致）：A 11.3 turns / 43 s，B 39.3 turns / 111 s。A 直接读 `kb parity`，B 要逐个文件比对。
  - `q06-login-files`：A 6.7 turns，B 13 turns。
- **有一题 A 没有优势。** `q05-outdated-docs`（旧文档里有哪些过时说法）两边都是约 25 turns。A 的 agent 没有优先读 `pages/_conflicts.md`，而是自己去翻旧文档。这说明 kb-query skill 的描述还可以更明确地指向 `_conflicts.md`。
  - **后续尝试（无效）**：在 kb-query 的 description 里加了“旧文档 / 过时说法请先读 `pages/_conflicts.md`”，用新版检查器生成的 wiki 重新跑 3 次 A 组的 q05：仍然是 25.3 turns、92 s。haiku 在 `-p` 模式下遇到这个问题仍然不调用 skill，直接去读文档。所以 skill 的触发率本身也是需要改进的点。在第一轮里，A 组 30 次运行中有 22 次用到了 skill、`kb` 或 wiki 文件，另外 8 次完全没碰（q07 三次都是）。这次追加花费 $0.21，基准总花费 $0.75。
  - **第 6 轮（有效）**：新增 `kb conflicts`（列出与代码矛盾的文档断言，附 `文件:行号`、代码证据和修改建议），kb-query / kb-lint 的 description 第一句就指向它。重跑 A 组 q05 3 次：全部调用了 `kb conflicts`，平均 **4.7 turns / 20 s / $0.018**（之前是 25.3 turns / 92 s / $0.069）。结果见 `results.q05-kb-conflicts.md`。
- **预计在大仓库上差距会更大，但这里没有测。** grep 的成本随仓库规模增长，查 wiki 基本不变。这一点需要在真实大仓库上验证，目前只是推测。

**打分修正的披露：** 第一次打分时，`q02` / `q07` 的接口正则写成了 `GET[^a-z]{0,6}/api/products`，匹配不到回答里的 `GET https://api.minishop.example/api/products`。结果 A 只通过 28/30，B 只通过 27/30，但人工核对后这些回答都是对的。正则已放宽为 `GET.{0,60}/api/products`，A、B 两组同样重新打分。修正前的结果保留在 `results.before-regexfix.md`。

## 大仓库变体：HarmonyOS Cases（第 6 轮）

为了检验“仓库越大，wiki 越有用”这个推测，在 HarmonyOS Cases 上做了同样的实验（1952 个 .ets 文件，726 MB；A 组的 wiki 有 96 页、940 个锚点）。问题集是 `questions-cases.json`，共 5 题：某个路由的 buildFunction 和实现文件、哪些函数请求了某个远程 JSON、某个接口在哪里被调用、某个模块注册了哪些路由、卡片请求的 URL。每题每组跑 2 次，用 haiku。

```bash
AGENT_QUESTIONS=bench/agent-qa/questions-cases.json AGENT_REPS=2 bench/agent-qa/run.sh <Cases 的副本，含 wiki>
```

| | 通过 | 平均 turns | 总费用 | 平均耗时 |
|---|---|---|---|---|
| A：wiki + skills | 10/10 | 5.9 | $0.039 | 15 s |
| B：只有源码 | 10/10 | 5.9 | $0.040 | 16 s |

**结论如实写：没有差别，推测不成立（至少对这类问题如此）。** 这 5 个问题都能用一个唯一的字符串（路由名、URL、文件名）直接 grep 到答案。grep 在 726 MB 的仓库上也只要几秒，所以 B 组并不吃亏。A 组 10 次运行里只有 4 次读了 wiki 文件，没有一次调用 `kb` 或 skill。按单题看，“模块注册了哪些路由”这题 A 略好（6.5 vs 10 turns），“某个路由的 buildFunction”这题 B 略好（3 vs 6 turns）。

wiki 真正有优势的，是 minishop 上那类需要**汇总**的问题：三端差异、哪些文档过时（配合 `kb conflicts`）。这类问题在 grep 下需要很多轮。要在大仓库上证明这一点，需要设计汇总类问题，并让 agent 稳定地调用 skill。这一轮没有做到。结果和 transcript 在 `demo/sample-output/agent-bench-cases/`，本节花费 $0.13。
