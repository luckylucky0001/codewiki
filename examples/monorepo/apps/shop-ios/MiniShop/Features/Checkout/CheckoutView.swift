import SwiftUI

struct CheckoutView: View {
    @EnvironmentObject var router: AppRouter

    var body: some View {
        VStack {
            BackButton()
            Button("Place order") {
                Task {
                    if let order = await placeOrder() {
                        router.path.append(Destination(route: .orderDetail, params: ["id": order.orderId]))
                    }
                }
            }
            .accessibilityIdentifier("checkout_submit")
        }
    }

    func placeOrder() async -> OrderResponse? {
        try? await APIClient.shared.send(.post, path: "/api/orders", body: OrderRequest(paymentMethod: "card"))
    }
}
