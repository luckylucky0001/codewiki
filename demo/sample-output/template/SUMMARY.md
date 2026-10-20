# codewiki demo summary

- mode: `template` (bootstrap writer: `template`)
- date (UTC): 20261020T173200Z
- repo: `demo/output/<run>/repo` (temp git repo, branch master)
- kb: `kb 0.1.0`

## Ingest

Discovered docs: 9 (adr=1, agent-guide=1, design=1, doc=3, readme=1, spec=2)

Claims: conflict=6, unverifiable=3, verified=24

Conflicts (code wins):

- **CART-43567f** (docs/legacy/cart.md): 购物车最多 10 件商品（常量 `MAX_CART_ITEMS`，iOS 为 `maxCartItems`）。
  - 代码中 `CartViewModel.MAX_CART_ITEMS` = 50（android），文档写的是 10; 代码中 `MAX_CART_ITEMS` = 50（harmony），文档写的是 10; 代码中 `CartViewModel.maxCartItems` = 99（ios），文档写的是 10
- **CART-7d3eb7** (docs/legacy/cart.md): 下单接口为 `POST /api/order/create`，成功后进入订单详情 `minishop://order/{id}`。
  - 接口 `POST /api/order/create` 在代码中不存在; deeplink `minishop://order/{id}` 存在
- **LOGIN-4dbfba** (docs/legacy/login.md): 登录使用手机号 + 短信验证码：先调用 `POST /api/sms/send` 发送验证码，再调用 `POST /api/login` 校验。
  - 接口 `POST /api/sms/send` 在代码中不存在; 接口 `POST /api/login` 存在（android, harmony, ios）
- **LOGIN-e5f114** (docs/legacy/login.md): 会话 token 由 `SessionManager.saveToken()` 持久化。
  - 符号 `SessionManager.saveToken()` 在代码中不存在（类型 `SessionManager` 也不存在）
- **FR-002** (specs/001-cart/spec.md): The cart MUST hold at most 99 items (`MAX_CART_ITEMS`).
  - 代码中 `CartViewModel.MAX_CART_ITEMS` = 50（android），文档写的是 99; 代码中 `MAX_CART_ITEMS` = 50（harmony），文档写的是 99
- **FR-004** (specs/001-cart/spec.md): Users MUST be able to apply a coupon code at checkout (`POST /api/coupons/apply`).
  - 接口 `POST /api/coupons/apply` 在代码中不存在

## Compounds

| step | mode | tasks | stale before | verify |
|---|---|---|---|---|
| initial | full | 10 | - | PASS |
| 01-cart-limit | incremental | 3 | 5 | PASS |
| 02-arkts-api-rename | incremental | 4 | 7 | PASS |
| 03-profile-route | incremental | 4 | 13 | PASS |

### 05-01-cart-limit

```
diff: base 3cb7c04 → head 47c975a
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
  t01-_conflicts recheck pages/_conflicts.md            p3 write_set=[.kb/ingest/verdicts.json] reasons=[anchor_body_changed:CartViewModel.MAX_CART_ITEMS, anchor_body_changed:MAX_CART_ITEMS]
  t02-features-cart update  pages/features/cart.md         p1 write_set=[pages/features/cart.md] reasons=[anchor_body_changed:CartViewModel.MAX_CART_ITEMS]
  t03-features-product_detail update  pages/features/product_detail.md p2 write_set=[pages/features/product_detail.md] reasons=[anchor_body_changed:CartViewModel.MAX_CART_ITEMS]
  task t01-_conflicts               ok       template 
  task t02-features-cart            ok       template 
  task t03-features-product_detail  ok       template 
verify PASS: 23 pages, 353 anchors, 0 errors, 0 warnings
```

### 06-02-arkts-api-rename

```
diff: base 47c975a → head dac9f37
diff:   unchanged  208
diff:   body       4
diff:   signature  1
diff:   added      0
diff:   deleted    0
status(before): stale facts/apis.json (generated facts out of date)
status(before): stale facts/harmony/apis.md (generated facts out of date)
status(before): stale facts/requirements.json (5 anchors: ProductDetailPage.build, Api.loadProducts, CartStore, …+2)
status(before): stale pages/_conflicts.md (3 anchors: Api.loadProducts, CartStore, ProductDetailPage.build)
status(before): stale pages/concepts/shared-components.md (1 anchors: Api)
status(before): stale pages/features/product_detail.md (2 anchors: CartStore.addItem, ProductDetailPage.build)
status(before): stale pages/features/products.md (2 anchors: Api.loadProducts, ProductsPage.aboutToAppear)
  t01-_conflicts recheck pages/_conflicts.md            p4 write_set=[.kb/ingest/verdicts.json] reasons=[anchor_renamed:Api.loadProducts, anchor_body_changed:CartStore, anchor_body_changed:ProductDetailPage.build]
  t02-concepts-shared-components update  pages/concepts/shared-components.md p3 write_set=[pages/concepts/shared-components.md] reasons=[anchor_body_changed:Api]
  t03-features-product_detail update  pages/features/product_detail.md p2 write_set=[pages/features/product_detail.md] reasons=[anchor_signature_changed:CartStore.addItem, anchor_body_changed:ProductDetailPage.build]
  t04-features-products update  pages/features/products.md     p1 write_set=[pages/features/products.md] reasons=[anchor_renamed:Api.loadProducts, anchor_body_changed:ProductsPage.aboutToAppear, anchor_added:Api.fetchProducts]
  task t01-_conflicts               ok       template 
  task t02-concepts-shared-components ok       template 
  task t03-features-product_detail  ok       template 
  task t04-features-products        ok       template 
verify PASS: 23 pages, 353 anchors, 0 errors, 0 warnings
```

### 07-03-profile-route

```
diff: base dac9f37 → head d36d971
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
  t01-concepts-navigation update  pages/concepts/navigation.md   p2 write_set=[pages/concepts/navigation.md] reasons=[anchor_body_changed:MiniShopNavHost, anchor_body_changed:Routes, anchor_body_changed:Route, anchor_added:Routes.PROFILE, …+2]
  t02-concepts-shared-components update  pages/concepts/shared-components.md p3 write_set=[pages/concepts/shared-components.md] reasons=[anchor_added:LoginResponse.token, anchor_added:TokenStore.token]
  t03-features-profile create  pages/features/profile.md      p1 write_set=[pages/features/profile.md] reasons=[route_added]
  t04-overview update  pages/overview.md              p4 write_set=[pages/overview.md] reasons=[route_set_changed]
  task t01-concepts-navigation      ok       template 
  task t02-concepts-shared-components ok       template 
  task t03-features-profile         ok       template 
  task t04-overview                 ok       template 
verify PASS: 24 pages, 372 anchors, 0 errors, 0 warnings
```

## Parity（三端一致性）

Gaps after the last merge: 1; constants that differ across platforms:

- `max_cart_items`: android=50, harmony=50, ios=99

## Eval（golden set，template）

```
claim verification (template, 33 labelled): accuracy 0.82
  verified      precision 0.88 recall 0.92 f1 0.90 (tp 22 fp 3 fn 2)
  conflict      precision 1.00 recall 0.56 f1 0.72 (tp 5 fp 0 fn 4)
  unverifiable  precision 0.00 recall 0.00 f1 0.00 (tp 0 fp 3 fn 0)
plan impact: micro precision 0.82 recall 1.00 f1 0.90
```

## Queries

```
  6.0 page   features/cart  购物车（cart）
       # 购物车（cart） > 由 `kb compound --llm template` 根据 facts 与符号图
  4.0 page   _conflicts  文档核对（冲突与已验证断言）
       [docs/legacy/cart.md](../raw/docs/docs/legacy/cart.md) L3）购物车最多 10 件商品（常量 `MAX_CART_ITEMS`，iOS 为 `maxCartItems`）
  1.0 page   overview  总览
       ---|---|---|---|---| | `cart` | `cart` | ✓ | ✓ | ✓ | [购物车（cart）](features/cart.md) | | `checkout` | `checkout` | ✓ | ✓ |
```

```
file android/app/src/main/java/com/minishop/ui/cart/CartViewModel.kt
pages (3):
  pages/_conflicts.md — 文档核对（冲突与已验证断言） [current] anchors=3
  pages/features/cart.md — 购物车（cart） [current] anchors=6
  pages/features/product_detail.md — 商品详情（product_detail） [current] anchors=6
symbols (7):
  L10   class      android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel
  L23   property   android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.MAX_CART_ITEMS
  L13   function   android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.addItem
  L11   property   android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.items
  L24   property   android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.pending
  L26   function   android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.preload
```

Final verify: PASS — 24 pages, 372 anchors.

Files: see `template-final/` (numbered by step); the final wiki is in `repo/wiki/`.
