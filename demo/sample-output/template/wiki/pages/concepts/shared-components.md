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
source_commit: 9d6e21c
status: current
---
# 共享组件

> 被 ≥3 个路由引用的符号（返回按钮、顶栏、API 客户端等）。它们不计入单个功能页的锚点，改动它们只会让本页失效，而不会让所有功能页一起变 stale。

## android

| kind | 符号 | 签名 | 使用方 |
|---|---|---|---|
| object | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiClient` | `object ApiClient` | （routes: cart, checkout, login, product_detail, products） |
| property | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiClient.BASE_URL` | `const val BASE_URL` |  |
| property | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiClient.service` | `val service: ApiService` | （routes: cart, checkout, login, product_detail, products） |
| composable | `android://app/src/main/java/com/minishop/ui/components/MiniShopTopBar.kt#MiniShopTopBar` | `@Composable fun MiniShopTopBar(title: String, onBack: (() -> Unit)? = null)` | （routes: cart, checkout, order_detail, product_detail, profile） |

## harmony

| kind | 符号 | 签名 | 使用方 |
|---|---|---|---|
| class | `harmony://entry/src/main/ets/common/Api.ets#Api` | `export class Api` | （routes: checkout, login, product_detail, products） |
| method | `harmony://entry/src/main/ets/common/Api.ets#Api.addToCart` | `static async addToCart(sku: string, quantity: number): Promise<void>` |  |
| component | `harmony://entry/src/main/ets/common/BackButton.ets#BackButton` | `@Component export struct BackButton` | （routes: cart, checkout, order_detail, product_detail, profile） |
| method | `harmony://entry/src/main/ets/common/BackButton.ets#BackButton.build` | `build()` |  |

## ios

| kind | 符号 | 签名 | 使用方 |
|---|---|---|---|
| struct | `ios://MiniShop/Components/BackButton.swift#BackButton` | `struct BackButton: View` | （routes: cart, checkout, order_detail, product_detail, profile） |
| property | `ios://MiniShop/Components/BackButton.swift#BackButton.body` | `var body: some View` | （routes: cart, checkout, order_detail, product_detail, profile） |
| property | `ios://MiniShop/Components/BackButton.swift#BackButton.dismiss` | `@Environment(\.dismiss) private var dismiss` | （routes: cart, checkout, order_detail, product_detail, profile） |
| class | `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel` | `@MainActor final class CartViewModel: ObservableObject` | （routes: cart, checkout, login, product_detail, products, profile） |
| function | `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.preload` | `static func preload(_ skus: [String])` | （routes: cart, checkout, login, products, profile） |
| class | `ios://MiniShop/Networking/APIClient.swift#APIClient` | `final class APIClient` | （routes: cart, checkout, login, product_detail, products） |
| function | `ios://MiniShop/Networking/APIClient.swift#APIClient.send` | `func send<T: Decodable>(_ method: HTTPMethod, path: String, body: Encodable? = nil) async throws -> T` | （routes: cart, checkout, login, product_detail, products） |
| property | `ios://MiniShop/Networking/APIClient.swift#APIClient.shared` | `static let shared` | （routes: cart, checkout, login, product_detail, products） |
| property | `ios://MiniShop/Networking/APIClient.swift#LoginResponse.token` | `let token: String` | （routes: checkout, login, profile） |
| class | `ios://MiniShop/Networking/APIClient.swift#TokenStore` | `final class TokenStore` | （routes: cart, checkout, login, products, profile） |
| function | `ios://MiniShop/Networking/APIClient.swift#TokenStore.save` | `func save(_ token: String)` | （routes: cart, checkout, login, products, profile） |
| property | `ios://MiniShop/Networking/APIClient.swift#TokenStore.shared` | `static let shared` | （routes: cart, checkout, login, products, profile） |
| property | `ios://MiniShop/Networking/APIClient.swift#TokenStore.token` | `private(set) var token: String?` | （routes: checkout, login, profile） |

## 相关页面

- [总览](../overview.md)
