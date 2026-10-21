import SwiftUI

/// Shared back button so every platform exposes the same nav_back testID.
struct BackButton: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Button("Back") { dismiss() }
            .accessibilityIdentifier("nav_back")
    }
}
