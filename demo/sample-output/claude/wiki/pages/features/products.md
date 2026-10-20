---
id: features/products
title: 商品列表（products）
kind: feature
platforms: [android, harmony, ios]
routes: [products]
sources:
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.getProduct
    hash: aec1ad5dda84abee9cd40ac64626e5c14c13d9d6063352d0d6a1b1e1a0b04cbd
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.listProducts
    hash: 811ab70ffe53f90e955509d706154fc4ac2a5a73f93d1085bec1db580e8dfe1c
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
  - sym: ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel.loadProduct
    hash: 745aa82c439b155cd921a3ff09c785faed15a4b24560c9f29a8953cf85972c04
  - sym: ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel.loadProducts
    hash: a071fb3b1d942a23576e555477e6265a5504dcdbf8b5bf792da7dabf7e56e086
  - sym: ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel.products
    hash: ae7da7c31b0c36a2bb389749882a3d04b933c0c50eda600926330a754e34bd62
  - sym: ios://MiniShop/Networking/APIClient.swift#HTTPMethod.get
    hash: 4c5fe12137a2b1148dece7a476f7730010f4347802931ef0fc8eafdd3f0cf572
  - sym: ios://MiniShop/Networking/APIClient.swift#Product.id
    hash: 22a33fb48918bb7a97d40a7a2512460d93468171f49d23bf8ab8e6fce77fd574
  - sym: ios://MiniShop/Networking/APIClient.swift#Product.title
    hash: be0eb9a3cabfe19db23b6287518ceb5b1fd2513d7ed2f9e89878c29f277bfcc5
source_commit: bb5e145
status: current
---
# 商品列表（products）

## 概述

商品列表是 MiniShop 的商品入口页：进入页面时拉取 `GET /api/products`，以列表展示每个商品的 `title`，点击条目进入商品详情（传 `id`），点击 Cart 按钮进入购物车。三端行为一致，仅加载触发方式与网络封装不同。

## 路由与深链

| 平台 | pattern | deeplink | 入口符号 |
|---|---|---|---|
| android | `products` | `minishop://products` | `android://app/src/main/java/com/minishop/ui/products/ProductsScreen.kt#ProductsScreen` |
| harmony | `products` | `minishop://products` | `harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsBuilder` |
| ios | `products` | `minishop://products` | `ios://MiniShop/Features/Products/ProductsView.swift#ProductsView` |

各端路由详情见 [android](../../facts/android/routes.md)、[harmony](../../facts/harmony/routes.md)、[ios](../../facts/ios/routes.md)。

## 三端实现对照

| 项 | android | harmony | ios |
|---|---|---|---|
| 页面 | `ProductsScreen` | `ProductsBuilder` → `ProductsPage.build` | `ProductsView.body` |
| 加载触发 | `LaunchedEffect(Unit)` 调 `vm.loadProducts()` | `ProductsPage.aboutToAppear` 调 `Api.fetchProducts()` | `.task { await vm.loadProducts() }` |
| 状态 | `ProductsViewModel.products`（`private set`） | `@State` `ProductsPage.products` | `@Published` `ProductsViewModel.products` |
| 点击条目 | 回调 `onOpen(p.id)` | `pathStack.pushPathByName('product_detail', { id: p.id })` | `router.path.append(Destination(route: .productDetail, params: ["id": p.id]))` |
| 进入购物车 | 回调 `onCart` | `pathStack.pushPathByName('cart', null)` | `router.path.append(Destination(route: .cart))` |
| 失败处理 | 未捕获，异常向上抛 | 未捕获 | `try?` 失败时列表置为 `[]` |

要点：

- android：`android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.loadProducts` 直接把 `listProducts()` 结果赋给 `products`；`android://app/src/main/java/com/minishop/ui/products/ProductsViewModel.kt#ProductsViewModel.loadProduct` 按 id 取单个商品。
- harmony：网络请求封装在 `harmony://entry/src/main/ets/common/Api.ets#Api.fetchProducts`（原名 `Api.loadProducts`，仅重命名，已同步）。`harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsPage.aboutToAppear` 现调用 `Api.fetchProducts().then(...)` 并把结果写入 `products`。
- ios：`ios://MiniShop/Features/Products/ProductsView.swift#ProductsView.vm` 持有 view model，`ios://MiniShop/Features/Products/ProductsView.swift#ProductsView.router` 负责跳转；`loadProduct(id:)` 失败返回 `nil`。模型 `Product` 含 `id`、`title`、`price`（见 `ios://MiniShop/Networking/APIClient.swift#Product.id`、`ios://MiniShop/Networking/APIClient.swift#Product.title`），请求方法使用 `ios://MiniShop/Networking/APIClient.swift#HTTPMethod.get`。

## 接口与数据流

| 平台 | 方法 | 路径 | 调用符号 |
|---|---|---|---|
| android | GET | `/api/products` | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.listProducts` |
| android | GET | `/api/products/{id}` | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.getProduct` |
| harmony | GET | `/api/products` | `harmony://entry/src/main/ets/common/Api.ets#Api.fetchProducts` |
| ios | GET | `/api/products` | `ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel.loadProducts` |
| ios | GET | `/api/products/{id}` | `ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel.loadProduct` |

数据流：页面出现 → 请求 `/api/products` → 更新 `products` 状态 → 列表重绘。harmony 端当前没有 `/api/products/{id}` 的列表页调用。

## testID 与测试要点

| tid | android | harmony | ios |
|---|---|---|---|
| `product_list` | `ProductsScreen.kt:18` | `ProductsPage.ets:30` | `ProductsView.swift:8` |
| `product_item_` + id | `ProductsScreen.kt:20` | `ProductsPage.ets:26` | `ProductsView.swift:9` |
| `tab_cart` | `ProductsScreen.kt:17` | `ProductsPage.ets:20` | `ProductsView.swift:14` |

- 条目 testID 形如 `product_item_<id>`，点击后进入商品详情。
- 三端 `tab_cart` 均跳转购物车。
- 测试注入参数：`?token=<t>&cart=<sku,sku>`（见各端 deeplink 处理代码）。

## 相关页面

- [总览](../overview.md)
- [导航与深链](../concepts/navigation.md) · [共享组件](../concepts/shared-components.md)
