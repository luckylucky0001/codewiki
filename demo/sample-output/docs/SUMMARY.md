# codewiki docs demo summary

## Module tree

```
depth 3; nodes {"L0":1,"L1":2,"L3":9,"L2":2}; clusters 9 (p50 5, max 8)
L0 repo     monoshop  [repo] → pages/overview.md
  L1 project  minishop  [shop-android] → pages/shop-android/overview.md
    L3 cluster  Cart view model  [shop-android/c-2fbaebfe] → pages/shop-android/cart-view-model.md  (8 core)
    L3 cluster  Login view model  [shop-android/c-4c13e15b] → pages/shop-android/login-view-model.md  (4 core)
    L3 cluster  Products view model  [shop-android/c-6fe46617] → pages/shop-android/products-view-model.md  (4 core)
    L3 cluster  Data  [shop-android/c-96e5ede0] → pages/shop-android/data.md  (8 core)
  L1 project  MiniShop  [shop-ios] → pages/shop-ios/overview.md
    L2 module   MiniShop (root)  [shop-ios/_root] → pages/shop-ios/_root/overview.md
    L2 module   MiniShop  [shop-ios/mini-shop] → pages/shop-ios/mini-shop/overview.md
      L3 cluster  Api client  [shop-ios/mini-shop/c-5feb53c3] → pages/shop-ios/mini-shop/api-client.md  (6 core)
      L3 cluster  App router  [shop-ios/mini-shop/c-6f7527c8] → pages/shop-ios/mini-shop/app-router.md  (7 core)
      L3 cluster  Checkout view  [shop-ios/mini-shop/c-a58fadb9] → pages/shop-ios/mini-shop/checkout-view.md  (5 core)
      L3 cluster  Cart view model  [shop-ios/mini-shop/c-aef82694] → pages/shop-ios/mini-shop/cart-view-model.md  (3 core)
      L3 cluster  Products view model  [shop-ios/mini-shop/c-b27ee65e] → pages/shop-ios/mini-shop/products-view-model.md  (4 core)

depth 3; nodes {"L0":1,"L1":2,"L3":9,"L2":2}; clusters 9 (p50 5, max 8)
```

## Scopes

```
repository  docs=docs specs=specs write=true read=true
project shop-android     root=apps/shop-android docs=apps/shop-android/docs specs=specs,apps/shop-android/specs android gradle (container)
project shop-ios         root=apps/shop-ios docs=apps/shop-ios/docs specs=specs,apps/shop-ios/specs ios swiftpm (container)
```

## First docs compound

```
docs compound (fresh: no previous run)
  scope repo           docs full
  scope shop-android   apps/shop-android/docs full
  scope shop-ios       apps/shop-ios/docs full
  write  new      apps/shop-android/docs/architecture.md [architecture] +4 ~0 =0
  write  new      apps/shop-android/docs/contracts.md [api-contracts] +5 ~0 =0
  write  new      apps/shop-android/docs/design-patterns.md [design-patterns] +2 ~0 =0
  write  new      apps/shop-android/docs/features.md [features] +7 ~0 =0
  write  new      apps/shop-android/docs/navigation.md [navigation] +7 ~0 =0
  write  new      apps/shop-android/docs/product-specs.md [product-specs] +1 ~0 =0
  write  new      apps/shop-android/docs/testing.md [testing] +7 ~0 =0
  write  new      apps/shop-ios/docs/architecture.md [architecture] +7 ~0 =0
  write  new      apps/shop-ios/docs/contracts.md [api-contracts] +5 ~0 =0
  write  new      apps/shop-ios/docs/design-patterns.md [design-patterns] +2 ~0 =0
  write  new      apps/shop-ios/docs/features.md [features] +7 ~0 =0
  write  skeleton apps/shop-ios/docs/navigation.md [navigation] +7 ~0 =0
  write  new      apps/shop-ios/docs/testing.md [testing] +7 ~0 =0
  write  adopted  docs/architecture.md [architecture] +2 ~0 =0
  write  new      docs/contracts.md [api-contracts] +5 ~0 =0
  write  new      docs/design-patterns.md [design-patterns] +2 ~0 =0
  write  new      docs/features.md [features] +6 ~0 =0
  write  new      docs/product-specs.md [product-specs] +3 ~0 =0
  write  new      docs/requirements.md [requirements] +5 ~0 =0
  write  skeleton docs/testing.md [testing] +7 ~0 =0
routing: 58 item(s), 30 to repository docs (root evidence or ≥2 projects), 0 parity difference(s)
```

## Human content


## docs/architecture.md
only additions: every original line is still present, in order
state before: adopted; kb guard (checkHumanContentPreserved): human chunks byte-identical

## docs/testing.md
lines only in the original (expected only for skeleton placeholders):
    < TODO
    < 
    < TBD
state before: skeleton; kb guard (checkHumanContentPreserved): human chunks byte-identical

## docs/onboarding.md
byte-identical (untouched)

## docs/adr/0001-native-ui-per-platform.md
byte-identical (untouched)

## apps/shop-android/docs/notes.md
byte-identical (untouched)

## apps/shop-ios/docs/navigation.md
lines only in the original (expected only for skeleton placeholders):
    < [DESCRIPTION]
    < 
    < TODO
state before: skeleton; kb guard (checkHumanContentPreserved): human chunks byte-identical

## No-change rerun

```
docs compound (fresh: previous run completed)
  scope repo           docs incremental
  scope shop-android   apps/shop-android/docs incremental
  scope shop-ios       apps/shop-ios/docs incremental
routing: 58 item(s), 30 to repository docs (root evidence or ≥2 projects), 0 parity difference(s)
(20 file(s) noop)
```

## After the code change

```
docs compound (fresh: previous run completed)
  scope repo           docs incremental
  scope shop-android   apps/shop-android/docs incremental
  scope shop-ios       apps/shop-ios/docs incremental
  write  managed  docs/testing.md [testing] +0 ~1 =6
routing: 58 item(s), 30 to repository docs (root evidence or ≥2 projects), 1 parity difference(s)
```

## ADR / debt / stale specs / links / verify

```
proposed docs/adr/0002-login.md
proposed docs/adr/0003-cart.md
dry-run: re-run with --write to create the ADR files (or review them in a PR)
created docs/adr/0002-login.md
created docs/adr/0003-cart.md
TODO: move the cart limit to remote config so product can tune it without a release  `apps/shop-android/app/src/main/java/com/minishop/ui/cart/CartViewModel.kt:10` `CartViewModel`
FIXME: retry failed requests with exponential backoff instead of failing immediately  `apps/shop-ios/MiniShop/Networking/APIClient.swift:3` —
docs/tech-debt.md: write, adds TD-001, TD-002
implemented-never-verified   Implemented  specs/001-cart/spec.md — Implemented but never marked Verified
implemented-conflict         Implemented  specs/001-cart/spec.md — Implemented but the code contradicts it
no broken links
verify PASS: 33 pages, 201 anchors, 0 errors, 0 warnings
```
