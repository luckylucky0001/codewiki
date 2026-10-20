import { http } from '@kit.NetworkKit';
import { TokenStore } from './TokenStore';

const BASE_URL: string = 'https://api.minishop.example';

export interface Product {
  id: string;
  title: string;
  price: number;
}

export class Api {
  static async login(username: string, password: string): Promise<string> {
    const resp = await http.createHttp().request(BASE_URL + '/api/login', {
      method: http.RequestMethod.POST,
      extraData: { username: username, password: password }
    });
    return JSON.parse(resp.result as string)['token'];
  }

  static async fetchProducts(): Promise<Product[]> {
    const resp = await http.createHttp().request(BASE_URL + '/api/products', {
      method: http.RequestMethod.GET
    });
    return JSON.parse(resp.result as string) as Product[];
  }

  static async loadProduct(id: string): Promise<Product> {
    const resp = await http.createHttp().request(BASE_URL + '/api/products/' + id, {
      method: http.RequestMethod.GET
    });
    return JSON.parse(resp.result as string) as Product;
  }

  static async addToCart(sku: string, quantity: number): Promise<void> {
    await http.createHttp().request(BASE_URL + '/api/cart', {
      method: http.RequestMethod.POST,
      header: { 'Authorization': 'Bearer ' + TokenStore.get() },
      extraData: { sku: sku, quantity: quantity }
    });
  }

  static async createOrder(paymentMethod: string): Promise<string> {
    const resp = await http.createHttp().request(BASE_URL + '/api/orders', {
      method: http.RequestMethod.POST,
      extraData: { paymentMethod: paymentMethod }
    });
    return JSON.parse(resp.result as string)['orderId'];
  }
}
