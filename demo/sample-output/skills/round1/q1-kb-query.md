# q1-kb-query

**Prompt:** 购物车上限三端分别是多少？请引用出处（符号 ID 与 wiki 页面）。只读，不要修改任何文件。

**Model:** `haiku` · cwd: demo repo with `.claude/skills` installed by `kb install-skills`

## Tool calls

- `Grep` {"pattern":"(?i)(cart.{0,20}(limit|max|quota|capacity)|max.{0,10}cart|MAX_CART|CART_LIMIT|cartLimit|购物车.{0,6}(上限|最多|限制))","path":"/tmp/claude-0/-home-user-axios
- `Bash` ls -la && ls -la .codewiki 2>/dev/null; ls wiki 2>/dev/null | head -50; git status --short | head -20
- `Bash` sed -n 1,20p wiki/pages/features/cart.md && echo ---- && sed -n 78,90p wiki/pages/features/cart.md && echo ---- && sed -n 1,30p wiki/pages/_conflicts.md && echo

## Answer

**三端购物车上限不一致：Android 50，iOS 99，HarmonyOS 50。** 代码为准，三个值都在源码里直接核对过。

| 平台 | 符号 ID | 值 | 源码位置 |
|---|---|---|---|
| Android | `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.MAX_CART_ITEMS` | 50 | `CartViewModel.kt:23` |
| iOS | `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.maxCartItems` | 99 | `CartViewModel.swift:6` |
| HarmonyOS | `harmony://entry/src/main/ets/common/CartStore.ets#MAX_CART_ITEMS` | 50 | `CartStore.ets:4` |

**Wiki 出处：**
- `wiki/pages/features/cart.md`：“关键常量”一节列出 Android `MAX_CART_ITEMS = 50`、iOS `maxCartItems = 99`。
- `wiki/pages/parity.md`：“跨平台常量差异”表，`max_cart_items` 为 android 50 / ios 99 / harmony 50，共 1 处差异。
- `wiki/pages/_conflicts.md`：记录了两条冲突，见下。

**文档与代码的冲突（wiki 已标记，代码为准）：**
- `docs/legacy/cart.md` 第 3 行写“最多 10 件”，与三端代码都不符。
- `specs/001-cart/spec.md` FR-002 写“最多 99 件”，与 Android 和 HarmonyOS 的 50 不符。

**其他需要注意的地方：**
- Android 和 HarmonyOS 的注释都写着“same rule on every platform”（同一规则），但实际数值不同。这很可能是有意的差异，也可能是遗漏，需要产品确认。
- 我只做了源码和 wiki 页面的核对，没有运行 `kb verify` 检查锚点哈希是否与当前 HEAD 一致。
- 全程只读，没有修改任何文件。

_turns: 4, cost: $0.0060, duration: 14s_
