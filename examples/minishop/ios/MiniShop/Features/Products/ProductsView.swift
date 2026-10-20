import SwiftUI

struct ProductsView: View {
    @StateObject private var vm = ProductsViewModel()
    @EnvironmentObject var router: AppRouter

    var body: some View {
        List(vm.products) { p in
            Button(p.title) { router.path.append(Destination(route: .productDetail, params: ["id": p.id])) }
                .accessibilityIdentifier("product_item_\(p.id)")
        }
        .accessibilityIdentifier("product_list")
        .toolbar {
            Button("Cart") { router.path.append(Destination(route: .cart)) }
                .accessibilityIdentifier("tab_cart")
        }
        .task { await vm.loadProducts() }
    }
}
