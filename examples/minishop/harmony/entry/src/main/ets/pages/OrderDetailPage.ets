import { BackButton } from '../common/BackButton';

@Builder
export function OrderDetailBuilder() {
  OrderDetailPage()
}

@Component
export struct OrderDetailPage {
  @Consume('pathStack') pathStack: NavPathStack;

  build() {
    NavDestination() {
      Column() {
        BackButton()
        Text('Order placed').id('order_status')
      }
    }
  }
}
