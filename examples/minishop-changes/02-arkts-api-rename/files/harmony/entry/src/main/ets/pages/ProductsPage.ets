import { Api, Product } from '../common/Api';

@Builder
export function ProductsBuilder() {
  ProductsPage()
}

@Component
export struct ProductsPage {
  @Consume('pathStack') pathStack: NavPathStack;
  @State products: Product[] = [];

  aboutToAppear(): void {
    Api.fetchProducts().then((list: Product[]) => { this.products = list; });
  }

  build() {
    NavDestination() {
      Column() {
        Button('Cart').id('tab_cart').onClick(() => { this.pathStack.pushPathByName('cart', null); })
        List() {
          ForEach(this.products, (p: Product) => {
            ListItem() {
              Text(p.title)
            }
            .id(`product_item_${p.id}`)
            .onClick(() => { this.pathStack.pushPathByName('product_detail', { id: p.id }); })
          })
        }
        .id('product_list')
      }
    }
  }
}
