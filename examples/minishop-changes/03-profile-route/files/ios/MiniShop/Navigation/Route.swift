import Foundation

/// Canonical route patterns, shared with Android and HarmonyOS.
enum Route: String, CaseIterable {
    case login = "login"
    case products = "products"
    case productDetail = "product/{id}"
    case cart = "cart"
    case checkout = "checkout"
    case orderDetail = "order/{id}"
    case profile = "profile"
}

struct Destination: Hashable {
    let route: Route
    var params: [String: String] = [:]
}
