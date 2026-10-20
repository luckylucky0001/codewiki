import Foundation

enum HTTPMethod: String { case get = "GET", post = "POST" }

struct LoginRequest: Encodable { let username: String; let password: String }
struct LoginResponse: Decodable { let token: String }
struct Product: Decodable, Identifiable { let id: String; let title: String; let price: Int }
struct CartRequest: Encodable { let sku: String; let quantity: Int }
struct CartResponse: Decodable { let count: Int }
struct OrderRequest: Encodable { let paymentMethod: String }
struct OrderResponse: Decodable { let orderId: String; let status: String }

final class TokenStore {
    static let shared = TokenStore()
    private(set) var token: String?
    func save(_ token: String) { self.token = token }
}

/// Thin URLSession wrapper. All endpoints are relative to baseURL.
final class APIClient {
    static let shared = APIClient()
    let baseURL = URL(string: "https://api.minishop.example")!

    func send<T: Decodable>(_ method: HTTPMethod, path: String, body: Encodable? = nil) async throws -> T {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method.rawValue
        if let token = TokenStore.shared.token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body { req.httpBody = try JSONEncoder().encode(body) }
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONDecoder().decode(T.self, from: data)
    }
}
