# ADR 0001：三端统一路由表

状态：已接受

## 决策

- 三端使用同一套 route pattern：`login`、`products`、`product/{id}`、`cart`、`checkout`、`order/{id}`。
- HarmonyOS 使用 Navigation 系统路由表 `router_map.json`（buildFunction 形如 `ProductDetailBuilder`），不再使用 `main_pages.json` 承载业务页面。
- 所有页面 MUST 支持 `minishop://<pattern>` 深链，并支持测试参数 `?token=<t>&cart=<sku,sku>` 注入状态。
