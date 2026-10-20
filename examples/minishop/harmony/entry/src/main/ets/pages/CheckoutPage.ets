import { Api } from '../common/Api';
import { BackButton } from '../common/BackButton';

@Builder
export function CheckoutBuilder() {
  CheckoutPage()
}

@Component
export struct CheckoutPage {
  @Consume('pathStack') pathStack: NavPathStack;

  async placeOrder(): Promise<void> {
    const orderId = await Api.createOrder('card');
    this.pathStack.pushPathByName('order_detail', { id: orderId });
  }

  build() {
    NavDestination() {
      Column() {
        BackButton()
        Button('Place order').id('checkout_submit').onClick(() => { this.placeOrder(); })
      }
    }
  }
}
