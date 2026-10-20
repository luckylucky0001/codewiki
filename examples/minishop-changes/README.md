# minishop-changes：模拟合并到 master 的变更集

每个目录是一次“合并”，`files/` 下是相对 `examples/minishop/` 的**完整替换文件**（overlay），`message.txt` 是提交信息。
`demo/run.sh` 按顺序把它们复制到临时仓库并提交到 `master`，随后运行 `kb compound`。

| 变更集 | 内容 | 期望 |
|---|---|---|
| `01-cart-limit` | 三端购物车上限 99 → 50；Android/iOS 登录 ViewModel 仅改注释与空白 | 注释变化为 no-op；上限常量 body 变化 → 商品详情/购物车页面与 `_conflicts.md` 重写；spec `FR-002`（99）变为 conflict |
| `02-arkts-api-rename` | ArkTS：`Api.loadProducts` 重命名为 `fetchProducts`（函数体不变）；`CartStore.addItem(sku)` 增加 `quantity` 参数 | diff 识别 renamed（similarity 1.0）与 signature 变化；沿引用边传播到调用方页面 |
| `03-profile-route` | 三端新增 `profile` 路由、页面与 testID | facts 新增路由；plan 生成 `create pages/features/profile.md` 并更新总览 |
