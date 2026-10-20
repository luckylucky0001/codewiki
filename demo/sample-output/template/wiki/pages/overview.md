---
id: overview
title: 总览
kind: overview
platforms: [android, ios, harmony]
routes: [cart, checkout, login, order_detail, product_detail, products, profile]
source_commit: c2e1c52
status: current
---
# 总览：三端路由矩阵

> 由 facts 确定性生成（`kb compound`）。每个功能页覆盖一个 `route_id`，三端共享同一 pattern 与 deeplink。

| route_id | pattern | android | ios | harmony | 页面 |
|---|---|---|---|---|---|
| `cart` | `cart` | ✓ | ✓ | ✓ | [购物车（cart）](features/cart.md) |
| `checkout` | `checkout` | ✓ | ✓ | ✓ | [结算（checkout）](features/checkout.md) |
| `login` | `login` | ✓ | ✓ | ✓ | [登录（login）](features/login.md) |
| `order_detail` | `order/{id}` | ✓ | ✓ | ✓ | [订单详情（order_detail）](features/order_detail.md) |
| `product_detail` | `product/{id}` | ✓ | ✓ | ✓ | [商品详情（product_detail）](features/product_detail.md) |
| `products` | `products` | ✓ | ✓ | ✓ | [商品列表（products）](features/products.md) |
| `profile` | `profile` | ✓ | ✓ | ✓ | [个人中心（profile）](features/profile.md) |

深链 scheme：`minishop`；测试态注入：`?token=<t>&cart=<sku,sku>`。

规模：21 条路由、39 个 testID、15 个接口调用点。三端差异见 [parity.md](parity.md)。机器可读：[routes.json](../facts/routes.json) · [testids.json](../facts/testids.json) · [apis.json](../facts/apis.json)
