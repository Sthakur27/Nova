# Nova Tao patches

Source: crates.io `tao` 0.35.3; original licenses are retained here.
Tauri 2 currently resolves this version. The iOS compatibility changes are:

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

Build-warning cleanup also removes the unused macOS `yes` callback,
`saved_desktop_display_mode` and `inner_rect` fields, and the unused size
calculation. The shared `hit_test` helper is compiled only for its Windows and
Linux/BSD callers. These changes do not alter window behavior.

Additional macOS cleanup removes unused imports, redundant unsafe blocks, and
unused internal event-loop badge wrappers (the public badge APIs keep their
existing implementations). Key-up events use `NSEventType::KeyUp`. Hidden titlebar
buttons omit the obsolete fullscreen button, whose lookup always returns nil;
the existing zoom-button entry handles the fullscreen control.

Remaining macOS warnings concern the legacy filename pasteboard protocol and
retained icon data. Migrating native file drag-and-drop is outside this cleanup.

Remove this Cargo patch once the supported Tauri dependency includes both iOS fixes.
