import { Api, Product } from '../common/Api';
import { CartStore } from '../common/CartStore';
import { BackButton } from '../common/BackButton';

@Builder
export function ProductDetailBuilder() {
  ProductDetailPage()
}

@Component
export struct ProductDetailPage {
  @Consume('pathStack') pathStack: NavPathStack;
  @State product: Product | undefined = undefined;

  aboutToAppear(): void {
    const params = this.pathStack.getParamByName('product_detail') as Record<string, string>[];
    Api.loadProduct(params[0]['id']).then((p: Product) => { this.product = p; });
  }

  build() {
    NavDestination() {
      Column() {
        BackButton()
        Text(this.product?.title ?? '')
        Button('Add to cart').id('add_to_cart').onClick(() => {
          if (this.product) {
            CartStore.addItem(this.product.id, 1);
          }
        })
      }
    }
  }
}
