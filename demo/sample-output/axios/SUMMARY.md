# 真实仓库案例：axios（JavaScript，只读）

对本机 axios 仓库（`/home/user/axios`，HEAD `56a5f1a`）运行 codewiki，用来验证两件事：`kb discover-docs` 和 JS 抽取器能处理真实仓库；文档中的断言可以与代码逐条对照。

**axios 仓库本身未被修改**：运行前后 `git status` 都是干净的。wiki 通过 `--config` 写在仓库外。

```bash
# codewiki.yaml（见本目录）: platforms: [{name: web, root: ., include: ["lib/**/*.js", "index.js"]}]
K="kb --root /home/user/axios --config /path/to/out/codewiki.yaml"
$K init
$K scan
$K discover-docs --json > docs.json
$K ingest --manifest docs.json --kinds agent-guide,design,readme          # template 模式（确定性核对）
$K compound && $K verify
# claude 模式：只核对 AGENTS.md（控制成本）
$K ingest --manifest agents-only.json --llm claude --fallback
```

## 扫描

| 指标 | 值 |
|---|---|
| 源文件 | 70（`lib/**/*.js` + `index.js`） |
| 符号 | 323（function / class / method / const） |
| parse_failures | 0 |
| 耗时 | 约 0.5 s |

完整符号表见 [template/symbols.md](template/symbols.md)。它相当于 repo-map：按文件列出顶层符号及其签名。

## 文档发现（`kb discover-docs`）

共发现 149 篇文档：

- `doc=133`：主要是 `docs/**`，包括多语言文档站
- `readme=7`：`lib/*/README.md` 等
- `design=6`：`THREATMODEL.md`、`SECURITY.md` 等
- `agent-guide=3`：`AGENTS.md`、`CLAUDE.md`、`.github/copilot-instructions.md`

manifest 见 [docs.json](docs.json)。

## 断言核对：template 模式（agent-guide + design + readme，共 16 篇）

共 174 条断言：**verified 89、unverifiable 85、conflict 0**。核对结果见 [template/_conflicts.md](template/_conflicts.md) 和 [template/requirements.json](template/requirements.json)。

以 AGENTS.md 中这条断言为例：“default adapter preference is `['xhr', 'http', 'fetch']`, with capability selection in `lib/adapters/adapters.js`”。

- 判定：**verified**
- 锚点：`web://lib/defaults/index.js#defaults`（在代码中检索到字面量 `adapter: ['xhr', 'http', 'fetch']`）
- 证据：文件 `lib/adapters/adapters.js` 存在

### 误报修正过程

第一版 template 检查给出 38 条 conflict，其中大多是误报。原因是把配置键、错误码和 Node 内置类型（如 `maxContentLength`、`ERR_NETWORK`、`ClientRequest.prototype.setHeader`）当成了“符号不存在”。

修正后的规则：

1. 先在声明过的符号中查找。
2. 找不到时，在代码中按完整 token 检索。
3. 只有 `Type.member` 中的 `Type` 在代码里完全不存在、并且不是内置类型时，才判为 conflict。
4. 其余情况判为 unverifiable。
5. `/api/...` 路径只在抽取到 HTTP 接口 facts 时才参与比对。

修正后 template 模式在 axios 上没有误报，minishop 中预期的冲突仍全部检出（有单测覆盖）。

## 断言核对：claude 模式（只核对 AGENTS.md，48 条断言，1 次 LLM 调用）

结果：**verified 23、unverifiable 22、conflict 3**，见 [claude-agents-md/_conflicts.md](claude-agents-md/_conflicts.md)。

同一份文档在 template 模式下的结果是 verified 32、unverifiable 16、conflict 0。语义核对找出了确定性检查发现不了的 3 处“文档与代码不一致”（以代码为准）：

| 断言 | LLM 给出的代码证据 |
|---|---|
| AGENTS.md：“Throw `AxiosError` for axios-originated failures; never raw `Error`.” | `lib/helpers/toFormData.js` 抛出 `new Error('Circular reference detected')`；`lib/helpers/formDataToStream.js` 抛出 `new Error('boundary must be 1-70 characters long')`；`CancelToken` 抛出 `TypeError` |
| AGENTS.md：“Do not use `Function.prototype.bind` directly — use `lib/helpers/bind.js`” | `lib/core/Axios.js` 使用 `dispatchRequest.bind(this)`；`lib/utils.js` 使用 `queueMicrotask.bind(_global)`；`lib/adapters/http.js` 使用 `process.nextTick.bind(process)` |
| AGENTS.md：“Do not throw raw `Error` from library code” | 证据同第一条 |

这 3 处的性质是：规范描述的是期望的约定，而代码中仍有例外（技术债，或者规范本身需要放宽）。这类信息正适合记录在 `_conflicts.md`，提醒后续 agent“代码现状与规范不同”。

LLM 判为 verified 的断言必须附带代码锚点；没有锚点的，CLI 会自动降级为 unverifiable。

## 结论

- JS 抽取器和文档发现可以直接用于真实仓库：tree-sitter 解析无失败，耗时在亚秒级。
- template 模式不产生误报，覆盖存在性和字面量类断言，适合作为 CI 中的确定性门禁。
- claude 模式能发现“规范与实现背离”这类语义冲突。可以按文档分批核对来控制成本，本例只用了 1 个任务。
