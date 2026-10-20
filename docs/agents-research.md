# 多 Agent 调研记录（2026-10-20）

这里记录 `internal/agents` 中各适配器的依据，以及每条结论的来源和验证程度。

验证等级说明：

- **实跑**：真实 CLI 加真实模型，在本仓库端到端跑通。
- **真二进制 / mock 模型**：真实 CLI 二进制端到端运行，模型 API 由本地 mock 代替。本环境屏蔽了 api.openai.com 和 Gemini API。
- **CLI 核对**：对照真实 CLI 的 `--help` 或调试输出确认过，没有调用模型。
- **仅文档**：只看了厂商文档，没有在本地验证。
- **未验证**：二手来源，或者没能打开原始页面。

测试用的版本是 Claude Code 2.1.305、codex-cli 0.163.0 和 gemini-cli 0.65.0（后两者用 `npm install --prefix <scratch>` 安装）。

## OpenAI Codex CLI（0.163.0）

| 结论 | 等级 | 依据 |
|---|---|---|
| 非交互运行用 `codex exec [PROMPT]`。PROMPT 写成 `-` 或省略时从 stdin 读取；同时给了 PROMPT 和 stdin 时，stdin 内容以 `<stdin>` 块追加在后面 | CLI 核对 | `codex exec --help` |
| `-m/--model`、`-s/--sandbox read-only\|workspace-write\|danger-full-access`、`-C/--cd`、`--skip-git-repo-check`、`--ephemeral`、`--json`（以 JSONL 输出事件）、`-o/--output-last-message <FILE>`、`--output-schema`、`-c key=value`、`--add-dir`、`--dangerously-bypass-approvals-and-sandbox` | CLI 核对 | `codex exec --help` |
| **0.163.0 的 `codex exec --help` 和 `codex --help` 里都没有 `--full-auto`**。全自动运行的写法是 `--sandbox workspace-write -c approval_policy="never"` | CLI 核对 | 在两份 help 中 grep，计数为 0 |
| `--json` 的事件类型有 `thread.started`、`turn.started`、`turn.completed{usage:{input_tokens,cached_input_tokens,cache_write_input_tokens,output_tokens,reasoning_output_tokens}}`、`turn.failed{error.message}`、`item.started/updated/completed`（item 类型包括 agent_message、command_execution、file_change、mcp_tool_call、error 等）和 `error{message}`。事件里不带费用 | 真二进制 / mock 模型 | [codex-rs/exec/src/exec_events.rs](https://raw.githubusercontent.com/openai/codex/main/codex-rs/exec/src/exec_events.rs)，加上真实事件流（`internal/agents/testdata/`，以及 mock 模型下的完整事件流） |
| 用 kb 适配器的整条命令行执行真实 `codex exec`：参数全部被接受；能指向自定义 provider（`model_providers.<id>.base_url`，`wire_api="responses"`）；模型调用的工具是 `exec_command` | 真二进制 / mock 模型 | `TestRealCodexBinaryWithMockModel` |
| `workspace-write` 沙箱下，写 cwd 之外的路径会失败（`/home/user/...` 报 “Read-only file system”），**但 `/tmp` 可写**。所以沙箱不能代替 kb 的写集合守卫：沙箱允许写整个 staging 和 /tmp，kb 只放行任务 write set 内的文件 | 真二进制 / mock 模型 | 手工探针（见下文“沙箱探针”） |
| 在 Codex 沙箱里执行的命令能拿到 kb 设置的 `KB_ROOT`、`KB_GRAPH`、`KB_TASK`，`kb anchor <sym>` 可以正常运行并输出 hash。模型没有写页面时，kb 报 “LLM did not write …”，并按 `--fallback` 改用 template 写作器，失败那次消耗的 token 也会记入用量 | 真二进制 / mock 模型 | 手工探针：用 `mock_responses.py` 跑 `kb compound --agent codex --max-llm-tasks 1 --fallback` |
| AGENTS.md 的发现规则：从 git 根目录到 cwd 逐级拼接各目录的 AGENTS.md；**同一目录下的 `AGENTS.override.md` 会取代该目录的 AGENTS.md**；拼接结果超过 `project_doc_max_bytes`（默认 32 KiB）的部分直接截掉；CLAUDE.md 默认不读，要在 `project_doc_fallback_filenames = ["CLAUDE.md"]` 里配置才会读 | CLI 核对 | `codex debug prompt-input` 探针（根目录放 AGENTS.md、子目录放 override、40 KB 文件末尾放 marker、fallback 配置） |
| skills 的发现位置：仓库里的 `.agents/skills/<name>/SKILL.md` 和 `.codex/skills/<name>/SKILL.md` 都能被发现，从子目录启动也会找到 git 根目录下的；此外还有 `$CODEX_HOME/skills/.system` 内置目录。官方文档推荐 `.agents/skills`，并说明会从 cwd 一直向上扫描到仓库根目录 | CLI 核对（官方文档部分：未验证） | `debug prompt-input` 里的 “Skill roots” 表；[官方 skills 文档](https://developers.openai.com/codex/skills)（本环境无法解析这个域名，内容取自搜索摘要） |
| MCP：`codex mcp add <name> -- <cmd> <args...>` 会往 `$CODEX_HOME/config.toml` 写入 `[mcp_servers.<name>]`，包含 `command` 和 `args = [...]`。项目里的 `.codex/config.toml` **只在项目被信任（`[projects."<path>"] trust_level = "trusted"`）时才加载** | CLI 核对 | 在临时 `CODEX_HOME` 下运行 `codex mcp add/list` |
| 在 CI 里认证：`printenv OPENAI_API_KEY \| codex login --with-api-key` | CLI 核对 | `codex login --help` |

沙箱探针用的是 `mock_responses.py`：mock 模型让 Codex 执行一条 shell 命令，同时写入 `pages/in.md`、`/tmp/.../outside.txt` 和 `/home/user/codex-sandbox-probe.txt`。结果是前两个写成功，第三个返回 `Read-only file system`。

## Claude Code（2.1.305）

| 结论 | 等级 | 依据 |
|---|---|---|
| `claude -p`（`--print`）用于非交互运行，prompt 从 stdin 读入；`--output-format text\|json\|stream-json`；`--permission-mode acceptEdits`；`--allowedTools` / `--disallowedTools`；`--model`；`--mcp-config <file>` 加 `--strict-mcp-config`；`--max-budget-usd` | 实跑 | `claude --help`；`kb compound --agent claude --model haiku`（2 个任务，$0.0316） |
| `--output-format json` 输出一个 result 对象，包含 `total_cost_usd`、`num_turns`、`usage{input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens}` 和 `is_error` | 实跑 | 由 kb 解析，任务行里的费用与 CLI 报告一致 |
| CLAUDE.md、`.claude/skills/<name>/SKILL.md`、项目根目录的 `.mcp.json`（`mcpServers`） | 实跑 | `demo/agents-demo.sh` 跑的 3 个问题，见 `demo/sample-output/agents/` |
| 参考文档 | 仅文档 | <https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-headless>、<https://docs.anthropic.com/en/docs/claude-code/mcp>、<https://docs.anthropic.com/en/docs/claude-code/skills> |

## Gemini CLI（0.65.0）

| 结论 | 等级 | 依据 |
|---|---|---|
| `-p/--prompt` 进入 headless 模式，`-p` 的文本追加在 stdin 内容之后；`-m/--model`；`-o/--output-format text\|json\|stream-json`；`--approval-mode default\|auto_edit\|yolo\|plan`（`-y/--yolo` 是旧写法）；`--skip-trust` 只对本次会话信任当前目录；`--include-directories`；`--allowed-tools` 已废弃，改用 Policy Engine | CLI 核对 | `gemini --help`；[cli-reference.md](https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/cli-reference.md) |
| 用 kb 适配器的整条命令行（`--skip-trust --approval-mode auto_edit -o json -p …`）执行真实 CLI，并通过 `GOOGLE_GEMINI_BASE_URL` 指向 mock：先发一次 router 请求（flash-lite，走 `generateContent`），再用 `streamGenerateContent?alt=sse` 跑主回合；headless 加 auto_edit 时**提供 write_file 和 replace，不提供 run_shell_command**（另外 web_fetch / google_web_search 也会出现） | 真二进制 / mock 模型 | `TestRealGeminiBinaryWithMockModel` |
| `-o json` 输出 `{"session_id","response","stats":{"models":{"<id>":{"api":{totalRequests…},"tokens":{input,prompt,candidates,total,cached,thoughts,tool}}}},"error"?}` | 真二进制 / mock 模型 | 真实输出 |
| 认证：`GEMINI_API_KEY` 需要配合 `security.auth.selectedType = "gemini-api-key"`（也可以设 `GEMINI_DEFAULT_AUTH_TYPE`），否则报 “Invalid auth method selected”（code 41）。`GEMINI_CLI_HOME` 用来替换 `~/.gemini` | 真二进制 / mock 模型 | 实测 |
| 上下文文件：工作区根目录的 `GEMINI.md` 会进入模型输入 | 真二进制 / mock 模型 | `TestRealGeminiConsumesInstall` |
| skills 的发现位置是 `.gemini/skills/` 或其别名 `.agents/skills/`（同一层级 `.agents` 优先），用户级是 `~/.gemini/skills/` 和 `~/.agents/skills/`。实测 `.agents/skills` 里的 kb skills 会出现在模型输入中 | 真二进制 / mock 模型 | [skills.md](https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/skills.md)；同上测试 |
| MCP：`.gemini/settings.json` 的 `mcpServers.<name>` 支持 `command/args/cwd/env/trust/timeout` 字段；也可以用 `gemini mcp add [-s project\|user] <name> <cmd> [args...]` 添加。**项目级 MCP server 只在受信任的文件夹里启用**（未信任时 `gemini mcp list` 显示 Disabled）。**`trust:false` 的 server，其工具在 `-p` 模式下根本不会提供给模型**；改成 `trust:true` 后才有 `mcp_codewiki_kb_*` | 真二进制 / mock 模型 | [mcp-server.md](https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/tools/mcp-server.md)；`gemini mcp list`；mock 请求里的 tools 列表 |

## Cursor

| 结论 | 等级 | 依据 |
|---|---|---|
| 项目规则放在 `.cursor/rules/*.mdc`，frontmatter 支持 `description`、`globs`、`alwaysApply`。没有 frontmatter 的 `.md` 文件会被规则系统忽略。也支持根目录的 AGENTS.md；CLAUDE.md 总会生效 | 仅文档 | <https://cursor.com/docs/context/rules>、<https://docs.cursor.com/context/rules> |
| 项目级 MCP 配置在 `.cursor/mcp.json`（`mcpServers`），全局配置在 `~/.cursor/mcp.json` | 未验证（来源为第三方） | <https://devsync.readthedocs.io/en/latest/ide-integrations/cursor/> |
| headless CLI（cursor-agent）不提供适配器，需要时用 `--llm-cmd` | — | — |

## GitHub Copilot

| 结论 | 等级 | 依据 |
|---|---|---|
| 仓库级自定义指令文件是 `.github/copilot-instructions.md`；Copilot coding agent 也会读 AGENTS.md | 仅文档 | <https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions> |
| VS Code 的 MCP 配置在 `.vscode/mcp.json`，顶层键是 `servers`；coding agent 的 MCP 在仓库设置里配置 | 未验证 | 同上文档站点；kb 只打印手工配置说明，不写这个文件 |

## 跨 Agent 标准

- **AGENTS.md**（<https://agents.md>）：一份 Markdown 写给所有 agent 的说明。Codex 实测会读；Cursor、Copilot 等的文档说明支持。仅文档。
- **Agent Skills**（<https://agentskills.io>）：一个目录加一份 `SKILL.md`，frontmatter 必须有 `name`（等于目录名）和 `description`。Claude Code（`.claude/skills`）、Codex（`.agents/skills`、`.codex/skills`）、Gemini（`.gemini/skills`、`.agents/skills`）都实测能发现 kb 的 4 个 skill，不需要任何改动。

## 对 kb 的设计影响

1. 不论用哪个 agent，写集合守卫和不可信数据包裹都由 kb 自己做。agent 自带的沙箱只是外层的第二道防线：Codex 的 workspace-write 允许写 /tmp；Gemini 的 auto_edit 允许写工作区内任意文件。
2. Codex 只读 AGENTS.md。为此 `kb install --agent codex` 会做两项提示：仓库根目录存在 AGENTS.override.md 时提醒（这时 AGENTS.md 里的块会被忽略）；codewiki 块的结束位置超过 32 KiB 时提醒（这部分会被截断）。
3. Gemini 的 MCP 条目写成 `trust: true`，否则 headless 模式拿不到 kb 工具。kb 的 MCP 工具全部只读。
4. 每个 agent 的用量解析：Claude 有费用和 token；Codex 有 token（含 reasoning），没有费用；Gemini 有 token，并按模型汇总，router 请求也计入。
