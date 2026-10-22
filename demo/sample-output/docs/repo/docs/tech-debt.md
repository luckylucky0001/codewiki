# 技术债登记 / Tech Debt Register

> 由 Compound 追加；带 `compound:owned` 标记的行只在 Status 为 Open 时刷新描述/来源/位置。人工行与人工修改的 Status 永不改动。

| ID | Description | Source | Location | Status | Key |
|----|-------------|--------|----------|--------|-----|
| TD-001 | TODO: move the cart limit to remote config so product can tune it without a release | `apps/shop-android/app/src/main/java/com/minishop/ui/cart/CartViewModel.kt:10` | `CartViewModel` | Open | <!-- compound:owned key="debt:apps/shop-android/app/src/main/java/com/minishop/ui/cart/CartViewModel.kt#CartViewModel:5bcbb761" --> |
| TD-002 | FIXME: retry failed requests with exponential backoff instead of failing immediately | `apps/shop-ios/MiniShop/Networking/APIClient.swift:3` | — | Open | <!-- compound:owned key="debt:apps/shop-ios/MiniShop/Networking/APIClient.swift:40b6be43" --> |
