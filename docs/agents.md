# 多 Agent 支持

codewiki 和 coding agent 打交道有两种方式：

- **消费者**：开发者在仓库里使用的 agent。它通过指令文件、skills 和 MCP 工具读取 wiki，不再去 grep 整个仓库。
- **后端**：`kb compound`、`kb ingest` 和 `kb eval` 以非交互方式调用 agent，由它写页面或核对文档断言。

两种方式都是一条命令完成配置：

```bash
kb install --agent claude,codex,gemini,cursor,copilot --mcp   # 或 --agent all
kb compound --agent codex                                     # 也可以用 claude / gemini
kb agents                                                     # 查看支持矩阵和每个 agent 实际执行的命令行
```

## 支持矩阵

| Agent | 后端（`--agent`） | 指令文件 | Skills | MCP（`--mcp`） | 验证等级 |
|---|---|---|---|---|---|
| **Claude Code** | `claude -p --permission-mode acceptEdits --allowedTools '<文件工具+kb 只读命令>' --output-format json` | `CLAUDE.md` | `.claude/skills/` | `.mcp.json` | 后端和消费者都是**实跑** |
| **OpenAI Codex CLI** | `codex exec --sandbox workspace-write -c 'approval_policy="never"' --skip-git-repo-check --ephemeral --color never --json -` | `AGENTS.md` | `.agents/skills/` | `.codex/config.toml`（项目需被信任），或 `codex mcp add` | 后端：**真二进制 / mock 模型**（compound 和 ingest 都跑过，见下文“Codex 端到端”）；消费者：**CLI 核对** |
| **Gemini CLI** | `gemini --skip-trust --approval-mode auto_edit --output-format json -p '…'`（完整 prompt 从 stdin 读入） | `GEMINI.md` | `.agents/skills/` | `.gemini/settings.json`（`trust: true`） | 后端和消费者都是**真二进制 / mock 模型** |
| **Cursor** | 无适配器，用 `--llm-cmd` | `.cursor/rules/codewiki.mdc`（`alwaysApply: true`） | — | `.cursor/mcp.json` | **仅文档** |
| **GitHub Copilot** | 无适配器，用 `--llm-cmd` | `.github/copilot-instructions.md` | — | 打印手工配置说明 | **仅文档** |
| **generic**（任何支持 AGENTS.md 的 agent） | 使用 `llm.cmd` 或 `--llm-cmd` | `AGENTS.md` | `.agents/skills/` | 打印 `kb mcp --root <repo>` | **仅文档** |

验证等级的含义：

- **实跑**：真实 CLI 调用真实模型。
- **真二进制 / mock 模型**：真实 CLI 二进制端到端运行，模型 API 换成本地 mock。本环境屏蔽了 OpenAI 和 Gemini 的 API，这样能验证参数、工具调用、沙箱、事件格式和配置发现，但验证不了模型写出来的内容好不好。
- **CLI 核对**：对照真实 CLI 的 `--help`、`codex debug prompt-input`、`codex mcp list` 确认过。
- **仅文档**：只依据厂商文档。

调研过程和来源见 [agents-research.md](agents-research.md)。

## 各 agent 快速上手

| Agent | 让它读 wiki | 让它写 wiki（后端） | 注意 |
|---|---|---|---|
| Claude Code | `kb install --agent claude --mcp` | `kb compound --agent claude --model sonnet` | 第一次使用 `.mcp.json` 时 Claude Code 会询问是否启用 |
| Codex CLI | `kb install --agent codex --mcp`，然后信任项目，或者执行 `codex mcp add codewiki -- kb mcp --root $PWD` | `printenv OPENAI_API_KEY \| codex login --with-api-key`，然后 `kb compound --agent codex` | 根目录有 AGENTS.override.md、或 AGENTS.md 超过 32 KiB 时，`kb install` 会提示 |
| Gemini CLI | `kb install --agent gemini --mcp`，然后信任文件夹 | 设置 `GEMINI_API_KEY`，选择 API-key 认证，然后 `kb compound --agent gemini` | 后端在 headless 模式下没有 shell 工具，kb 已在 prompt 里给出全部 hash |
| Cursor | `kb install --agent cursor --mcp` | 使用 `--llm-cmd '<cursor CLI 命令>'` | `.mdc` 规则文件带 `alwaysApply: true` |
| Copilot | `kb install --agent copilot` | 使用 `--llm-cmd` | MCP 需要按提示手工配置 |
| 其他 | `kb install --agent generic`，会写 AGENTS.md 和 `.agents/skills` | 使用 `--llm-cmd` 或 `llm.cmd` | 只要求 agent 能从 stdin 读 prompt、在 cwd 里写文件 |

## 作为消费者：`kb install`

```bash
kb install --agent all --mcp                  # 安装到当前仓库（--root）
kb install --agent codex --target ../app      # 安装到别的仓库
kb install --agent claude,cursor --dry-run    # 只列出会改哪些文件，不写入
kb install-skills ../app                      # 旧命令，保留为别名：.claude/skills 加 AGENTS.md / CLAUDE.md 块
```

`kb install` 遵循以下规则：

- **指令块**放在 `<!-- codewiki:begin … -->` 和 `<!-- codewiki:end -->` 之间，原地替换。块外的内容不会动。重复运行时文件逐字节不变，每一项都报告 `unchanged`。
- 指令块的内容就是按“问题类型 → 首选动作”整理的表格（路由用 `kb routes`，testID 用 `kb lint-tid --pages`，跨端差异用 `kb parity`，过时文档用 `kb conflicts`，改文件前用 `kb context <file>`）。表格里的工具名按 agent 调整：Claude 写成 `Bash:` / `Read` / `Grep`，其他 agent 写成 `Run:` / `Read` / `Search`，并说明 MCP 工具 `kb_*` 也能用。
- **Skill**：kb 自带唯一的 `codewiki` skill（SKILL.md 路由 + `references/*.md`），符合 [Agent Skills](https://agentskills.io) 规范，同一份文件同时供 Claude、Codex 和 Gemini 使用。
- **MCP 的 JSON 配置**（`.mcp.json`、`.gemini/settings.json`、`.cursor/mcp.json`）：先解析，只设置 `mcpServers.codewiki` 这一个键，其他键保留（大数字也不会丢精度）。文件带注释、不是合法 JSON 时直接跳过并提示，不会重写。
- **MCP 的 TOML 配置**（`.codex/config.toml`）：追加一张由 `# codewiki:begin/end` 标记包住的 `[mcp_servers.codewiki]` 表。如果用户已经在标记之外自己写了同名的表，就跳过。
- MCP 命令写成 `kb mcp --root <仓库绝对路径>`。如果配置要提交到仓库，用 `--mcp-root .` 改成相对路径。
- **Codex 专项检查**（用真实 CLI 验证过）：
  - 仓库根目录有 `AGENTS.override.md` 时，Codex 只读这个文件，AGENTS.md 里的块会被忽略，kb 会提示。
  - codewiki 块的结束位置超过 32 KiB 时（Codex 默认的 `project_doc_max_bytes`），块会被截掉，kb 会提示把块挪到文件开头，或调大这个上限。
- **Gemini 专项**：项目级 MCP 只在受信任的文件夹里生效（`/permissions` 或 `~/.gemini/trustedFolders.json`）。kb 写入的条目带 `"trust": true`，因为 kb 的 MCP 工具全部只读；如果没有这个设置，`gemini -p` 不会把 MCP 工具提供给模型（实测）。
- **Codex 的 MCP**：项目里的 `.codex/config.toml` 只有在项目被信任时才会加载。也可以在用户级注册：`codex mcp add codewiki -- kb mcp --root /path/to/repo`，它会写入 `~/.codex/config.toml`。

### 实测：agent 是否真的用上了 wiki

`demo/agents-demo.sh` 会复制 minishop，依次执行 `kb init`、`kb compound` 和 `kb install --agent all --mcp`，然后做以下检查。结果在 [demo/sample-output/agents/](../demo/sample-output/agents/)。

| 检查 | 结果 |
|---|---|
| 重复执行 `kb install --agent all --mcp` | 21 个文件全部 `unchanged` |
| Claude（haiku）问“购物车上限三端分别是多少，引用出处” | 第一步就运行了 `kb search` 和 `kb parity`，回答给出了三端的符号 ID。5 轮，$0.0061 |
| Claude（haiku）问“一共多少路由，哪些路由页面没设 testID” | 只调用了 `kb routes` 和 `kb lint-tid --pages` 两次，就给出完整答案。3 轮，$0.0037 |
| Claude（haiku）只开放 MCP 工具（禁用 Bash、Read、Grep、Glob）问“login 页三端 testID 和接口” | 通过 `mcp__codewiki__kb_search` 和 `mcp__codewiki__kb_get` 两次调用回答，表格里带行号 |
| Codex：`codex debug prompt-input`（没有调用模型） | AGENTS.md 里的 codewiki 块出现 1 次，`codewiki` skill 在 skill 列表里；从子目录启动也一样（TypeScript 版用 codex-cli 0.163.0 重新验证过） |
| Codex：`codex mcp list`（项目已信任） | 列出 `codewiki  kb  mcp --root <repo>  enabled` |
| Gemini：真实 CLI 加 mock API | 模型输入里有 GEMINI.md 块和 `codewiki` skill，tools 里有 `mcp_codewiki_kb_*`，由真实的 TypeScript 版 `kb mcp` 握手提供（gemini 0.65.0 重新验证过） |

**A/B：多装了别的 agent 的文件，会不会干扰 Claude？**（`demo/agents-ab.sh`，haiku，3 个问题，每组 3 次，共 18 次真实运行）

对比两组：只执行 `kb install --agent claude --mcp`，与执行 `--agent all --mcp`（后者多出 AGENTS.md、GEMINI.md、`.cursor/`、`.github/`、`.agents/`、`.codex/`、`.gemini/`）。

| 指标 | 只装 claude | 装 all |
|---|---|---|
| 读取其他 agent 文件的次数 | 0 | 0 |
| 首个动作：q1 / q2 | 3/3 是 `kb search`；3/3 是 `kb routes`（加 `lint-tid --pages`） | 3/3 是 `kb search`；3/3 是 `kb routes`（加 `lint-tid --pages`） |
| q3（改文件前） | 先用 Glob（2 次）或 find（1 次）定位文件，之后 3/3 调用了 `kb context` | 3 次都先用 Glob 定位文件，之后 3/3 调用了 `kb context` |
| 平均轮数 q1 / q2 / q3 | 5.7 / 2.7 / 7.3 | 5.3 / 2.3 / 8.3 |
| 9 次总花费 | $0.0497 | $0.0484 |

结论：差异都在随机波动范围内，额外的文件没有让 Claude 分心。明细见 [ab-claude-vs-all/summary.md](../demo/sample-output/agents/ab-claude-vs-all/summary.md)。

Codex 和 Gemini 的这几项由 [test/agents-real.test.ts](../test/agents-real.test.ts) 覆盖，它是 Go 版 `TestRealCodex*` 和 `TestRealGemini*` 的移植。本机装了对应 CLI，或者设置了 `KB_CODEX_BIN` / `KB_GEMINI_BIN` 时才会运行，否则跳过：

```bash
npm install --prefix /tmp/agents @openai/codex@0.163.0 @google/gemini-cli@0.65.0
KB_CODEX_BIN=/tmp/agents/node_modules/.bin/codex KB_GEMINI_BIN=/tmp/agents/node_modules/.bin/gemini npx vitest run test/agents-real.test.ts
```

2026-10-21 在 TypeScript 版上跑过，4/4 通过，用时约 35 s。4 个用例分别是：

- `compound` 和 `ingest --agent codex`；
- codex 读到安装产物；
- `compound --agent gemini`；
- gemini 读到安装产物和 MCP。

这次不需要修改任何代码。

## 作为后端：`--agent`

```bash
kb compound --agent claude --model sonnet --max-llm-tasks 5 --fallback
kb compound --agent codex  --model gpt-5-codex
kb ingest --manifest docs.json --agent gemini
kb eval --agent claude --model haiku
kb compound --llm-cmd 'my-agent --headless'                    # 逃生口：任意命令，prompt 从 stdin 读入
```

`codewiki.yaml`：

```yaml
llm:
  agent: codex          # 设置后，--llm cmd 会使用这个适配器，优先级高于 llm.cmd
  model: gpt-5-codex    # 可选，作为 --model 的默认值
  cmd: claude -p ...    # 没有设置 agent 时使用（不会被删除）
  timeout_sec: 600
```

命令行的优先级从高到低依次是：`--llm-cmd`、`--agent` / `--llm <agent>`、`llm.agent`、`llm.cmd`。默认写作器仍然是 `template`，不设置 `--agent` 或 `--llm` 就不会调用任何模型。`--llm claude` 保持旧行为：如果改过 `llm.cmd`，用改过的命令；否则用 Claude 适配器。

### 和具体 agent 无关的保证

不管用哪个 agent，下面这些都由 kb 自己负责，而不是交给 agent：

1. **工作目录**是 staging 中的 wiki 副本，prompt 从 stdin 传入。prompt 不写任何特定 agent 的工具名，只要求“用你自己的文件读写工具”。
2. **不可信数据包裹**：源码、旧文档、现有页面都包在 `<untrusted-data>` 块里，可疑的行会被删掉；prompt 开头带安全规则。
3. **写集合守卫**：任务结束后对 staging 做快照比对。写集合之外的新增或修改一律回滚，任务记为 `violation`，并列出 `reverted` 的文件。Codex 和 Gemini 的测试里，模型都故意多写一个文件，结果都被回滚了。
4. **校验与发布**：页面经过后处理（锚点重新盖章，未知符号拒绝），`kb verify` 通过后才原子发布。失败时不发布，可以用 `--fallback` 改用 template 写作器兜底。
5. **用量**：每个任务的 `usage` 字段，以及运行结束时的汇总 `agent usage:`：
   - Claude：费用和 token（含 cache）。
   - Codex：token（含 cached 和 reasoning），来自 `turn.completed` 事件，Codex 不报费用。
   - Gemini：token，按模型汇总（router 请求也计入）。

   agent 自己报告的错误也会写进任务错误里，比如 Codex 的 `turn.failed`、Claude 的 `is_error`。

实跑示例：

- 在 minishop 上应用 01-cart-limit 改动后，`kb compound --agent claude --model haiku` 完成 2 个任务，共 $0.0316，verify 通过（[输出](../demo/sample-output/agents/compound-agent-claude-haiku.txt)）。
- `kb ingest docs/legacy/cart.md --agent claude --model haiku` 用 1 个任务完成断言核对，耗时 18 s，花费 $0.0075。结果是 2 条 conflict（购物车上限文档写 10、代码是 99；下单接口文档写 `/api/order/create`、代码是 `/api/orders`）和 3 条 verified（[输出](../demo/sample-output/agents/ingest-agent-claude-haiku.txt)）。

### Codex 端到端：真实二进制 + mock 模型

`demo/codex-mock-demo.sh` 让真实的 codex-cli 0.163.0 完整跑一遍（2026-10-21 已在 TypeScript 版 kb 上重新运行，结果与 Go 版一致） `kb compound --agent codex` 和 `kb ingest --agent codex`，只有模型是假的。模型由 [demo/mock-model/mock_openai_responses.py](../demo/mock-model/mock_openai_responses.py) 代替：它是 OpenAI Responses API 的流式 mock，通过 Codex 的自定义 provider（`model_providers.mock.base_url`）接入。结果在 [demo/sample-output/agents/codex-mock/](../demo/sample-output/agents/codex-mock/)。

| 环节 | 真实 / mock | 观察到的结果 |
|---|---|---|
| `codex exec` 二进制、参数解析、`-` 从 stdin 读 prompt | **真实** | kb 适配器生成的整条命令行全部被接受 |
| Codex 配置、自定义 provider、`approval_policy="never"` | **真实** | 运行全程无人工干预，不会卡在审批 |
| 模型输出（工具调用的内容、最终回答） | **mock** | 脚本化两轮：第一轮用 `exec_command` 写入写集合内的页面，外加一个写集合之外的 `pages/evil-codex.md`；第二轮回答 `done` |
| 工具执行（`exec_command`）和 `workspace-write` 沙箱 | **真实** | 命令在 staging 里执行；写 staging 之外的非 /tmp 路径报 `Read-only file system`（单独探针） |
| `--json` 事件流 | **真实** | `thread.started → turn.started → item.* (command_execution) → item.completed (agent_message) → turn.completed{usage}`，见 `04-codex-exec-json-events.jsonl` |
| 用量解析 | **真实解析，mock 数值** | 每个任务 `in 2000 / out 40 tok, cached 200, reasoning 10`（mock 每次返回 1000/20/100/5，每个任务 2 次请求） |
| kb prompt 与不可信数据包裹 | **真实** | mock 收到的请求里有 `codewiki 任务` 和 `<untrusted-data …>` |
| 写集合守卫 | **真实** | 每个任务都是 `violation`，`reverted: pages/evil-codex.md`，发布出来的 wiki 里没有这个文件 |
| 后处理、verify、原子发布 | **真实** | `verify PASS`；mock 写的页面被重新盖上 `sources` 锚点后发布 |
| `kb ingest --agent codex`（断言核对任务，写 `.kb/ingest/verdicts.json`） | **真实**（mock 的结论全是 unverifiable） | `_conflicts.md` 和 `requirements.json` 重新生成，越界写入同样被回滚 |

Go 版的这次运行顺带发现并修复了一个 bug：agent 的 stdout 和 stderr 由两个 goroutine 并发写进同一个未加锁的 buffer，导致 Codex 的 JSON 事件在任务日志里几乎全部丢失（3000 行里只剩 27 行）。修复后有回归测试 `TestAgentTaskLogKeepsStdoutAndStderr`。TypeScript 版的任务日志在 TS 版重跑时完整无缺（`04-codex-exec-json-events.jsonl`）。

另外，Codex 运行时会尝试连接 `chatgpt.com` 和 `ab.chatgpt.com`。在本环境里这些连接被代理拒绝，任务不受影响。

### Gemini 端到端：真实二进制 + mock 模型

`demo/gemini-mock-demo.sh` 让真实的 gemini 0.65.0 完整跑一遍 `kb compound --agent gemini`，只有模型是假的。模型由 [demo/mock-model/mock_gemini.py](../demo/mock-model/mock_gemini.py) 代替，经 `GOOGLE_GEMINI_BASE_URL` 接入，认证方式为 API key，key 用的是假值。结果在 [demo/sample-output/agents/gemini-mock/](../demo/sample-output/agents/gemini-mock/)。

| 环节 | 真实 / mock | 结果 |
|---|---|---|
| `gemini --skip-trust --approval-mode auto_edit --output-format json -p …`，prompt 从 stdin 读入 | **真实** | 命令行被接受，headless 模式下全程没有交互 |
| 模型的路由调用（`generateContent`） | **mock** | 返回固定的路由选择 |
| 主回合（`streamGenerateContent`） | **mock** | 第一轮对写集合内的每个页面调用一次 `write_file`，外加 `pages/evil-gemini.md`；第二轮回答 `done` |
| `write_file` 工具的执行（auto_edit 自动批准） | **真实** | 页面写进 staging |
| 提供给模型的工具 | **真实** | 不包含 `run_shell_command`：auto_edit 在 headless 模式下不开放 shell，所以 kb 在 prompt 里直接给出全部 hash |
| `-o json` 的用量解析 | **真实** | 每个任务约 `in 2700 / out 90 tok, reasoning 12` |
| 写集合守卫 | **真实** | 两个任务都是 `violation`，`reverted: pages/evil-gemini.md`，发布出来的 wiki 里没有这个文件 |
| 后处理、verify、原子发布 | **真实** | `verify PASS: 27 pages, 262 anchors` |

## CI

[`.github/workflows/compound.yml`](../.github/workflows/compound.yml) 按以下规则选择写作器：

- 有 `ANTHROPIC_API_KEY` 时用 `--agent claude`；
- 否则有 `OPENAI_API_KEY` 时用 `--agent codex`；
- 都没有时用 template；
- 也可以用仓库变量 `KB_AGENT` 强制指定。

Codex 的片段：

```yaml
env:
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
steps:
  - run: |
      npm install -g @openai/codex@0.163.0
      printenv OPENAI_API_KEY | codex login --with-api-key
  - run: kb compound --agent codex --fallback --max-llm-tasks 12 --keep-work --json > compound.json
  - run: jq -c '.result.usage' compound.json
  - run: kb verify
```

Claude 的片段：

```yaml
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
steps:
  - run: npm install -g @anthropic-ai/claude-code
  - run: kb compound --agent claude --model sonnet --fallback --max-llm-tasks 12 --json > compound.json
```

## 安全

- **第一道防线是 kb 的写集合守卫，和 agent 无关。** agent 的沙箱是外层的第二道防线，而且两者的范围不一样：
  - Codex 的 `workspace-write` 允许写整个 staging，以及 `/tmp`（实测）；
  - Gemini 的 `auto_edit` 允许写工作区内任意文件；
  - kb 只放行任务写集合里的文件。
- 不要在后端模式下使用 `--dangerously-bypass-approvals-and-sandbox`（Codex）或 `--approval-mode yolo`（Gemini）。如果确实需要（比如 CI 容器里没有可用的 Linux 沙箱），只在一次性的 runner 上通过 `--llm-cmd` 显式使用，写集合守卫照常生效。
- Codex 后端：审批策略是 `never`，headless 运行不会卡住；沙箱是 workspace-write，默认禁止网络（Codex 文档，本地未验证）。
- Gemini 后端：headless 模式加 auto_edit 时不提供 shell 工具（实测）；会提供 web_fetch 和 google_web_search，但它们不是编辑类工具，需要确认，headless 下不会执行（仅文档）。
- Claude 后端：`--allowedTools` 只放行文件工具和 `kb anchor` / `kb get` / `kb search`。
- Codex 后端：在沙箱内执行的命令能读到 `KB_ROOT`、`KB_GRAPH`、`KB_TASK`，`kb anchor` 可用（实测）。Gemini 后端在 headless 模式下没有 shell，prompt 里已经给出所有 hash，不需要运行 kb 命令。
- MCP 工具全部只读，所以给 Gemini 设置 `trust: true` 是安全的。

## 故障排查

| 现象 | 原因 / 处理 |
|---|---|
| **Claude**：任务 `failed`，日志里是 `{"type":"result","is_error":true,…}` | 先看 `usage.error`，也就是 Claude 返回的 `result` 或 `subtype`，例如 `error_max_turns`。确认 `ANTHROPIC_API_KEY` 或登录状态；`--model` 要写 Claude Code 认识的别名（`haiku`、`sonnet`、`opus`） |
| **Claude**：`.mcp.json` 里的 codewiki 工具没出现 | 项目级 MCP 第一次使用时需要批准（交互模式下执行 `/mcp`）。`-p` 模式下用 `--mcp-config .mcp.json --strict-mcp-config`，并在 `--allowedTools` 里放行 `mcp__codewiki__kb_*` |
| **Codex**：`Not inside a trusted directory` 或 `git repo check` | kb 的命令行已经带了 `--skip-git-repo-check`，因为 staging 不是 git 仓库。如果是自定义的 `--llm-cmd`，需要自己加上 |
| **Codex**：任务一直挂到 `llm.timeout_sec` | 有审批在等待。kb 的命令行固定 `-c approval_policy="never"`；自定义命令不要把 `approval_policy` 设成 `on-request` 或 `untrusted`（`codex exec` 0.163.0 没有 `-a` 参数，要用 `-c` 设置） |
| **Codex**：`llm command failed: … : Reconnecting… / stream disconnected` | 连不上模型 API（网络、代理或额度问题）。agent 报告的错误已经附在任务错误里；`--fallback` 会改用 template 继续 |
| **Codex**：页面写了，但 kb 报 `LLM did not write …` | 写到了 staging 之外（被沙箱拒绝），或者写到了别的路径。看任务日志里 `command_execution` 的 `aggregated_output` |
| **Codex**：模型看不到 AGENTS.md 里的 codewiki 块 | 根目录有 `AGENTS.override.md`，或者块的位置超过了 32 KiB。`kb install` 会提示；可以用 `codex debug prompt-input` 自查 |
| **Codex**：`codex mcp list` 里没有 codewiki | 项目没有被信任，`.codex/config.toml` 不会加载。要么信任项目，要么执行 `codex mcp add codewiki -- kb mcp --root $PWD` |
| **Codex**：用量全是 0 | 没有 `turn.completed` 事件，说明运行中途失败了；看 `usage.error`。Codex 本身不报告费用 |
| **Gemini**：`Invalid auth method selected`（code 41） | 设置 `GEMINI_API_KEY`，并在 `~/.gemini/settings.json` 里配置 `security.auth.selectedType: "gemini-api-key"`（或者设置 `GEMINI_DEFAULT_AUTH_TYPE`） |
| **Gemini**：后端什么都没写 | 没有 `--skip-trust` 时，文件夹不被信任，auto_edit 会降级（kb 的命令行已经带上）。headless 模式下没有 shell 工具，这是预期行为 |
| **Gemini**：MCP 显示 Disabled，或者 `-p` 时没有 `mcp_codewiki_*` 工具 | 文件夹没有被信任（用 `/permissions` 或 `~/.gemini/trustedFolders.json`），或者条目缺少 `"trust": true`。重新执行 `kb install --agent gemini --mcp` 可以补上 |
| **Cursor**：规则不生效 | 确认是 `.cursor/rules/codewiki.mdc`，带 frontmatter 且 `alwaysApply: true`。没有 frontmatter 的 `.md` 会被 Cursor 忽略 |
| **全部**：`kb install` 跳过了某个 JSON 文件 | 文件里有注释，或者不是合法 JSON。kb 不会改写这种文件，提示里会给出手工配置的写法 |
| **全部**：任务状态是 `violation` | agent 写了写集合之外的文件，已被回滚，内容在 `reverted` 列表里。页面本身仍然发布。如果一直出现，查看 `--keep-work` 留下的 `.kb-work/<run>/tasks/<id>.prompt.md` 和 `.log` |

## 局限

- Codex 和 Gemini 在本环境没能连真实模型，后端写作质量没有实测，只验证了参数、工具调用、事件格式、沙箱和写集合守卫。
- Cursor 和 Copilot 只做了消费者文件，验证等级是“仅文档”；它们的 headless CLI 需要用 `--llm-cmd` 自行接入。
- JSON 合并后会按 2 空格缩进重排键的顺序（只在确实有变化时写回）。
