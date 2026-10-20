---
id: features/cart
title: 购物车（cart）
kind: feature
platforms: [android, harmony, ios]
routes: [cart]
sources:
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
  - sym: harmony://entry/src/main/ets/common/CartStore.ets#CartStore.total
    hash: c4d08fdf62cd8e2854236741b547c3d662d5d8239a2ce00fef56e4488dd51989
  - sym: harmony://entry/src/main/ets/pages/CartPage.ets#CartBuilder
    hash: 4329e34be7212fc1576c50d1d48e31a539790b92df2c88a26cfde1d32274d603
  - sym: harmony://entry/src/main/ets/pages/CartPage.ets#CartPage.build
    hash: 21d9a3829e98fea009f4723757981bcdb85ad8569734a2938ced0b316a126125
  - sym: ios://MiniShop/Features/Cart/CartView.swift#CartView
    hash: d47d57d059273a31af207e5d5bb372ec0c897bd5da8005b3f15971f95ef12cbf
  - sym: ios://MiniShop/Features/Cart/CartView.swift#CartView.body
    hash: 675fc35157f25a42b23fa2b4d7b40139077431c04f91673ae966060db549724c
  - sym: ios://MiniShop/Features/Cart/CartView.swift#CartView.router
    hash: 137f5eb371d4d68983fd5b9b7dc70d78c07c32f8a2dd1dbad99f490707470b9c
  - sym: ios://MiniShop/Features/Cart/CartView.swift#CartView.vm
    hash: 898bf98ad4b11c1170a73b9e84e8089933742e2f62b0307ce51ea24979b7103b
  - sym: ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.addItem
    hash: 88c93466d1e406c1684b1237c4f216e37932aa5f2b8974f54189fa78f10a2d09
  - sym: ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.items
    hash: 2c78b259eb4b8d14b2a0dfb56a13683c7420c13bf029661633a58c787443b73c
  - sym: ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.maxCartItems
    hash: ffaf69f8eb9681951eecc75a6643019d4a9398418f99a0ff562c39656344542e
  - sym: ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.pending
    hash: 2e4565671b7c32e8de7b839069fa0b32a59365cc69619630b4fdbdfe13fce0b3
  - sym: ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.total
    hash: 1c98db8cfa12470f874e7bdbcd317f84b324ebe5ea705dcde9338448e816c1ca
  - sym: ios://MiniShop/Networking/APIClient.swift#CartRequest.quantity
    hash: 525f20e30a2e21fe83e0ef115cbd52f06ac4fc2b4e63cd75cf2c58631d2f668b
  - sym: ios://MiniShop/Networking/APIClient.swift#CartRequest.sku
    hash: 10ec028d43c7dd167b9a8947e75e6cc9b4156869852986128bb1a7e723ea14e4
  - sym: ios://MiniShop/Networking/APIClient.swift#CartResponse.count
    hash: 7ccd9948ba99f0e16f94e88d2a0b4cd26c8a16dcf86de7f21b9f6d77eb857118
source_commit: 27c7b72
status: current
---
# 购物车（cart）

## 概述

购物车页展示商品数量（`Items: N`）和「Checkout」按钮；数量为 0 时按钮禁用，点击后进入 `checkout` 路由。Android 与 iOS 的 ViewModel 提供 `addItem`：先检查容量上限，再本地加入，并异步 POST `/api/cart`。Harmony 端目前只有读取数量的 `CartStore.total`。

> **平台差异（重要）**：购物车容量上限 Android 为 **50**，iOS 为 **99**，两端不一致。Harmony 在已给出的符号中没有对应上限逻辑。

## 路由与深链

| 平台 | pattern | deeplink | 入口符号 |
|---|---|---|---|
| android | `cart` | `minishop://cart` | `android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen` |
| harmony | `cart` | `minishop://cart` | `harmony://entry/src/main/ets/pages/CartPage.ets#CartBuilder` |
| ios | `cart` | `minishop://cart` | `ios://MiniShop/Features/Cart/CartView.swift#CartView` |

测试注入参数：`?token=<t>&cart=<sku,sku>`（见各端 deeplink 处理代码）。

## 三端实现对照

| 项 | android | harmony | ios |
|---|---|---|---|
| 页面 | `android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen` | `harmony://entry/src/main/ets/pages/CartPage.ets#CartPage.build`（经 `harmony://entry/src/main/ets/pages/CartPage.ets#CartBuilder`） | `ios://MiniShop/Features/Cart/CartView.swift#CartView.body` |
| 数量来源 | `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.total` = `items.size` | `harmony://entry/src/main/ets/common/CartStore.ets#CartStore.total` = `CartStore.items.length` | `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.total` = `items.count` |
| 商品列表 | `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.items`（`mutableListOf<String>()`） | `CartStore.items`（静态存储） | `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.items`（`@Published`） |
| 容量上限 | `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.MAX_CART_ITEMS` = **50** | — | `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.maxCartItems` = **99** |
| 结算跳转 | `onCheckout` 回调 | `pathStack.pushPathByName('checkout', null)` | `router.path.append(Destination(route: .checkout))`（`ios://MiniShop/Features/Cart/CartView.swift#CartView.router`） |
| 按钮禁用条件 | `vm.total() > 0` 才可用 | `CartStore.total() > 0` 才可用 | `vm.total() == 0` 时禁用 |

`ios://MiniShop/Features/Cart/CartView.swift#CartView.vm` 为 `@StateObject` 持有的 `CartViewModel`。

## 接口与数据流

`addItem(sku)` 流程（android / ios 一致，仅上限不同）：

1. 当前条目数 ≥ 上限 → 返回 `false`，不加入也不请求。
   - android：`items.size >= MAX_CART_ITEMS`（50）
   - ios：`items.count < maxCartItems`（99）才继续
2. 本地 `items` 追加 `sku`。
3. 异步 POST `/api/cart`，body 为 `CartRequest(sku, quantity = 1)`，忽略返回结果（fire-and-forget）。
4. 返回 `true`。

| 平台 | 方法 | 路径 | 调用符号 |
|---|---|---|---|
| android | POST | `/api/cart` | `android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.addToCart` |
| ios | POST | `/api/cart` | `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.addItem` |

数据模型（iOS）：`ios://MiniShop/Networking/APIClient.swift#CartRequest.sku`（`String`）、`ios://MiniShop/Networking/APIClient.swift#CartRequest.quantity`（`Int`）；响应 `ios://MiniShop/Networking/APIClient.swift#CartResponse.count`（`Int`）。

注意：请求是异步且不处理失败，本地列表与服务端可能不一致；服务端是否另有上限本页无法确认。

## 预加载（pending）

- android：`android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.preload` 把 sku 加入私有 `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.pending`。
- ios：`ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.pending` 为私有静态数组，初始为空。

两者均不计入 `total()`，也不受容量上限检查。

## testID 与测试要点

| 平台 | tid | 位置 |
|---|---|---|
| android | `cart_checkout` | `android/app/src/main/java/com/minishop/ui/cart/CartScreen.kt:17` |
| harmony | `cart_checkout` | `harmony/entry/src/main/ets/pages/CartPage.ets:18` |
| ios | `cart_checkout` | `ios/MiniShop/Features/Cart/CartView.swift:11` |

- 空购物车时 `cart_checkout` 应为禁用状态；至少一件商品时可点击并进入 `checkout`。
- 容量边界测试需分平台：android 第 51 件、ios 第 100 件 `addItem` 应返回 `false`。
- 跨平台一致性用例不要假设上限相同。

## 相关页面

- [总览](../overview.md)
- [导航与深链](../concepts/navigation.md) · [共享组件](../concepts/shared-components.md)
- [android routes facts](../../facts/android/routes.md)
- [harmony routes facts](../../facts/harmony/routes.md)
- [ios routes facts](../../facts/ios/routes.md)
