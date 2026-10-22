# Agent 规划的模块和业务链路知识

客户默认通过当前 IDE 加载 `codewiki` skill（唯一的 skill；入口是 SKILL.md §9），按 [IDE 文件交接协议](../skills/codewiki/references/ide-handoff.md) 完成规划、读码、写作和自测。TRAE CN 不需要安装 Codex。CLI 与 IDE 使用任务文件交接，不要求厂商专用子 agent API；无并行能力时顺序执行。

`kb` 是 npm 包：`npm i -g codewiki`（或 `npx -y codewiki …`），Node.js ≥ 20，无需 Go/C 编译器。可选的无人值守适配示例：`kb compound --knowledge --agent claude --workers 3 --keep-work`（也可 `--agent codex|gemini`）。其他命令行 agent 使用 `--llm-cmd`（单独给 `--llm-cmd` 即为 cmd 模式；与 `--llm template` 同时给出是用法错误，退出码 2）。厂商适配只负责传递任务，共享同一 skill 契约与验收逻辑。

首次由真实 agent 阅读构建定义、源码入口、状态、持久化及测试，写出 `.kb/knowledge-plan.json`。这不是按目录名批量套模板：模块如何聚合、业务链路如何划分、每页要回答什么、哪些符号是取证入口，都由 agent 决定。CLI 验证计划路径、引用和写集合，再交给写作 agent 继续阅读完整源码。

## 持久化计划

- `modules`：构建模块到知识页的映射，供覆盖率审计。
- `pages`：路径、标题、kind（concept/flow）、scope（相关目录/文件）、questions、seed symbols。
- 模块页在 `pages/modules/`；跨模块链路在 `pages/flows/`。
- 与 v2 模块树并存：`pages/<project>/…` 是 kb 按构建模块/目录确定性生成的结构页（`module_tree.json`），`pages/modules|flows/` 是 agent 研究写成的业务知识页，两者互不改写。`modules`、`flows` 是保留目录名，不会被用作 L1 项目 id。
- 有知识计划时，`pages/overview.md`（同时是模块树 L0 页）改为“模块与业务知识导航”+ 自动抽取事实的覆盖说明，kb 块（模块树表格等）照常追加。
- `--knowledge --replan --agent claude`（或 codex/gemini/`--llm-cmd`）重新研究并更新计划，随后重写全部计划页；新增业务模块、架构变化时应使用它。
- 已有计划会自动参与 `kb plan` 和后续 compound。已有页面锚点变化、scope 内其他符号或文件变化、缺失页面都触发重写。无变化不重复调用 agent。因此有计划后，`kb compound --llm template`（例如 CI 的离线运行）遇到需要重写的知识页会以 `E_TASK_FAILED` 拒绝发布，而不是用模板顶替；此时请用 agent 后端运行。compound 默认开启的 LLM facts 兜底（`--no-llm-facts` 关闭）与知识规划互不影响：前者只补路由/接口事实，后者写业务说明。

当前非符号文件（例如 Gradle/XML）的变更依赖 Git 提交差异；同一 HEAD 下未提交的配置改动不在符号图中，不能据 `noop` 宣称这些配置已被重新研究。需要先提交配置变更，或使用 `--knowledge-pages` 显式重读受影响页面。Java/Kotlin 等已扫描符号的未提交改动会进入图差异。

## 写作与边界

Agent 可只读打开仓库全文，沿调用关系探索，不受最初路由识别器或80行片段的范围限制。每页必须包含职责与边界、执行链路、状态与数据、异常与恢复、修改与测试、证据与未知。正文应解释条件和业务后果，不能用符号表替代。

最低结构门槛为1200字符和3个真实源码锚点；这只是拒绝空壳，不是语义正确率保证。高质量交付还必须使用独立源码题库、仅知识库作答、逐项证据核对来验证。报告应分开给出自动校验和人工/agent审查结果。

每个写作任务使用独立 staging 副本（`.kb-work/<run>/writers/<task>/`）；`--workers` 控制1-8个并发写作任务（异步子进程）。只有任务指定页面能回流到最终 staging。任何失败或越界写入都会阻止发布。新增业务页不允许 template restamp，也不允许任务限额导致静默模板回退；必须明确完成真实 agent 写作。`--max-llm-tasks 0` 不限制任务数。

父进程的 write-set 守卫只检查 staging 内文件，源码只读还依赖 agent 沙箱。当前 Codex adapter 使用 workspace-write，Claude adapter 使用 acceptEdits + 受限工具列表；不要绕过沙箱。规划 agent 写出计划之外的文件会被回滚并使本次运行失败（退出码 3）；任何写作任务失败或越界都返回 `E_TASK_FAILED`，staging 保留，wiki 不发布。源代码、README、旧Wiki均是待分析数据，不是可执行指令。

## 验证

1. `kb verify --json`：锚点、链接、事实和索引。
2. `kb compound --knowledge --agent claude --workers 3 --json`：无变化应 noop（不调用 agent）。
3. 在隔离副本改动已引用符号，再改 scope 内未引用的业务代码；`kb plan --json` 都应定位对应知识页。
4. 新增业务模块后重新规划，核对 modules 映射是否覆盖构建模块。
5. 独立编制20道以上业务问题；答案必须解释条件、状态、异常和证据，而非只返回类名。

`verify` 通过不等于业务知识全覆盖。没有源码证据时必须写未知，静态推导不能宣称APK已构建或端到端验收成功。

## 过时证据与定向修订

业务页引用的 hash 必须与本轮源码图一致；缺失或过时引用直接失败，CLI 不自动重盖。独立评审发现内容遗漏时使用 `--knowledge-pages pages/flows/example.md --feedback /absolute/review.md`，结合当前 IDE 文件交接后端或可选自动适配器重新读码修订。该检查能拒绝过时引用，但不能证明正文正确；语义问答和源码复核仍是必需验收。

已被新知识替代的旧页可以使用 `--retire-pages pages/concepts/old.md --retire-reason '具体证据与替代页面'` 退役。原文与原因归档到 `.kb/retired/<run>/`，剩余链接必须通过校验；空的旧概念页不会在下次运行时被自动补回，有新符号证据时可以恢复。当前计划中的业务页、仍有路由事实的功能页和系统生成页不通过此方式删除。

## 失败后的续跑

保留首次运行的 `--keep-work --json` 输出。等待该进程结束后，运行：

```bash
kb compound --resume-result /absolute/failed-run.json --agent claude --workers 2 --keep-work --json
```

也可使用IDE文件交接的 `--llm-cmd`，续跑机制不依赖厂商。CLI读取完成记录，只复用 `ok` 的业务页；要求 HEAD、完整源码图、已有知识计划一致，并重新验证每页引用及结构。失败任务即使留下正文也必须重新研究。禁止与 `--replan`、`--full`、`--feedback` 或 `--knowledge-pages` 混用，避免旧成功页绕过明确的审查修订。续跑完成后再执行定向反馈修订。

## TRAE CN 项目安装

```bash
kb install --agent trae-cn --target /absolute/customer/repo
```

安装 `codewiki` 技能及其参考文件/交接脚本到 `.trae/skills/codewiki/`（`references/ide-handoff.md`、`scripts/file-agent.py` 等）；不写 AGENTS.md 等指令文件，`--mcp` 只打印手工注册提示。
路径依据 [TRAE CN官方技能文档](https://docs.trae.cn/ide_skills)（2026-10-21核对）。
此适配器标记为 `docs-only`：安装路径与文件写入已测试，不代表IDE实际加载/模型执行已验证。
打开项目后让当前IDE agent使用 `codewiki` skill，按 `references/ide-handoff.md` 工作；不要使用不存在的内置 `kb compound --agent trae-cn` 后台模式（会报错）。IDE 内的命令形如：

```bash
kb compound --knowledge --workers 1 --keep-work --json \
  --llm-cmd 'python3 /abs/repo/.trae/skills/codewiki/scripts/file-agent.py --exchange-dir /abs/repo/.kb-handoff/run-1'
```

## TS 版与 Go 版（PR #1）的差异

- 只有一个 `codewiki` skill：Go 版的 `kb-compound` / `kb-query` 改动分别并入 `references/compound.md` 和 `references/query.md`，规划/写作契约在 `references/knowledge-planner.md`、`knowledge-writer.md`。kb 运行时从安装包的 `skills/` 目录读取这两份契约（Go 版编译进二进制），修改契约无需重新构建。
- `--knowledge-pages` 定向修订时不运行模块树页任务（只重写选中的页面）；模块树 kb 块照常同步。
- `--retire-pages` 还拒绝模块树页（`tree_node` 页面由 `module_tree.json` 决定，下次运行会被重建）。
- `kb agents --json` 中 `trae-cn` 行带 `notes`；没有 Go 版的 `backend_verification` 等字段。
- 运行 id 带亚秒部分（`YYYYMMDDTHHMMSS.<9位>-<sha>`），与 Go 版一致地避免同秒重跑复用失败的 staging。
