---
id: overview
title: 总览
kind: overview
platforms: [android, ios, harmony]
routes: [cart, checkout, login, order_detail, product_detail, products, profile]
source_commit: f484520
status: current
---
# 总览：三端路由矩阵

> 每个功能页覆盖一个 `route_id`，三端（Android / iOS / Harmony）共享同一 pattern 与 deeplink。

## 路由与深链

| route_id | pattern | deeplink | android | ios | harmony | 页面 |
|---|---|---|---|---|---|---|
| `cart` | `cart` | `minishop://cart` | ✓ | ✓ | ✓ | [购物车（cart）](features/cart.md) |
| `checkout` | `checkout` | `minishop://checkout` | ✓ | ✓ | ✓ | [结算（checkout）](features/checkout.md) |
| `login` | `login` | `minishop://login` | ✓ | ✓ | ✓ | [登录（login）](features/login.md) |
| `order_detail` | `order/{id}` | `minishop://order/{id}` | ✓ | ✓ | ✓ | [订单详情（order_detail）](features/order_detail.md) |
| `product_detail` | `product/{id}` | `minishop://product/{id}` | ✓ | ✓ | ✓ | [商品详情（product_detail）](features/product_detail.md) |
| `products` | `products` | `minishop://products` | ✓ | ✓ | ✓ | [商品列表（products）](features/products.md) |
| `profile` | `profile` | `minishop://profile` | ✓ | ✓ | ✓ | [个人中心（profile）](features/profile.md) |

深链 scheme：`minishop`；测试态注入：`?token=<t>&cart=<sku,sku>`。

## 三端实现对照

| route_id | Android | iOS | Harmony |
|---|---|---|---|
| `cart` | `android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen` | `ios://MiniShop/Features/Cart/CartView.swift#CartView` | `harmony://entry/src/main/ets/pages/CartPage.ets#CartBuilder` |
| `checkout` | `android://app/src/main/java/com/minishop/ui/checkout/CheckoutScreen.kt#CheckoutScreen` | `ios://MiniShop/Features/Checkout/CheckoutView.swift#CheckoutView` | `harmony://entry/src/main/ets/pages/CheckoutPage.ets#CheckoutBuilder` |
| `login` | `android://app/src/main/java/com/minishop/ui/login/LoginScreen.kt#LoginScreen` | `ios://MiniShop/Features/Login/LoginView.swift#LoginView` | `harmony://entry/src/main/ets/pages/LoginPage.ets#LoginBuilder` |
| `order_detail` | `android://app/src/main/java/com/minishop/ui/order/OrderDetailScreen.kt#OrderDetailScreen` | `ios://MiniShop/Features/Order/OrderDetailView.swift#OrderDetailView` | `harmony://entry/src/main/ets/pages/OrderDetailPage.ets#OrderDetailBuilder` |
| `product_detail` | `android://app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt#ProductDetailScreen` | `ios://MiniShop/Features/Products/ProductDetailView.swift#ProductDetailView` | `harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailBuilder` |
| `products` | `android://app/src/main/java/com/minishop/ui/products/ProductsScreen.kt#ProductsScreen` | `ios://MiniShop/Features/Products/ProductsView.swift#ProductsView` | `harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsBuilder` |
| `profile` | `android://app/src/main/java/com/minishop/ui/profile/ProfileScreen.kt#ProfileScreen` | `ios://MiniShop/Features/Profile/ProfileView.swift#ProfileView` | `harmony://entry/src/main/ets/pages/ProfilePage.ets#ProfileBuilder` |

## 规模与机器可读事实

- 21 条路由（7 个 route_id × 3 端）、39 个 testID、15 个接口调用点。
- 机器可读：[routes.json](../facts/routes.json) · [testids.json](../facts/testids.json) · [apis.json](../facts/apis.json)
- 分平台路由表：[android](../facts/android/routes.md) · [ios](../facts/ios/routes.md) · [harmony](../facts/harmony/routes.md)

## 相关页面

各功能页见上方路由表；接口与 testID 细节见对应功能页及 facts。
