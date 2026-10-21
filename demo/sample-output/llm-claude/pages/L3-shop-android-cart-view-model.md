---
id: shop-android/cart-view-model
title: 购物车与结账簇
kind: cluster
level: 3
tree_node: shop-android/c-2fbaebfe
parent: shop-android/overview
summary: Cart view model：8 个核心符号（6 个 composable、1 个 class、1 个 object），位于 8 个文件；主要符号 MiniShopNavHost、Routes、CartScreen；路由 cart, checkout, order_detail, product_detail。
importance: high
sources:
  - sym: android://app/src/main/java/com/minishop/navigation/MiniShopNavHost.kt#MiniShopNavHost
    hash: bfc713403f0ec8c7308fad0ddccb980f91967c236be695e95389c53f223b916c
  - sym: android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes
    hash: bce5a0024ee32220b710155aab30a32fbc0a7bd42afcdc474678ebcd26d7a7f7
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen
    hash: a6f5f9ce6b9eea4e562a211421e707f35754cfdbcd9bbed0310fce7075cfde73
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel
    hash: 0cc2ef4b4d87270da9c0d1c4190a5204f22d91b75fc765e6bf1143d689a38c4d
  - sym: android://app/src/main/java/com/minishop/ui/checkout/CheckoutScreen.kt#CheckoutScreen
    hash: 1940402765a35c64188391d26cfe364248f8ccbf9b3cd29e06a3b2d7e30a77a1
  - sym: android://app/src/main/java/com/minishop/ui/components/MiniShopTopBar.kt#MiniShopTopBar
    hash: a950939b071b355f1752ab5ba76842b203ccc17a22905e00e98b7cce1f172af5
  - sym: android://app/src/main/java/com/minishop/ui/order/OrderDetailScreen.kt#OrderDetailScreen
    hash: 43c083aed2c3505314ce1e096e54315d235c069cd2ae327cdca4a5e8d88008a7
  - sym: android://app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt#ProductDetailScreen
    hash: c2ac000c4398a6bf1761eb93ef5fd5c40f47d53e0fa5cd16b9a8c18a2242f261
source_commit: dd2d40d
status: current
---
# 购物车与结账簇

<!-- kb:breadcrumb -->
> [monoshop](../overview.md) › [minishop](overview.md) › Cart view model
<!-- /kb:breadcrumb -->

## 概述

本簇覆盖 shop-android 中“商品详情 → 购物车 → 结账 → 订单详情”这一段导航与界面，以及其依赖的共享组件：

- 导航图：`android://app/src/main/java/com/minishop/navigation/MiniShopNavHost.kt#MiniShopNavHost`，路由常量见 `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes`。
- 购物车状态：`android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel`，仅保存在内存中的 `items` 列表，上限 `MAX_CART_ITEMS = 20`。
- 界面：`CartScreen`、`CheckoutScreen`、`OrderDetailScreen`、`ProductDetailScreen`，以及顶栏 `MiniShopTopBar`。

本页仅描述 android 端。三端对照未包含在本次输入的符号源码中，见 [平台对照](../parity.md)。

## 路由与深链

| `Routes` 常量 | 路由值 | route_id | 深链 | 目标界面 |
|---|---|---|---|---|
| `LOGIN` | `login` | login | `DEEPLINK_BASE + Routes.LOGIN` | 起始页（登录，非本簇符号） |
| `PRODUCTS` | `products` | products | `DEEPLINK_BASE + Routes.PRODUCTS` | 商品列表（非本簇符号） |
| `PRODUCT_DETAIL` | `product/{id}` | product_detail | `DEEPLINK_BASE + Routes.PRODUCT_DETAIL` | `android://app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt#ProductDetailScreen` |
| `CART` | `cart` | cart | `DEEPLINK_BASE + Routes.CART` | `android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen` |
| `CHECKOUT` | `checkout` | checkout | `DEEPLINK_BASE + Routes.CHECKOUT` | `android://app/src/main/java/com/minishop/ui/checkout/CheckoutScreen.kt#CheckoutScreen` |
| `ORDER_DETAIL` | `order/{id}` | order_detail | `DEEPLINK_BASE + Routes.ORDER_DETAIL` | `android://app/src/main/java/com/minishop/ui/order/OrderDetailScreen.kt#OrderDetailScreen` |

`MiniShopNavHost` 中的跳转关系（`nav.navigate` / `popBackStack`）：

- 起始页 → `products`（登录成功后）。
- `products` → `product/$id`，以及 → `cart`。
- `product/{id}` → 返回（`popBackStack`）。
- `cart` → `checkout`，以及返回。
- `checkout` → `order/$orderId`（下单成功后），以及返回。
- `order/{id}` → 返回。

深链 `DEEPLINK_BASE` 的具体取值未在输入中给出。

## 三端实现对照

本次仅有 android 符号源码，因此没有三端并列对照。仅 android 侧可确认的实现要点：

| 符号 | 角色 | 输入 | 输出 / 副作用 |
|---|---|---|---|
| `android://app/src/main/java/com/minishop/navigation/MiniShopNavHost.kt#MiniShopNavHost` | 导航图（`NavHost`，起始 `Routes.LOGIN`） | 无 | 为六个路由注册 composable 与深链 |
| `android://app/src/main/java/com/minishop/navigation/Routes.kt#Routes` | 路由字符串常量 | 无 | 被导航图与深链引用 |
| `android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen` | 购物车页 | `vm: CartViewModel` | 显示 `vm.total()`；结账按钮 `enabled = vm.total() > 0` |
| `android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel` | 购物车状态 | SKU 字符串 | `items` 列表；`addItem` 时异步调用 `ApiClient.service.addToCart` |
| `android://app/src/main/java/com/minishop/ui/checkout/CheckoutScreen.kt#CheckoutScreen` | 结账页 | `onOrderPlaced`、`onBack` | 点击后在协程中下单，回调返回的订单 ID |
| `android://app/src/main/java/com/minishop/ui/order/OrderDetailScreen.kt#OrderDetailScreen` | 订单详情页 | 订单 `id` | 标题 `Order $id`，状态文字 `Order placed` |
| `android://app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt#ProductDetailScreen` | 商品详情页，加购入口 | 商品 `id`；`cart: CartViewModel` | 加载商品后，点击按钮调用 `cart.addItem(product.id)` |
| `android://app/src/main/java/com/minishop/ui/components/MiniShopTopBar.kt#MiniShopTopBar` | 共享顶栏 | `title`，可选 `onBack` | `onBack` 非空时渲染返回按钮 |

## 接口与数据流

1. 商品详情加购：`ProductDetailScreen` 调用 `CartViewModel.addItem(sku)`。若 `items.size >= 20` 返回 `false` 且不加入；否则追加到 `items`，并在 `viewModelScope` 中调用 `ApiClient.service.addToCart(CartRequest(sku, 1))`。
2. 购物车展示：`CartScreen` 调用 `total()`（即 `items.size`）显示数量，数量为 0 时结账按钮禁用。
3. 结账：`CheckoutScreen` 下单成功后把订单 ID 交给导航，进入 `order/{id}`。
4. `CartViewModel.preload(sku)` 向伴生对象的私有列表 `pending` 追加 SKU。本次源码中未见对 `pending` 的读取。

### 待核实的风险（源码可见，但未在运行时验证）

- `items` 是普通 `mutableListOf`，不是可观察状态。`CartScreen` 在组合时读取 `total()`，源码中未见变更通知，列表变化能否触发重组需核实。
- `CartScreen` 与 `ProductDetailScreen` 各自以默认 `viewModel()` 取得 `CartViewModel`，源码未显式指定 `ViewModelStoreOwner`。两屏是否共享同一购物车实例需核实。
- `addItem` 先本地追加再异步请求，源码中未见请求失败的回滚或错误处理。
- 购物车满 20 件时 `addItem` 返回 `false`，`ProductDetailScreen` 忽略该返回值，用户无提示。
- `preload` 写入的 `pending` 无读取点，可能是遗留代码。

## testID 与测试要点

| testID | 位置 | 所在界面 | 说明 |
|---|---|---|---|
| `cart_total` | `apps/shop-android/app/src/main/java/com/minishop/ui/cart/CartScreen.kt:16` | 购物车 | 文本 `Items: N` |
| `cart_checkout` | `apps/shop-android/app/src/main/java/com/minishop/ui/cart/CartScreen.kt:17` | 购物车 | 结账按钮，`total() == 0` 时禁用 |
| `checkout_submit` | `apps/shop-android/app/src/main/java/com/minishop/ui/checkout/CheckoutScreen.kt:22` | 结账 | 下单按钮 `Place order` |
| `order_status` | `apps/shop-android/app/src/main/java/com/minishop/ui/order/OrderDetailScreen.kt:14` | 订单详情 | 文本 `Order placed` |
| `add_to_cart` | `apps/shop-android/app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt:21` | 商品详情 | 加购按钮，商品加载前点击无效果 |

测试要点：

- 购物车初始为空时，`cart_checkout` 应不可用。
- 商品详情加购 N 次后进入购物车，`cart_total` 应显示 N（需先核实风险 2）。
- 加购到第 21 次时计数不应增加（上限 `MAX_CART_ITEMS = 20`）。
- 结账成功后应进入订单详情，并可见 `order_status`。

## 相关页面

- [购物车功能页](../features/cart.md)、[结账功能页](../features/checkout.md)、[订单详情功能页](../features/order_detail.md)、[商品详情功能页](../features/product_detail.md)
- [Android 路由事实](../../facts/android/routes.md)、[Android testID 事实](../../facts/android/testids.md)
- [Products view model](products-view-model.md)
- [Login view model](login-view-model.md)
- [Data](data.md)

<!-- kb:symbols -->
## 符号表

| 符号 | kind | 签名 | 位置 |
|---|---|---|---|
| `MiniShopNavHost` | composable | `@Composable fun MiniShopNavHost()` | `apps/shop-android/app/src/main/java/com/minishop/navigation/MiniShopNavHost.kt:17-43` |
| `Routes` | object | `object Routes` | `apps/shop-android/app/src/main/java/com/minishop/navigation/Routes.kt:4-11` |
| `CartScreen` | composable | `@Composable fun CartScreen(onCheckout: () -> Unit, onBack: () -> Unit, vm: CartViewModel = viewModel())` | `apps/shop-android/app/src/main/java/com/minishop/ui/cart/CartScreen.kt:12-19` |
| `CartViewModel` | class | `class CartViewModel : ViewModel()` | `apps/shop-android/app/src/main/java/com/minishop/ui/cart/CartViewModel.kt:11-31` |
| `CheckoutScreen` | composable | `@Composable fun CheckoutScreen(onOrderPlaced: (String) -> Unit, onBack: () -> Unit)` | `apps/shop-android/app/src/main/java/com/minishop/ui/checkout/CheckoutScreen.kt:15-25` |
| `MiniShopTopBar` | composable | `@Composable fun MiniShopTopBar(title: String, onBack: (() -> Unit)? = null)` | `apps/shop-android/app/src/main/java/com/minishop/ui/components/MiniShopTopBar.kt:12-22` |
| `OrderDetailScreen` | composable | `@Composable fun OrderDetailScreen(id: String, onBack: () -> Unit)` | `apps/shop-android/app/src/main/java/com/minishop/ui/order/OrderDetailScreen.kt:10-16` |
| `ProductDetailScreen` | composable | `@Composable fun ProductDetailScreen(id: String, onBack: () -> Unit, vm: ProductsViewModel = viewModel(), cart: CartViewModel = viewModel())` | `apps/shop-android/app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt:14-23` |
<!-- /kb:symbols -->

<!-- kb:routes -->
## 相关功能页

- [cart](../features/cart.md)
- [checkout](../features/checkout.md)
- [order_detail](../features/order_detail.md)
- [product_detail](../features/product_detail.md)
<!-- /kb:routes -->

<!-- kb:sources -->
Sources: `apps/shop-android/app/src/main/java/com/minishop/navigation/MiniShopNavHost.kt:17-43` · `apps/shop-android/app/src/main/java/com/minishop/navigation/Routes.kt:4-11` · `apps/shop-android/app/src/main/java/com/minishop/ui/cart/CartScreen.kt:12-19` · `apps/shop-android/app/src/main/java/com/minishop/ui/cart/CartViewModel.kt:11-31` · `apps/shop-android/app/src/main/java/com/minishop/ui/checkout/CheckoutScreen.kt:15-25` · `apps/shop-android/app/src/main/java/com/minishop/ui/components/MiniShopTopBar.kt:12-22` · `apps/shop-android/app/src/main/java/com/minishop/ui/order/OrderDetailScreen.kt:10-16` · `apps/shop-android/app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt:14-23`
<!-- /kb:sources -->
