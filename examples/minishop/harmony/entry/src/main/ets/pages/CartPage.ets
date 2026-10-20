import { CartStore } from '../common/CartStore';
import { BackButton } from '../common/BackButton';

@Builder
export function CartBuilder() {
  CartPage()
}

@Component
export struct CartPage {
  @Consume('pathStack') pathStack: NavPathStack;

  build() {
    NavDestination() {
      Column() {
        BackButton()
        Text(`Items: ${CartStore.total()}`)
        Button('Checkout').id('cart_checkout').enabled(CartStore.total() > 0)
          .onClick(() => { this.pathStack.pushPathByName('checkout', null); })
      }
    }
  }
}
