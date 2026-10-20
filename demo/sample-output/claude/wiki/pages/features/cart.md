---
id: features/cart
title: 购物车（cart）
kind: feature
platforms: [android, harmony, ios]
routes: [cart]
sources:
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiClient.service
    hash: 3fe962f0317cd2eb2057b5d5b2a5825fa045583e3425e998d41e5e76a56e1a05
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.addToCart
    hash: 04fc4a76c52c7def97e7e7e8c75b25f3609ef967500beb8ffe9b5b493a46ad02
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen
    hash: 298d51bd3abcc95697e472891f857dc8c47d1824e744b533c7f259aa56776ab1
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
  - sym: harmony://entry/src/main/ets/common/CartStore.ets#CartStore.total
    hash: c4d08fdf62cd8e2854236741b547c3d662d5d8239a2ce00fef56e4488dd51989
  - sym: harmony://entry/src/main/ets/pages/CartPage.ets#CartBuilder
    hash: 4329e34be7212fc1576c50d1d48e31a539790b92df2c88a26cfde1d32274d603
  - sym: harmony://entry/src/main/ets/pages/CartPage.ets#CartPage.build
    hash: 21d9a3829e98fea009f4723757981bcdb85ad8569734a2938ced0b316a126125
  - sym: harmony://entry/src/main/ets/pages/CartPage.ets#CartPage.pathStack
    hash: d348143e464db81a86e98f370526c7e901585a646f2c2da22b03cd196207ad88
  - sym: ios://MiniShop/Components/BackButton.swift#BackButton.body
    hash: a98e27bdf2b7598556a38db6c2a3124dfd935858218baa2ae19751dd87c4cb19
  - sym: ios://MiniShop/Components/BackButton.swift#BackButton.dismiss
    hash: d2952ecb413ac8da3f7adf0834b85bb8b8cd61e0c9a337992105bf4394da93c6
  - sym: ios://MiniShop/Features/Cart/CartView.swift#CartView
    hash: d47d57d059273a31af207e5d5bb372ec0c897bd5da8005b3f15971f95ef12cbf
  - sym: ios://MiniShop/Features/Cart/CartView.swift#CartView.body
    hash: 675fc35157f25a42b23fa2b4d7b40139077431c04f91673ae966060db549724c
  - sym: ios://MiniShop/Features/Cart/CartView.swift#CartView.router
    hash: 137f5eb371d4d68983fd5b9b7dc70d78c07c32f8a2dd1dbad99f490707470b9c
  - sym: ios://MiniShop/Features/Cart/CartView.swift#CartView.vm
    hash: 898bf98ad4b11c1170a73b9e84e8089933742e2f62b0307ce51ea24979b7103b
  - sym: ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.total
    hash: 1c98db8cfa12470f874e7bdbcd317f84b324ebe5ea705dcde9338448e816c1ca
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter.handle
    hash: 4b2d7773068d8cf126bef60046012ded7a2182494966a5907cd13d5ccede6be3
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter.match
    hash: 4277008b895b029f4caf0522de87de218a6dd86ddea121b01be670c4d227e484
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter.path
    hash: 8e630fea62710ade5354d04e1e353ff6e1c5b0ac38acbcbed1796eabc8660b98
source_commit: 71a86be
status: current
---
# 购物车（cart）

## 概述

购物车页展示当前商品数量（`Items: N`）和「Checkout」按钮；数量为 0 时按钮禁用。三端均通过 `cart` 路由 / `minishop://cart` 深链进入，点击 Checkout 跳转 `checkout`。

## 路由与深链

| 平台 | pattern | deeplink | 入口符号 |
|---|---|---|---|
| android | `cart` | `minishop://cart` | `android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen` |
| harmony | `cart` | `minishop://cart` | `harmony://entry/src/main/ets/pages/CartPage.ets#CartBuilder` |
| ios | `cart` | `minishop://cart` | `ios://MiniShop/Features/Cart/CartView.swift#CartView` |

iOS 深链由 `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.handle` 处理：仅接受 scheme 为 `minishop` 的 URL；query 中的 `token` 会保存到 `TokenStore`，`cart=<sku,sku>` 会按逗号拆分后交给 `CartViewModel` 的 `preload`；随后由 `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.match` 匹配 host + path 段与 `Route` 枚举，命中则追加到 `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.path`。

## 三端实现对照

| 项 | android | harmony | ios |
|---|---|---|---|
| 页面 | `android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen` | `harmony://entry/src/main/ets/pages/CartPage.ets#CartPage.build`（经 `harmony://entry/src/main/ets/pages/CartPage.ets#CartBuilder` 注册） | `ios://MiniShop/Features/Cart/CartView.swift#CartView.body` |
| 返回 | `android://app/src/main/java/com/minishop/ui/components/MiniShopTopBar.kt#MiniShopTopBar`（`onBack` 非空时显示 `nav_back`） | `BackButton()` | `ios://MiniShop/Components/BackButton.swift#BackButton.body`（`nav_back`，调用 `ios://MiniShop/Components/BackButton.swift#BackButton.dismiss`） |
| 数量 | `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.total` = `items.size` | `harmony://entry/src/main/ets/common/CartStore.ets#CartStore.total` = `CartStore.items.length` | `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.total` = `items.count` |
| 状态持有 | ViewModel（`viewModel()` 默认参数） | 静态 `CartStore` | `ios://MiniShop/Features/Cart/CartView.swift#CartView.vm`（`@StateObject`） |
| 去结算 | 回调 `onCheckout` | `harmony://entry/src/main/ets/pages/CartPage.ets#CartPage.pathStack` 的 `pushPathByName('checkout', null)` | `ios://MiniShop/Features/Cart/CartView.swift#CartView.router` 的 `path.append(Destination(route: .checkout))` |

## 加购规则与关键常量（android）

- `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.MAX_CART_ITEMS` = `50`（旧文档/旧页面中的 `99` 已过时）。
- `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.addItem`：当 `items.size >= MAX_CART_ITEMS` 时直接返回 `false`，不加入也不请求接口；否则写入 `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.items`，在 `viewModelScope` 中异步调用 `ApiClient.service.addToCart(CartRequest(sku, 1))`，返回 `true`。
- 接口调用不影响本地列表：本地先加入，请求在协程中发出（代码中未见失败回滚）。
- `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.preload` 把 sku 追加到私有的 `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.pending`；该列表在已给出的源码中未被 `items` 消费。
- harmony / ios 的数量上限：本页所依据的符号中未体现，不作断言。

## 接口与数据流

| 平台 | 方法 | 路径 | 调用符号 |
|---|---|---|---|
| android | POST | `/api/cart` | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.addToCart` |

流程：`addItem(sku)` → 上限检查 → 本地 `items.add` → `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiClient.service` 发起 `POST /api/cart`（body 为 `CartRequest`）。harmony / ios 的 `total` 仅读取本地列表，facts 中未记录它们的购物车接口。

## testID 与测试要点

| 平台 | tid | 位置 |
|---|---|---|
| android | `cart_checkout` | `android/app/src/main/java/com/minishop/ui/cart/CartScreen.kt:17` |
| harmony | `cart_checkout` | `harmony/entry/src/main/ets/pages/CartPage.ets:18` |
| ios | `cart_checkout` | `ios/MiniShop/Features/Cart/CartView.swift:11` |

- 返回按钮 testID 均为 `nav_back`。
- 空购物车时 `cart_checkout` 应为禁用状态；有商品后可点击。
- android 加购上限测试应以 `50` 为边界（第 51 次 `addItem` 返回 `false`）。
- 测试注入：`minishop://cart?token=<t>&cart=<sku,sku>`（iOS 处理逻辑见上）。

## 相关页面

- [总览](../overview.md)
- [android routes facts](../../facts/android/routes.md)
- [harmony routes facts](../../facts/harmony/routes.md)
- [ios routes facts](../../facts/ios/routes.md)
