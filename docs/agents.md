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
| **OpenAI Codex CLI** | `codex exec --sandbox workspace-write -c 'approval_policy="never"' --skip-git-repo-check --ephemeral --color never --json -` | `AGENTS.md` | `.agents/skills/` | `.codex/config.toml`（项目需被信任），或 `codex mcp add` | 后端：**真二进制 / mock 模型**；消费者：**CLI 核对** |
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
- **Skills**：kb 自带的 4 个 skill 符合 [Agent Skills](https://agentskills.io) 规范，同一份文件同时供 Claude、Codex 和 Gemini 使用。
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
| Codex：`codex debug prompt-input`（没有调用模型） | AGENTS.md 里的 codewiki 块出现 1 次，4 个 kb skill 都在 skill 列表里；从子目录启动也一样 |
| Codex：`codex mcp list`（项目已信任） | 列出 `codewiki  kb  mcp --root <repo>  enabled` |
| Gemini：真实 CLI 加 mock API | 模型输入里有 GEMINI.md 块和 kb skills，tools 里有 `mcp_codewiki_kb_*`（由真实的 `kb mcp` 握手提供） |

Codex 和 Gemini 的这几项由 `TestRealCodexConsumesInstall` 和 `TestRealGeminiConsumesInstall` 覆盖。本机装了对应 CLI，或者设置了 `KB_CODEX_BIN` / `KB_GEMINI_BIN` 时才会运行，否则跳过。

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

实跑示例：在 minishop 上应用 01-cart-limit 改动后，`kb compound --agent claude --model haiku` 完成 2 个任务，共 $0.0316，verify 通过（[输出](../demo/sample-output/agents/compound-agent-claude-haiku.txt)）。

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
- MCP 工具全部只读，所以给 Gemini 设置 `trust: true` 是安全的。

## 局限

- Codex 和 Gemini 在本环境没能连真实模型，后端写作质量没有实测，只验证了参数、工具调用、事件格式、沙箱和写集合守卫。
- Cursor 和 Copilot 只做了消费者文件，验证等级是“仅文档”；它们的 headless CLI 需要用 `--llm-cmd` 自行接入。
- JSON 合并后会按 2 空格缩进重排键的顺序（只在确实有变化时写回）。
