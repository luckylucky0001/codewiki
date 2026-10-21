import SwiftUI

struct ProductDetailView: View {
    let id: String
    @StateObject private var vm = ProductsViewModel()
    @StateObject private var cart = CartViewModel()
    @State private var product: Product?

    var body: some View {
        VStack {
            BackButton()
            Text(product?.title ?? "")
            Button("Add to cart") { _ = cart.addItem(sku: id) }
                .accessibilityIdentifier("add_to_cart")
        }
        .task { product = await vm.loadProduct(id: id) }
    }
}
