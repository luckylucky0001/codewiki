import SwiftUI

final class AppRouter: ObservableObject {
    @Published var path: [Destination] = []

    /// minishop://<pattern>?token=<t>&cart=<sku,sku>
    func handle(url: URL) {
        guard url.scheme == "minishop" else { return }
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        for item in comps?.queryItems ?? [] {
            if item.name == "token", let t = item.value { TokenStore.shared.save(t) }
            if item.name == "cart", let skus = item.value { CartViewModel.preload(skus.split(separator: ",").map(String.init)) }
        }
        if let dest = match(host: url.host ?? "", segments: url.pathComponents.filter { $0 != "/" }) {
            path.append(dest)
        }
    }

    func match(host: String, segments: [String]) -> Destination? {
        let parts = [host] + segments
        for route in Route.allCases {
            let pat = route.rawValue.split(separator: "/").map(String.init)
            guard pat.count == parts.count else { continue }
            var params: [String: String] = [:]
            var ok = true
            for (p, v) in zip(pat, parts) {
                if p.hasPrefix("{") { params[String(p.dropFirst().dropLast())] = v } else if p != v { ok = false }
            }
            if ok { return Destination(route: route, params: params) }
        }
        return nil
    }
}

struct RootView: View {
    @EnvironmentObject var router: AppRouter

    var body: some View {
        NavigationStack(path: $router.path) {
            LoginView()
                .navigationDestination(for: Destination.self) { dest in
                    switch dest.route {
                    case .login: LoginView()
                    case .products: ProductsView()
                    case .productDetail: ProductDetailView(id: dest.params["id"] ?? "")
                    case .cart: CartView()
                    case .checkout: CheckoutView()
                    case .orderDetail: OrderDetailView(id: dest.params["id"] ?? "")
                    }
                }
        }
    }
}
