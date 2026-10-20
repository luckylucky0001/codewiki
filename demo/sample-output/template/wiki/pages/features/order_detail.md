---
id: features/order_detail
title: 订单详情（order_detail）
kind: feature
platforms: [android, harmony, ios]
routes: [order_detail]
sources:
  - sym: android://app/src/main/java/com/minishop/ui/order/OrderDetailScreen.kt#OrderDetailScreen
    hash: 43c083aed2c3505314ce1e096e54315d235c069cd2ae327cdca4a5e8d88008a7
  - sym: harmony://entry/src/main/ets/pages/OrderDetailPage.ets#OrderDetailBuilder
    hash: 1388863401ec47f4917f8e81d5d03c44ff9151ea68eb590d9897718048f1f3ee
  - sym: harmony://entry/src/main/ets/pages/OrderDetailPage.ets#OrderDetailPage.build
    hash: 6647881d72838f0dadd93e4107052796a80280a72322d6db7eb5d42e65d5d89b
  - sym: ios://MiniShop/Features/Order/OrderDetailView.swift#OrderDetailView
    hash: 3a3b475312b0bf55a339b68ae327feadba87f367600149803bcfcdc606514e8b
  - sym: ios://MiniShop/Features/Order/OrderDetailView.swift#OrderDetailView.body
    hash: 0926b072cacce7ce5cb5717540bad6ae6c29803a4e253f3ba5edc566a61b2a24
  - sym: ios://MiniShop/Features/Order/OrderDetailView.swift#OrderDetailView.id
    hash: 22a33fb48918bb7a97d40a7a2512460d93468171f49d23bf8ab8e6fce77fd574
source_commit: 296c865
status: current
---
# 订单详情（order_detail）

> 由 `kb compound --llm template` 根据 facts 与符号图确定性生成；使用 claude 模式可获得更完整的叙述。锚点见 frontmatter `sources`。

## 路由与深链

| 平台 | pattern | deeplink | 入口符号 |
|---|---|---|---|
| android | `order/{id}` | `minishop://order/{id}` | `android://app/src/main/java/com/minishop/ui/order/OrderDetailScreen.kt#OrderDetailScreen` |
| harmony | `order/{id}` | `minishop://order/{id}` | `harmony://entry/src/main/ets/pages/OrderDetailPage.ets#OrderDetailBuilder` |
| ios | `order/{id}` | `minishop://order/{id}` | `ios://MiniShop/Features/Order/OrderDetailView.swift#OrderDetailView` |

测试注入参数：`?token=<t>&cart=<sku,sku>`（见各端 deeplink 处理代码）。

## testID

| 平台 | tid | 位置 |
|---|---|---|
| android | `order_status` | `android/app/src/main/java/com/minishop/ui/order/OrderDetailScreen.kt:14` |
| harmony | `order_status` | `harmony/entry/src/main/ets/pages/OrderDetailPage.ets:16` |
| ios | `order_status` | `ios/MiniShop/Features/Order/OrderDetailView.swift:9` |

## 接口

（该功能的锚点符号未直接调用 HTTP 接口）

## 相关代码

**android**

- `android://app/src/main/java/com/minishop/ui/order/OrderDetailScreen.kt#OrderDetailScreen` — composable `@Composable fun OrderDetailScreen(id: String, onBack: () -> Unit)`

**harmony**

- `harmony://entry/src/main/ets/pages/OrderDetailPage.ets#OrderDetailBuilder` — function `@Builder export function OrderDetailBuilder()`
- `harmony://entry/src/main/ets/pages/OrderDetailPage.ets#OrderDetailPage.build` — method `build()`

**ios**

- `ios://MiniShop/Features/Order/OrderDetailView.swift#OrderDetailView` — struct `struct OrderDetailView: View`
- `ios://MiniShop/Features/Order/OrderDetailView.swift#OrderDetailView.body` — property `var body: some View`
- `ios://MiniShop/Features/Order/OrderDetailView.swift#OrderDetailView.id` — property `let id: String`

## 相关页面

- [总览](../overview.md)
- [导航与深链](../concepts/navigation.md) · [共享组件](../concepts/shared-components.md)
- [android routes facts](../../facts/android/routes.md)
- [harmony routes facts](../../facts/harmony/routes.md)
- [ios routes facts](../../facts/ios/routes.md)
