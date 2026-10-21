import SwiftUI

struct CartView: View {
    @StateObject private var vm = CartViewModel()
    @EnvironmentObject var router: AppRouter

    var body: some View {
        VStack {
            BackButton()
            Text("Items: \(vm.total())")
            Button("Checkout") { router.path.append(Destination(route: .checkout)) }
                .disabled(vm.total() == 0)
                .accessibilityIdentifier("cart_checkout")
        }
    }
}
