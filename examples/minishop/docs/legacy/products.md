# 商品与订单（旧文档）

- 商品列表 testID 为 `product_list`，单个商品为 `product_item_<id>`。
- 商品列表接口为 `GET /api/products`，支持 `page` 与 `size` 分页参数。
- 商品详情页右上角有分享按钮（testID `share_button`）。
- 下单成功后，订单状态展示在 `order_status` 上。
- 下单接口返回 `orderId` 与 `status` 字段。
