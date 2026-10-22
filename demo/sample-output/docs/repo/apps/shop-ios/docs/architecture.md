---
last_compound_scan: 2026-10-21
compound_scan_mode: full
compound_source_commit: 0eac90a45f255baa4080e270c0069ae35df522e6
---
# Architecture

## Module map

### 模块 MiniShop (root)

- MiniShop (root)：0 个核心符号（），位于 1 个文件；主要符号 。
- wiki：`wiki/pages/shop-ios/_root/overview.md`

**Source**: `apps/shop-ios/Package.swift` [Code Direct] [Verified]

### 模块 MiniShop

- MiniShop（swift-executable）：5 个功能簇（Api client、App router、Checkout view、Cart view model 等），25 个核心符号。
- wiki：`wiki/pages/shop-ios/mini-shop/overview.md`

**Source**: `apps/shop-ios/MiniShop/App/MiniShopApp.swift` [Code Direct] [Verified]

### 功能簇 Api client

- Api client：6 个核心符号（3 个 class、2 个 struct、1 个 enum），位于 2 个文件；主要符号 LoginViewModel、APIClient、HTTPMethod。
- wiki：`wiki/pages/shop-ios/mini-shop/api-client.md`

**Source**: `apps/shop-ios/MiniShop/Features/Login/LoginViewModel.swift` [Code Direct] [Verified]

### 功能簇 App router

- App router：7 个核心符号（5 个 struct、1 个 class、1 个 enum），位于 5 个文件；主要符号 MiniShopApp、CartView、LoginView；路由 RootView, cart, login。
- wiki：`wiki/pages/shop-ios/mini-shop/app-router.md`

**Source**: `apps/shop-ios/MiniShop/App/MiniShopApp.swift` [Code Direct] [Verified]

### 功能簇 Checkout view

- Checkout view：5 个核心符号（5 个 struct），位于 4 个文件；主要符号 BackButton、CheckoutView、OrderDetailView；路由 checkout, order_detail。
- wiki：`wiki/pages/shop-ios/mini-shop/checkout-view.md`

**Source**: `apps/shop-ios/MiniShop/Components/BackButton.swift` [Code Direct] [Verified]

### 功能簇 Cart view model

- Cart view model：3 个核心符号（2 个 struct、1 个 class），位于 2 个文件；主要符号 CartViewModel、CartRequest、CartResponse。
- wiki：`wiki/pages/shop-ios/mini-shop/cart-view-model.md`

**Source**: `apps/shop-ios/MiniShop/Features/Cart/CartViewModel.swift` [Code Direct] [Verified]

### 功能簇 Products view model

- Products view model：4 个核心符号（3 个 struct、1 个 class），位于 4 个文件；主要符号 ProductDetailView、ProductsView、ProductsViewModel；路由 product_detail, products。
- wiki：`wiki/pages/shop-ios/mini-shop/products-view-model.md`

**Source**: `apps/shop-ios/MiniShop/Features/Products/ProductDetailView.swift` [Code Direct] [Verified]
