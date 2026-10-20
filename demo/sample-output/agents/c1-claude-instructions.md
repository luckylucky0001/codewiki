# c1-claude-instructions

**Prompt:** 购物车上限三端分别是多少？请引用出处（符号 ID 与 wiki 页面）。只读，不要修改任何文件。

**Model:** `haiku` · claude args: `--allowedTools Skill,Read,Glob,Grep,Bash(kb:*)`

## Tool calls

- `Bash` kb search cart 2>&1 | head -50; echo ---; kb parity 2>&1 | head -80
- `Grep` {"pattern":"(?i)(cart|购物车).*(limit|max|上限|MAX)|(limit|max|上限|MAX).*(cart|购物车)","path":"<tmp>/minishop/wiki","output_mode":"content","-n":true,"hea
- `Bash` sed -n 80,125p wiki/pages/features/cart.md; echo ---; grep -n "MAX_CART_ITEMS" -r harmony/ 2>/dev/null; grep -n "MAX_CART_ITEMS\|maxCartItems" -r app/ ios/ 2>/d
- `Bash` grep -rn "MAX_CART_ITEMS" --include=*.kt . | grep -v wiki/; sed -n 1,20p harmony/entry/src/main/ets/common/CartStore.ets; sed -n 1,20p ios/MiniShop/Features/Car

## Answer

三端购物车上限都是 **99**，且三端一致。

| 平台 | 符号 ID | 取值 | 代码位置 |
|---|---|---|---|
| Android | `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.MAX_CART_ITEMS` | `const val MAX_CART_ITEMS = 99` | `android/app/src/main/java/com/minishop/ui/cart/CartViewModel.kt:23` |
| iOS | `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.maxCartItems` | `static let maxCartItems = 99` | `ios/MiniShop/Features/Cart/CartViewModel.swift:6` |
| HarmonyOS | `harmony://entry/src/main/ets/common/CartStore.ets#MAX_CART_ITEMS` | `export const MAX_CART_ITEMS: number = 99` | `harmony/entry/src/main/ets/common/CartStore.ets:4` |

**出处**
- wiki 页面：`wiki/pages/features/cart.md` 的「关键常量」一节，列出 Android 与 iOS 的值为 99。Harmony 的常量没有列在该节里。
- `kb parity` 报告「跨平台常量差异：（无）」，即三端同名常量取值一致。
- 源码中的三处值均已逐一核对。

**两点需要注意**
1. 上限的检查方式是：`addItem` 时判断 `items.count` 是否已达到 99，然后追加一条。因此它限制的是购物车里的**条目数**，不是各条目数量之和。三端的 `addItem` 都固定以数量 1 调用接口。
2. Android 的注释写的是「Quantity per order is capped by MAX_CART_ITEMS」（`CartViewModel.kt:9`），按数量理解，但实际逻辑是按条目数。这个注释容易误导，建议修正措辞。

此外，wiki 符号 ID 中省略了仓库根目录前缀（`android/`、`ios/`、`harmony/`），定位文件时需要补上。

本次只读，没有修改任何文件。

_turns: 5, cost: $0.0061, duration: 15s_
