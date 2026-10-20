# c2-claude-instructions

**Prompt:** 这个 app 一共有多少个路由？哪些路由页面没有设置 testID？只读，不要修改任何文件。

**Model:** `haiku` · claude args: `--allowedTools Skill,Read,Glob,Grep,Bash(kb:*)`

## Tool calls

- `Bash` kb routes
- `Bash` kb lint-tid --pages

## Answer

**一共 6 个路由**，分布在三端，合计 18 条路由映射（Android、HarmonyOS 各 6 条，iOS 6 条）。`kb routes` 显示有 7 个模块，dangling buildFunction 为 0。

**没有设置 testID 的路由页面：0 个。** 18 个路由页面的源码都设置了 testID。

| 路由 | Android | HarmonyOS | iOS |
|---|---|---|---|
| login | ✅ 3 个 | ✅ 3 个 | ✅ 3 个 |
| products | ✅ 3 个 | ✅ 3 个 | ✅ 3 个 |
| product_detail | ✅ 1 个 | ✅ 1 个 | ✅ 1 个 |
| cart | ✅ 1 个 | ✅ 1 个 | ✅ 1 个 |
| checkout | ✅ 1 个 | ✅ 1 个 | ✅ 1 个 |
| order_detail | ✅ 1 个 | ✅ 1 个 | ✅ 1 个 |

这里统计的是每个页面源码里是否出现 testID，不是逐个控件是否都有。例如 `product_detail` 只有 `add_to_cart` 一个 testID。如果要看逐控件的覆盖情况，可以再用 `kb lint-tid --json` 或 `kb lint-tid` 查看。

本次只运行了只读的 `kb` 命令，没有修改任何文件。

_turns: 3, cost: $0.0037, duration: 8s_
