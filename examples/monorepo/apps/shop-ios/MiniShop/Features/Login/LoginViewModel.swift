import Foundation

@MainActor
final class LoginViewModel: ObservableObject {
    @Published var error: String?

    /// Username + password login; persists the token on success.
    func login(username: String, password: String) async -> Bool {
        guard !username.isEmpty, password.count >= 6 else {
            error = "invalid_credentials"
            return false
        }
        do {
            let resp: LoginResponse = try await APIClient.shared.send(.post, path: "/api/login", body: LoginRequest(username: username, password: password))
            TokenStore.shared.save(resp.token)
            return true
        } catch {
            return false
        }
    }
}
