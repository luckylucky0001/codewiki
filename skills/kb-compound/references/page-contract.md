# Page contract

```yaml
---
id: features/cart              # path without pages/ and .md
title: 购物车（cart）
kind: feature                  # feature | flow | concept | decision | overview | conflicts
platforms: [android, harmony, ios]
routes: [cart]
sources:
  - sym: android://app/src/main/java/com/minishop/ui/cart/CartScreen.kt#CartScreen
    hash: <sha256 from the prompt or `kb anchor`>
source_commit: 1a2b3c4
status: current                # current | stale | outdated-doc
---
```

Recommended body for a feature page:

1. 概述 — what the user can do, one paragraph.
2. 路由与深链 — table per platform: pattern, deeplink, entry symbol.
3. 三端实现对照 — table: concern × android / ios / harmony with symbol ids.
4. 接口与数据流 — HTTP method + path, which symbol calls it, request/response models.
5. testID 与测试要点 — testIDs from facts, notable edge cases (limits, validation).
6. 相关页面 — `../overview.md`, facts pages.

Verification (`kb verify`) fails on: stale/missing anchors, unknown symbol ids in the body,
dead links, pages not reachable from `index.md`, stale generated facts.
