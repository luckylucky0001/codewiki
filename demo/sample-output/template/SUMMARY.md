# codewiki demo summary

- mode: `template` (bootstrap writer: `template`)
- date (UTC): 20261020T163836Z
- repo: `demo/output/<run>/repo` (temp git repo, branch master)
- kb: `kb 0.1.0`

## Ingest

Discovered docs: 8 (adr=1, agent-guide=1, design=1, doc=2, readme=1, spec=2)

Claims: conflict=6, unverifiable=2, verified=20

Conflicts (code wins):

- **CART-43567f** (docs/legacy/cart.md): 购物车最多 10 件商品（常量 `MAX_CART_ITEMS`，iOS 为 `maxCartItems`）。
  - 代码中 `CartViewModel.MAX_CART_ITEMS` = 50（android），文档写的是 10; 代码中 `MAX_CART_ITEMS` = 50（harmony），文档写的是 10; 代码中 `CartViewModel.maxCartItems` = 50（ios），文档写的是 10
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
| initial | full | 8 | - | PASS |
| 01-cart-limit | incremental | 3 | 4 | PASS |
| 02-arkts-api-rename | incremental | 3 | 6 | PASS |
| 03-profile-route | incremental | 2 | 11 | PASS |

### 05-01-cart-limit

```
diff: base ad44c25 → head 37c8400
diff:   unchanged  211
diff:   body       3
diff:   signature  0
diff:   added      0
diff:   deleted    0
status(before): stale facts/requirements.json (5 anchors: CartViewModel.MAX_CART_ITEMS, MAX_CART_ITEMS, CartViewModel.maxCartItems, …+2)
status(before): stale pages/_conflicts.md (3 anchors: CartViewModel.MAX_CART_ITEMS, MAX_CART_ITEMS, CartViewModel.maxCartItems)
status(before): stale pages/features/cart.md (1 anchors: CartViewModel.MAX_CART_ITEMS)
status(before): stale pages/features/product_detail.md (1 anchors: CartViewModel.MAX_CART_ITEMS)
  t01-_conflicts recheck pages/_conflicts.md            write_set=[.kb/ingest/verdicts.json] reasons=[anchor_body_changed:CartViewModel.MAX_CART_ITEMS, anchor_body_changed:MAX_CART_ITEMS, anchor_body_changed:CartViewModel.maxCartItems]
  t02-features-cart update  pages/features/cart.md         write_set=[pages/features/cart.md] reasons=[anchor_body_changed:CartViewModel.MAX_CART_ITEMS]
  t03-features-product_detail update  pages/features/product_detail.md write_set=[pages/features/product_detail.md] reasons=[anchor_body_changed:CartViewModel.MAX_CART_ITEMS]
  task t01-_conflicts               ok       template 
  task t02-features-cart            ok       template 
  task t03-features-product_detail  ok       template 
verify PASS: 20 pages, 286 anchors, 0 errors, 0 warnings
```

### 06-02-arkts-api-rename

```
diff: base 37c8400 → head 0391c27
diff:   unchanged  208
diff:   body       4
diff:   signature  1
diff:   added      0
diff:   deleted    0
status(before): stale facts/apis.json (generated facts out of date)
status(before): stale facts/harmony/apis.md (generated facts out of date)
status(before): stale facts/requirements.json (4 anchors: ProductDetailPage.build, CartStore, ProductDetailPage.build, …+1)
status(before): stale pages/_conflicts.md (2 anchors: CartStore, ProductDetailPage.build)
status(before): stale pages/features/product_detail.md (2 anchors: CartStore.addItem, ProductDetailPage.build)
status(before): stale pages/features/products.md (2 anchors: Api.loadProducts, ProductsPage.aboutToAppear)
  t01-_conflicts recheck pages/_conflicts.md            write_set=[.kb/ingest/verdicts.json] reasons=[anchor_body_changed:CartStore, anchor_body_changed:ProductDetailPage.build]
  t02-features-product_detail update  pages/features/product_detail.md write_set=[pages/features/product_detail.md] reasons=[anchor_signature_changed:CartStore.addItem, anchor_body_changed:ProductDetailPage.build]
  t03-features-products update  pages/features/products.md     write_set=[pages/features/products.md] reasons=[anchor_renamed:Api.loadProducts, anchor_body_changed:ProductsPage.aboutToAppear]
  task t01-_conflicts               ok       template 
  task t02-features-product_detail  ok       template 
  task t03-features-products        ok       template 
verify PASS: 20 pages, 286 anchors, 0 errors, 0 warnings
```

### 07-03-profile-route

```
diff: base 0391c27 → head 4d0fb00
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
  t01-features-profile create  pages/features/profile.md      write_set=[pages/features/profile.md] reasons=[route_added]
  t02-overview update  pages/overview.md              write_set=[pages/overview.md] reasons=[route_set_changed]
  task t01-features-profile         ok       template 
  task t02-overview                 ok       template 
verify PASS: 21 pages, 309 anchors, 0 errors, 0 warnings
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
pages (4):
  pages/_conflicts.md — 文档核对（冲突与已验证断言） [current] anchors=2
  pages/features/cart.md — 购物车（cart） [current] anchors=6
  pages/features/product_detail.md — 商品详情（product_detail） [current] anchors=6
  pages/features/products.md — 商品列表（products） [current] anchors=1
symbols (7):
  L10   class      android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel
  L23   property   android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.MAX_CART_ITEMS
  L13   function   android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.addItem
  L11   property   android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.items
  L24   property   android://app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel.pending
```

Final verify: PASS — 21 pages, 309 anchors.

Files: see `20261020T163836Z-template/` (numbered by step); the final wiki is in `repo/wiki/`.
