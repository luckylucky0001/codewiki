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
source_commit: bb5e145
status: current
---
# 商品详情（product_detail）

## 概述

商品详情页按路由 `product/{id}` 展示单个商品：进入页面时按 `id` 请求 `GET /api/products/{id}`，显示商品标题（Android 另显示价格），并提供「Add to cart」按钮（testID `add_to_cart`），点击后把商品加入购物车并调用 `POST /api/cart`。

## 路由与深链

| 平台 | pattern | deeplink | 入口符号 |
|---|---|---|---|
| android | `product/{id}` | `minishop://product/{id}` | `android://app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt#ProductDetailScreen` |
| harmony | `product/{id}` | `minishop://product/{id}` | `harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailBuilder` |
| ios | `product/{id}` | `minishop://product/{id}` | `ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView` |

测试注入参数：`?token=<t>&cart=<sku,sku>`（见各端 deeplink 处理代码）。

## 三端实现对照

| 项 | android | harmony | ios |
|---|---|---|---|
| 加载时机 | `LaunchedEffect(id)` 调用 `android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.loadProduct` | `harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailPage.aboutToAppear` 读取导航参数后调用 `harmony://entry/src/main/ets/common/Api.ets#Api.loadProduct` | `.task` 调用 `ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel.loadProduct`（失败返回 `nil`） |
| 商品状态 | `remember` 的 `product` | `harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailPage.product`（`@State`） | `ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView.product`（`@State`） |
| 加购调用 | `cart.addItem(it.id)`，使用已加载商品的 `id` | `harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailPage.build` 中 `CartStore.addItem(this.product.id, 1)`，仅在商品已加载时触发，数量显式传 1 | `cart.addItem(sku: id)`，使用路由参数 `id`，不依赖商品是否加载完成 |
| 购物车实现 | `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.addItem` | `harmony://entry/src/main/ets/common/CartStore.ets#CartStore.addItem`（签名 `(sku, quantity)`） | `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.addItem` |
| 页面展示 | 顶栏标题 + 价格文本 | `BackButton` + 标题 | `BackButton` + 标题 |

`addItem` 的共同逻辑：超过购物车上限时返回 `false` 且不发请求；否则本地追加 SKU、异步发起 `POST /api/cart`，返回 `true`。页面侧均忽略返回值，不向用户提示上限。

三端差异：

- Android / iOS：`addItem` 只接收 `sku`，请求数量固定为 1；判断条件为「当前条目数已达上限」（Android `items.size >= MAX_CART_ITEMS`）。
- Harmony：`CartStore.addItem` 新增 `quantity` 参数，判断条件为 `CartStore.items.length + quantity > MAX_CART_ITEMS`，通过后向 `items` 追加一次 SKU，并把 `quantity` 传给 `Api.addToCart`。详情页传入 `1`，因此与另两端行为一致；但若其他调用方传入大于 1 的数量，本地条目只增加 1 条而上限检查按 `quantity` 计算。

## 接口与数据流

| 平台 | 方法 | 路径 | 调用符号 |
|---|---|---|---|
| android | POST | `/api/cart` | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.addToCart` |
| android | GET | `/api/products/{id}` | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.getProduct` |
| harmony | GET | `/api/products/{id}` | `harmony://entry/src/main/ets/common/Api.ets#Api.loadProduct` |
| ios | POST | `/api/cart` | `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.addItem` |
| ios | GET | `/api/products/{id}` | `ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel.loadProduct` |

数据流：路由参数 `id` → 加载商品（`Product` 含 `id`、`title`、`price`：`ios://MiniShop/Networking/APIClient.swift#Product.id`、`ios://MiniShop/Networking/APIClient.swift#Product.title`、`ios://MiniShop/Networking/APIClient.swift#Product.price`）→ 点击按钮 → 购物车 `addItem` → `POST /api/cart`（iOS 请求体 `CartRequest`，字段 `sku`：`ios://MiniShop/Networking/APIClient.swift#CartRequest.sku`，`quantity` 为 1）。

## 购物车上限

- Android：`android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.MAX_CART_ITEMS` = `50`（旧版本页面曾记为 99，已过时）。
- Harmony 在 `CartStore.addItem` 中与 `MAX_CART_ITEMS` 比较，iOS 在 `CartViewModel.addItem` 中与 `CartViewModel.maxCartItems` 比较；这两端的具体数值未在本页所依据的符号中给出，跨端对齐请另行核对。
- 相关 Android 成员：`android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.items`（SKU 列表）、`android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.total`（返回 `items.size`）、`android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.preload` 与 `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.pending`（`preload` 仅向私有 `pending` 追加 SKU）。

## testID 与测试要点

| 平台 | tid | 位置 |
|---|---|---|
| android | `add_to_cart` | `android/app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt:21` |
| harmony | `add_to_cart` | `harmony/entry/src/main/ets/pages/ProductDetailPage.ets:25` |
| ios | `add_to_cart` | `ios/MiniShop/Features/Products/ProductDetailView.swift:13` |

测试要点：

- 三端使用同一 testID `add_to_cart`。
- Android/Harmony 在商品未加载完成时点击无效果；iOS 直接用路由 `id` 加购，行为不同。
- 购物车已满时点击按钮不会新增条目，也不会发出 `POST /api/cart`；Android 的上限为 50（需先通过 `cart` 注入参数填满）。

## 相关页面

- [总览](../overview.md)
- [导航与深链](../concepts/navigation.md) · [共享组件](../concepts/shared-components.md)
- [android routes facts](../../facts/android/routes.md)
- [harmony routes facts](../../facts/harmony/routes.md)
- [ios routes facts](../../facts/ios/routes.md)
