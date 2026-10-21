# Index

<!-- maintained by kb (kb verify --fix-index); do not edit by hand -->

入口：[AGENTS.md](AGENTS.md)（写作规范） · [log.md](log.md)（变更日志） · `facts/*.json`（机器可读事实）

## 总览

- [总览](pages/overview.md) — routes: `MainActivity`, `RootView`, `cart`, `checkout`, `login`, `order_detail`, `product_detail`, `products`

## 三端一致性 parity（生成）

- [三端一致性（parity）](pages/parity.md)

## 功能 features

- [MainActivity](pages/features/MainActivity.md) — routes: `MainActivity`
- [RootView](pages/features/RootView.md) — routes: `RootView`
- [购物车（cart）](pages/features/cart.md) — routes: `cart`
- [结算（checkout）](pages/features/checkout.md) — routes: `checkout`
- [登录（login）](pages/features/login.md) — routes: `login`
- [订单详情（order_detail）](pages/features/order_detail.md) — routes: `order_detail`
- [商品详情（product_detail）](pages/features/product_detail.md) — routes: `product_detail`
- [商品列表（products）](pages/features/products.md) — routes: `products`

## 概念 concepts

- [导航与深链](pages/concepts/navigation.md)
- [共享组件](pages/concepts/shared-components.md)

## 事实 facts（生成）

- **android**: [apis](facts/android/apis.md) [routes](facts/android/routes.md) [symbols](facts/android/symbols.md) [testids](facts/android/testids.md)
- **ios**: [apis](facts/ios/apis.md) [routes](facts/ios/routes.md) [symbols](facts/ios/symbols.md) [testids](facts/ios/testids.md)

## 模块树 tree（L0–L3，深度 3）

- [monoshop 总览](pages/overview.md) — L0
- [minishop](pages/shop-android/overview.md) — L1 project · [索引](pages/shop-android/index.md)
- [MiniShop](pages/shop-ios/overview.md) — L1 project · [索引](pages/shop-ios/index.md)
