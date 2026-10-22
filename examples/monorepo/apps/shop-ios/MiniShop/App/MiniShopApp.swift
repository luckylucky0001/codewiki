import SwiftUI

@main
struct MiniShopApp: App {
    @StateObject private var router = AppRouter()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(router)
                .onOpenURL { url in router.handle(url: url) }
        }
    }
}
