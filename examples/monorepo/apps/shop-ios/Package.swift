// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "MiniShop",
    platforms: [.iOS(.v17)],
    targets: [
        .executableTarget(name: "MiniShop", path: "MiniShop")
    ]
)
