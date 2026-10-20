# codewiki demo summary

- mode: `claude` (bootstrap writer: `template`)
- date (UTC): 20261020T170141Z
- repo: `demo/output/<run>/repo` (temp git repo, branch master)
- kb: `kb 0.1.0`

## Ingest

Discovered docs: 8 (adr=1, agent-guide=1, design=1, doc=2, readme=1, spec=2)

Claims: conflict=8, unverifiable=2, verified=18

Conflicts (code wins):

- **LOGIN-R2.2** (.kiro/specs/login/requirements.md): WHEN the user taps `login_submit` with an empty username THEN the system SHALL show an SMS verification dialog.
  - [llm] 用户名为空时 LoginViewModel.login 仅设置 error=invalid_credentials 并返回 false，代码中没有短信验证弹窗。; testID `login_submit` 存在
- **CART-43567f** (docs/legacy/cart.md): 购物车最多 10 件商品（常量 `MAX_CART_ITEMS`，iOS 为 `maxCartItems`）。
  - [llm] 代码中上限为 Android 50、Harmony 50、iOS 99，而非文档所写的 10。; 代码中 `CartViewModel.MAX_CART_ITEMS` = 50（android），文档写的是 10; 代码中 `MAX_CART_ITEMS` = 50（harmony），文档写的是 10; 代码中 `CartViewModel.maxCartItems` = 99（ios），文档写的是 10
- **CART-7d3eb7** (docs/legacy/cart.md): 下单接口为 `POST /api/order/create`，成功后进入订单详情 `minishop://order/{id}`。
  - [llm] 下单接口实际为 POST /api/orders 而非 /api/order/create；订单详情深链 minishop://order/{id} 存在。; 接口 `POST /api/order/create` 在代码中不存在; deeplink `minishop://order/{id}` 存在
- **LOGIN-4dbfba** (docs/legacy/login.md): 登录使用手机号 + 短信验证码：先调用 `POST /api/sms/send` 发送验证码，再调用 `POST /api/login` 校验。
  - [llm] 登录仅使用用户名+密码调用 POST /api/login，代码中没有 /api/sms/send 或短信验证码流程。; 接口 `POST /api/sms/send` 在代码中不存在; 接口 `POST /api/login` 存在（android, harmony, ios）
- **LOGIN-e5f114** (docs/legacy/login.md): 会话 token 由 `SessionManager.saveToken()` 持久化。
  - [llm] 代码中不存在 SessionManager，token 实际由 TokenStore.save 保存。; 符号 `SessionManager.saveToken()` 在代码中不存在（类型 `SessionManager` 也不存在）
- **PLAN-3e24ef** (specs/001-cart/plan.md): 三端共享上限常量，接口 `POST /api/cart`。
  - [llm] 三端均调用 POST /api/cart，但上限常量各自定义且值不同（Android 50、Harmony 50、iOS 99），并非共享。; 接口 `POST /api/cart` 存在（android, harmony, ios）
- **FR-002** (specs/001-cart/spec.md): The cart MUST hold at most 99 items (`MAX_CART_ITEMS`).
  - [llm] Android 与 Harmony 的 MAX_CART_ITEMS 均为 50，而非 99（iOS maxCartItems 为 99）。; 代码中 `CartViewModel.MAX_CART_ITEMS` = 50（android），文档写的是 99; 代码中 `MAX_CART_ITEMS` = 50（harmony），文档写的是 99
- **FR-004** (specs/001-cart/spec.md): Users MUST be able to apply a coupon code at checkout (`POST /api/coupons/apply`).
  - [llm] 代码中不存在 POST /api/coupons/apply 接口，也没有优惠券相关 UI。; 接口 `POST /api/coupons/apply` 在代码中不存在

## Compounds

| step | mode | tasks | stale before | verify |
|---|---|---|---|---|
| initial | full | 10 | - | PASS |
| 01-cart-limit | incremental | 3 | 5 | PASS |
| 02-arkts-api-rename | incremental | 4 | 7 | PASS |
| 03-profile-route | incremental | 4 | 13 | PASS |

### 05-01-cart-limit

```
diff: base 4e93a3f → head ad013ce
diff:   unchanged  212
diff:   body       2
diff:   signature  0
diff:   added      0
diff:   deleted    0
status(before): stale facts/requirements.json (4 anchors: CartViewModel.MAX_CART_ITEMS, MAX_CART_ITEMS, CartViewModel.MAX_CART_ITEMS, …+1)
status(before): stale pages/_conflicts.md (2 anchors: CartViewModel.MAX_CART_ITEMS, MAX_CART_ITEMS)
status(before): stale pages/features/cart.md (1 anchors: CartViewModel.MAX_CART_ITEMS)
status(before): stale pages/features/product_detail.md (1 anchors: CartViewModel.MAX_CART_ITEMS)
status(before): stale pages/parity.md (generated facts out of date)
  t01-_conflicts recheck pages/_conflicts.md            write_set=[.kb/ingest/verdicts.json] reasons=[anchor_body_changed:CartViewModel.MAX_CART_ITEMS, anchor_body_changed:MAX_CART_ITEMS]
  t02-features-cart update  pages/features/cart.md         write_set=[pages/features/cart.md] reasons=[anchor_body_changed:CartViewModel.MAX_CART_ITEMS]
  t03-features-product_detail update  pages/features/product_detail.md write_set=[pages/features/product_detail.md] reasons=[anchor_body_changed:CartViewModel.MAX_CART_ITEMS]
  task t01-_conflicts               ok       cmd 
  task t02-features-cart            ok       cmd 
  task t03-features-product_detail  ok       template 
verify PASS: 23 pages, 341 anchors, 0 errors, 0 warnings
```

### 06-02-arkts-api-rename

```
diff: base ad013ce → head 56ad681
diff:   unchanged  208
diff:   body       4
diff:   signature  1
diff:   added      0
diff:   deleted    0
status(before): stale facts/apis.json (generated facts out of date)
status(before): stale facts/harmony/apis.md (generated facts out of date)
status(before): stale facts/requirements.json (4 anchors: ProductDetailPage.build, CartStore, ProductDetailPage.build, …+1)
status(before): stale pages/_conflicts.md (2 anchors: CartStore, ProductDetailPage.build)
status(before): stale pages/concepts/shared-components.md (1 anchors: Api)
status(before): stale pages/features/product_detail.md (2 anchors: CartStore.addItem, ProductDetailPage.build)
status(before): stale pages/features/products.md (2 anchors: Api.loadProducts, ProductsPage.aboutToAppear)
  t01-_conflicts recheck pages/_conflicts.md            write_set=[.kb/ingest/verdicts.json] reasons=[anchor_body_changed:CartStore, anchor_body_changed:ProductDetailPage.build]
  t02-concepts-shared-components update  pages/concepts/shared-components.md write_set=[pages/concepts/shared-components.md] reasons=[anchor_body_changed:Api]
  t03-features-product_detail update  pages/features/product_detail.md write_set=[pages/features/product_detail.md] reasons=[anchor_signature_changed:CartStore.addItem, anchor_body_changed:ProductDetailPage.build]
  t04-features-products update  pages/features/products.md     write_set=[pages/features/products.md] reasons=[anchor_renamed:Api.loadProducts, anchor_body_changed:ProductsPage.aboutToAppear, anchor_added:Api.fetchProducts]
  task t01-_conflicts               ok       cmd 
  task t02-concepts-shared-components ok       cmd 
  task t03-features-product_detail  ok       template 
  task t04-features-products        ok       template 
verify PASS: 23 pages, 337 anchors, 0 errors, 0 warnings
```

### 07-03-profile-route

```
diff: base 56ad681 → head ad4e3b0
diff:   unchanged  210
diff:   body       4
diff:   signature  0
diff:   added      10
diff:   deleted    0
status(before): stale facts/android/routes.md (generated facts out of date)
status(before): stale facts/android/symbols.md (generated facts out of date)
status(before): stale facts/android/testids.md (generated facts out of date)
status(before): stale facts/harmony/routes.md (generated facts out of date)
status(before): stale facts/harmony/symbols.md (generated facts out of date)
status(before): stale facts/harmony/testids.md (generated facts out of date)
status(before): stale facts/ios/routes.md (generated facts out of date)
status(before): stale facts/ios/symbols.md (generated facts out of date)
status(before): stale facts/ios/testids.md (generated facts out of date)
status(before): stale facts/routes.json (generated facts out of date)
status(before): stale facts/testids.json (generated facts out of date)
status(before): stale pages/concepts/navigation.md (3 anchors: MiniShopNavHost, Routes, Route)
status(before): stale pages/parity.md (generated facts out of date)
  t01-concepts-navigation update  pages/concepts/navigation.md   write_set=[pages/concepts/navigation.md] reasons=[anchor_body_changed:MiniShopNavHost, anchor_body_changed:Routes, anchor_body_changed:Route, anchor_added:Routes.PROFILE, …+2]
  t02-concepts-shared-components update  pages/concepts/shared-components.md write_set=[pages/concepts/shared-components.md] reasons=[anchor_added:LoginResponse.token, anchor_added:TokenStore.token]
  t03-features-profile create  pages/features/profile.md      write_set=[pages/features/profile.md] reasons=[route_added]
  t04-overview update  pages/overview.md              write_set=[pages/overview.md] reasons=[route_set_changed]
  task t01-concepts-navigation      ok       cmd 
  task t02-concepts-shared-components ok       cmd 
  task t03-features-profile         ok       template 
  task t04-overview                 ok       template 
verify PASS: 24 pages, 356 anchors, 0 errors, 0 warnings
```

## Parity（三端一致性）

Gaps after the last merge: 1; constants that differ across platforms:

- `max_cart_items`: android=50, harmony=50, ios=99

## Queries

```
 15.0 page   features/cart  购物车（cart）
       # 购物车（cart） ## 概述 购物车页展示当前商品数量（`Items: N
 10.0 page   _conflicts  文档核对（冲突与已验证断言）
       [docs/legacy/cart.md](../raw/docs/docs/legacy/cart.md) L3）购物车最多 10 件商品（常量 `MAX_CART_ITEMS`，iOS 为 `maxCartItems`）
  3.0 page   concepts/shared-components  共享组件
       nav_back`（见下文“testID 与测试要点”）。 - **购物车状态**：购物车列表在 Android（`items`）与 iOS（`CartViewMo
  1.0 page   concepts/navigation  导航与深链
       /products?token=<t>&cart=<sku,sku>` 一次完成登录态与购物车预置，再落到目标页。 - 验证 `product/{id}`、`order/{id}` 两
```

```
file android/app/src/main/java/com/minishop/ui/cart/CartViewModel.kt
pages (4):
  pages/_conflicts.md — 文档核对（冲突与已验证断言） [current] anchors=2
  pages/concepts/shared-components.md — 共享组件 [current] anchors=1
  pages/features/cart.md — 购物车（cart） [current] anchors=5
  pages/features/product_detail.md — 商品详情（product_detail） [current] anchors=5
symbols (7):
  L10   class      android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel
  L23   property   android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.MAX_CART_ITEMS
  L13   function   android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.addItem
  L11   property   android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.items
  L24   property   android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.pending
```

Final verify: PASS — 24 pages, 356 anchors.

Files: see `claude-final/` (numbered by step); the final wiki is in `repo/wiki/`.
