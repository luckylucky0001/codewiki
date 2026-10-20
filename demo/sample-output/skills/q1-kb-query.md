# q1-kb-query

**Prompt:** 购物车上限三端分别是多少？请引用出处（符号 ID 与 wiki 页面）。只读，不要修改任何文件。

**Model:** `haiku` · cwd: demo repo with `.claude/skills` installed by `kb install-skills`

## Tool calls

- `Skill` kb-query
- `Bash` kb status --json; echo "---"; kb search "购物车 上限" --json; echo "---"; kb parity --json
- `Bash` grep -rn "MAX_CART_ITEMS\|maxCartItems" --include=*.kt --include=*.swift --include=*.ets . | grep -v "/build/"; echo "--- cart page"; kb get features/cart; echo

## Answer

**三端购物车上限不一致：Android 50、HarmonyOS 50、iOS 99。** 三端代码都能对上，wiki 的 `kb status` 为 ok、无过期页面。

| 平台 | 上限 | 符号 ID | 判定逻辑 |
|---|---|---|---|
| Android | 50 | `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.MAX_CART_ITEMS` | `CartViewModel.kt:14`，`if (items.size >= MAX_CART_ITEMS) return false` |
| HarmonyOS | 50 | `harmony://entry/src/main/ets/common/CartStore.ets#MAX_CART_ITEMS` | `CartStore.ets:4` 定义，`:11` 中 `items.length + quantity > MAX_CART_ITEMS` 时拒绝 |
| iOS | 99 | `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.maxCartItems` | `CartViewModel.swift:6` 定义，`:12` 中 `items.count < maxCartItems` 才允许添加 |

**wiki 出处**
- `pages/features/cart.md`（购物车（cart））的「关键常量」列出 android `MAX_CART_ITEMS = 50`、ios `maxCartItems = 99`，并列出对应符号锚点。
- `kb parity --json` 的 `constant_diffs` 中 `max_cart_items` 给出同样的三端值。

**需要注意**
- **文档与代码冲突**：`pages/_conflicts.md` 记录了两处过时文档。`CART-43567f`（`raw/docs/docs/legacy/cart.md` L3）写的是 10，已被判为与代码冲突。`FR-002`（`raw/docs/specs/001-cart/spec.md` L22）写的是 99，只与 iOS 一致，与 Android、HarmonyOS 冲突。`PLAN-3e24ef`（`specs/001-cart/plan.md` L4）声称「三端共享上限常量」，代码并非如此，这条文档也不可信。
- **计数口径不同**：Android 按不同 SKU 的条目数计，最多 50 个条目。HarmonyOS 按件数计（`items.length + quantity`），总件数不能超过 50。iOS 按 `items.count` 计，最多 99 个条目。所以「上限」数字相同的两端，实际语义也不一样。

本次只读，没有修改任何文件。

_turns: 5, cost: $0.0078, duration: 16s_
