---
id: concepts/shared-components
title: 共享组件
kind: concept
platforms: [android, harmony, ios]
sources:
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiClient
    hash: de2811733986c4dd62d121638ffbdb0cbe58eadc35651735ade3118ba8d9d938
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiClient.BASE_URL
    hash: 7dcd362edc1216606ccf4916aed55fc74855c4095cc2b4583fa705a55c7959a9
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiClient.service
    hash: 3fe962f0317cd2eb2057b5d5b2a5825fa045583e3425e998d41e5e76a56e1a05
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.items
    hash: 6933c36bf1380135f949cc722b04f5f4ca17951c7af709a0d83f4a7bc818c3c7
  - sym: android://app/src/main/java/com/minishop/ui/components/MiniShopTopBar.kt#MiniShopTopBar
    hash: a950939b071b355f1752ab5ba76842b203ccc17a22905e00e98b7cce1f172af5
  - sym: harmony://entry/src/main/ets/common/Api.ets#Api
    hash: 5e312798cfe6a2aa5befb257dcf24ca63d2a3775b89f30a1f67ab1905cb4361b
  - sym: harmony://entry/src/main/ets/common/Api.ets#Api.addToCart
    hash: 2ba9b9e96f64cd43188e28c0cb0ce068718daeb724decbed662b193352e8d65e
  - sym: harmony://entry/src/main/ets/common/BackButton.ets#BackButton
    hash: 6af4e515fcee74f0cc6a323385366aa86392d4b356a25852e11e4f3c720c7705
  - sym: harmony://entry/src/main/ets/common/BackButton.ets#BackButton.build
    hash: 5cae89833567b94193783e6c5af6291bbc6dc8a7382e594697c5485f0c6d578e
  - sym: ios://MiniShop/Components/BackButton.swift#BackButton
    hash: 927a88e4a4aadadbdcf7a5df0ac63103b4fd4665040934eaba06e8df323b559a
  - sym: ios://MiniShop/Components/BackButton.swift#BackButton.body
    hash: a98e27bdf2b7598556a38db6c2a3124dfd935858218baa2ae19751dd87c4cb19
  - sym: ios://MiniShop/Components/BackButton.swift#BackButton.dismiss
    hash: d2952ecb413ac8da3f7adf0834b85bb8b8cd61e0c9a337992105bf4394da93c6
  - sym: ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel
    hash: 65d4b59b92a139ca7ea4742ffa1e5299dfe378c0230f71e77310f7037ef91439
  - sym: ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.preload
    hash: 47f905d14a85998bdaaa4daf9cd8069cb3ef174fb787cd1b8ea823c63a328697
  - sym: ios://MiniShop/Networking/APIClient.swift#APIClient
    hash: c5e6ec083db8da3b60ada101d24777b880f90a77bd7942857308380eef805c38
  - sym: ios://MiniShop/Networking/APIClient.swift#APIClient.send
    hash: b6f29af6cc3428a33a0672d119e060c8983c74a2f3131f01378651ee4362e43e
  - sym: ios://MiniShop/Networking/APIClient.swift#APIClient.shared
    hash: 74c5c163f81b3f1a5f29c398419c92c86ef926961f9820a252da3c3a06c310b9
  - sym: ios://MiniShop/Networking/APIClient.swift#CartResponse.count
    hash: 7ccd9948ba99f0e16f94e88d2a0b4cd26c8a16dcf86de7f21b9f6d77eb857118
  - sym: ios://MiniShop/Networking/APIClient.swift#LoginResponse.token
    hash: d31dd686a0bb1c46c11e0ebcd19b599d5aa898cb82b6ce956b5f579cba6d3e17
  - sym: ios://MiniShop/Networking/APIClient.swift#TokenStore
    hash: 59185d41a76f21ca55b2b423e6e6bfcb7ea1fc5dcfb5fce823db3f38c1a6984f
  - sym: ios://MiniShop/Networking/APIClient.swift#TokenStore.save
    hash: f0e91ef8b002ef95a2de1eb4665dd1fd8d0906cb506a4adebb688455f571984a
  - sym: ios://MiniShop/Networking/APIClient.swift#TokenStore.shared
    hash: 160dd603b73cd275a6b0089cbe4b95d633ac45773c271403286088aa378bff21
  - sym: ios://MiniShop/Networking/APIClient.swift#TokenStore.token
    hash: cc9a2bad373da05b2c10efdd69bf76de940bebff0e4ee5477b4b4cd213b4dc72
source_commit: ad4e3b0
status: current
---
# 共享组件

> 被 ≥3 个路由引用的符号（返回按钮、顶栏、API 客户端等）。它们不计入单个功能页的锚点，改动它们只会让本页失效，而不会让所有功能页一起变 stale。

## 概述

- **网络层**：三端各有一个集中式 API 入口，基础地址均为 `https://api.minishop.example`（Android/iOS 在代码中声明；Harmony 使用 `BASE_URL`）。
- **登录令牌**：iOS 由 `TokenStore` 在内存中持有 token，`APIClient.send` 自动附加；Harmony 仅 `addToCart` 携带 token。
- **返回导航**：三端的返回按钮统一使用 testID `nav_back`（见下文“testID 与测试要点”）。
- **购物车状态**：购物车列表在 Android（`items`）与 iOS（`CartViewModel`）中由 ViewModel 持有。

## android

| kind | 符号 | 签名 | 使用方 |
|---|---|---|---|
| object | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiClient` | `object ApiClient` | （routes: cart, checkout, login, product_detail, products） |
| property | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiClient.BASE_URL` | `const val BASE_URL` |  |
| property | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiClient.service` | `val service: ApiService` | （routes: cart, checkout, login, product_detail, products） |
| property | `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.items` | `val items`（`mutableListOf<String>()`） | （routes: cart, product_detail, products） |
| composable | `android://app/src/main/java/com/minishop/ui/components/MiniShopTopBar.kt#MiniShopTopBar` | `@Composable fun MiniShopTopBar(title: String, onBack: (() -> Unit)? = null)` | （routes: cart, checkout, order_detail, product_detail） |

`ApiClient.service` 通过 Retrofit 以 `BASE_URL` 构建。`MiniShopTopBar` 仅在 `onBack != null` 时渲染返回图标。

## harmony

| kind | 符号 | 签名 | 使用方 |
|---|---|---|---|
| class | `harmony://entry/src/main/ets/common/Api.ets#Api` | `export class Api` | （routes: checkout, login, product_detail, products） |
| method | `harmony://entry/src/main/ets/common/Api.ets#Api.addToCart` | `static async addToCart(sku: string, quantity: number): Promise<void>` |  |
| component | `harmony://entry/src/main/ets/common/BackButton.ets#BackButton` | `@Component export struct BackButton` | （routes: cart, checkout, order_detail, product_detail） |
| method | `harmony://entry/src/main/ets/common/BackButton.ets#BackButton.build` | `build()` |  |

`Api` 为全静态方法集合，基于 `http.createHttp().request`：

| 方法 | 请求 | 返回 |
|---|---|---|
| `login(username, password)` | POST `/api/login` | token（取响应 JSON 的 `token`） |
| `fetchProducts()` | GET `/api/products` | `Product[]` |
| `loadProduct(id)` | GET `/api/products/<id>` | `Product` |
| `addToCart(sku, quantity)` | POST `/api/cart`，带 `Authorization: Bearer <TokenStore.get()>` | `void` |
| `createOrder(paymentMethod)` | POST `/api/orders` | orderId（取响应 JSON 的 `orderId`） |

注意：`createOrder` 的请求头中没有 `Authorization`，仅 `addToCart` 携带 Bearer token。

`BackButton` 通过 `@Consume('pathStack') pathStack: NavPathStack` 在点击时 `pop()`。

## ios

| kind | 符号 | 签名 | 使用方 |
|---|---|---|---|
| struct | `ios://MiniShop/Components/BackButton.swift#BackButton` | `struct BackButton: View` | （routes: cart, checkout, order_detail, product_detail） |
| property | `ios://MiniShop/Components/BackButton.swift#BackButton.body` | `var body: some View` |  |
| property | `ios://MiniShop/Components/BackButton.swift#BackButton.dismiss` | `@Environment(\.dismiss) private var dismiss` |  |
| class | `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel` | `@MainActor final class CartViewModel: ObservableObject` | （routes: cart, checkout, login, product_detail, products） |
| function | `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.preload` | `static func preload(_ skus: [String])` | （routes: cart, checkout, login, products） |
| class | `ios://MiniShop/Networking/APIClient.swift#APIClient` | `final class APIClient` | （routes: cart, checkout, login, product_detail, products） |
| function | `ios://MiniShop/Networking/APIClient.swift#APIClient.send` | `func send<T: Decodable>(_ method: HTTPMethod, path: String, body: Encodable? = nil) async throws -> T` | （routes: cart, checkout, login, product_detail, products） |
| property | `ios://MiniShop/Networking/APIClient.swift#APIClient.shared` | `static let shared` | （routes: cart, checkout, login, product_detail, products） |
| property | `ios://MiniShop/Networking/APIClient.swift#CartResponse.count` | `let count: Int` | （routes: cart, checkout, login, product_detail, products） |
| property | `ios://MiniShop/Networking/APIClient.swift#LoginResponse.token` | `let token: String`（`struct LoginResponse: Decodable`） |  |
| class | `ios://MiniShop/Networking/APIClient.swift#TokenStore` | `final class TokenStore` | （routes: cart, checkout, login, products） |
| function | `ios://MiniShop/Networking/APIClient.swift#TokenStore.save` | `func save(_ token: String)` | （routes: cart, checkout, login, products） |
| property | `ios://MiniShop/Networking/APIClient.swift#TokenStore.shared` | `static let shared` | （routes: cart, checkout, login, products） |
| property | `ios://MiniShop/Networking/APIClient.swift#TokenStore.token` | `private(set) var token: String?` |  |

## 接口与数据流

- iOS 请求：`APIClient.send` 统一构造请求；`TokenStore.shared` 的 `token` 非空时自动附加 `Authorization: Bearer`，请求体用 JSON 编码，响应按泛型 `Decodable` 解码。
- iOS 令牌：登录响应类型 `LoginResponse` 带 `token: String`；`TokenStore.token` 为 `private(set)`，外部只能通过 `TokenStore.save` 写入，且仅保存在内存属性中（不持久化，应用重启后丢失）。
- iOS `CartViewModel` 加入购物车后，向 POST `/api/cart` 发送 `CartRequest(sku:quantity:)`，响应类型为 `CartResponse`（字段 `count`）。`CartViewModel.preload` 把 SKU 追加到静态 `pending` 列表。
- Harmony：`Api` 直接拼接 `BASE_URL`，token 取自 `TokenStore.get()`，仅在 `addToCart` 中使用。
- Android：请求通过 `ApiClient.service`（Retrofit）发出。

## testID 与测试要点

| 平台 | 返回按钮标识 | 实现 |
|---|---|---|
| android | `nav_back`（`testTag`） | `MiniShopTopBar` 的 `IconButton` |
| harmony | `nav_back`（`id`） | `BackButton.build` |
| ios | `nav_back`（`accessibilityIdentifier`） | `BackButton.body` |

## 相关页面

- [总览](../overview.md)
