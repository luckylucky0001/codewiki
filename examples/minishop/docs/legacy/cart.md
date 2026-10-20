# 购物车与下单（旧文档）

- 购物车最多 10 件商品（常量 `MAX_CART_ITEMS`，iOS 为 `maxCartItems`）。
- 加入购物车调用 `POST /api/cart`，按钮 testID 为 `add_to_cart`。
- 购物车页路由为 `cart`，结算按钮 testID 为 `cart_checkout`。
- 下单接口为 `POST /api/order/create`，成功后进入订单详情 `minishop://order/{id}`。
- 商品详情接口为 `GET /api/products/{id}`。
