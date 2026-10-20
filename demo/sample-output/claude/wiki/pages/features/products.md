---
id: features/products
title: 商品列表（products）
kind: feature
platforms: [android, harmony, ios]
routes: [products]
sources:
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiClient.service
    hash: 3fe962f0317cd2eb2057b5d5b2a5825fa045583e3425e998d41e5e76a56e1a05
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.getProduct
    hash: aec1ad5dda84abee9cd40ac64626e5c14c13d9d6063352d0d6a1b1e1a0b04cbd
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.listProducts
    hash: 811ab70ffe53f90e955509d706154fc4ac2a5a73f93d1085bec1db580e8dfe1c
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.items
    hash: 6933c36bf1380135f949cc722b04f5f4ca17951c7af709a0d83f4a7bc818c3c7
  - sym: android://app/src/main/java/com/minishop/ui/products/ProductsScreen.kt#ProductsScreen
    hash: 3c528d5681374370c401fbbeaf2a52ced005d647684229c0838372146d458993
  - sym: android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.loadProduct
    hash: 73af4e1e5e372cc5a7e7ecba9d9755f45df8f2f6b72238ee5085844ec92df395
  - sym: android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.loadProducts
    hash: fd051751ef9db53c9d32922b0156bb4ef0f3807b2b1498dd120f4b816d304a39
  - sym: android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.products
    hash: c89add9e72a3fb1e5a2c7b8b7ab2eacae4462d0a6134cd3f6d89eadb2c53ba79
  - sym: harmony://entry/src/main/ets/common/Api.ets#Api.fetchProducts
    hash: c0e47bff3aac1f68c711e60bd88daea456a44f44f68a1a7596be32bca71e52a2
  - sym: harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsBuilder
    hash: 0c195a6b69746051b92763764c47bc6679a927f5ea7792caf48c2a5884d2cb60
  - sym: harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsPage.aboutToAppear
    hash: d1b16fa49c507d35c10ac1c14d6a16e6dfedc0b3fdd3fe0d02896ba932be68d5
  - sym: harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsPage.build
    hash: 65f07a9c5edfba1adcd011820fbf9f61ccc15b2812cfa152f49957659988744e
  - sym: harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsPage.pathStack
    hash: d348143e464db81a86e98f370526c7e901585a646f2c2da22b03cd196207ad88
  - sym: harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsPage.products
    hash: e26a76434e55ea594a50def5ba2745a94e01f4b60bbd482b8ea28bcefa7d39fc
  - sym: ios://MiniShop/Features/Products/ProductsView.swift#ProductsView
    hash: 6e3105782171131b6e0b10a2bf13398e154dbe6c66ed58445b6a5db3f2792280
  - sym: ios://MiniShop/Features/Products/ProductsView.swift#ProductsView.body
    hash: 7a64a7d803afea6b7b33b92e965f69ab18a0ec34476e5c0d8d8b2584cb8e1cc4
  - sym: ios://MiniShop/Features/Products/ProductsView.swift#ProductsView.router
    hash: 137f5eb371d4d68983fd5b9b7dc70d78c07c32f8a2dd1dbad99f490707470b9c
  - sym: ios://MiniShop/Features/Products/ProductsView.swift#ProductsView.vm
    hash: 480e2a0906efcd34a35a3556e319ee7fbb6259054f86e123053300ba5455379e
  - sym: ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel.loadProducts
    hash: a071fb3b1d942a23576e555477e6265a5504dcdbf8b5bf792da7dabf7e56e086
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter.handle
    hash: 4b2d7773068d8cf126bef60046012ded7a2182494966a5907cd13d5ccede6be3
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter.match
    hash: 4277008b895b029f4caf0522de87de218a6dd86ddea121b01be670c4d227e484
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter.path
    hash: 8e630fea62710ade5354d04e1e353ff6e1c5b0ac38acbcbed1796eabc8660b98
  - sym: ios://MiniShop/Navigation/Route.swift#Destination.params
    hash: 2e469b4ecc4f45b1ff796f72e2fecd121208cc549ec25238f0092b7e5832e8ea
  - sym: ios://MiniShop/Navigation/Route.swift#Destination.route
    hash: 12d58fa4f87a306c398635b92e2d024d469918b3e33abd03bd572f833d9d2c82
source_commit: 95f7b7c
status: current
---
# 商品列表（products）

> 由 `kb compound --llm template` 根据 facts 与符号图确定性生成；使用 claude 模式可获得更完整的叙述。锚点见 frontmatter `sources`。

## 路由与深链

| 平台 | pattern | deeplink | 入口符号 |
|---|---|---|---|
| android | `products` | `minishop://products` | `android://app/src/main/java/com/minishop/ui/products/ProductsScreen.kt#ProductsScreen` |
| harmony | `products` | `minishop://products` | `harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsBuilder` |
| ios | `products` | `minishop://products` | `ios://MiniShop/Features/Products/ProductsView.swift#ProductsView` |

测试注入参数：`?token=<t>&cart=<sku,sku>`（见各端 deeplink 处理代码）。

## testID

| 平台 | tid | 位置 |
|---|---|---|
| android | `product_item_` | `android/app/src/main/java/com/minishop/ui/products/ProductsScreen.kt:20` |
| android | `product_list` | `android/app/src/main/java/com/minishop/ui/products/ProductsScreen.kt:18` |
| android | `tab_cart` | `android/app/src/main/java/com/minishop/ui/products/ProductsScreen.kt:17` |
| harmony | `product_item_` | `harmony/entry/src/main/ets/pages/ProductsPage.ets:26` |
| harmony | `product_list` | `harmony/entry/src/main/ets/pages/ProductsPage.ets:30` |
| harmony | `tab_cart` | `harmony/entry/src/main/ets/pages/ProductsPage.ets:20` |
| ios | `product_item_` | `ios/MiniShop/Features/Products/ProductsView.swift:9` |
| ios | `product_list` | `ios/MiniShop/Features/Products/ProductsView.swift:8` |
| ios | `tab_cart` | `ios/MiniShop/Features/Products/ProductsView.swift:14` |

## 接口

| 平台 | 方法 | 路径 | 调用符号 |
|---|---|---|---|
| android | GET | `/api/products` | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.listProducts` |
| android | GET | `/api/products/{id}` | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.getProduct` |
| harmony | GET | `/api/products` | `harmony://entry/src/main/ets/common/Api.ets#Api.fetchProducts` |
| ios | GET | `/api/products` | `ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel.loadProducts` |

## 关键常量

- `ProductsPage.products` = `[]`（harmony）
- `AppRouter.path` = `[]`（ios）
- `Destination.params` = `[:]`（ios）

## 相关代码

**android**

- `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiClient.service` — property `val service: ApiService`
- `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.getProduct` — function `@GET("/api/products/{id}") suspend fun getProduct(@Path("id") id: String): Product`
- `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.listProducts` — function `@GET("/api/products") suspend fun listProducts(): List<Product>`
- `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.items` — property `val items`
- `android://app/src/main/java/com/minishop/ui/products/ProductsScreen.kt#ProductsScreen` — composable `@Composable fun ProductsScreen(onOpen: (String) -> Unit, onCart: () -> Unit, vm: ProductsViewModel = viewModel())`
- `android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.loadProduct` — function `suspend fun loadProduct(id: String): Product`
- `android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.loadProducts` — function `suspend fun loadProducts()`
- `android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.products` — property `var products: List<Product>`

**harmony**

- `harmony://entry/src/main/ets/common/Api.ets#Api.fetchProducts` — method `static async fetchProducts(): Promise<Product[]>`
- `harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsBuilder` — function `@Builder export function ProductsBuilder()`
- `harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsPage.aboutToAppear` — method `aboutToAppear(): void`
- `harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsPage.build` — method `build()`
- `harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsPage.pathStack` — property `@Consume('pathStack') pathStack: NavPathStack`
- `harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsPage.products` — property `@State products: Product[]`

**ios**

- `ios://MiniShop/Features/Products/ProductsView.swift#ProductsView` — struct `struct ProductsView: View`
- `ios://MiniShop/Features/Products/ProductsView.swift#ProductsView.body` — property `var body: some View`
- `ios://MiniShop/Features/Products/ProductsView.swift#ProductsView.router` — property `@EnvironmentObject var router: AppRouter`
- `ios://MiniShop/Features/Products/ProductsView.swift#ProductsView.vm` — property `@StateObject private var vm`
- `ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel.loadProducts` — function `func loadProducts() async`
- `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.handle` — function `func handle(url: URL)`
- `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.match` — function `func match(host: String, segments: [String]) -> Destination?`
- `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.path` — property `@Published var path: [Destination]`
- `ios://MiniShop/Navigation/Route.swift#Destination.params` — property `var params: [String: String]`
- `ios://MiniShop/Navigation/Route.swift#Destination.route` — property `let route: Route`

## 相关页面

- [总览](../overview.md)
- [android routes facts](../../facts/android/routes.md)
- [harmony routes facts](../../facts/harmony/routes.md)
- [ios routes facts](../../facts/ios/routes.md)
