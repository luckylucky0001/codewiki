---
last_compound_scan: 2026-10-21
compound_scan_mode: full
compound_source_commit: 0eac90a45f255baa4080e270c0069ae35df522e6
---
# MonoShop 架构

MonoShop 由两个原生应用组成，共用同一套后端接口（`/api/*`）。本文由架构组维护，
记录我们**有意为之**的设计取舍：

- 每个平台独立实现 UI，不共享 UI 代码；
- 路由 id 三端一致，便于 e2e 用例复用；
- 购物车上限由产品决定，目前是 10。

> 人工维护的段落：kb 只能在后面追加带 `**Source**` 的条目，不会改动这里的任何字节。

## Projects

### 项目 minishop

- 构建：gradle · android
- minishop（gradle · android · android-app）：4 个功能簇（Cart view model、Login view model、Products view model、Data），24 个核心符号。

**Source**: `apps/shop-android/app/src/main/java/com/minishop/MainActivity.kt` [Code Direct] [Verified]

### 项目 MiniShop

- 构建：swiftpm · ios
- MiniShop（swiftpm · ios）：2 个模块（MiniShop (root)、MiniShop），25 个核心符号。

**Source**: `apps/shop-ios/MiniShop/App/MiniShopApp.swift` [Code Direct] [Verified]
