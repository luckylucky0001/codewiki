---
id: shop-ios/mini-shop/products-view-model
title: Products view model
kind: cluster
level: 3
tree_node: shop-ios/mini-shop/c-b27ee65e
parent: shop-ios/mini-shop/overview
summary: Products view model：4 个核心符号（3 个 struct、1 个 class），位于 4 个文件；主要符号 ProductDetailView、ProductsView、ProductsViewModel；路由 product_detail, products。
importance: low
sources:
  - sym: ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView
    hash: bc8dc6ae3622ce49c146a20c67fea930d9ab5aaba831227605f700a688f17ac3
  - sym: ios://MiniShop/Features/Products/ProductsView.swift#ProductsView
    hash: 6e3105782171131b6e0b10a2bf13398e154dbe6c66ed58445b6a5db3f2792280
  - sym: ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel
    hash: 016331c0d2a3084c909cb1d30abf022020a74ee6e5e8289eb2a944407e1e9514
  - sym: ios://MiniShop/Networking/APIClient.swift#Product
    hash: b5eaaa09783434da064ac114310a09a8cb28e28807c3aaa55d449a25f543b93c
source_commit: f8537f3
status: current
---
# Products view model

<!-- kb:breadcrumb -->
> [monoshop](../../overview.md) › [MiniShop](../overview.md) › [MiniShop](overview.md) › Products view model
<!-- /kb:breadcrumb -->

> 由 `kb compound --llm template` 根据模块树（module_tree.json）、符号图与 facts 确定性生成；使用 agent 模式可获得更完整的叙述。

Products view model：4 个核心符号（3 个 struct、1 个 class），位于 4 个文件；主要符号 ProductDetailView、ProductsView、ProductsViewModel；路由 product_detail, products。

## 职责

- `ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView` — struct `struct ProductDetailView: View`
- `ios://MiniShop/Features/Products/ProductsView.swift#ProductsView` — struct `struct ProductsView: View`
- `ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel` — class `@MainActor final class ProductsViewModel: ObservableObject`
- `ios://MiniShop/Networking/APIClient.swift#Product` — struct `struct Product: Decodable, Identifiable`

## 接口

- GET `/api/products`（ios，`ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel.loadProducts`）
- GET `/api/products/{id}`（ios，`ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel.loadProduct`）

## testID

- `add_to_cart`（ios，`apps/shop-ios/MiniShop/Features/Products/ProductDetailView.swift:13`）
- `product_item_`（ios，`apps/shop-ios/MiniShop/Features/Products/ProductsView.swift:9`）
- `product_list`（ios，`apps/shop-ios/MiniShop/Features/Products/ProductsView.swift:8`）
- `tab_cart`（ios，`apps/shop-ios/MiniShop/Features/Products/ProductsView.swift:14`）

## 相关簇

- [App router](app-router.md)
- [Api client](api-client.md)
- [Cart view model](cart-view-model.md)

<!-- kb:symbols -->
## 符号表

| 符号 | kind | 签名 | 位置 |
|---|---|---|---|
| `ProductDetailView` | struct | `struct ProductDetailView: View` | `apps/shop-ios/MiniShop/Features/Products/ProductDetailView.swift:3-18` |
| `ProductsView` | struct | `struct ProductsView: View` | `apps/shop-ios/MiniShop/Features/Products/ProductsView.swift:3-19` |
| `ProductsViewModel` | class | `@MainActor final class ProductsViewModel: ObservableObject` | `apps/shop-ios/MiniShop/Features/Products/ProductsViewModel.swift:3-14` |
| `Product` | struct | `struct Product: Decodable, Identifiable` | `apps/shop-ios/MiniShop/Networking/APIClient.swift:9-9` |
<!-- /kb:symbols -->

<!-- kb:routes -->
## 相关功能页

- [product_detail](../../features/product_detail.md)
- [products](../../features/products.md)
<!-- /kb:routes -->

<!-- kb:sources -->
Sources: `apps/shop-ios/MiniShop/Features/Products/ProductDetailView.swift:3-18` · `apps/shop-ios/MiniShop/Features/Products/ProductsView.swift:3-19` · `apps/shop-ios/MiniShop/Features/Products/ProductsViewModel.swift:3-14` · `apps/shop-ios/MiniShop/Networking/APIClient.swift:9-9`
<!-- /kb:sources -->
