# MiniShop 客户端技术说明（v1.3 整理稿）

> 本文由客户端组根据历次评审纪要与 Wiki 旧页面合并整理，供新同学入职与测试同学编写用例参考。
> 部分内容来自早期方案，若与线上行为不一致，请以代码为准并在群里反馈。

## 1. 背景

MiniShop 是公司内部用于验证三端（Android、iOS、HarmonyOS）一致性的电商样板应用，覆盖登录、商品浏览、购物车、结算、订单详情这条主链路。三端由同一个小组维护，需求评审时统一过一遍交互稿。

## 2. 接口约定

后端域名原计划由网关下发，目前仍写死在客户端代码里。三端 API 基础地址必须统一为 `https://api.minishop.example`。

| 场景 | 约定 |
|---|---|
| 账号登录 | 客户端 MUST 通过 `POST /api/login` 登录，请求体字段为 `username` 和 `password` |
| 商品详情 | 进入详情页时 MUST 调用 `GET /api/products/{id}` 拉取商品信息 |
| 创建订单 | 下单 MUST 调用 `POST /api/order/create`，返回订单号 |

补充说明：

- 加入购物车时客户端调用 `POST /api/cart`，每次请求的 `quantity` 固定为 1。
- `GET /api/products` 支持通过 `category` 参数按类目筛选商品，首页类目 Tab 依赖此能力。
- 下单请求体中的 `paymentMethod` 目前在三端都写死为 `card`。
- iOS 端 `APIClient.send` 在已有 token 时会为请求附加 `Authorization: Bearer <token>` 请求头。
- Android 与鸿蒙端在所有业务请求上都会附带 `Authorization: Bearer` 请求头。

## 3. 登录与会话

1. Android 端的 token 由 Java 类 `TokenStore` 管理，通过单例 `TokenStore.getInstance()` 访问（历史原因保留 Java 实现）。
2. 登录成功后跳转商品列表页，鸿蒙端使用 `replacePathByName` 替换登录页，避免返回到登录页。

为保证重启后免登录，token 必须落盘持久化：iOS 端写入 Keychain，Android 端写入 `SharedPreferences`。

WHEN 用户名或密码校验不通过 THE SYSTEM SHALL 弹出 Toast 提示“用户名或密码错误”并清空 `login_password` 输入框。

WHEN 鸿蒙应用不是通过深链启动 THE SYSTEM SHALL 在已登录时进入 `products` 页面，未登录时进入 `login` 页面。

安全合规：账号连续 5 次登录失败后，服务端 MUST 锁定该账号 15 分钟（由账号中台实现，客户端无感知）。

## 4. 商品与购物车

- 商品列表页提供购物车入口，testID 为 `tab_cart`，点击后进入 `cart` 页面。
- 商品详情页加购按钮的 testID 为 `add_cart_button`。
- 三端商品详情页均展示商品标题和价格（价格字段 `price`）。
- 购物车最多容纳 50 件商品，达到上限后 `add_to_cart` 按钮置灰。

商品主图由运营同学在 CMS 后台上传，图片尺寸 MUST 为 800x800，且单张不超过 200KB。

## 5. 结算与订单

WHEN 用户在结算页点击 `checkout_submit` THE SYSTEM SHALL 调用 `POST /api/orders`，成功后跳转到订单详情页 `order/{id}`。

结算页 MUST 允许用户在 `card`、`alipay`、`wechat` 三种支付方式中选择，并作为 `paymentMethod` 提交。

订单创建后 30 分钟内未支付的，服务端 SHALL 自动关闭订单并释放库存。

用户发起退款申请后，客服团队 MUST 在 24 小时内完成审核。

## 6. 路由与深链

| 平台 | 约定 |
|---|---|
| HarmonyOS | 订单详情页 MUST 在 `router_map.json` 中注册为 `order_detail`，buildFunction 为 `OrderDetailBuilder` |
| HarmonyOS | 商品详情页 MUST 在 `router_map.json` 中使用 buildFunction `ProductDetailPageBuilder` |
| 通用 | 订单详情页 MUST 支持深链 `minishop://orders/{id}` |

## 7. 构建与发布

- Android 工程 `minSdk` 为 26。
- Android 工程 `compileSdk` 为 34。
- 新版本 MUST 先向 5% 用户灰度发布，观察 48 小时无严重崩溃后再全量。
- 线上所有接口的 P99 延迟 MUST 低于 300ms，由后端 SRE 负责监控告警。
