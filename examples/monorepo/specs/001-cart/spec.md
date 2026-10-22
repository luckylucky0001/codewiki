# Feature Specification: 购物车（Cart）

**Status**: Implemented
**Created**: 2026-01-10

## Requirements

- **FR-001**: The cart MUST hold at most 10 items (`MAX_CART_ITEMS`).
- **FR-002**: Checkout MUST call `POST /api/orders` with the cart items.
- **FR-003**: The cart screen MUST expose the testID `cart_checkout`.
