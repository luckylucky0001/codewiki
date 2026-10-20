import Foundation

@MainActor
final class CartViewModel: ObservableObject {
    /// Quantity cap per order (same rule on every platform).
    static let maxCartItems = 50
    private static var pending: [String] = []

    @Published var items: [String] = []

    func addItem(sku: String) -> Bool {
        guard items.count < CartViewModel.maxCartItems else { return false }
        items.append(sku)
        Task { let _: CartResponse? = try? await APIClient.shared.send(.post, path: "/api/cart", body: CartRequest(sku: sku, quantity: 1)) }
        return true
    }

    func total() -> Int { items.count }

    static func preload(_ skus: [String]) {
        pending.append(contentsOf: skus)
    }
}
