# Developing Nova

[← Back to Nova](../README.md) · [Reference guide](user-guide.md)

Build prerequisites, local development, packaging, and verification. To install Nova without developer tools, use the [downloads](../README.md#download-nova).

## Run from source (developers)

Requires Node.js 22.22.2+ (or 24.15+ / 26+), Rust stable, CMake, and libclang (for the local speech engine's platform-specific bindings). On macOS 11 or later, install Xcode Command Line Tools. On Windows install Visual Studio C++ Build Tools (Desktop development with C++), LLVM, and WebView2. If libclang is not discovered automatically, set `LIBCLANG_PATH` to LLVM's `bin` directory. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run desktop
```

For direct `cargo` commands and packaging on a newly configured Mac, run `source "$HOME/.cargo/env"` first if Cargo is not on your PATH. `npm run dev` starts a browser-only preview with editable sample notes; local-folder access requires the desktop app. Sample notes persist in local storage and are explicitly labeled.

### Fast iteration

Run `npm run desktop` and leave it running while making changes. This opens the native app with live frontend updates; Rust changes automatically rebuild and restart it. The launcher automatically chooses an available frontend port, so an existing preview server does not block startup. The command finds Rust in the standard Cargo installation directory, so sourcing Cargo's environment is not needed for this command. Stop it with Ctrl-C.

Quit the installed Nova before starting development: both use the same saved folders and bookmarks. Unsaved edits are retained as local recovery drafts across reloads and native restarts. Development does not update `/Applications/Nova.app`; the Dock copy stays at its last installed version. No DMG or drag-to-Applications step is needed to try changes. Use `npm run package` when you need an installer to share.

## Verify / build

### Native window backgrounds

Both Windows and macOS use the transparent window in `src-tauri/tauri.conf.json`, so Galaxy mode's Translucent background control remains available on both platforms.

On Windows, `configure_window_menu` hides only the native menu strip, which can expose the desktop when a transparent window is maximized. It keeps the native title bar and window controls, and retains the registered menu for keyboard accelerators. This runs for the startup window and additional windows created by `new_window`. macOS keeps its visible system menu unchanged. Do not disable window transparency to fix a menu-strip rendering issue.

For native visual verification, maximize, restore, resize, minimize/restore, and enter/exit fullscreen with both Galaxy modes, then repeat in a newly opened window. On Windows, check that no menu strip remains below the title bar, the window controls and Ctrl-Q/Ctrl-A/Ctrl-C/Ctrl-V/Ctrl-Z shortcuts work, and the translucency toggle visibly switches the editor between translucent and solid backgrounds. On macOS, check the traffic lights, system menu, fullscreen transitions, and Galaxy translucency.

### Generate installers

After installing the build prerequisites above and running `npm ci`, run:

```sh
npm run package
```

This rebuilds the frontend and native app in release mode, then generates a macOS `.dmg` or Windows NSIS setup `.exe` for the current machine's architecture. Run it again after any changes. It runs without interactive prompts and returns a nonzero exit code if the build fails. macOS installers must be built on a Mac; Windows installers must be built on Windows. End users do not need Node, Rust, or CMake.

Default output locations:

- macOS: `src-tauri/target/release/bundle/dmg/`
- Windows: `src-tauri/target/release/bundle/nsis/`

For another architecture on the same OS, install its Rust target with `rustup target add <target>`, then run `npm run package -- --target <target>`. Targeted builds place output under `src-tauri/target/<target>/release/bundle/`. A custom `CARGO_TARGET_DIR` changes the target directory.

The **Desktop installers** GitHub Actions workflow runs on every push and pull request, and can also be started with **Actions → Desktop installers → Run workflow**. It runs tests and generates separate Apple Silicon Mac, Intel Mac, and Windows x64 installers. Successful builds on `main` publish a GitHub Release after all three platforms pass. Each release uses a unique build tag and includes installers with stable filenames plus `SHA256SUMS.txt`; the README links always resolve to the latest complete release. The release is assembled as a draft and published only after all files upload. Pull requests and other branches only upload Actions artifacts, retained for 14 days and requiring GitHub sign-in. Installer binaries are release assets, not files committed to Git history.

Mac bundles use Tauri's free ad-hoc signing (`bundle.macOS.signingIdentity: "-"`), requiring no Apple membership, certificates, or CI secrets. This seals the complete app bundle, unlike the linker's executable-only signature. After packaging, CI mounts each Mac DMG read-only and runs `codesign --verify --deep --strict` on the app inside it; invalid or missing signatures prevent publication. You can run the same check locally:

```sh
bash scripts/verify-macos-installer.sh src-tauri/target/release/bundle/dmg/*.dmg
```

Ad-hoc signing is not notarization or proof of publisher identity. Gatekeeper can still block a browser download; see the [Mac installation instructions](../README.md#download-nova) for approval and the app-specific quarantine workaround. Gatekeeper acceptance (`spctl`) is deliberately not the release check because non-notarized builds are expected to be rejected. Windows builds remain unsigned. See [Tauri ad-hoc signing](https://v2.tauri.app/distribute/sign/macos/#ad-hoc-signing). Generated installers stay out of Git.

```sh
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

Tests cover terminal startup, tab lifetimes, collapse and teardown, a real Unix PTY shell (input, working directory, and resize), panel shortcuts and dragging, dictation previews and cancellation, the native dictation shortcut, toolbar preference-menu navigation and dismissal, shared Edit/Read markup, checkbox-only source changes, preservation of untouched Markdown, table alignment, rich-editor undo/redo and selections, large-note fallback, extension-specific modes, single-click file opening, bookmark tracking and search, formatting, current-tab search, tabs, folder and session preferences, recovery drafts, find/replace matching, zoom shortcuts, large-document pagination and nested lists, custom extensions, note creation and renaming, empty-note cleanup, starred-file registries, move destinations, file scope, symlink escapes on Unix, stale-save rejection, and CRLF preservation. Windows has not been tested locally.

Architecture: React/TypeScript → Tauri IPC → Rust file operations. CodeMirror owns the Markdown text buffer, undo history, and bookmark mappings. Tiptap/ProseMirror provides the shared Edit/Read document surface and maps changes back into that buffer. Unchanged blocks retain their original Markdown; edits can normalize the changed block. Large-note pagination prepares Markdown in a background worker. Full-text search runs off the UI thread and does not retain all note bodies in memory.


## Terminal and live dictation

The terminal UI lazy-loads xterm.js with its fit addon. Rust uses `portable-pty` to start shells and streams byte output through a Tauri channel. Sessions belong to their creating window; write, resize, and close commands check that ownership. Window destruction closes its sessions. Frontend tests mock IPC for session lifecycle checks; the Unix Rust test exercises a real shell without launching the desktop UI.

Dictation captures microphone audio while a single Whisper decoder produces periodic partial transcripts, followed by a final transcript on Stop. Session IDs filter stale events. CodeMirror tracks the preview range outside undo history and preserves user edits to that range. Ordinary tests do not use the microphone or download a model. To exercise decoding against the public JFK fixture, run:

```sh
cargo test --manifest-path src-tauri/Cargo.toml actual_whisper_transcription -- --ignored --nocapture
```

Set `NOVA_SPEECH_TEST_MODEL` to an existing tiny.en model file to skip the model download; the fixture is still downloaded. This test checks partial decoding, final transcription, and cancellation, not microphone capture or desktop permissions.

## iPhone and iPad

See [the iOS port guide](mobile.md) for the mobile scope, prerequisites, simulator commands, and outstanding device checks.
