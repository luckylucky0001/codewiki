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
source_commit: "8527147"
status: current
---
# 导航与深链

> 路由表、路由器、导航栈与深链/测试参数处理代码（三端）。路由事实见 facts/*/routes.md。

## android

| kind | 符号 | 签名 | 使用方 |
|---|---|---|---|
| function | `android://app/src/main/java/com/minishop/MainActivity.kt#MainActivity.applyTestParams` | `private fun applyTestParams(uri: Uri?)` |  |
| property | `android://app/src/main/java/com/minishop/navigation/MiniShopNavHost.kt#DEEPLINK_BASE` | `const val DEEPLINK_BASE` |  |
| composable | `android://app/src/main/java/com/minishop/navigation/MiniShopNavHost.kt#MiniShopNavHost` | `@Composable fun MiniShopNavHost()` |  |
| object | `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes` | `object Routes` |  |
| property | `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.CART` | `const val CART` |  |
| property | `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.CHECKOUT` | `const val CHECKOUT` |  |
| property | `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.LOGIN` | `const val LOGIN` |  |
| property | `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.ORDER_DETAIL` | `const val ORDER_DETAIL` |  |
| property | `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.PRODUCTS` | `const val PRODUCTS` |  |
| property | `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.PRODUCT_DETAIL` | `const val PRODUCT_DETAIL` |  |
| property | `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes.PROFILE` | `const val PROFILE` |  |

## harmony

| kind | 符号 | 签名 | 使用方 |
|---|---|---|---|
| property | `harmony://entry/src/main/ets/common/BackButton.ets#BackButton.pathStack` | `@Consume('pathStack') pathStack: NavPathStack` |  |
| method | `harmony://entry/src/main/ets/entryability/EntryAbility.ets#EntryAbility.applyTestParams` | `applyTestParams(uri?: string): void` |  |
| property | `harmony://entry/src/main/ets/pages/CartPage.ets#CartPage.pathStack` | `@Consume('pathStack') pathStack: NavPathStack` | （routes: cart） |
| property | `harmony://entry/src/main/ets/pages/CheckoutPage.ets#CheckoutPage.pathStack` | `@Consume('pathStack') pathStack: NavPathStack` | （routes: checkout） |
| method | `harmony://entry/src/main/ets/pages/Index.ets#Index.openDeepLink` | `openDeepLink(uri: string): void` |  |
| property | `harmony://entry/src/main/ets/pages/Index.ets#Index.pathStack` | `@Provide('pathStack') pathStack: NavPathStack` |  |
| property | `harmony://entry/src/main/ets/pages/LoginPage.ets#LoginPage.pathStack` | `@Consume('pathStack') pathStack: NavPathStack` | （routes: login） |
| property | `harmony://entry/src/main/ets/pages/OrderDetailPage.ets#OrderDetailPage.pathStack` | `@Consume('pathStack') pathStack: NavPathStack` | （routes: order_detail） |
| property | `harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailPage.pathStack` | `@Consume('pathStack') pathStack: NavPathStack` | （routes: product_detail） |
| property | `harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsPage.pathStack` | `@Consume('pathStack') pathStack: NavPathStack` | （routes: products） |
| property | `harmony://entry/src/main/ets/pages/ProfilePage.ets#ProfilePage.pathStack` | `@Consume('pathStack') pathStack: NavPathStack` | （routes: profile） |

## ios

| kind | 符号 | 签名 | 使用方 |
|---|---|---|---|
| property | `ios://MiniShop/App/MiniShopApp.swift#MiniShopApp.router` | `@StateObject private var router` |  |
| class | `ios://MiniShop/Navigation/AppRouter.swift#AppRouter` | `final class AppRouter: ObservableObject` | （routes: cart, checkout, login, products, profile） |
| function | `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.handle` | `func handle(url: URL)` | （routes: cart, checkout, login, products, profile） |
| function | `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.match` | `func match(host: String, segments: [String]) -> Destination?` | （routes: cart, checkout, login, products, profile） |
| property | `ios://MiniShop/Navigation/AppRouter.swift#AppRouter.path` | `@Published var path: [Destination]` | （routes: cart, checkout, login, products, profile） |
| property | `ios://MiniShop/Navigation/AppRouter.swift#RootView.router` | `@EnvironmentObject var router: AppRouter` |  |
| struct | `ios://MiniShop/Navigation/Route.swift#Destination` | `struct Destination: Hashable` | （routes: cart, checkout, login, products, profile） |
| property | `ios://MiniShop/Navigation/Route.swift#Destination.params` | `var params: [String: String]` | （routes: cart, checkout, login, products, profile） |
| property | `ios://MiniShop/Navigation/Route.swift#Destination.route` | `let route: Route` | （routes: cart, checkout, login, products, profile） |
| enum | `ios://MiniShop/Navigation/Route.swift#Route` | `enum Route: String, CaseIterable` | （routes: cart, checkout, login, products, profile） |
| case | `ios://MiniShop/Navigation/Route.swift#Route.cart` | `case cart` | （routes: products） |
| case | `ios://MiniShop/Navigation/Route.swift#Route.checkout` | `case checkout` | （routes: cart） |
| case | `ios://MiniShop/Navigation/Route.swift#Route.login` | `case login` | （routes: profile） |
| case | `ios://MiniShop/Navigation/Route.swift#Route.orderDetail` | `case orderDetail` | （routes: checkout） |
| case | `ios://MiniShop/Navigation/Route.swift#Route.productDetail` | `case productDetail` | （routes: products） |
| case | `ios://MiniShop/Navigation/Route.swift#Route.products` | `case products` | （routes: login） |
| case | `ios://MiniShop/Navigation/Route.swift#Route.profile` | `case profile` |  |

## 相关页面

- [总览](../overview.md)
