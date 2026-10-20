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

## 大仓库 + 汇总类问题：HarmonyOS Cases（第 7 轮）

第 6 轮的问题都是能 grep 到的查找题，这一轮专门测**汇总 / 跨文件**问题：

- G1：router_map 一共几个、注册了多少页面、最多的两个模块各有多少；
- G2：哪些 buildFunction 在源文件里找不到实现；
- G3：哪些路由页面的源文件设置了 testID；
- G4：哪些文件通过 `.request(` 发网络请求；
- G5：使用次数最多的 testID 字面量。

标准答案由 `cases-groundtruth.py` **直接从源码**算出，不依赖 kb 的抽取结果，见 `demo/sample-output/agent-bench-cases-agg/groundtruth.txt`。设置：haiku，每题每组 2 次，`AGENT_MAX_TURNS=40`（两组相同），总花费 $0.28。

```bash
AGENT_QUESTIONS=bench/agent-qa/questions-cases-agg.json AGENT_REPS=2 AGENT_MAX_TURNS=40 bench/agent-qa/run.sh <Cases 的副本，含 wiki>
```

| | 通过 | 检查点 | 平均 turns | 总费用 | 平均耗时 |
|---|---|---|---|---|---|
| A：wiki + skills | 10/10 | 34/34 | 17.6 | $0.149 | 51 s |
| B：只有源码 | 9/10 | 32/34 | 14.0 | $0.126 | 46 s |

**结论如实写：汇总类问题上 wiki 也没有带来可证明的优势。**

- A 多对了 1 次，是 G5（B 有一次因为没有 Bash 而无法计数）。但 A 用的 turns 更多，费用和耗时也略高。每组只有 10 次运行，1 次的差距在噪声范围内。
- **关键事实：A 组 10 次运行中，没有一次调用 `kb` 或 skill。** 只有 1 次直接读了 wiki 文件。A 能接触到 wiki，只是因为它在仓库根目录 grep 时顺带搜到了 `wiki/` 下的 facts JSON 和页面（G3、G4、G5 的部分运行）。也就是说，这一组实际测的是“仓库里多一个可被 grep 的 wiki 目录”，而不是“agent 使用 kb”。

**为什么和 minishop 的结果不同？** minishop 上的收益全部来自 agent **真正调用了对应命令**的题目：“三端不一致”用了 `kb parity`，“过时文档”用了 `kb conflicts`，turns 分别降到原来的约 1/3 和 1/5。在 Cases 上，这 5 个问题虽然有对应的现成命令，agent 却一个都没用上：

- G3 对应 `kb lint-tid`；
- G1 和 G2 对应 `facts/routes.json` 和 router_map 的 dangling 警告；
- G5 对应 `facts/testids.json`。

原因是这些问题读起来像“搜代码”，而 skill 的描述是围绕“三端功能、路由、过时文档”写的，haiku 没有把它们联系起来。所以**瓶颈在 skill 的触发和命名，而不在 wiki 的内容**。这和 q05 的经验一致：只改描述没有用，要有一个名字直接对应问题的命令（`kb conflicts`）。

**打分修正的披露**：

- G3 的 `must_not` 正则匹配到了“没有”里的“有”，把 B 的一个正确回答判成了错；
- G5 题面写的是“整个仓库”，B 的一个回答把 docs/*.md 里的 1 个示例也算进去，得到 14。这个解读合理，现在 13 和 14 都接受。

两项修正对 A、B 同样适用。修正前的结果（A 10/10，B 7/10）保留在 `results.before-scoring-fix.md`。

## 加上 AGENTS.md / CLAUDE.md 指引块（第 8 轮，只重跑 A 组）

`kb install-skills` 会在目标仓库的 `AGENTS.md` 和 `CLAUDE.md` 里写入一段带标记的指引块，把各类问题映射到对应命令。块的内容见 `demo/sample-output/agent-bench-cases-agg/with-agents-block/agents-block.md`。写入是幂等的，块外内容不会被改动，有测试覆盖（`TestInstallSkillsAgentsBlockIdempotent`）。

用同一组 5 道汇总题，A 组每题跑 2 次，用 haiku，turn 上限 40，花费 $0.14：

| | 通过 | 平均 turns | 总费用 | 平均耗时 | 工具调用涉及 wiki 的运行 | 调用 `kb` 的运行 |
|---|---|---|---|---|---|---|
| A + 指引块（第 8 轮） | 10/10 | **13.8** | $0.142 | 52 s | **8/10** | **2/10** |
| A（第 7 轮，无指引块） | 10/10 | 17.6 | $0.149 | 51 s | 2/10 | 0/10 |
| B（第 7 轮，只有源码） | 9/10 | 14.0 | $0.126 | 46 s | — | — |

**结论如实写：**

- 指引块确实改变了 agent 的行为：涉及 wiki 的运行从 2/10 增加到 8/10，`kb` 首次被调用（G3 中的 `kb lint-tid`）。turns 比无指引块时少 22%。skill 仍然没有被触发。
- 但和 B 组相比，**准确率、turns、费用和耗时都没有明显优势**。
- 一个具体原因：agent 想用 `ls`、`head`、`python` 读取 `wiki/facts/*.json`，但基准只允许 `Bash(kb:*)`，这些调用被拒绝，agent 只能退回到 Read 和 Grep（G1 和 G2 的每次运行都有 1–2 次被拒）。
- 下一步：一是指引块里直接写出“用 Read 打开 `wiki/facts/routes.json`”这类可执行动作；二是让 `kb` 直接回答汇总问题，例如 `kb lint-tid --pages`、`kb routes --dangling`。这一轮没有做。

## 再加上汇总命令和具体工具动作（第 9 轮，只重跑 A 组）

新增 `kb routes [--dangling]` 和 `kb lint-tid --pages`，有测试覆盖（`TestRoutesAndLintTidPages`）。指引块改为写明具体的工具动作，例如“Bash: `kb routes`”“Read `wiki/facts/routes.json`”“Grep `wiki/facts/testids.json`”。块的全文见 `with-commands/agents-block.md`。

| A 组配置 | 通过 | 平均 turns（全部 / G1–G4） | 费用（全部 / G1–G4） | 平均耗时 | 调用 kb 的运行 |
|---|---|---|---|---|---|
| 第 7 轮：无指引块 | 10/10 | 17.6 / 17.0 | $0.149 / $0.115 | 51 s | 0/10 |
| 第 8 轮：+ 指引块 | 10/10 | 13.8 / 13.1 | $0.142 / $0.114 | 52 s | 2/10 |
| 第 9 轮：+ 命令 + 具体动作 | 10/10 | **9.6 / 8.1** | $0.384 / **$0.067** | 57 s | **8/10** |
| B 组（第 7 轮） | 9/10 | 14.0 / 14.8 | $0.126 / $0.095 | 46 s | — |

**结论如实写：**

- 有专门命令的题目（G1–G3）上，A 组每次都调用了对应命令。G1–G4 的 turns 比 B 组少 45%，费用低 30%。
- 没有专门命令的 G5 上，两次运行花了 $0.317（大段 Grep 输出加上大量 thinking），总费用是 B 组的 3 倍。
- kb 命令每次都要加载扫描结果，因此单次耗时偏长。
- 这一轮花费 $0.38，超出了约 $0.15 的预算，原因就是 G5。所有基准累计约 $1.73。
