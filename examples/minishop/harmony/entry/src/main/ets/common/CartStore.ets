import { Api } from './Api';

// Quantity cap per order (same rule on every platform).
export const MAX_CART_ITEMS: number = 99;

export class CartStore {
  static items: string[] = [];
  static pending: string[] = [];

  static addItem(sku: string): boolean {
    if (CartStore.items.length >= MAX_CART_ITEMS) {
      return false;
    }
    CartStore.items.push(sku);
    Api.addToCart(sku, 1);
    return true;
  }

  static total(): number {
    return CartStore.items.length;
  }

  static preload(skus: string[]): void {
    CartStore.pending = CartStore.pending.concat(skus);
  }
}
