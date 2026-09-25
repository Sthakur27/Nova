# Nova for iPhone and iPad

Nova now builds and runs as an installed iPhone/iPad app: a Tauri native shell with the shared React/WebKit editor and Rust file engine. It bundles its interface locally and stores notes on the device; no hosted website or development server is needed for the built app. The unsigned debug simulator build has been verified with Xcode 27.0 and iOS/iPadOS 27.0 on Apple Silicon. Physical-device signing and release distribution have not been performed.

## Included

- Native mobile entry point and iOS window configuration.
- A Cloud-only setup gate and automatically discovered Google Drive spaces, with offline copies in private app storage.
- **Show Read mode** in Settings defaults off, just as on desktop. Enable it to add Read to the view switch; large Markdown notes retain the reading fallback.
- Editing, reading, search, stars, bookmarks, rename, device-only deletion, Cloud autosave, and native recovery drafts using the existing note engine.
- Touch navigation, safe-area spacing, horizontally scrolling formatting controls, and keyboard-aware viewport sizing. iPad uses the same touch layout. The mode switch uses larger icon controls; bottom navigation hides while editing, and the scroll canvas stays stable as the keyboard resizes.
- Stable `mobile-sync/<hash>` workspace identity and relative bookmark identities, so an iOS container path change does not invalidate saved tabs, drafts, or bookmarks.
- **Reset from Google Drive…** in Settings downloads fresh Cloud copies and clears local note state, including device-only deletions. It discards changes that have not uploaded while keeping sign-in and appearance preferences. See [reset recovery](sync.md#reset-mobile-local-data-from-drive) for details.

Desktop terminal, desktop voice engine, new windows, folder pickers, and file-location actions are excluded from the mobile interface. Use the system keyboard for dictation. External Files/iCloud folder integration and general import/export are not implemented. Google Drive foreground sync is implemented for iOS; see [sync.md](sync.md) for setup and live verification results. Uninstalling the app removes its private notes. This is a development preview, not a production release.

## Touch editing and open files

- Tap **New** beside the current file, or **New note** at the top of Notes, to create a note in the active space.
- Tap the file bar to open the **Open files** sheet. Choose a file to switch to it, or use its close button. Swipe left across the note or file bar for the next open file, and right for the previous one. Switching stops at either end; it does not wrap. Vertical scrolling, text selections, and horizontally scrolling code/table regions do not trigger note swipes.
- Tap the note title or the pencil beside the file picker to rename. The name is selected for replacement; **Rename** confirms and **Cancel** leaves it unchanged. Mobile renaming preserves the extension and does not commit merely because focus moves away.
- Tap blank note padding or outside the editor to dismiss the keyboard. Tapping text still positions the caret. **Done** beside the formatting controls also dismisses it.
- Undo, redo, bold, italic, and task lists come first in the horizontally scrolling toolbar. Scroll it for headings, code, lists, and quotes; **Done** stays visible. Formatting is disabled for non-Markdown files.

These controls also appear in the narrow browser preview. Browser checks do not verify iOS keyboard or touch behavior; repeat the native checklist below on an iPhone/iPad.

## Updating the installed iOS app

The current Xcode-installed development app does not update itself. Install a new native build from Xcode; live frontend changes are available only while the development server is running and reachable. The desktop updater does not support iOS ([Tauri supported platforms](https://v2.tauri.app/plugin/updater/)).

For automatic beta updates, distribute signed builds through TestFlight and enable automatic updates in TestFlight ([Apple’s instructions](https://beta.itunes.apple.com/)). This requires Apple Developer Program membership, an App Store Connect app, signing/provisioning, and uploaded builds. Nova does not yet have a configured TestFlight release workflow. A free personal Xcode account cannot provide this distribution path.

## First native run

Install full **Xcode** from the Mac App Store, open it to finish setup, and install an iOS Simulator runtime. Command Line Tools alone do not include the iOS SDK.

```sh
brew install cocoapods
npm ci
npm run ios:init
npm run ios:dev
```

The npm launcher finds Rust in the standard Cargo installation and uses the full Xcode SDK even when the global selection still points to Command Line Tools. Tauri initialization installs missing Rust targets and regenerates `src-tauri/gen/apple`. The generated source project is included; build output, Pods, user settings, and generated web assets are excluded.

This machine now has full Xcode, the iOS 27 simulator runtime, CocoaPods, and the Apple Silicon iOS device/simulator Rust targets installed. The verified simulator app is at `src-tauri/gen/apple/build/nova-notes_iOS.xcarchive/Products/Applications/Nova.app`.

The iOS 27 SDK requires a scene lifecycle declaration. `Info.ios.plist` supplies it, and the documented [Tao patch](../src-tauri/vendor/tao/NOVA-PATCH.md) backports scene configuration ownership and single-window lifecycle fixes while Tauri pins Tao 0.35.3.

For a physical iPhone/iPad, configure signing in Xcode using your Apple account, or supply `APPLE_DEVELOPMENT_TEAM` to Tauri. The existing bundle identifier is `com.nova.notes.prototype`; choose the intended release identifier before distribution.

For development on a paired physical device, keep the Tauri dev process running and open Xcode with:

```sh
npm run ios:dev -- --open --host
```

`./runios.sh` is a shortcut for this command that first stops existing desktop or iOS development sessions in this checkout. Additional arguments are passed through to the iOS launcher.

Choose your personal/development team under **Signing & Capabilities**, select your iPhone as the run destination, and click Run. Keep the phone and Mac on the same network for live updates. The checked-in Xcode build phase uses `scripts/ios-xcode.sh` to find Rust and Node even when Xcode was launched outside a terminal; it supports standard Cargo, Homebrew, and nvm installations. If `ios:init` regenerates the Xcode project, restore that build-phase wrapper if the generator replaces it.

A simulator archive can be built on an Apple Silicon Mac with:

```sh
npm run ios:build -- --target aarch64-sim --debug --archive-only --ci
```

TestFlight/App Store distribution additionally needs Apple signing/provisioning and store setup. These have not been performed. [Tauri iOS prerequisites](https://v2.tauri.app/start/prerequisites/) and [iOS signing](https://v2.tauri.app/distribute/sign/ios/) describe the setup.

## Verification

```sh
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Verified on September 25, 2026 for the mobile controls update:

- 472 frontend tests pass, including rename confirmation/cancellation, file selection/closing, keyboard focus protection, and swipe eligibility.
- Production frontend build and debug iOS simulator archive succeed. The archive launches and renders the updated interface on the iPhone 18 Pro simulator.
- Browser checks cover note creation, rename dialog, Open files selection, synthetic horizontal swipe switching, and phone/tablet/desktop layouts. Real iOS swipe and software-keyboard interactions remain unverified for this update.

Earlier verification on September 19, 2026:

- 160 frontend tests and 20 native desktop tests pass; the optional speech-model download test is skipped. Production frontend build and native simulator archive succeed.
- iPhone 18 Pro simulator: create/edit/save, inspect the saved native file, terminate/relaunch with saved content intact, recover unsaved content after termination, and search saved text.
- iPad Pro 11-inch (M5) simulator: create/edit/save, inspect the saved native file, terminate/relaunch, and landscape layout.
- Browser checks at phone/tablet/desktop widths passed in the earlier layout checks.

The archive still emits a linker warning for the BLAKE3 assembly object's SDK deployment version. iOS 27 is the only native runtime tested; older OS compatibility, physical hardware, release archives, VoiceOver, and the full software-keyboard matrix remain unverified.

A narrow browser window previews the touch layout with sample notes. It does not validate native file storage, iOS permissions, WebKit keyboard behavior, or signing.

Before distributing a native build, verify on both iPhone and iPad: create and save a note, edit and recover an unsaved draft after relaunch, rename and delete through the note actions menu, search and jump to bookmarks, rotate with the keyboard open, background/foreground the app, and confirm content persists without network access. Test with VoiceOver and a hardware keyboard too.

For Google Drive testing, keep Xcode’s normal simulator signing enabled. `--no-sign` removes the simulated application entitlement needed by Keychain, so that build cannot save or read Google credentials. This simulator build uses ad hoc signing and does not require a paid Apple developer account.
