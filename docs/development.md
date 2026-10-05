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

### Cloud-only web preview

`npm run dev:web` runs the separate browser app on port 1422. `npm run build:web` produces `dist-web/` with an installable manifest and versioned offline shell; `npm run preview:web` serves it locally. Native builds and the ordinary browser demo retain their existing entry point. Web modules live in `src/web`, share `Editor`, and use IndexedDB plus direct Drive APIs instead of Tauri commands. Tests use fake IndexedDB and simulated Google responses.

Set only the public `VITE_GOOGLE_WEB_CLIENT_ID` for the web build. Do not expose native secrets through Vite environment variables. The checked-in Vercel configuration builds this static target. See [web setup and verification](web.md) and the [implementation specification](specs/nova-web.md).

### Fast iteration

On macOS, run `node scripts/setup-dev-signing.mjs` once before starting desktop
development. It creates a **Nova Local Development** code-signing identity in
your user keychain. If macOS asks whether **codesign** may use that key, choose
**Always Allow**. The launcher signs each native build with that same certificate
before starting it, so approving access to **Nova Google Drive** survives Rust
rebuilds and restarts. The first run after switching from ad-hoc signing can still
require one more **Always Allow** approval for the Drive credential.

The private signing key stays in Keychain; temporary certificate-generation files
are deleted. Rerunning setup reuses the existing identity. Use `npm run desktop`
for this signing flow; raw `cargo run` and `npm run tauri dev` bypass it. The local
certificate is for development only and does not change installer signing or
notarize the app.

Run `npm run desktop` and leave it running while making changes. This opens the native app with live frontend updates; Rust changes automatically rebuild and restart it. The launcher automatically chooses an available frontend port, so an existing preview server does not block startup. The command finds Rust in the standard Cargo installation directory, so sourcing Cargo's environment is not needed for this command. Stop it with Ctrl-C.

On macOS, `./run.sh` starts desktop development and `./runios.sh` opens Xcode for a standalone debug iPhone build with the interface bundled locally. Both first stop existing development sessions belonging to this checkout, including their child servers and builds. Use `./runios.sh --live` for live frontend updates through the Mac’s development server; `--standalone` remains an explicit alias for the default. Use the npm commands directly when you want to keep another session running.

For a standalone install, run `./runios.sh`, keep the terminal running, select your iPhone and signing team, and click **Run (▶)** in Xcode to install it. The terminal can close after installation. **Build** alone does not update the app on the phone. See [standalone iPhone installation and blank-screen troubleshooting](mobile.md#install-an-app-that-works-without-the-development-server).

Quit the installed Nova before starting development: both use the same saved folders and bookmarks. Unsaved edits are retained as local recovery drafts across reloads and native restarts. Development does not update `/Applications/Nova.app`; the Dock copy stays at its last installed version. No DMG or drag-to-Applications step is needed to try changes. Use `npm run package` when you need an installer to share.

## Verify / build

### Native window backgrounds

Both Windows and macOS use the transparent window in `src-tauri/tauri.conf.json`. Galaxy mode offers Translucent and Black on both platforms; Frosted backgrounds and panels are available only on macOS.

On Windows, `configure_window_menu` hides only the native menu strip, which can expose the desktop when a transparent window is maximized. It keeps the native title bar and window controls, and retains the registered menu for keyboard accelerators. This runs for the startup window and additional windows created by `new_window`. macOS keeps its visible system menu unchanged. Do not disable window transparency to fix a menu-strip rendering issue.

For native visual verification, maximize, restore, resize, minimize/restore, and enter/exit fullscreen with both Galaxy modes, then repeat in a newly opened window. On Windows, check that no menu strip remains below the title bar, the window controls and Ctrl-Q/Ctrl-A/Ctrl-C/Ctrl-V/Ctrl-Z shortcuts work, and the Background control cycles between Translucent and Black with no Frosted option. On macOS, check the traffic lights, system menu, fullscreen transitions, Galaxy translucency, and independent Frosted background and panel controls.

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

`scripts/ios-launcher.test.mjs` exercises the macOS-only `runios.sh` launcher with POSIX executable fixtures. It runs on both macOS CI jobs and is explicitly excluded on other platforms; Windows still runs the remaining frontend and native tests before packaging.

Tests cover terminal startup, tab lifetimes, collapse and teardown, a real Unix PTY shell (input, working directory, and resize), panel shortcuts and dragging, dictation previews and cancellation, the native dictation shortcut, toolbar preference-menu navigation and dismissal, shared Edit/Read markup, checkbox-only source changes, preservation of untouched Markdown, table alignment, rich-editor undo/redo and selections, large-note fallback, extension-specific modes, single-click file opening, bookmark tracking and search, formatting, current-tab search, find toggling and query retention, tab drag reordering and cancellation, formatted-document line highlighting, tabs, folder and session preferences, recovery drafts, find/replace matching, zoom shortcuts, large-document pagination and nested lists, custom extensions, note creation and renaming, empty-note cleanup, starred-file registries, move destinations, file scope, symlink escapes on Unix, stale-save rejection, and CRLF preservation. Windows has not been tested locally.

Architecture: React/TypeScript → Tauri IPC → Rust file operations. CodeMirror owns the Markdown text buffer, undo history, and bookmark mappings. Tiptap/ProseMirror provides the shared Edit/Read document surface and maps changes back into that buffer. Unchanged blocks retain their original Markdown; edits can normalize the changed block. Large-note pagination prepares Markdown in a background worker. Full-text search runs off the UI thread and does not retain all note bodies in memory.

### Outline, external changes, and workspace replacement

`HeadingOutline` parses the active source in a short-lived worker after a typing pause, only while its panel is visible. Source offsets drive the existing editor/reader navigation; rendering is paged at 200 headings.

`local_changes::native_watch` uses [notify](https://docs.rs/notify/8.2.0/notify/) native backends with nonrecursive directory watches. Subscriptions belong to the requesting window and are removed on window destruction or target changes. Watching parents preserves detection across atomic file replacement; intermediate parents also support removed/recreated directories. Events are filtered against open Local files and expanded directories before entering a bounded queue. A worker blocks while idle, combines bursts with a 200 ms quiet period and 500 ms maximum batch interval, and reports overflow/errors as reconciliation requests. It never walks a repo recursively to register watches.

`useLocalChanges` listens for `nova:local-changes` before configuring its subscription. Generations reject stale subscription results/events. Native batches schedule only affected paths; initial setup, window focus, and watcher rescan requests reconcile current targets using `local_path_stamps` and note revisions. There is no recurring scan timer. Pending work is deferred while hidden/busy and retried with a bound for persistent read failures. `prepareLocalReload` rechecks dirty, recovery, and operation state after asynchronous reads before applying a clean reload. Directory refresh uses `refresh_directory` to rebuild its loaded prefix in one pass; `scanned` tracks inspected entries even when filtering hides them, avoiding repeated page-prefix traversal.

Frontend tests cover idle behavior, batching, focus/overflow reconciliation, stale generations, hidden/busy deferral, and draft protection. Native tests exercise the real OS watcher with a 5,000-file fixture, atomic replacement, deletion, bounded registration/queues, and symlink boundaries. Verify the desktop UI by editing a temporary workspace externally with both clean and dirty tabs, deleting an open file, and adding/removing files from expanded directories. Native events may be unavailable on some network or virtual filesystems; focus/manual reconciliation remains available without silently falling back to periodic repo scans.

Metadata tests use different file lengths rather than assuming that rapid writes advance filesystem timestamps. Same-metadata events remain covered by the frontend forced-reload test. The native root-removal test deletes the fixture while the full subscription remains active instead of renaming it: Windows can deny directory renames while watcher handles remain open. It still requires a real rescan event, and all platforms retain atomic-save, deletion, and nested-directory recreation coverage.

`WorkspaceSearch` provides the persistent sidebar Search view and Command/Ctrl-Shift-F capture shortcut. It debounces saved-content searches, ignores stale responses, groups hits by file, and shares the search-preference storage format with the palette. The palette’s Replace entry hands its query to this panel. Leaving the panel invalidates replacement previews and stops queued writes; an already running save completes normally.

`workspaceReplace` builds bounded previews using existing search filters. `replace_saved_note` serializes writes under `Access.writes`, validates the reviewed disk revision and UTF-16 edit ranges, rejects recovery drafts and Cloud roots, and maps the latest bookmark metadata before the normal CRLF-preserving atomic save. Metadata is restored if the note save fails; these are two separate files, not a crash-atomic transaction. UI tests cover selection, preview invalidation, partial failures, and cancellation; native tests cover stale previews, drafts, Unicode bookmarks, CRLF, and scope guards.


## Terminal and live dictation

The terminal UI lazy-loads xterm.js with its fit addon. Rust uses `portable-pty` to start shells and streams byte output through a Tauri channel. Sessions belong to their creating window; write, resize, and close commands check that ownership. Window destruction closes its sessions. Frontend tests mock IPC for session lifecycle checks; the Unix Rust test exercises a real shell without launching the desktop UI.

Dictation captures microphone audio while a single Whisper decoder produces periodic partial transcripts, followed by a final transcript on Stop. Session IDs filter stale events. CodeMirror tracks the preview range outside undo history and preserves user edits to that range. Ordinary tests do not use the microphone or download a model. To exercise decoding against the public JFK fixture, run:

```sh
cargo test --manifest-path src-tauri/Cargo.toml actual_whisper_transcription -- --ignored --nocapture
```

Set `NOVA_SPEECH_TEST_MODEL` to an existing tiny.en model file to skip the model download; the fixture is still downloaded. This test checks partial decoding, final transcription, and cancellation, not microphone capture or desktop permissions.

## Desktop updater releases

See [Desktop update releases](app-updates.md) for the signing secret, generated versions, updater artifacts, and rollout checks. Main-branch installer builds require the updater signing secret; local builds without it still produce ordinary installers. `npm test` includes the release-manifest validation test in `scripts/prepare-release.test.mjs`.

## Google Drive build configuration

Desktop OAuth uses the client ID in `src-tauri/src/drive_auth.rs`. Supply its
matching `NOVA_GOOGLE_CLIENT_SECRET` in the build environment or an ignored
repository-root `.env.local` file. `src-tauri/build.rs` loads that file and embeds
the value at compile time; rebuild the native app after changing it. A build
without this value disables Connect and explains that configuration is missing.
Do not commit local credentials. The embedded desktop client value is distinct
from users’ refresh tokens, which are stored through the native credential store.

Ordinary native tests cover callback validation, credential caching, selection
inheritance, and restore name/ID validation without contacting Google. Frontend
tests cover connection state, queued uploads, restore controls, tab-close prompts
and shortcuts, and formatting state. Additional tests cover explorer double-click
promotion, click-position title editing, and confirmation before disabling
effective sync, including inherited folder defaults. Live Drive tests are explicitly ignored:
`live_selected_upload` requires `NOVA_DRIVE_TEST_ROOT` and a JSON array in
`NOVA_DRIVE_TEST_FILES`, uploads those selected root-level notes, and leaves them
in Drive. `live_update_and_conflict_guard` creates a generated test folder,
checks updates and stale-write rejection, then deletes that test folder. Both
use the saved desktop connection; run only the intended test with `--ignored`.

Cloud folder creation queues paths in the protected `cloudPendingFolders` registry
field. Sync reserves Drive folder IDs before creation, reuses reservations on retry,
and materializes remote empty folders without following symlinks. Cloud Explorer
receives a complete directory listing; Local retains lazy directory paging.
Folder paths are not note identities: note moves continue to update the same
Drive ID with conditional parent changes. Native regression tests use temporary
filesystem folders and a loopback HTTP server; live multi-device Drive verification
remains separate.


## Google Drive connection test

Use `python3 scripts/test-drive-connection.py --help` for the standalone Drive smoke test, which performs manual OAuth, generated-note upload, and exact read-back checks. It is independent of the app’s stored connection and is not run by the normal test suite.

## iPhone and iPad

See [the iOS port guide](mobile.md) for the mobile scope, prerequisites, simulator commands, and outstanding device checks.

## Workspace metadata editor

`registry_editor.rs` exposes separate read, validate, and save commands for the root `.nova` file. Ordinary note scope and sync scans continue to reject it. Native saves validate under the shared write lock and compare disk revisions before atomic replacement. Cloud identity/tracking fields must equal their saved values. `storage.ts` routes `.nova` reads and saves from normal editor tabs to these commands. `RegistryValidation.tsx` shows debounced native validation inline; tabs use the existing draft store and explicit Save, with Cloud autosave disabled for metadata. Local navigation visibility and the search `includeHidden` option are separate preferences. The search matcher filters both traversal and results so hidden directories are searched only when requested.

## Saved states

`savedStates.ts` validates nine versioned, device-local layout slots per Local folder context in `nova:saved-states:v2:<scope>`. The scope uses sorted Local roots, independent of the selected tab and loaded Cloud spaces; windows without Local folders use a separate Cloud-only scope. Folder changes reload slots and clear the window’s flex return point and layout baseline. Storage events refresh other windows in the same scope. Compatible slots from the legacy global `nova:saved-states:v1` key remain readable until the first scoped write; the legacy source stays intact for other folders, and Cloud-only legacy layouts belong to the Cloud-only scope. Entries contain file identities, pane trees, active selections, and vertical scroll offsets, never document bodies or editor histories. `App` preserves drafts and prepares every referenced note through the normal recovery path before replacing tabs and panes; unavailable roots/files and edits during preparation abort the layout change. Restored editors reuse matching in-memory snapshots for undo history and mount with an explicit scroll offset. `ReadPaneSurface` waits for lazy reader content to grow before restoring its scroll position. Keyboard shortcuts use physical digit codes so macOS Option characters work. A window-local flex return point is committed only after successful preparation. Layout comparisons preserve it across saved-state switching while detecting navigation changes; scrolling, text edits, and appearance changes do not replace it. Returning consumes it. Legacy appearance fields are ignored. Saved views include optional validated Source/Edit/Read modes for every tab; older states without modes fall back to current per-file preferences. Restore normalizes saved modes through `availablePaneMode`, preserving file-type and Read-visibility constraints, and does not change app chrome or appearance. Mode changes count as a new flex layout so Previous state can return to them.

`App.savedStates.test.tsx` exercises the real App and editors: save a Markdown layout in Edit or Read, switch to Source, restore through the sidebar, return to Previous state, and restore by shortcut after remounting. These browser-environment tests check both toolbar selection and the displayed document surface.

Verify with two split notes at different scroll positions: save a state, navigate elsewhere or close a pane, then restore with Command-Option-1 / Ctrl-Alt-1. Repeat after restart, with unsaved edits, with an unavailable root, and with Source and formatted Edit/Read. Browser fixtures cover frontend behavior; native Cloud access and OS shortcut delivery need desktop verification.

`trackScrollSpace` compensates desktop editor/reader scroll offsets when the document viewport height changes. The viewport-sized top spacer otherwise cancels the upward movement from collapsing top chrome. It observes the document area, rebases hidden surfaces, and uses instant adjustments with existing scroll anchoring disabled. Mobile retains its independent scroll-space behavior.

Sidebar saved-state reordering uses `useStateReorder` pointer handling, matching tab dragging for desktop webviews with native file-drop interception. It supports edge autoscroll, Escape/blur cancellation, and keyboard Up/Down on grips. Saved-state cards use `data-panel-no-drag` so card gestures cannot also start sidebar resizing; an integration test exercises both handlers together. Reordering fills the existing occupied slot positions, so deleted slots remain empty and displayed shortcuts track the new order. Overwrite and reorder compare the latest storage before writing to avoid silently replacing another window’s updates.

### Cloud-only desktop windows

`new_window` accepts an optional `cloudOnly` flag, passed into the new webview before startup. A requested local root takes its own folder-session path; native launch rejects combining a root with `cloudOnly: true`. `cloudWindowPreferences` filters roots and pane tabs before `loadFolders`, retaining Local sessions in Recents without opening their files. The saved explorer payload remembers `cloudOnly`; an explicit local-folder launch clears it. Session persistence remains shared between windows (last writer wins), not a per-window session registry.

Verify the folder menu launches a separate native Cloud-only window, with no Local section and no change to the originating window. Check disconnected setup, a connected empty space, cached notes offline, restart, and reopening a local recent into a mixed window. Menu, preference, and IPC tests cover the frontend portions; Google authentication and real offline sync require native verification.

## Built-in documents

`BuiltinDocs.tsx` provides the About Nova book button in App’s navigation row below Quick find, alongside Files, Search, folder, and Recent files controls. It opens Welcome directly in a modal read-only Markdown viewer, with buttons to switch to Changelog. Initial focus goes to Close rather than the document heading; closing restores focus to the book button. Vite bundles `docs/welcome.md` and the root `CHANGELOG.md` through raw imports, so both work offline without filesystem or Drive access. Edit those Markdown files to update the bundled pages; keep Welcome focused on everyday workflows and platform differences. The changelog retains its development-date and publication caveats. Relative changelog links resolve against the repository on GitHub. These pages never enter note tabs, recovery drafts, saved states, or workspace search.

## Recent files

`recentFileHistory.ts` stores a bounded, deduplicated list of root/path identities in device-local `nova:recent-files:v1` storage. App records successful document selection, not text or sync updates; the sidebar filters to mounted workspace roots and applies Explorer’s connected-account boundary for Cloud. Writes read the latest stored list and storage events refresh other windows. Renames, moves, deletion, and discarded empty notes update history without touching document ownership or recovery. Recent files reopen through `openNote`; folder sessions remain in `explorer.json` and are accessible from `OpenWindowMenu`. Tests cover ordering, scope, persistence, clearing, and menu keyboard/focus behavior. Browser checks do not verify native folder launch or Drive access.
