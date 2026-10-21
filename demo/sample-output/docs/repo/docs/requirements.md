---
last_compound_scan: 2026-10-21
compound_scan_mode: full
compound_source_commit: 0eac90a45f255baa4080e270c0069ae35df522e6
---
# Requirement Patterns

## Requirements

### login · LOGIN-R1.1

WHEN the user submits valid credentials THE SYSTEM SHALL call `POST /api/login` and store the token.

- 规格：`.kiro/specs/login/requirements.md`（**Status**: Verified）
- 代码核对：verified — 接口 `POST /api/login` 存在（android, ios）

**Source**: `apps/shop-android/app/src/main/java/com/minishop/data/ApiService.kt` [Code Direct] [Verified]

### login · LOGIN-R1.2

WHEN the password is shorter than 6 characters THE SYSTEM SHALL show an error.

- 规格：`.kiro/specs/login/requirements.md`（**Status**: Verified）
- 代码核对：verified — 「shorter than 6」对应代码中的比较 `length<6`（android://app/src/main/java/com/minishop/ui/login/LoginViewModel.kt#LoginViewModel.login）

**Source**: `apps/shop-android/app/src/main/java/com/minishop/ui/login/LoginViewModel.kt` [Code Direct] [Verified]

### 001-cart · FR-002

Checkout MUST call `POST /api/orders` with the cart items.

- 规格：`specs/001-cart/spec.md`（**Status**: Implemented）
- 代码核对：verified — 接口 `POST /api/orders` 存在（android, ios）

**Source**: `apps/shop-android/app/src/main/java/com/minishop/data/ApiService.kt` [Code Direct] [Verified]

### 001-cart · FR-003

The cart screen MUST expose the testID `cart_checkout`.

- 规格：`specs/001-cart/spec.md`（**Status**: Implemented）
- 代码核对：verified — testID `cart_checkout` 存在

**Source**: `apps/shop-android/app/src/main/java/com/minishop/ui/cart/CartScreen.kt` [Code Direct] [Verified]

### 002-wishlist · FR-001

Users SHOULD be able to save products to a wishlist from the product detail page.

- 规格：`specs/002-wishlist/spec.md`（**Status**: Draft）
- 代码核对：unverifiable — 没有可确定性校验的锚点（需要 LLM 语义核对）

**Source**: `specs/002-wishlist/spec.md` [Code Direct] [Unconfirmed]
