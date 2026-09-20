// swift-tools-version:5.5
import PackageDescription
let package = Package(name: "tauri-plugin-nova-auth", platforms: [.iOS(.v15)],
    products: [.library(name: "tauri-plugin-nova-auth", type: .static, targets: ["tauri-plugin-nova-auth"])],
    dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
    targets: [.target(name: "tauri-plugin-nova-auth", dependencies: [.byName(name: "Tauri")], path: "Sources")])
