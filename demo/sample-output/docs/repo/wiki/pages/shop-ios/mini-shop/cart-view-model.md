---
id: shop-ios/mini-shop/cart-view-model
title: Cart view model
kind: cluster
level: 3
tree_node: shop-ios/mini-shop/c-aef82694
parent: shop-ios/mini-shop/overview
summary: Cart view model：3 个核心符号（2 个 struct、1 个 class），位于 2 个文件；主要符号 CartViewModel、CartRequest、CartResponse。
importance: low
sources:
  - sym: ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel
    hash: 65d4b59b92a139ca7ea4742ffa1e5299dfe378c0230f71e77310f7037ef91439
  - sym: ios://MiniShop/Networking/APIClient.swift#CartRequest
    hash: a32728ae28945d0265972da3fd38c2cdc9f98b6dd0b58ccaedbbe299fe03e1f6
  - sym: ios://MiniShop/Networking/APIClient.swift#CartResponse
    hash: 9c564193f89f063508d219e4fd7d792d27be2d846767b29a597016c6fab1220c
source_commit: f8537f3
status: current
---
# Cart view model

<!-- kb:breadcrumb -->
> [monoshop](../../overview.md) › [MiniShop](../overview.md) › [MiniShop](overview.md) › Cart view model
<!-- /kb:breadcrumb -->

> 由 `kb compound --llm template` 根据模块树（module_tree.json）、符号图与 facts 确定性生成；使用 agent 模式可获得更完整的叙述。

Cart view model：3 个核心符号（2 个 struct、1 个 class），位于 2 个文件；主要符号 CartViewModel、CartRequest、CartResponse。

## 职责

- `ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel` — class `@MainActor final class CartViewModel: ObservableObject`
- `ios://MiniShop/Networking/APIClient.swift#CartRequest` — struct `struct CartRequest: Encodable`
- `ios://MiniShop/Networking/APIClient.swift#CartResponse` — struct `struct CartResponse: Decodable`

## 接口

- POST `/api/cart`（ios，`ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.addItem`）

## 相关簇

- [App router](app-router.md)
- [Products view model](products-view-model.md)
- [Api client](api-client.md)

<!-- kb:symbols -->
## 符号表

| 符号 | kind | 签名 | 位置 |
|---|---|---|---|
| `CartViewModel` | class | `@MainActor final class CartViewModel: ObservableObject` | `apps/shop-ios/MiniShop/Features/Cart/CartViewModel.swift:3-23` |
| `CartRequest` | struct | `struct CartRequest: Encodable` | `apps/shop-ios/MiniShop/Networking/APIClient.swift:10-10` |
| `CartResponse` | struct | `struct CartResponse: Decodable` | `apps/shop-ios/MiniShop/Networking/APIClient.swift:11-11` |
<!-- /kb:symbols -->

<!-- kb:sources -->
Sources: `apps/shop-ios/MiniShop/Features/Cart/CartViewModel.swift:3-23` · `apps/shop-ios/MiniShop/Networking/APIClient.swift:10-10` · `apps/shop-ios/MiniShop/Networking/APIClient.swift:11-11`
<!-- /kb:sources -->
