---
id: features/product_detail
title: 商品详情（product_detail）
kind: feature
platforms: [android, harmony, ios]
routes: [product_detail]
sources:
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
  - sym: android://app/src/main/java/com/minishop/ui/components/MiniShopTopBar.kt#MiniShopTopBar
    hash: a950939b071b355f1752ab5ba76842b203ccc17a22905e00e98b7cce1f172af5
  - sym: android://app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt#ProductDetailScreen
    hash: c2ac000c4398a6bf1761eb93ef5fd5c40f47d53e0fa5cd16b9a8c18a2242f261
  - sym: android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.loadProduct
    hash: 73af4e1e5e372cc5a7e7ecba9d9755f45df8f2f6b72238ee5085844ec92df395
  - sym: android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.loadProducts
    hash: fd051751ef9db53c9d32922b0156bb4ef0f3807b2b1498dd120f4b816d304a39
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
  - sym: harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailPage.pathStack
    hash: d348143e464db81a86e98f370526c7e901585a646f2c2da22b03cd196207ad88
  - sym: harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailPage.product
    hash: da8058331209e160abcff98266201c0852134694b97528c0b9a4b8f22ddb4e77
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
  - sym: ios://MiniShop/Navigation/Route.swift#Route.cart
    hash: 960d1701af3bdabe477341b6bd83bf009df3a0d47e3c1563f0f0321610b1b677
  - sym: ios://MiniShop/Networking/APIClient.swift#Product.id
    hash: 22a33fb48918bb7a97d40a7a2512460d93468171f49d23bf8ab8e6fce77fd574
  - sym: ios://MiniShop/Networking/APIClient.swift#Product.price
    hash: 3ee801bf69a8b65767a6aac58bb85ae9f15efd745d969198ab4a71956e822945
  - sym: ios://MiniShop/Networking/APIClient.swift#Product.title
    hash: be0eb9a3cabfe19db23b6287518ceb5b1fd2513d7ed2f9e89878c29f277bfcc5
source_commit: 95f7b7c
status: current
---
# 商品详情（product_detail）

## 概述

商品详情页按商品 `id` 加载单个商品，展示标题（Android 另显示价格），并提供「Add to cart」按钮（testID `add_to_cart`）把商品加入购物车。三端均有实现。

## 路由与深链

| 平台 | pattern | deeplink | 入口符号 |
|---|---|---|---|
| android | `product/{id}` | `minishop://product/{id}` | `android://app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt#ProductDetailScreen` |
| harmony | `product/{id}` | `minishop://product/{id}` | `harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailBuilder` |
| ios | `product/{id}` | `minishop://product/{id}` | `ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView` |

测试注入参数：`?token=<t>&cart=<sku,sku>`（见各端 deeplink 处理代码）。

## 三端实现对照

| 项 | Android | Harmony | iOS |
|---|---|---|---|
| 页面 | `ProductDetailScreen`（Composable） | `ProductDetailPage.build` 经 `ProductDetailBuilder` 挂载 | `ProductDetailView.body` |
| 取参 | 参数 `id` | `ProductDetailPage.aboutToAppear` 从 `ProductDetailPage.pathStack` 的 `product_detail` 参数读取 `id` | 属性 `ProductDetailView.id` |
| 加载 | `LaunchedEffect(id)` 调 `ProductsViewModel.loadProduct` | `Api.loadProduct` 后写入 `ProductDetailPage.product` | `.task` 中调 `vm.loadProduct(id:)` |
| 展示 | 顶栏 `MiniShopTopBar`（标题 + 返回）、价格文本 | `BackButton` + 标题 | `BackButton` + 标题 |
| 加购 | `cart.addItem(it.id)` | `CartStore.addItem(this.product.id, 1)` | `cart.addItem(sku: id)` |

### 加购行为差异

- **Android**：`android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.addItem` 在 `items.size >= MAX_CART_ITEMS`（`android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.MAX_CART_ITEMS` = `50`）时返回 `false`；否则写入本地 `items` 并异步调用 `addToCart(CartRequest(sku, 1))`。详情页忽略返回值。`CartViewModel.total` 返回 `items.size`。
- **Harmony**：`CartStore.addItem(sku, quantity)` 现带 `quantity` 参数（签名已变更），判断条件为 `CartStore.items.length + quantity > MAX_CART_ITEMS` 时返回 `false`；否则 `items.push(sku)` 并调用 `Api.addToCart(sku, quantity)`。详情页以数量 `1` 调用，且仅在 `product` 已加载时触发，不处理返回值。
- **iOS**：`cart.addItem(sku: id)` 使用路由参数 `id` 作为 sku（而非已加载的 `product.id`），返回值以 `_ =` 丢弃；因此商品未加载完成时也可点击加购。Android/Harmony 则要求 `product` 非空。
- Android 的 `CartViewModel.preload` / `CartViewModel.pending` 仅把 sku 追加到私有列表 `pending`，详情页未使用。

> 注：`MAX_CART_ITEMS` 的 Harmony 常量值在本任务提供的事实中未出现，此处不给出具体数值。

## 接口与数据流

| 平台 | 方法 | 路径 | 调用符号 |
|---|---|---|---|
| harmony | GET | `/api/products/{id}` | `harmony://entry/src/main/ets/common/Api.ets#Api.loadProduct` |

- Android：`ProductsViewModel.loadProduct` 经 `ApiClient.service.getProduct(id)` 返回 `Product`；同文件 `ProductsViewModel.loadProducts` 用于列表（非详情）。
- Harmony：`Api.loadProduct` 发 GET 并 `JSON.parse` 为 `Product`。
- iOS：`Product` 含 `id`、`title`、`price`（`Int`）三字段，详情页仅展示 `title`。
- 数据流：路由参数 `id` → 加载 `Product` → 状态变量（Android `product` / Harmony `ProductDetailPage.product` / iOS `ProductDetailView.product`）→ 点击加购 → 本地购物车 + 后端 `addToCart`。

## testID 与测试要点

| 平台 | tid | 位置 |
|---|---|---|
| android | `add_to_cart` | `android/app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt:21` |
| harmony | `add_to_cart` | `harmony/entry/src/main/ets/pages/ProductDetailPage.ets:25` |
| ios | `add_to_cart` | `ios/MiniShop/Features/Products/ProductDetailView.swift:13` |

- Android 返回按钮 testTag 为 `nav_back`（`MiniShopTopBar`，仅当传入 `onBack`）。
- 测试加购上限时，需注意 Harmony 以 `items.length + quantity` 判断，Android 以 `items.size` 判断。
- iOS 的 `Route.cart` 为 `cart` 路由 case，可用于加购后的跳转验证。

## 相关页面

- [总览](../overview.md)
- [android routes facts](../../facts/android/routes.md)
- [harmony routes facts](../../facts/harmony/routes.md)
- [ios routes facts](../../facts/ios/routes.md)
