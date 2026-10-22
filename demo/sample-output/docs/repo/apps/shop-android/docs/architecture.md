---
last_compound_scan: 2026-10-21
compound_scan_mode: full
compound_source_commit: 0eac90a45f255baa4080e270c0069ae35df522e6
---
# Architecture

## Module map

### 功能簇 Cart view model

- Cart view model：8 个核心符号（6 个 composable、1 个 class、1 个 object），位于 8 个文件；主要符号 MiniShopNavHost、Routes、CartScreen；路由 cart, checkout, order_detail, product_detail。
- wiki：`wiki/pages/shop-android/cart-view-model.md`

**Source**: `apps/shop-android/app/src/main/java/com/minishop/navigation/MiniShopNavHost.kt` [Code Direct] [Verified]

### 功能簇 Login view model

- Login view model：4 个核心符号（3 个 class、1 个 composable），位于 4 个文件；主要符号 MainActivity、TokenStore、LoginScreen；路由 MainActivity, login。
- wiki：`wiki/pages/shop-android/login-view-model.md`

**Source**: `apps/shop-android/app/src/main/java/com/minishop/MainActivity.kt` [Code Direct] [Verified]

### 功能簇 Products view model

- Products view model：4 个核心符号（1 个 class、1 个 composable、1 个 function、1 个 object），位于 4 个文件；主要符号 ApiClient、placeOrder、ProductsScreen；路由 products。
- wiki：`wiki/pages/shop-android/products-view-model.md`

**Source**: `apps/shop-android/app/src/main/java/com/minishop/data/ApiService.kt` [Code Direct] [Verified]

### 功能簇 Data

- Data：8 个核心符号（7 个 class、1 个 interface），位于 2 个文件；主要符号 ApiService、CartRequest、CartResponse。
- wiki：`wiki/pages/shop-android/data.md`

**Source**: `apps/shop-android/app/src/main/java/com/minishop/data/ApiService.kt` [Code Direct] [Verified]
