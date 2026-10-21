---
last_compound_scan: 2026-10-21
compound_scan_mode: full
compound_source_commit: aca79fd22e09360835e048979b68973ed5a66004
---
# Navigation & Deep Links

### 路由 MainActivity

单 Activity 宿主。`onCreate` 中调用 `applyTestParams`，读取深链的 `token` 与 `cart` 参数并写入 `TokenStore` 和 `CartViewModel.preload`，然后渲染 `MiniShopNavHost()`。

**Source**: `apps/shop-android/app/src/main/java/com/minishop/MainActivity.kt` [Code Direct] [Verified]

### 路由 cart

`CartScreen` 接收 `onCheckout` 和 `onBack` 回调，顶栏标题为 "Cart"。`cart_total` 显示 `vm.total()`，`cart_checkout` 按钮仅在数量大于 0 时启用。

**Source**: `apps/shop-android/app/src/main/java/com/minishop/ui/cart/CartScreen.kt` [Code Direct] [Verified]

### 路由 checkout

`CheckoutScreen` 的 `checkout_submit` 按钮调用 `placeOrder()`，以 `paymentMethod = "card"` 请求 `ApiClient.service.createOrder`，成功后通过 `onOrderPlaced(orderId)` 回调导航。

**Source**: `apps/shop-android/app/src/main/java/com/minishop/ui/checkout/CheckoutScreen.kt` [Code Direct] [Verified]

### 路由 login

`LoginScreen` 包含 `login_username`、`login_password` 两个输入框和 `login_submit` 按钮。点击后调用 `vm.login`，成功则触发 `onLoggedIn()`，由导航宿主跳转到 `Routes.PRODUCTS`。

**Source**: `apps/shop-android/app/src/main/java/com/minishop/ui/login/LoginScreen.kt` [Code Direct] [Verified]

### 路由 order_detail

`OrderDetailScreen` 接收路由参数 `id`，顶栏标题为 `"Order $id"`，状态文本固定为 "Order placed"（testTag `order_status`）。

**Source**: `apps/shop-android/app/src/main/java/com/minishop/ui/order/OrderDetailScreen.kt` [Code Direct] [Verified]

### 路由 product_detail

`ProductDetailScreen` 接收 `id`，在 `LaunchedEffect` 中调用 `vm.loadProduct(id)`。`add_to_cart` 按钮在商品加载后调用 `cart.addItem(it.id)`。

**Source**: `apps/shop-android/app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt` [Code Direct] [Verified]

### 路由 products

`ProductsScreen` 在 `LaunchedEffect(Unit)` 中调用 `vm.loadProducts()`。列表 `product_list` 的每项 `product_item_<id>` 点击后调用 `onOpen(id)`，顶部 `tab_cart` 调用 `onCart`。

**Source**: `apps/shop-android/app/src/main/java/com/minishop/ui/products/ProductsScreen.kt` [Code Direct] [Verified]
