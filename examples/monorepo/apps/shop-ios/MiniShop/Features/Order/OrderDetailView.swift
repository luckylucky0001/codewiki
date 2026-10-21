import SwiftUI

struct OrderDetailView: View {
    let id: String

    var body: some View {
        VStack {
            BackButton()
            Text("Order placed").accessibilityIdentifier("order_status")
        }
    }
}
