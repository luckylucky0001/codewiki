import Foundation

@MainActor
final class ProductsViewModel: ObservableObject {
    @Published var products: [Product] = []

    func loadProducts() async {
        products = (try? await APIClient.shared.send(.get, path: "/api/products")) ?? []
    }

    func loadProduct(id: String) async -> Product? {
        try? await APIClient.shared.send(.get, path: "/api/products/\(id)")
    }
}
