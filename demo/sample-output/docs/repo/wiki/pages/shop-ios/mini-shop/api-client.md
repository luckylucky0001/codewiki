---
id: shop-ios/mini-shop/api-client
title: Api client
kind: cluster
level: 3
tree_node: shop-ios/mini-shop/c-5feb53c3
parent: shop-ios/mini-shop/overview
summary: Api client：6 个核心符号（3 个 class、2 个 struct、1 个 enum），位于 2 个文件；主要符号 LoginViewModel、APIClient、HTTPMethod。
importance: medium
sources:
  - sym: ios://MiniShop/Features/Login/LoginViewModel.swift#LoginViewModel
    hash: 41460a935e5e6e38f40bf0c2e6e6bc57bfd690e9644c2c5deab5b08eba1a5595
  - sym: ios://MiniShop/Networking/APIClient.swift#APIClient
    hash: c5e6ec083db8da3b60ada101d24777b880f90a77bd7942857308380eef805c38
  - sym: ios://MiniShop/Networking/APIClient.swift#HTTPMethod
    hash: 1b06cc389829f0b13a6dfbe06e22c210b165166fdf9bdd04b84d39d112b085c0
  - sym: ios://MiniShop/Networking/APIClient.swift#LoginRequest
    hash: 23a3b79d8e9bc14da446cfed01bbf90181e0a83b16fa17d0d6518c18c3d6d323
  - sym: ios://MiniShop/Networking/APIClient.swift#LoginResponse
    hash: 79eeb7ad3c9dbdae5c3058ecea59e72223f6e7ee147590e9f2a1120005169d1c
  - sym: ios://MiniShop/Networking/APIClient.swift#TokenStore
    hash: 59185d41a76f21ca55b2b423e6e6bfcb7ea1fc5dcfb5fce823db3f38c1a6984f
source_commit: f8537f3
status: current
---
# Api client

<!-- kb:breadcrumb -->
> [monoshop](../../overview.md) › [MiniShop](../overview.md) › [MiniShop](overview.md) › Api client
<!-- /kb:breadcrumb -->

> 由 `kb compound --llm template` 根据模块树（module_tree.json）、符号图与 facts 确定性生成；使用 agent 模式可获得更完整的叙述。

Api client：6 个核心符号（3 个 class、2 个 struct、1 个 enum），位于 2 个文件；主要符号 LoginViewModel、APIClient、HTTPMethod。

## 职责

- `ios://MiniShop/Features/Login/LoginViewModel.swift#LoginViewModel` — class `@MainActor final class LoginViewModel: ObservableObject`
- `ios://MiniShop/Networking/APIClient.swift#APIClient` — class `final class APIClient`
- `ios://MiniShop/Networking/APIClient.swift#HTTPMethod` — enum `enum HTTPMethod: String`
- `ios://MiniShop/Networking/APIClient.swift#LoginRequest` — struct `struct LoginRequest: Encodable`
- `ios://MiniShop/Networking/APIClient.swift#LoginResponse` — struct `struct LoginResponse: Decodable`
- `ios://MiniShop/Networking/APIClient.swift#TokenStore` — class `final class TokenStore`

## 接口

- POST `/api/login`（ios，`ios://MiniShop/Features/Login/LoginViewModel.swift#LoginViewModel.login`）

## 相关簇

- [Products view model](products-view-model.md)
- [App router](app-router.md)
- [Checkout view](checkout-view.md)

<!-- kb:symbols -->
## 符号表

| 符号 | kind | 签名 | 位置 |
|---|---|---|---|
| `LoginViewModel` | class | `@MainActor final class LoginViewModel: ObservableObject` | `apps/shop-ios/MiniShop/Features/Login/LoginViewModel.swift:3-21` |
| `APIClient` | class | `final class APIClient` | `apps/shop-ios/MiniShop/Networking/APIClient.swift:22-34` |
| `HTTPMethod` | enum | `enum HTTPMethod: String` | `apps/shop-ios/MiniShop/Networking/APIClient.swift:5-5` |
| `LoginRequest` | struct | `struct LoginRequest: Encodable` | `apps/shop-ios/MiniShop/Networking/APIClient.swift:7-7` |
| `LoginResponse` | struct | `struct LoginResponse: Decodable` | `apps/shop-ios/MiniShop/Networking/APIClient.swift:8-8` |
| `TokenStore` | class | `final class TokenStore` | `apps/shop-ios/MiniShop/Networking/APIClient.swift:15-19` |
<!-- /kb:symbols -->

<!-- kb:sources -->
Sources: `apps/shop-ios/MiniShop/Features/Login/LoginViewModel.swift:3-21` · `apps/shop-ios/MiniShop/Networking/APIClient.swift:22-34` · `apps/shop-ios/MiniShop/Networking/APIClient.swift:5-5` · `apps/shop-ios/MiniShop/Networking/APIClient.swift:7-7` · `apps/shop-ios/MiniShop/Networking/APIClient.swift:8-8` · `apps/shop-ios/MiniShop/Networking/APIClient.swift:15-19`
<!-- /kb:sources -->
