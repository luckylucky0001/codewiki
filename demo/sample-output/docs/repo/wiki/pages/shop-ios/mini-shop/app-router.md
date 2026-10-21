---
id: shop-ios/mini-shop/app-router
title: App router
kind: cluster
level: 3
tree_node: shop-ios/mini-shop/c-6f7527c8
parent: shop-ios/mini-shop/overview
summary: App router：7 个核心符号（5 个 struct、1 个 class、1 个 enum），位于 5 个文件；主要符号 MiniShopApp、CartView、LoginView；路由 RootView, cart, login。
importance: high
sources:
  - sym: ios://MiniShop/App/MiniShopApp.swift#MiniShopApp
    hash: 2b85fe764194bcf8deca7d790646aa6ed3dde90d8c30d1663753866b88019370
  - sym: ios://MiniShop/Features/Cart/CartView.swift#CartView
    hash: d47d57d059273a31af207e5d5bb372ec0c897bd5da8005b3f15971f95ef12cbf
  - sym: ios://MiniShop/Features/Login/LoginView.swift#LoginView
    hash: 13735226ce1bc1845db3b9bb5a9fef4c6b614584b4bcd4112b82d3ef73259537
  - sym: ios://MiniShop/Navigation/AppRouter.swift#AppRouter
    hash: 4ce57faecf25e8e563cb2a5daad952c363701a71d1efa34c7b08d605297c6a16
  - sym: ios://MiniShop/Navigation/AppRouter.swift#RootView
    hash: 4f49f5014b3bde7ee66e2ccc46f765cacc73c5b4149cc373ebf1884103f14967
  - sym: ios://MiniShop/Navigation/Route.swift#Destination
    hash: 301f84caec498e24edf51b728803a5f77ea0090d3b82f9d790bccc48cc814baf
  - sym: ios://MiniShop/Navigation/Route.swift#Route
    hash: 346ccda78672709d252578126592ff5a002c23023ef3437a4cd4d6f3e443b591
source_commit: f8537f3
status: current
---
# App router

<!-- kb:breadcrumb -->
> [monoshop](../../overview.md) › [MiniShop](../overview.md) › [MiniShop](overview.md) › App router
<!-- /kb:breadcrumb -->

> 由 `kb compound --llm template` 根据模块树（module_tree.json）、符号图与 facts 确定性生成；使用 agent 模式可获得更完整的叙述。

App router：7 个核心符号（5 个 struct、1 个 class、1 个 enum），位于 5 个文件；主要符号 MiniShopApp、CartView、LoginView；路由 RootView, cart, login。

## 职责

- `ios://MiniShop/App/MiniShopApp.swift#MiniShopApp` — struct `@main struct MiniShopApp: App`
- `ios://MiniShop/Features/Cart/CartView.swift#CartView` — struct `struct CartView: View`
- `ios://MiniShop/Features/Login/LoginView.swift#LoginView` — struct `struct LoginView: View`
- `ios://MiniShop/Navigation/AppRouter.swift#AppRouter` — class `final class AppRouter: ObservableObject`
- `ios://MiniShop/Navigation/AppRouter.swift#RootView` — struct `struct RootView: View`
- `ios://MiniShop/Navigation/Route.swift#Destination` — struct `struct Destination: Hashable`
- `ios://MiniShop/Navigation/Route.swift#Route` — enum `enum Route: String, CaseIterable`

## testID

- `cart_checkout`（ios，`apps/shop-ios/MiniShop/Features/Cart/CartView.swift:11`）
- `login_password`（ios，`apps/shop-ios/MiniShop/Features/Login/LoginView.swift:12`）
- `login_submit`（ios，`apps/shop-ios/MiniShop/Features/Login/LoginView.swift:13`）
- `login_username`（ios，`apps/shop-ios/MiniShop/Features/Login/LoginView.swift:11`）

## 相关簇

- [Checkout view](checkout-view.md)
- [Products view model](products-view-model.md)
- [Api client](api-client.md)

<!-- kb:symbols -->
## 符号表

| 符号 | kind | 签名 | 位置 |
|---|---|---|---|
| `MiniShopApp` | struct | `@main struct MiniShopApp: App` | `apps/shop-ios/MiniShop/App/MiniShopApp.swift:3-14` |
| `CartView` | struct | `struct CartView: View` | `apps/shop-ios/MiniShop/Features/Cart/CartView.swift:3-16` |
| `LoginView` | struct | `struct LoginView: View` | `apps/shop-ios/MiniShop/Features/Login/LoginView.swift:3-23` |
| `AppRouter` | class | `final class AppRouter: ObservableObject` | `apps/shop-ios/MiniShop/Navigation/AppRouter.swift:3-33` |
| `RootView` | struct | `struct RootView: View` | `apps/shop-ios/MiniShop/Navigation/AppRouter.swift:35-53` |
| `Destination` | struct | `struct Destination: Hashable` | `apps/shop-ios/MiniShop/Navigation/Route.swift:13-16` |
| `Route` | enum | `enum Route: String, CaseIterable` | `apps/shop-ios/MiniShop/Navigation/Route.swift:4-11` |
<!-- /kb:symbols -->

<!-- kb:routes -->
## 相关功能页

- [RootView](../../features/RootView.md)
- [cart](../../features/cart.md)
- [login](../../features/login.md)
<!-- /kb:routes -->

<!-- kb:sources -->
Sources: `apps/shop-ios/MiniShop/App/MiniShopApp.swift:3-14` · `apps/shop-ios/MiniShop/Features/Cart/CartView.swift:3-16` · `apps/shop-ios/MiniShop/Features/Login/LoginView.swift:3-23` · `apps/shop-ios/MiniShop/Navigation/AppRouter.swift:3-33` · `apps/shop-ios/MiniShop/Navigation/AppRouter.swift:35-53` · `apps/shop-ios/MiniShop/Navigation/Route.swift:13-16` · `apps/shop-ios/MiniShop/Navigation/Route.swift:4-11`
<!-- /kb:sources -->
