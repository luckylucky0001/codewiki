import SwiftUI

struct LoginView: View {
    @StateObject private var vm = LoginViewModel()
    @EnvironmentObject var router: AppRouter
    @State private var username = ""
    @State private var password = ""

    var body: some View {
        VStack {
            TextField("Username", text: $username).accessibilityIdentifier("login_username")
            SecureField("Password", text: $password).accessibilityIdentifier("login_password")
            Button("Sign in") {
                Task {
                    if await vm.login(username: username, password: password) {
                        router.path.append(Destination(route: .products))
                    }
                }
            }
            .accessibilityIdentifier("login_submit")
        }
    }
}
