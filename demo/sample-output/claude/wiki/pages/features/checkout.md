---
id: features/checkout
title: 结算（checkout）
kind: feature
platforms: [android, harmony, ios]
routes: [checkout]
sources:
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.createOrder
    hash: 16dddab20b7b2f5889cfa94f4855b4859621c873dce95bbfd7c3f540e8d5a39e
  - sym: android://app/src/main/java/com/minishop/ui/checkout/CheckoutScreen.kt#CheckoutScreen
    hash: 1940402765a35c64188391d26cfe364248f8ccbf9b3cd29e06a3b2d7e30a77a1
  - sym: android://app/src/main/java/com/minishop/ui/checkout/CheckoutScreen.kt#placeOrder
    hash: 6a49be2de0965c0cfd44ec7837c54a7fd4b21a6be67fc7450137f60c4d8655b7
  - sym: harmony://entry/src/main/ets/common/Api.ets#Api.createOrder
    hash: b4ac085d45415e75d5d9157f62d8918021490b4203ced3aef25a71b76ac45462
  - sym: harmony://entry/src/main/ets/pages/CheckoutPage.ets#CheckoutBuilder
    hash: e3e37ad1e7fecd0076df371af3e913375b3c89d66aaea009e616dc766d900eca
  - sym: harmony://entry/src/main/ets/pages/CheckoutPage.ets#CheckoutPage.build
    hash: 40040482d3f2a819eb0422af5dca450992cfe936fa07ae544923add88aec1c08
  - sym: harmony://entry/src/main/ets/pages/CheckoutPage.ets#CheckoutPage.placeOrder
    hash: 8aea985a316bf1252fd9a3580d1ba302b1a7f4a53aaa70207716ff2fad85c4be
  - sym: ios://MiniShop/Features/Checkout/CheckoutView.swift#CheckoutView
    hash: b33e63205cc465f2fd5986cf24b6edac9b938d724a644f7907cb2a0bf3b16a72
  - sym: ios://MiniShop/Features/Checkout/CheckoutView.swift#CheckoutView.body
    hash: 836b7ccf330c757aba70c87b1461ac7c29907999f465c9a155d4b5c7375ddef2
  - sym: ios://MiniShop/Features/Checkout/CheckoutView.swift#CheckoutView.placeOrder
    hash: d550cae56e3c79f61c91d21b77abe66c40cdc91bc4012480979f14637c318a82
  - sym: ios://MiniShop/Features/Checkout/CheckoutView.swift#CheckoutView.router
    hash: 137f5eb371d4d68983fd5b9b7dc70d78c07c32f8a2dd1dbad99f490707470b9c
  - sym: ios://MiniShop/Networking/APIClient.swift#APIClient.baseURL
    hash: 1cf6225facc7542a86b7192fa7bc17bfdaba767e09006fe3edf655410524c2a0
  - sym: ios://MiniShop/Networking/APIClient.swift#LoginResponse.token
    hash: d31dd686a0bb1c46c11e0ebcd19b599d5aa898cb82b6ce956b5f579cba6d3e17
  - sym: ios://MiniShop/Networking/APIClient.swift#OrderRequest.paymentMethod
    hash: d1762ee929d6d5f2d912dee489947d1f3ad5c8addfa12934cd25b1e39c682673
  - sym: ios://MiniShop/Networking/APIClient.swift#OrderResponse.orderId
    hash: ead55dc30df1719756ce3396b0c48010bbe572c178892e9d115a3436087714e2
  - sym: ios://MiniShop/Networking/APIClient.swift#OrderResponse.status
    hash: 19364be6e63ee5d8f917f567b981834d91e24c5d6a119d578912f788e44f0cb6
  - sym: ios://MiniShop/Networking/APIClient.swift#TokenStore.token
    hash: cc9a2bad373da05b2c10efdd69bf76de940bebff0e4ee5477b4b4cd213b4dc72
source_commit: 4b29970
status: current
---
# 结算（checkout）

> 由 `kb compound --llm template` 根据 facts 与符号图确定性生成；使用 claude 模式可获得更完整的叙述。锚点见 frontmatter `sources`。

## 路由与深链

| 平台 | pattern | deeplink | 入口符号 |
|---|---|---|---|
| android | `checkout` | `minishop://checkout` | `android://app/src/main/java/com/minishop/ui/checkout/CheckoutScreen.kt#CheckoutScreen` |
| harmony | `checkout` | `minishop://checkout` | `harmony://entry/src/main/ets/pages/CheckoutPage.ets#CheckoutBuilder` |
| ios | `checkout` | `minishop://checkout` | `ios://MiniShop/Features/Checkout/CheckoutView.swift#CheckoutView` |

测试注入参数：`?token=<t>&cart=<sku,sku>`（见各端 deeplink 处理代码）。

## testID

| 平台 | tid | 位置 |
|---|---|---|
| android | `checkout_submit` | `android/app/src/main/java/com/minishop/ui/checkout/CheckoutScreen.kt:22` |
| harmony | `checkout_submit` | `harmony/entry/src/main/ets/pages/CheckoutPage.ets:22` |
| ios | `checkout_submit` | `ios/MiniShop/Features/Checkout/CheckoutView.swift:9` |

## 接口

| 平台 | 方法 | 路径 | 调用符号 |
|---|---|---|---|
| android | POST | `/api/orders` | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.createOrder` |
| harmony | POST | `/api/orders` | `harmony://entry/src/main/ets/common/Api.ets#Api.createOrder` |
| ios | POST | `/api/orders` | `ios://MiniShop/Features/Checkout/CheckoutView.swift#CheckoutView.placeOrder` |

## 相关代码

**android**

- `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.createOrder` — function `@POST("/api/orders") suspend fun createOrder(@Body body: OrderRequest): OrderResponse`
- `android://app/src/main/java/com/minishop/ui/checkout/CheckoutScreen.kt#CheckoutScreen` — composable `@Composable fun CheckoutScreen(onOrderPlaced: (String) -> Unit, onBack: () -> Unit)`
- `android://app/src/main/java/com/minishop/ui/checkout/CheckoutScreen.kt#placeOrder` — function `suspend fun placeOrder(): String`

**harmony**

- `harmony://entry/src/main/ets/common/Api.ets#Api.createOrder` — method `static async createOrder(paymentMethod: string): Promise<string>`
- `harmony://entry/src/main/ets/pages/CheckoutPage.ets#CheckoutBuilder` — function `@Builder export function CheckoutBuilder()`
- `harmony://entry/src/main/ets/pages/CheckoutPage.ets#CheckoutPage.build` — method `build()`
- `harmony://entry/src/main/ets/pages/CheckoutPage.ets#CheckoutPage.placeOrder` — method `async placeOrder(): Promise<void>`

**ios**

- `ios://MiniShop/Features/Checkout/CheckoutView.swift#CheckoutView` — struct `struct CheckoutView: View`
- `ios://MiniShop/Features/Checkout/CheckoutView.swift#CheckoutView.body` — property `var body: some View`
- `ios://MiniShop/Features/Checkout/CheckoutView.swift#CheckoutView.placeOrder` — function `func placeOrder() async -> OrderResponse?`
- `ios://MiniShop/Features/Checkout/CheckoutView.swift#CheckoutView.router` — property `@EnvironmentObject var router: AppRouter`
- `ios://MiniShop/Networking/APIClient.swift#APIClient.baseURL` — property `let baseURL`
- `ios://MiniShop/Networking/APIClient.swift#LoginResponse.token` — property `let token: String`
- `ios://MiniShop/Networking/APIClient.swift#OrderRequest.paymentMethod` — property `let paymentMethod: String`
- `ios://MiniShop/Networking/APIClient.swift#OrderResponse.orderId` — property `let orderId: String`
- `ios://MiniShop/Networking/APIClient.swift#OrderResponse.status` — property `let status: String`
- `ios://MiniShop/Networking/APIClient.swift#TokenStore.token` — property `private(set) var token: String?`

## 相关页面

- [总览](../overview.md)
- [导航与深链](../concepts/navigation.md) · [共享组件](../concepts/shared-components.md)
- [android routes facts](../../facts/android/routes.md)
- [harmony routes facts](../../facts/harmony/routes.md)
- [ios routes facts](../../facts/ios/routes.md)
