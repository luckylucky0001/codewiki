import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var router: AppRouter

    var body: some View {
        VStack {
            BackButton()
            Text(TokenStore.shared.token == nil ? "Guest" : "Signed in").accessibilityIdentifier("profile_name")
            Button("Log out") {
                TokenStore.shared.save("")
                router.path = [Destination(route: .login)]
            }
            .accessibilityIdentifier("profile_logout")
        }
    }
}
