# 多 Agent 实测输出

生成方式：`demo/agents-demo.sh`（Claude haiku，真实调用；Codex 只做发现检查，不调用模型），以及单独执行的 `kb compound --agent claude --model haiku`。说明见 [docs/agents.md](../../../docs/agents.md)。

| 文件 | 内容 |
|---|---|
| `00-install.txt` / `00-install-rerun.txt` | `kb install --agent all --mcp` 首次运行时的动作和提示；重复运行时 21 个文件全部为 `unchanged` |
| `01-installed-files.txt` | 安装后仓库中的 agent 文件清单 |
| `c1-claude-instructions.md` | 问购物车上限三端取值：调用了 `kb search` 和 `kb parity`，5 轮，$0.0061 |
| `c2-claude-instructions.md` | 问路由数量和缺 testID 的页面：调用了 `kb routes` 和 `kb lint-tid --pages`，3 轮，$0.0037 |
| `c3-claude-mcp-only.md` | 只开放 MCP 工具：调用了 `mcp__codewiki__kb_search` 和 `kb_get` |
| `x1-codex.md` | Codex 的后端命令行、`codex mcp list`，以及 `codex debug prompt-input` 中的 AGENTS.md 块和 skills |
| `compound-agent-claude-haiku.txt` | `kb compound --agent claude --model haiku`：2 个任务，$0.0316，verify 通过 |

Codex 和 Gemini 端到端运行的证据（真实 CLI 二进制，模型 API 用本地 mock）在以下测试里：

- `internal/cli/codex_real_test.go`
- `internal/cli/gemini_real_test.go`

设置 `KB_CODEX_BIN` / `KB_GEMINI_BIN` 后会运行这些测试。

## 子目录

- [`codex-mock/`](codex-mock/)：由 `demo/codex-mock-demo.sh` 生成。真实的 codex-cli 0.163.0 配合脚本化的 mock 模型，跑通 `kb compound --agent codex` 和 `kb ingest --agent codex`，包括真实的 `--json` 事件流、写集合回滚和 verify。哪些环节是真实的、哪些是 mock，见 [docs/agents.md](../../../docs/agents.md)。
- [`ab-claude-vs-all/`](ab-claude-vs-all/)：由 `demo/agents-ab.sh` 生成。对比 `kb install --agent claude` 和 `--agent all`，用 haiku 真实运行 18 次。两组都没有读取其他 agent 的文件，首个动作相同，花费也相同。
