# Nova iOS compatibility patch

Source: crates.io `tao` 0.35.3; original licenses are retained here.
Tauri 2 currently resolves this version. Only the iOS implementation is changed:

- `view.rs`: return the scene configuration with `Retained::autorelease_ptr`
  instead of a pointer to a value that immediately drops. This backports
  https://github.com/tauri-apps/tao/pull/1245 (released upstream in 0.36).
- `scene.rs`, `view.rs`, `app_state.rs`: select the scene lifecycle based on
  the presence of `UIApplicationSceneManifest`, independently of multi-window
  support. This permits Nova's single-window scene configuration on iPad.
  Related upstream issue: https://github.com/tauri-apps/tao/issues/1308.

Nova also supplies a static `TaoSceneDelegate` configuration in
`src-tauri/Info.ios.plist` for the iOS 27 SDK's launch validator:
https://github.com/tauri-apps/tauri/issues/15719.

Remove this Cargo patch once the supported Tauri dependency includes both fixes.
