# Feature Specification: 购物车（Cart）

**Feature Branch**: `001-cart`
**Status**: Approved

## User Scenarios & Testing

### User Story 1 - 加入购物车 (Priority: P1)

用户在商品详情页把商品加入购物车，然后去结算。

**Acceptance Scenarios**:

1. WHEN the user taps `add_to_cart` on product detail THE SYSTEM SHALL call `POST /api/cart`.
2. WHEN the cart is empty THE SYSTEM SHALL disable `cart_checkout`.

## Requirements

### Functional Requirements

- **FR-001**: System MUST let users add a product to the cart from the product detail page (`add_to_cart`, `POST /api/cart`).
- **FR-002**: The cart MUST hold at most 99 items (`MAX_CART_ITEMS`).
- **FR-003**: Checkout MUST create an order via `POST /api/orders` and then show `order_status`.
- **FR-004**: Users MUST be able to apply a coupon code at checkout (`POST /api/coupons/apply`).
- **FR-005**: The cart page MUST be reachable via deep link `minishop://cart`.
