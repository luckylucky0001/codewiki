---
id: features/product_detail
title: 商品详情（product_detail）
kind: feature
platforms: [android, harmony, ios]
routes: [product_detail]
sources:
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.addToCart
    hash: 04fc4a76c52c7def97e7e7e8c75b25f3609ef967500beb8ffe9b5b493a46ad02
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.getProduct
    hash: aec1ad5dda84abee9cd40ac64626e5c14c13d9d6063352d0d6a1b1e1a0b04cbd
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.MAX_CART_ITEMS
    hash: c874d1a813b4bf8aa6817442999368d7da32979bf689f785a5cea94c2ca423bb
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.addItem
    hash: 31497a415b9556bb374e5e6171fae5b2b1eb67ea5b9b009000bd7d2d63366b79
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.items
    hash: 6933c36bf1380135f949cc722b04f5f4ca17951c7af709a0d83f4a7bc818c3c7
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.pending
    hash: cdb3e2698d888b400e74a4bbc9d61a3211ed7109a074fa4b698ed66de0209bd7
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.preload
    hash: f8040fd13f4e75ef09e0cdfe990ad5c1a2d945824d784dc3d9fbc3b9e8854a8f
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.total
    hash: 83e05d402203fec9ac172c0203a32fc1bcccf25f2f905b17212c5d2bd4742856
  - sym: android://app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt#ProductDetailScreen
    hash: c2ac000c4398a6bf1761eb93ef5fd5c40f47d53e0fa5cd16b9a8c18a2242f261
  - sym: android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.loadProduct
    hash: 73af4e1e5e372cc5a7e7ecba9d9755f45df8f2f6b72238ee5085844ec92df395
  - sym: android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.loadProducts
    hash: fd051751ef9db53c9d32922b0156bb4ef0f3807b2b1498dd120f4b816d304a39
  - sym: android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.products
    hash: c89add9e72a3fb1e5a2c7b8b7ab2eacae4462d0a6134cd3f6d89eadb2c53ba79
  - sym: harmony://entry/src/main/ets/common/Api.ets#Api.loadProduct
    hash: f4de4914781b649378fafa141d22475f8206203a2886b6e36659e5dcb7d10e90
  - sym: harmony://entry/src/main/ets/common/CartStore.ets#CartStore.addItem
    hash: a546bf482a21a741552e2127f0855a2dca37338acf0fa017e1cd60ca2af44b23
  - sym: harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailBuilder
    hash: f8f5d1f86bb29c7c206c6784f9354b5ef77d9f02bec3f6b98a27c7b8287774d3
  - sym: harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailPage.aboutToAppear
    hash: 1f7260fcdb193f8d7df0b130d9f3e6413a6d33bdaac408f8890f3808498df74e
  - sym: harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailPage.build
    hash: 1ec93dcba753b8190d3523ade8c3569d465d82d692525263c07f80720a890238
  - sym: harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailPage.product
    hash: da8058331209e160abcff98266201c0852134694b97528c0b9a4b8f22ddb4e77
  - sym: ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.addItem
    hash: 88c93466d1e406c1684b1237c4f216e37932aa5f2b8974f54189fa78f10a2d09
  - sym: ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView
    hash: bc8dc6ae3622ce49c146a20c67fea930d9ab5aaba831227605f700a688f17ac3
  - sym: ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView.body
    hash: ea5d7d83367493045662e455e7b8e90be4237f86ab9d45548b4e04b31f9d8cb6
  - sym: ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView.cart
    hash: 8d86beac612dc9a8a5f2d4564db53932d2a09cf07e132e7f50dcad3d2e77fdd6
  - sym: ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView.id
    hash: 22a33fb48918bb7a97d40a7a2512460d93468171f49d23bf8ab8e6fce77fd574
  - sym: ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView.product
    hash: 98668f26ea111d7c62f467f7f37dfa0250fb16c8ba90fad7b71dfa1fea131995
  - sym: ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView.vm
    hash: 480e2a0906efcd34a35a3556e319ee7fbb6259054f86e123053300ba5455379e
  - sym: ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel.loadProduct
    hash: 745aa82c439b155cd921a3ff09c785faed15a4b24560c9f29a8953cf85972c04
  - sym: ios://MiniShop/Networking/APIClient.swift#CartRequest.sku
    hash: 10ec028d43c7dd167b9a8947e75e6cc9b4156869852986128bb1a7e723ea14e4
  - sym: ios://MiniShop/Networking/APIClient.swift#Product.id
    hash: 22a33fb48918bb7a97d40a7a2512460d93468171f49d23bf8ab8e6fce77fd574
  - sym: ios://MiniShop/Networking/APIClient.swift#Product.price
    hash: 3ee801bf69a8b65767a6aac58bb85ae9f15efd745d969198ab4a71956e822945
  - sym: ios://MiniShop/Networking/APIClient.swift#Product.title
    hash: be0eb9a3cabfe19db23b6287518ceb5b1fd2513d7ed2f9e89878c29f277bfcc5
source_commit: 08d60b5
status: current
---
# 商品详情（product_detail）

> 由 `kb compound --llm template` 根据 facts 与符号图确定性生成；使用 claude 模式可获得更完整的叙述。锚点见 frontmatter `sources`。

## 路由与深链

| 平台 | pattern | deeplink | 入口符号 |
|---|---|---|---|
| android | `product/{id}` | `minishop://product/{id}` | `android://app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt#ProductDetailScreen` |
| harmony | `product/{id}` | `minishop://product/{id}` | `harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailBuilder` |
| ios | `product/{id}` | `minishop://product/{id}` | `ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView` |

测试注入参数：`?token=<t>&cart=<sku,sku>`（见各端 deeplink 处理代码）。

## testID

| 平台 | tid | 位置 |
|---|---|---|
| android | `add_to_cart` | `android/app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt:21` |
| harmony | `add_to_cart` | `harmony/entry/src/main/ets/pages/ProductDetailPage.ets:25` |
| ios | `add_to_cart` | `ios/MiniShop/Features/Products/ProductDetailView.swift:13` |

## 接口

| 平台 | 方法 | 路径 | 调用符号 |
|---|---|---|---|
| android | POST | `/api/cart` | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.addToCart` |
| android | GET | `/api/products/{id}` | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.getProduct` |
| harmony | GET | `/api/products/{id}` | `harmony://entry/src/main/ets/common/Api.ets#Api.loadProduct` |
| ios | POST | `/api/cart` | `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.addItem` |
| ios | GET | `/api/products/{id}` | `ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel.loadProduct` |

## 关键常量

- `CartViewModel.MAX_CART_ITEMS` = `50`（android）

## 相关代码

**android**

- `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.addToCart` — function `@POST("/api/cart") suspend fun addToCart(@Body body: CartRequest): CartResponse`
- `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.getProduct` — function `@GET("/api/products/{id}") suspend fun getProduct(@Path("id") id: String): Product`
- `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.MAX_CART_ITEMS` — property `const val MAX_CART_ITEMS`
- `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.addItem` — function `fun addItem(sku: String): Boolean`
- `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.items` — property `val items`
- `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.pending` — property `private val pending`
- `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.preload` — function `fun preload(sku: String)`
- `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.total` — function `fun total(): Int`
- `android://app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt#ProductDetailScreen` — composable `@Composable fun ProductDetailScreen(id: String, onBack: () -> Unit, vm: ProductsViewModel = viewModel(), cart: CartViewModel = viewModel())`
- `android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.loadProduct` — function `suspend fun loadProduct(id: String): Product`
- `android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.loadProducts` — function `suspend fun loadProducts()`
- `android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.products` — property `var products: List<Product>`

**harmony**

- `harmony://entry/src/main/ets/common/Api.ets#Api.loadProduct` — method `static async loadProduct(id: string): Promise<Product>`
- `harmony://entry/src/main/ets/common/CartStore.ets#CartStore.addItem` — method `static addItem(sku: string, quantity: number): boolean`
- `harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailBuilder` — function `@Builder export function ProductDetailBuilder()`
- `harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailPage.aboutToAppear` — method `aboutToAppear(): void`
- `harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailPage.build` — method `build()`
- `harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailPage.product` — property `@State product: Product | undefined`

**ios**

- `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.addItem` — function `func addItem(sku: String) -> Bool`
- `ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView` — struct `struct ProductDetailView: View`
- `ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView.body` — property `var body: some View`
- `ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView.cart` — property `@StateObject private var cart`
- `ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView.id` — property `let id: String`
- `ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView.product` — property `@State private var product: Product?`
- `ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView.vm` — property `@StateObject private var vm`
- `ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel.loadProduct` — function `func loadProduct(id: String) async -> Product?`
- `ios://MiniShop/Networking/APIClient.swift#CartRequest.sku` — property `let sku: String`
- `ios://MiniShop/Networking/APIClient.swift#Product.id` — property `let id: String`
- `ios://MiniShop/Networking/APIClient.swift#Product.price` — property `let price: Int`
- `ios://MiniShop/Networking/APIClient.swift#Product.title` — property `let title: String`

## 相关页面

- [总览](../overview.md)
- [导航与深链](../concepts/navigation.md) · [共享组件](../concepts/shared-components.md)
- [android routes facts](../../facts/android/routes.md)
- [harmony routes facts](../../facts/harmony/routes.md)
- [ios routes facts](../../facts/ios/routes.md)
