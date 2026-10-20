# c3-claude-mcp-only

**Prompt:** 登录页（login 路由）三端分别设置了哪些 testID，调用了哪个接口？只用 codewiki MCP 工具回答，引用 wiki 页面。

**Model:** `haiku` · claude args: `--mcp-config .mcp.json --strict-mcp-config --allowedTools mcp__codewiki__kb_search,mcp__codewiki__kb_get,mcp__codewiki__kb_context,mcp__codewiki__kb_parity,mcp__codewiki__kb_conflicts,mcp__codewiki__kb_status,mcp__codewiki__kb_anchor --disallowedTools Bash,Read,Grep,Glob`

## Tool calls

- `ToolSearch` {"query":"select:mcp__codewiki__kb_search,mcp__codewiki__kb_get,mcp__codewiki__kb_context,mcp__codewiki__kb_parity,mcp__codewiki__kb_status","max_results":5}
- `mcp__codewiki__kb_search` {"query":"login","limit":10}
- `mcp__codewiki__kb_get` {"page":"features/login"}

## Answer

登录页（`login` 路由）三端的 testID 名称完全一致，三端都只调用一个接口：`POST /api/login`。以下来自 wiki 页面 `features/login`（`pages/features/login.md`），该页面标注为 `current`，源提交为 `dd2b17a`。

**testID**（三端各 3 个，位置来自该页面的 testID 表）

| testID | Android | iOS | HarmonyOS |
|---|---|---|---|
| `login_username` | `LoginScreen.kt:19` | `LoginView.swift:11` | `LoginPage.ets:27` |
| `login_password` | `LoginScreen.kt:20` | `LoginView.swift:12` | `LoginPage.ets:29` |
| `login_submit` | `LoginScreen.kt:23` | `LoginView.swift:13` | `LoginPage.ets:31` |

路径前缀分别为 `android/app/src/main/java/com/minishop/ui/login/`、`ios/MiniShop/Features/Login/`、`harmony/entry/src/main/ets/pages/`。

**接口**

三端都是 `POST /api/login`，调用符号各不相同：

- Android：`ApiService.kt#ApiService.login`，`@POST("/api/login") suspend fun login(@Body body: LoginRequest): LoginResponse`
- iOS：`LoginViewModel.swift#LoginViewModel.login`
- HarmonyOS：`Api.ets#Api.login`

登录成功后，token 分别存入各端的 `TokenStore`（Android 的 `TokenStore.save`、HarmonyOS 的 `TokenStore.save`，iOS 的 `TokenStore.token`）。

**来源说明**

- testID 也可在 `facts/android/testids`、`facts/ios/testids`、`facts/harmony/testids` 中逐条核对，我用 `kb_search` 看到的摘要与上表行号一致。
- 该页面由 `kb compound --llm template` 确定性生成，并非 claude 模式的完整叙述；表格内容足以回答本问题。

_turns: 4, cost: $0.0103, duration: 11s_
