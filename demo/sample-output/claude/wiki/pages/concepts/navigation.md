---
id: concepts/navigation
title: 导航与深链
kind: concept
platforms: [android, harmony, ios]
sources:
  - sym: android://app/src/main/java/com/minishop/MainActivity.kt#MainActivity.applyTestParams
    hash: 708ff4ad10e85cb96534e72c257847ad1d89992ac46961753be0a9e92f919765
  - sym: android://app/src/main/java/com/minishop/navigation/MiniShopNavHost.kt#DEEPLINK_BASE
    hash: 0bb391957a908145a38f3a5193cfecd75dddfb7934238a39ec6cc8f38d28dcb7
  - sym: android://app/src/main/java/com/minishop/navigation/MiniShopNavHost.kt#MiniShopNavHost
    hash: e26f2a4213b8fe59aad58759b3fa8cefdd2c1a2e92bd056d978bb388053fe4b4
  - sym: android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes
    hash: 302b9d641f32c206196887d139eaeafeb825c932420893cab8e485229d2d9550
  - sym: android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.CART
    hash: cf5e2d72e2e641d87f3ed0dd1b0e27b8dbecbb43d9189e3b68bb2da2978382f2
  - sym: android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.CHECKOUT
    hash: 5fd1744876582a3b6a6bb222c79a915f537752db805044788379290fa62335dc
  - sym: android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.LOGIN
    hash: 0de7354e67f7391c5c10fda6661ace396a6eae610aa1831dd4fbaf2def9c9aae
  - sym: android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.ORDER_DETAIL
    hash: 95a65d5ee26abf6bb7bc82d020dd480774a838715259cd68751e6a27603aa7b4
  - sym: android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.PRODUCTS
    hash: b9204954bd48239820740338ceeb088a6a10d4b7e9c88b9c6c8149c28ee9fb43
  - sym: android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.PRODUCT_DETAIL
    hash: e22652eb15a1f1440832bc076ff359a01617aa6bed2a5137feaa73e5f9f182e8
  - sym: android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.PROFILE
    hash: feb1786760b4e7b2be5ce55b8912a7f947629301e2897187470e9a30b8ee035e
  - sym: harmony://entry/src/main/ets/common/BackButton.ets#BackButton.pathStack
    hash: d348143e464db81a86e98f370526c7e901585a646f2c2da22b03cd196207ad88
  - sym: harmony://entry/src/main/ets/entryability/EntryAbility.ets#EntryAbility.applyTestParams
    hash: a64dd68ae208350983d623b454e900d9aa50ef3fdfde714f47c6870b7f9de212
  - sym: harmony://entry/src/main/ets/pages/CartPage.ets#CartPage.pathStack
    hash: d348143e464db81a86e98f370526c7e901585a646f2c2da22b03cd196207ad88
  - sym: harmony://entry/src/main/ets/pages/CheckoutPage.ets#CheckoutPage.pathStack
    hash: d348143e464db81a86e98f370526c7e901585a646f2c2da22b03cd196207ad88
  - sym: harmony://entry/src/main/ets/pages/Index.ets#Index.openDeepLink
    hash: 9010d8a5699bb75ad9da8795f0c2cee2da7da1497a6268a64316c9a6b10bbae6
  - sym: harmony://entry/src/main/ets/pages/Index.ets#Index.pathStack
    hash: cd92c213a565d1a6eb4716fd21f3c2ed810bedf73b91fee840203593edd2749c
  - sym: harmony://entry/src/main/ets/pages/LoginPage.ets#LoginPage.pathStack
    hash: d348143e464db81a86e98f370526c7e901585a646f2c2da22b03cd196207ad88
  - sym: harmony://entry/src/main/ets/pages/OrderDetailPage.ets#OrderDetailPage.pathStack
    hash: d348143e464db81a86e98f370526c7e901585a646f2c2da22b03cd196207ad88
  - sym: harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailPage.pathStack
    hash: d348143e464db81a86e98f370526c7e901585a646f2c2da22b03cd196207ad88
  - sym: harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsPage.pathStack
    hash: d348143e464db81a86e98f370526c7e901585a646f2c2da22b03cd196207ad88
  - sym: harmony://entry/src/main/ets/pages/ProfilePage.ets#ProfilePage.pathStack
    hash: d348143e464db81a86e98f370526c7e901585a646f2c2da22b03cd196207ad88
  - sym: ios://MiniShop/App/MiniShopApp.swift#MiniShopApp.router
    hash: d53534e7104f6dbaa0315f92678bca64a1f5ac9032275b05a526a90887555d0e
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter
    hash: 4ce57faecf25e8e563cb2a5daad952c363701a71d1efa34c7b08d605297c6a16
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter.handle
    hash: 4b2d7773068d8cf126bef60046012ded7a2182494966a5907cd13d5ccede6be3
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter.match
    hash: 4277008b895b029f4caf0522de87de218a6dd86ddea121b01be670c4d227e484
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter.path
    hash: 8e630fea62710ade5354d04e1e353ff6e1c5b0ac38acbcbed1796eabc8660b98
  - sym: ios://MiniShop/Navigation/AppRouter.swift#RootView.router
    hash: 137f5eb371d4d68983fd5b9b7dc70d78c07c32f8a2dd1dbad99f490707470b9c
  - sym: ios://MiniShop/Navigation/Route.swift#Destination
    hash: 301f84caec498e24edf51b728803a5f77ea0090d3b82f9d790bccc48cc814baf
  - sym: ios://MiniShop/Navigation/Route.swift#Destination.params
    hash: 2e469b4ecc4f45b1ff796f72e2fecd121208cc549ec25238f0092b7e5832e8ea
  - sym: ios://MiniShop/Navigation/Route.swift#Destination.route
    hash: 12d58fa4f87a306c398635b92e2d024d469918b3e33abd03bd572f833d9d2c82
  - sym: ios://MiniShop/Navigation/Route.swift#Route
    hash: 00301ea72b1501097080f891ad640482a21d21ab195b6916758de2066171bc2c
  - sym: ios://MiniShop/Navigation/Route.swift#Route.cart
    hash: 960d1701af3bdabe477341b6bd83bf009df3a0d47e3c1563f0f0321610b1b677
  - sym: ios://MiniShop/Navigation/Route.swift#Route.checkout
    hash: 53fa77d0285a9f0bd2a6a45d14e1e93936d65d95fb78dd3b0b3f7548ad791768
  - sym: ios://MiniShop/Navigation/Route.swift#Route.login
    hash: 262731050f215c435fc39c30757b9a327bc3edf59f0e42fc0d76cd41ac4b863c
  - sym: ios://MiniShop/Navigation/Route.swift#Route.orderDetail
    hash: a86156ad969616e1045f98cea9af27f9da4c8c6ad25af16e6b96304aff4d6032
  - sym: ios://MiniShop/Navigation/Route.swift#Route.productDetail
    hash: 352862e075c18bb11e048b2da333f81b3c965db39bb522c154f5fcde56f0542b
  - sym: ios://MiniShop/Navigation/Route.swift#Route.products
    hash: 0fbe631d08afe24b8d26ee6911bafb84fad369e681ecfe0c1308b7d0b484d8a2
  - sym: ios://MiniShop/Navigation/Route.swift#Route.profile
    hash: b4eeb3dba90bf3318c66b05247e35a69b93faa580f5dccccb1aa35bc61f0d6dd
source_commit: 8cdd41b
status: current
---
# 导航与深链

## 概述

三端使用同一套路由模式（7 条）和同一个深链协议 `minishop://`。各端实现方式不同：Android 用 Compose Navigation，Harmony 用 `NavPathStack`，iOS 用 `AppRouter` 管理 `[Destination]` 路径。路由事实见 [android](../../facts/android/routes.md)、[harmony](../../facts/harmony/routes.md)、[ios](../../facts/ios/routes.md)。

## 路由与深链

| 路由模式 | Android | iOS | Harmony（pushPathByName 名称） |
|---|---|---|---|
| `login` | `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.LOGIN` | `ios://MiniShop/Navigation/Route.swift#Route.login` | `login` |
| `products` | `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.PRODUCTS` | `ios://MiniShop/Navigation/Route.swift#Route.products` | `products` |
| `product/{id}` | `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.PRODUCT_DETAIL` | `ios://MiniShop/Navigation/Route.swift#Route.productDetail` | `product_detail` |
| `cart` | `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.CART` | `ios://MiniShop/Navigation/Route.swift#Route.cart` | `cart` |
| `checkout` | `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.CHECKOUT` | `ios://MiniShop/Navigation/Route.swift#Route.checkout` | `checkout` |
| `order/{id}` | `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.ORDER_DETAIL` | `ios://MiniShop/Navigation/Route.swift#Route.orderDetail` | `order_detail` |
| `profile`（新增） | `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.PROFILE` | `ios://MiniShop/Navigation/Route.swift#Route.profile` | `ProfilePage` 持有 `pathStack` |

- 深链格式：`minishop://<pattern>?token=<t>&cart=<sku,sku>`，例如 `minishop://product/42`。
- Android：`android://app/src/main/java/com/minishop/navigation/MiniShopNavHost.kt#DEEPLINK_BASE` 为 `minishop://`，`android://app/src/main/java/com/minishop/navigation/MiniShopNavHost.kt#MiniShopNavHost` 为每条路由都注册 `navDeepLink`（含 `profile`），起始页为 `Routes.LOGIN`。
- Profile 路由：Android 中 `ProfileScreen` 的 `onLogout` 导航到 `Routes.LOGIN`，`onBack` 调用 `popBackStack()`；iOS 新增 `Route.profile`；Harmony 新增 `ProfilePage` 并消费 `pathStack`。

## 三端实现对照

| 项 | Android | Harmony | iOS |
|---|---|---|---|
| 路由表 | `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes`（字符串常量） | 页面名字符串（无集中枚举） | `ios://MiniShop/Navigation/Route.swift#Route`（`String` 枚举，`CaseIterable`） |
| 导航状态 | `rememberNavController()` 的返回栈 | `harmony://entry/src/main/ets/pages/Index.ets#Index.pathStack`（`@Provide`） | `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.path`（`@Published`） |
| 子页获取导航 | 回调 lambda（`onOpen`/`onBack` 等） | 各页 `@Consume('pathStack')`，如 `harmony://entry/src/main/ets/pages/ProfilePage.ets#ProfilePage.pathStack` | `ios://MiniShop/Navigation/AppRouter.swift#RootView.router`（`@EnvironmentObject`） |
| 深链入口 | `NavHost` 的 `navDeepLink` | `harmony://entry/src/main/ets/pages/Index.ets#Index.openDeepLink` | `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.handle` |
| 路由匹配 | Navigation 库内置 | 手工拆分路径：`product`/`order` 取 `parts[1]` 作为 `id` | `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.match` 逐段匹配 `{param}` |
| 测试参数 | `android://app/src/main/java/com/minishop/MainActivity.kt#MainActivity.applyTestParams` | `harmony://entry/src/main/ets/entryability/EntryAbility.ets#EntryAbility.applyTestParams` | 在 `handle` 内处理 |

## 接口与数据流

- iOS：`MiniShopApp.router`（`ios://MiniShop/App/MiniShopApp.swift#MiniShopApp.router`）创建 `AppRouter`；`handle(url:)` 仅接受 scheme 为 `minishop`，先处理 query，再用 `match` 得到 `ios://MiniShop/Navigation/Route.swift#Destination`（含 `route` 与 `params`）并追加到 `path`。
- Harmony：`openDeepLink` 对非 `minishop://` 的 URI 回退为已登录 `products`、未登录 `login`；`product/<id>` 与 `order/<id>` 分别映射到 `product_detail`、`order_detail` 并传 `{ id }`；其余直接以首段作为页面名。返回由 `harmony://entry/src/main/ets/common/BackButton.ets#BackButton.pathStack` 实现。
- 测试参数（三端一致）：`token` 写入 `TokenStore`，`cart`（逗号分隔 SKU）预加载购物车；Android/Harmony 在入口处解析，iOS 在 `handle` 内解析。

## 注意事项

- Android 深链 `profile` 与其他路由一样已注册；Harmony 的 `openDeepLink` 对 `profile` 走默认分支（`pushPathByName('profile', null)`），需确认其在导航目的地中已注册，本页不做断言。
- Profile 尚无 `features/` 页面，因此此处不链接。

## 相关页面

- [总览](../overview.md)
- [登录](../features/login.md)、[商品列表](../features/products.md)、[商品详情](../features/product_detail.md)
- [购物车](../features/cart.md)、[结算](../features/checkout.md)、[订单详情](../features/order_detail.md)
