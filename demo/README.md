# codewiki 端到端演示

`demo/run.sh` 用 `examples/minishop` 在临时目录建一个 git 仓库，分支为 `master`。脚本先模拟 **初始化 → 文档入库 → 首次 compound**，再按顺序合并 `examples/minishop-changes/` 下的 3 个变更集，每次合并后都执行一次增量 compound 和 verify，最后跑一组查询命令。

## 1. 安装依赖

- Go 1.24，需要 cgo 和 gcc/clang（tree-sitter 语法是 C 代码）
- git、jq
- 可选：`claude` CLI（已登录，`claude -p "hi"` 能返回结果）。只有 claude 模式需要。

```bash
go build -o kb ./cmd/kb      # 仅为了确认能编译；run.sh 会自行编译到输出目录
./kb --help
```

## 2. 配置

不需要手动配置。`kb init` 会探测 `android/`、`ios/`、`harmony/`，并生成 `codewiki.yaml`。demo 使用这份默认配置：

```yaml
wiki_dir: wiki
platforms: [{name: android, root: android}, {name: ios, root: ios}, {name: harmony, root: harmony}]
plan: {hops: 1, rebuild_module_ratio: 0.5, rebuild_structural_ratio: 0.3}
llm: {cmd: "claude -p --permission-mode acceptEdits --allowedTools ... --output-format text"}
```

## 3. 运行

```bash
DEMO_LLM=template demo/run.sh     # 默认。离线、确定性、可复现，约 1 分钟
DEMO_LLM=claude   demo/run.sh     # 真实 LLM（claude -p）。ingest 和增量 compound 由 LLM 完成
```

claude 模式相关的环境变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `DEMO_BOOTSTRAP_LLM` | `template` | 首次全量 compound 用哪个 writer。默认用 template，省下 7 次 LLM 调用 |
| `DEMO_MAX_LLM_TASKS` | `3` | 每次 compound 最多交给 LLM 的任务数，超出的任务改用 template |
| `DEMO_CLAUDE_CMD` | `claude -p --model sonnet ...` | 完整命令行。prompt 从 stdin 传入，cwd 为 staging wiki |
| `DEMO_OUT` | `demo/output/<ts>-<mode>` | 输出目录 |

claude 模式下单个任务耗时约 30–60 秒。以 `DEMO_MAX_LLM_TASKS=2` 为例，整轮大约 7 次 LLM 调用，总耗时约 6–8 分钟。LLM 失败时，`--fallback` 会改用 template writer，demo 不会因此中断。

## 4. 每一步做了什么

| 步骤 | 命令 | 看点 |
|---|---|---|
| 01 | `kb init` | 生成 `codewiki.yaml`、`wiki/AGENTS.md`（写作规范）、骨架和 `log.md` |
| 02 | `kb discover-docs --json` | 发现 9 篇文档，涵盖 spec-kit `specs/001-cart/`（spec、plan）、Kiro `.kiro/specs/login/` 与 steering、ADR、3 篇旧文档、README；除 README 外的 8 篇会被 ingest |
| 03 | `kb ingest --manifest …` | 抽取 33 条断言，逐条判为 verified、conflict 或 unverifiable，结果写入 `pages/_conflicts.md` 和 `facts/requirements.json` |
| 04 | `kb compound` | 首次运行没有基线，走全量（full），共 10 个任务：6 个功能页、总览页、navigation 和 shared-components 两个概念页、`_conflicts`；另外生成 `parity.md`；verify 通过后发布 |
| 05 | 合并 `01-cart-limit` | 只改注释的变化是 no-op。android 和 harmony 的上限常量属于 body 变化（iOS 漏改，仍为 99），会重写 cart、product_detail、`_conflicts` 三页。spec `FR-002`（99）从 verified 变为 conflict；`kb parity` 报出 `max_cart_items` 三端为 50 / 99 / 50；`changed_route_ids` 为 `[cart, product_detail]` |
| 06 | 合并 `02-arkts-api-rename` | diff 识别出 `Api.loadProducts → Api.fetchProducts`（renamed，similarity 1.00），以及 `CartStore.addItem` 的签名变化。共 4 个任务：更新 products、product_detail、shared-components 三页，并重检 `_conflicts`（其断言锚点涉及被改名的符号）。verify 通过：23 页、358 个锚点 |
| 07 | 合并 `03-profile-route` | facts 中新增 profile 路由；plan 生成 `create pages/features/profile.md`，并更新 overview、navigation、shared-components |
| 90+ | `search` / `context` / `get` / `lint-tid` / `parity` / `eval` / `status` / `verify` | 查询、三端一致性、golden set 评测（accuracy 0.97）与门禁 |

每个变更集都会依次保存 6 个文件：`1-status`（合并后、compound 前哪些页面 stale）、`2-diff`、`3-plan.json`（含 `changed_route_ids` 与按价值排序的 `priority`）、`4-compound`、`5-verify`、`6-parity`。

## 5. 查看结果

```
demo/output/<ts>-<mode>/
  SUMMARY.md                 # 汇总：冲突列表、每次 compound 的 mode/tasks/stale/verify
  01-init.txt … 96-verify.json
  97-log.md                  # wiki/log.md（append-only）
  98-requirements.json       # 需求 → 锚点追踪
  99-update_record.json      # 最后一次运行记录
  99-git-log.txt             # 模拟的合并历史
  repo/                      # 临时仓库；repo/wiki/ 是最终 wiki
```

建议按这个顺序阅读：

1. `SUMMARY.md`
2. `repo/wiki/index.md`
3. `repo/wiki/pages/features/cart.md`：留意 frontmatter 里的 `sources`
4. `repo/wiki/pages/_conflicts.md`
5. `repo/wiki/log.md`

也可以在临时仓库里直接执行命令：

```bash
cd demo/output/<ts>-template/repo
../bin/kb status; ../bin/kb get features/profile; ../bin/kb context ios/MiniShop/Features/Cart/CartViewModel.swift
```

## 6. 已提交的样例输出

`demo/sample-output/` 里有一份代表性快照，不含临时仓库的 `.git`：

- `template/`：`DEMO_LLM=template` 的完整输出，以及最终 wiki
- `claude/`：`DEMO_LLM=claude`（`DEMO_MAX_LLM_TASKS=2`）的输出。由 LLM 写的页面在 `log.md` 和 `update_record.json` 中标记为 `cmd`
- `axios/`：真实仓库 axios 的 discover-docs、scan、ingest 案例，见 [axios/SUMMARY.md](sample-output/axios/SUMMARY.md)
- `hook/`：`demo/hook-demo.sh` 的输出，演示不依赖 GitHub 时用 git server hook 触发 compound，见 [hook/README.md](sample-output/hook/README.md)
- `skills/`：`demo/skills-demo.sh` 的输出，真实 agent（`claude -p --model haiku`）使用 kb skills 的 transcript，见 [skills/README.md](sample-output/skills/README.md)

## 7. 其它演示脚本

| 脚本 | 演示内容 | 依赖 |
|---|---|---|
| `demo/hook-demo.sh [outdir]` | 本地 bare 仓库加 post-receive 钩子：3 次 merge 背靠背 push（其中 2 次几乎同时），钩子串行执行并追平进度，wiki 与 master 一致 | go、git |
| `demo/skills-demo.sh <demo-repo> [outdir]` | 先 `kb install-skills`，再用 `claude -p` 问两个问题，记录 transcript | go、git、jq、claude |
| `demo/snapshot.sh <demo/output/run> <name>` | 把一次运行的结果整理到 `demo/sample-output/<name>`，去掉临时仓库 | — |
| `kb eval` | 用 golden set 评测断言核对和 plan 影响面 | — |
| `bench/agent-qa/run.sh <demo-repo> [outdir]` | Agent A/B 基准：同一组问题分别在“有 wiki + skills”和“只有源码”两种条件下跑 `claude -p --model haiku`，自动打分，统计 turns / tokens / 费用 / 耗时。结果见 `demo/sample-output/agent-bench/` | go、git、jq、claude |
