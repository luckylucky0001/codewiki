---
id: _conflicts
title: 文档核对（冲突与已验证断言）
kind: conflicts
sources:
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.addToCart
    hash: 04fc4a76c52c7def97e7e7e8c75b25f3609ef967500beb8ffe9b5b493a46ad02
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.createOrder
    hash: 16dddab20b7b2f5889cfa94f4855b4859621c873dce95bbfd7c3f540e8d5a39e
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.getProduct
    hash: aec1ad5dda84abee9cd40ac64626e5c14c13d9d6063352d0d6a1b1e1a0b04cbd
  - sym: android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.login
    hash: 16d311d2a6158c5d17707cadc88b03bbe10eb3bc49d630600109bbafc5d030d8
  - sym: android://app/src/main/java/com/minishop/data/TokenStore.java#TokenStore.save
    hash: 3cae2cf4e99a8abfdeb5a42e53b6a5ad84baeb843fdb390e10684ac9af6457ce
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen
    hash: 298d51bd3abcc95697e472891f857dc8c47d1824e744b533c7f259aa56776ab1
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel
    hash: 0cc2ef4b4d87270da9c0d1c4190a5204f22d91b75fc765e6bf1143d689a38c4d
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.MAX_CART_ITEMS
    hash: c874d1a813b4bf8aa6817442999368d7da32979bf689f785a5cea94c2ca423bb
  - sym: android://app/src/main/java/com/minishop/ui/checkout/CheckoutScreen.kt#CheckoutScreen
    hash: 1940402765a35c64188391d26cfe364248f8ccbf9b3cd29e06a3b2d7e30a77a1
  - sym: android://app/src/main/java/com/minishop/ui/components/MiniShopTopBar.kt#MiniShopTopBar
    hash: a950939b071b355f1752ab5ba76842b203ccc17a22905e00e98b7cce1f172af5
  - sym: android://app/src/main/java/com/minishop/ui/login/LoginScreen.kt#LoginScreen
    hash: d844335d42fe1a03de8c3fd18fd336b466dda45abb8ca96a36a76086e01ac7bd
  - sym: android://app/src/main/java/com/minishop/ui/login/LoginViewModel.kt#LoginViewModel.login
    hash: 95656a4f2c6e87d65125d80b8512d39d72353bab4897e6fe1a3b5c23a3b76270
  - sym: android://app/src/main/java/com/minishop/ui/order/OrderDetailScreen.kt#OrderDetailScreen
    hash: 43c083aed2c3505314ce1e096e54315d235c069cd2ae327cdca4a5e8d88008a7
  - sym: android://app/src/main/java/com/minishop/ui/products/ProductDetailScreen.kt#ProductDetailScreen
    hash: c2ac000c4398a6bf1761eb93ef5fd5c40f47d53e0fa5cd16b9a8c18a2242f261
  - sym: android://app/src/main/java/com/minishop/ui/products/ProductsScreen.kt#ProductsScreen
    hash: 3c528d5681374370c401fbbeaf2a52ced005d647684229c0838372146d458993
  - sym: harmony://entry/src/main/ets/common/Api.ets#Api.addToCart
    hash: 2ba9b9e96f64cd43188e28c0cb0ce068718daeb724decbed662b193352e8d65e
  - sym: harmony://entry/src/main/ets/common/Api.ets#Api.createOrder
    hash: b4ac085d45415e75d5d9157f62d8918021490b4203ced3aef25a71b76ac45462
  - sym: harmony://entry/src/main/ets/common/Api.ets#Api.loadProduct
    hash: f4de4914781b649378fafa141d22475f8206203a2886b6e36659e5dcb7d10e90
  - sym: harmony://entry/src/main/ets/common/Api.ets#Api.login
    hash: 97c03ac531110f5db09c79111053b250cf9de6679324f0cd54a9bc72cb56a77d
  - sym: harmony://entry/src/main/ets/common/BackButton.ets#BackButton.build
    hash: 5cae89833567b94193783e6c5af6291bbc6dc8a7382e594697c5485f0c6d578e
  - sym: harmony://entry/src/main/ets/common/CartStore.ets#CartStore
    hash: d67098d2ec8e95a4e79fe9e227f84c3185324ceca07f4f78caeaa93e8ba45ad9
  - sym: harmony://entry/src/main/ets/common/CartStore.ets#MAX_CART_ITEMS
    hash: 6e9d5bcb94a54206cacbef1ca2eef4a96f65e32eaf10437f6257dc231ce1ce0c
  - sym: harmony://entry/src/main/ets/common/TokenStore.ets#TokenStore.save
    hash: 7dddfca852f01d7d973f86ae3e2887090838eaf6839d883ed9b44b71ee4896bd
  - sym: harmony://entry/src/main/ets/pages/CartPage.ets#CartBuilder
    hash: 4329e34be7212fc1576c50d1d48e31a539790b92df2c88a26cfde1d32274d603
  - sym: harmony://entry/src/main/ets/pages/CartPage.ets#CartPage.build
    hash: 21d9a3829e98fea009f4723757981bcdb85ad8569734a2938ced0b316a126125
  - sym: harmony://entry/src/main/ets/pages/LoginPage.ets#LoginPage.build
    hash: 8ec8756bc0a9562d2af5fbc26b1364b178df3365b8430d06becc3287917b3f8d
  - sym: harmony://entry/src/main/ets/pages/OrderDetailPage.ets#OrderDetailPage.build
    hash: 6647881d72838f0dadd93e4107052796a80280a72322d6db7eb5d42e65d5d89b
  - sym: harmony://entry/src/main/ets/pages/ProductDetailPage.ets#ProductDetailPage.build
    hash: 1ec93dcba753b8190d3523ade8c3569d465d82d692525263c07f80720a890238
  - sym: harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsBuilder
    hash: 0c195a6b69746051b92763764c47bc6679a927f5ea7792caf48c2a5884d2cb60
  - sym: harmony://entry/src/main/ets/pages/ProductsPage.ets#ProductsPage.build
    hash: 65f07a9c5edfba1adcd011820fbf9f61ccc15b2812cfa152f49957659988744e
  - sym: ios://MiniShop/Components/BackButton.swift#BackButton.body
    hash: a98e27bdf2b7598556a38db6c2a3124dfd935858218baa2ae19751dd87c4cb19
  - sym: ios://MiniShop/Features/Cart/CartView.swift#CartView
    hash: d47d57d059273a31af207e5d5bb372ec0c897bd5da8005b3f15971f95ef12cbf
  - sym: ios://MiniShop/Features/Cart/CartView.swift#CartView.body
    hash: 675fc35157f25a42b23fa2b4d7b40139077431c04f91673ae966060db549724c
  - sym: ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel
    hash: 65d4b59b92a139ca7ea4742ffa1e5299dfe378c0230f71e77310f7037ef91439
  - sym: ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.addItem
    hash: 88c93466d1e406c1684b1237c4f216e37932aa5f2b8974f54189fa78f10a2d09
  - sym: ios://MiniShop/Features/Cart/CartViewModel.swift#CartViewModel.maxCartItems
    hash: 85c19669f1a943ad960ceb03fa3da6c605712ca32e18838415b0cddf2aff8d4f
  - sym: ios://MiniShop/Features/Login/LoginView.swift#LoginView.body
    hash: 8b6a7f3eb1b970c92a4e12ebecc245eca3b3351b8e40760349dbf7d55c411004
  - sym: ios://MiniShop/Features/Login/LoginViewModel.swift#LoginViewModel.login
    hash: c7a114bae2e4a6dd1df9f051017b9ec3966962fecbe46f60d258cb0c33f36ed8
  - sym: ios://MiniShop/Features/Products/ProductsView.swift#ProductsView
    hash: 6e3105782171131b6e0b10a2bf13398e154dbe6c66ed58445b6a5db3f2792280
  - sym: ios://MiniShop/Features/Products/ProductsView.swift#ProductsView.body
    hash: 7a64a7d803afea6b7b33b92e965f69ab18a0ec34476e5c0d8d8b2584cb8e1cc4
  - sym: ios://MiniShop/Features/Products/ProductsViewModel.swift#ProductsViewModel.loadProduct
    hash: 745aa82c439b155cd921a3ff09c785faed15a4b24560c9f29a8953cf85972c04
source_commit: 95f7b7c
status: current
---
# 文档核对：冲突与已验证断言

> 代码为准（code wins）。本页由 `kb ingest` / `kb compound` 根据 `raw/docs/` 中的文档逐条核对生成；机器可读版本见 [facts/requirements.json](../facts/requirements.json)。

| 状态 | 数量 |
|---|---|
| conflict（与代码冲突） | 7 |
| verified（有代码锚点） | 18 |
| unverifiable（无证据，不提升为知识） | 3 |

## 冲突 conflicts（文档已过时，以代码为准）

- **LOGIN-R2.2** （[.kiro/specs/login/requirements.md](../raw/docs/.kiro/specs/login/requirements.md) L26）WHEN the user taps `login_submit` with an empty username THEN the system SHALL show an SMS verification dialog.
  - 证据：[llm] 用户名为空时 LoginViewModel.login 仅设置 invalid_credentials 并返回 false，没有任何短信验证对话框。；testID `login_submit` 存在
- **CART-43567f** （[docs/legacy/cart.md](../raw/docs/docs/legacy/cart.md) L3）购物车最多 10 件商品（常量 `MAX_CART_ITEMS`，iOS 为 `maxCartItems`）。
  - 证据：[llm] 三端购物车上限常量实际均为 50，而非文档所写的 10。；代码中 `CartViewModel.MAX_CART_ITEMS` = 50（android），文档写的是 10；代码中 `MAX_CART_ITEMS` = 50（harmony），文档写的是 10；代码中 `CartViewModel.maxCartItems` = 50（ios），文档写的是 10
- **CART-7d3eb7** （[docs/legacy/cart.md](../raw/docs/docs/legacy/cart.md) L6）下单接口为 `POST /api/order/create`，成功后进入订单详情 `minishop://order/{id}`。
  - 证据：[llm] 代码中的下单接口是 POST /api/orders，不存在 POST /api/order/create；订单详情路由 minishop://order/{id} 存在。；接口 `POST /api/order/create` 在代码中不存在；deeplink `minishop://order/{id}` 存在
- **LOGIN-4dbfba** （[docs/legacy/login.md](../raw/docs/docs/legacy/login.md) L3）登录使用手机号 + 短信验证码：先调用 `POST /api/sms/send` 发送验证码，再调用 `POST /api/login` 校验。
  - 证据：[llm] 登录直接以 username + password 调用 POST /api/login，代码中没有 POST /api/sms/send 与短信验证码流程。；接口 `POST /api/sms/send` 在代码中不存在；接口 `POST /api/login` 存在（android, harmony, ios）
- **LOGIN-e5f114** （[docs/legacy/login.md](../raw/docs/docs/legacy/login.md) L7）会话 token 由 `SessionManager.saveToken()` 持久化。
  - 证据：[llm] 代码中不存在 SessionManager，token 实际由 TokenStore.save 持久化。；符号 `SessionManager.saveToken()` 在代码中不存在（类型 `SessionManager` 也不存在）
- **FR-002** （[specs/001-cart/spec.md](../raw/docs/specs/001-cart/spec.md) L22）The cart MUST hold at most 99 items (`MAX_CART_ITEMS`).
  - 证据：[llm] MAX_CART_ITEMS 在代码中为 50，而非文档所写的 99。；代码中 `CartViewModel.MAX_CART_ITEMS` = 50（android），文档写的是 99；代码中 `MAX_CART_ITEMS` = 50（harmony），文档写的是 99
- **FR-004** （[specs/001-cart/spec.md](../raw/docs/specs/001-cart/spec.md) L24）Users MUST be able to apply a coupon code at checkout (`POST /api/coupons/apply`).
  - 证据：[llm] 代码中不存在 POST /api/coupons/apply，也没有优惠券相关实现。；接口 `POST /api/coupons/apply` 在代码中不存在

## 已验证 verified

- **LOGIN-R1.1** （[.kiro/specs/login/requirements.md](../raw/docs/.kiro/specs/login/requirements.md) L15）WHEN the user submits valid credentials THEN the system SHALL call `POST /api/login` and navigate to `products`.
  - 证据：[llm] 登录调用 POST /api/login，成功后 LoginScreen 触发 onLoggedIn 跳转到 products 路由。；接口 `POST /api/login` 存在（android, harmony, ios）；路由 `products` 存在
- **LOGIN-R1.2** （[.kiro/specs/login/requirements.md](../raw/docs/.kiro/specs/login/requirements.md) L16）WHEN the password is shorter than 6 characters THEN the system SHALL reject the login without calling the backend.
  - 证据：[llm] LoginViewModel.login 在 password.length < 6 时先返回 false 并设置 invalid_credentials，不会调用 ApiClient.service.login。；没有可确定性校验的锚点（需要 LLM 语义核对）
- **LOGIN-R1.3** （[.kiro/specs/login/requirements.md](../raw/docs/.kiro/specs/login/requirements.md) L17）WHEN login succeeds THEN the system SHALL persist the token via `TokenStore.save`.
  - 证据：[llm] 登录成功后 LoginViewModel.login 调用 TokenStore.getInstance().save(resp.token) 保存 token。；符号 `TokenStore.save` 存在（3 处）
- **PRODUCT-4d19f5** （[.kiro/steering/product.md](../raw/docs/.kiro/steering/product.md) L4）All platforms MUST expose identical testIDs such as `nav_back` and `product_list`.
  - 证据：[llm] 三端均暴露 nav_back 与 product_list 这两个 testID。；testID `nav_back` 存在；testID `product_list` 存在
- **0001-NAVIGATION-5c8d9b** （[docs/adr/0001-navigation.md](../raw/docs/docs/adr/0001-navigation.md) L7）三端使用同一套 route pattern：`login`、`products`、`product/{id}`、`cart`、`checkout`、`order/{id}`。
  - 证据：[llm] 三端的 deeplink 模式一致：login、products、product/{id}、cart、checkout、order/{id}。；路由 `login` 存在；路由 `products` 存在；路由 `product/{id}` 存在；路由 `cart` 存在；路由 `checkout` 存在；路由 `order/{id}` 存在
- **CART-cbf050** （[docs/legacy/cart.md](../raw/docs/docs/legacy/cart.md) L4）加入购物车调用 `POST /api/cart`，按钮 testID 为 `add_to_cart`。
  - 证据：[llm] 加入购物车按钮 testID 为 add_to_cart，最终调用 POST /api/cart。；接口 `POST /api/cart` 存在（android, harmony, ios）；testID `add_to_cart` 存在
- **CART-9b9a98** （[docs/legacy/cart.md](../raw/docs/docs/legacy/cart.md) L5）购物车页路由为 `cart`，结算按钮 testID 为 `cart_checkout`。
  - 证据：[llm] 购物车页路由为 cart，结算按钮 testID 为 cart_checkout。；路由 `cart` 存在；testID `cart_checkout` 存在
- **CART-9509ed** （[docs/legacy/cart.md](../raw/docs/docs/legacy/cart.md) L7）商品详情接口为 `GET /api/products/{id}`。
  - 证据：[llm] 三端均通过 GET /api/products/{id} 获取商品详情。；接口 `GET /api/products/{id}` 存在（android, harmony, ios）
- **LOGIN-514629** （[docs/legacy/login.md](../raw/docs/docs/legacy/login.md) L4）登录页的输入框 testID 为 `login_username`、`login_password`，提交按钮为 `login_submit`。
  - 证据：[llm] 登录页包含 login_username、login_password、login_submit 三个 testID。；testID `login_username` 存在；testID `login_password` 存在；testID `login_submit` 存在
- **LOGIN-974e57** （[docs/legacy/login.md](../raw/docs/docs/legacy/login.md) L5）登录成功后跳转到商品列表 `minishop://products`。
  - 证据：[llm] 登录成功后触发 onLoggedIn 跳转到 products 路由（minishop://products）。；deeplink `minishop://products` 存在
- **LOGIN-120849** （[docs/legacy/login.md](../raw/docs/docs/legacy/login.md) L6）登录逻辑集中在 `LoginViewModel.login` 中。
  - 证据：[llm] Android 与 iOS 的登录逻辑集中在 LoginViewModel.login（HarmonyOS 则在 Api.login 与页面中）。；符号 `LoginViewModel.login` 存在（2 处）
- **PLAN-404208** （[specs/001-cart/plan.md](../raw/docs/specs/001-cart/plan.md) L3）Android: `CartViewModel` (Compose + ViewModel)；iOS: `CartViewModel` (ObservableObject)；HarmonyOS: `CartStore`。
  - 证据：[llm] Android/iOS 的购物车状态在 CartViewModel，HarmonyOS 在 CartStore。；符号 `CartViewModel` 存在（2 处）；符号 `CartViewModel` 存在（2 处）；符号 `CartStore` 存在（1 处）
- **PLAN-3e24ef** （[specs/001-cart/plan.md](../raw/docs/specs/001-cart/plan.md) L4）三端共享上限常量，接口 `POST /api/cart`。
  - 证据：[llm] 三端各自定义上限常量（取值同为 50）并均调用 POST /api/cart；“共享”指取值一致而非同一份代码。；接口 `POST /api/cart` 存在（android, harmony, ios）
- **001-CART-SPEC-503548** （[specs/001-cart/spec.md](../raw/docs/specs/001-cart/spec.md) L14）WHEN the user taps `add_to_cart` on product detail THE SYSTEM SHALL call `POST /api/cart`.
  - 证据：[llm] 点击 add_to_cart 后 cart.addItem 调用 POST /api/cart。；接口 `POST /api/cart` 存在（android, harmony, ios）；testID `add_to_cart` 存在
- **001-CART-SPEC-4d53d3** （[specs/001-cart/spec.md](../raw/docs/specs/001-cart/spec.md) L15）WHEN the cart is empty THE SYSTEM SHALL disable `cart_checkout`.
  - 证据：[llm] cart_checkout 按钮的 enabled 条件为购物车总数大于 0，空购物车时禁用。；testID `cart_checkout` 存在
- **FR-001** （[specs/001-cart/spec.md](../raw/docs/specs/001-cart/spec.md) L21）System MUST let users add a product to the cart from the product detail page (`add_to_cart`, `POST /api/cart`).
  - 证据：[llm] 商品详情页的 add_to_cart 按钮通过 POST /api/cart 加入购物车。；接口 `POST /api/cart` 存在（android, harmony, ios）；testID `add_to_cart` 存在
- **FR-003** （[specs/001-cart/spec.md](../raw/docs/specs/001-cart/spec.md) L23）Checkout MUST create an order via `POST /api/orders` and then show `order_status`.
  - 证据：[llm] 下单调用 POST /api/orders，订单详情页展示 order_status。；接口 `POST /api/orders` 存在（android, harmony, ios）；testID `order_status` 存在
- **FR-005** （[specs/001-cart/spec.md](../raw/docs/specs/001-cart/spec.md) L25）The cart page MUST be reachable via deep link `minishop://cart`.
  - 证据：[llm] 三端均注册了 cart 路由，深链为 minishop://cart。；deeplink `minishop://cart` 存在

## 无法验证 unverifiable

- **LOGIN-R2.1** （[.kiro/specs/login/requirements.md](../raw/docs/.kiro/specs/login/requirements.md) L25）WHEN the app is opened with `minishop://login?token=<t>` THEN the system SHALL store the token before rendering.
  - 证据：[llm] LoginScreen 的代码中没有处理 minishop://login?token= 的 token 参数并在渲染前存储的逻辑。；deeplink `minishop://login` 存在
- **0001-NAVIGATION-7bb06a** （[docs/adr/0001-navigation.md](../raw/docs/docs/adr/0001-navigation.md) L8）HarmonyOS 使用 Navigation 系统路由表 `router_map.json`（buildFunction 形如 `ProductDetailBuilder`），不再使用 `main_pages.json` 承载业务页面。
  - 证据：[llm] ProductDetailBuilder 存在，但 main_pages.json 仍存在且其内容未提供，无法确认其是否不再承载业务页面。；文件 `router_map.json` 存在（harmony/entry/src/main/resources/base/profile/router_map.json）；符号 `ProductDetailBuilder` 存在（1 处）；文件 `main_pages.json` 存在（harmony/entry/src/main/resources/base/profile/main_pages.json）
- **0001-NAVIGATION-ad00b5** （[docs/adr/0001-navigation.md](../raw/docs/docs/adr/0001-navigation.md) L9）所有页面 MUST 支持 `minishop://<pattern>` 深链，并支持测试参数 `?token=<t>&cart=<sku,sku>` 注入状态。
  - 证据：[llm] 所给代码中没有 ?token=&cart= 测试参数注入的实现，也无法确认所有页面都支持深链。；没有可确定性校验的锚点（需要 LLM 语义核对）
