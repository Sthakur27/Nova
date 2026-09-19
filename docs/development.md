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

Installer generation does not configure developer certificates or notarization. Current iteration builds may require OS security approval to open; public distribution still needs signing setup, including Apple notarization. Existing Tauri signing environment variables and configuration are honored by the script. See [Tauri distribution](https://v2.tauri.app/distribute/). Generated installers stay out of Git.

```sh
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

Tests cover toolbar preference-menu navigation and dismissal, shared Edit/Read markup, checkbox-only source changes, preservation of untouched Markdown, table alignment, rich-editor undo/redo and selections, large-note fallback, extension-specific modes, single-click file opening, bookmark tracking and search, formatting, current-tab search, tabs, folder and session preferences, recovery drafts, find/replace matching, zoom shortcuts, large-document pagination and nested lists, custom extensions, note creation and renaming, empty-note cleanup, starred-file registries, move destinations, file scope, symlink escapes on Unix, stale-save rejection, and CRLF preservation. Windows has not been tested locally.

Architecture: React/TypeScript → Tauri IPC → Rust file operations. CodeMirror owns the Markdown text buffer, undo history, and bookmark mappings. Tiptap/ProseMirror provides the shared Edit/Read document surface and maps changes back into that buffer. Unchanged blocks retain their original Markdown; edits can normalize the changed block. Large-note pagination prepares Markdown in a background worker. Full-text search runs off the UI thread and does not retain all note bodies in memory.
