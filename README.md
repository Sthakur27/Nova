# Nova

A local-first Mac and Windows notes prototype: ordinary folders, plain text and Markdown, filename-first search (including bookmark names and excerpts), named bookmarks across your folders, recovery drafts, starred files, and a customizable writing workspace.

## Run

Requires Node.js 22.22.2+ (or 24.15+ / 26+), Rust stable, and CMake (for the local speech engine). On macOS 11 or later, install Xcode Command Line Tools. On Windows install Visual Studio C++ Build Tools (Desktop development with C++) and WebView2. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run desktop
```

For direct `cargo` commands and packaging on a newly configured Mac, run `source "$HOME/.cargo/env"` first if Cargo is not on your PATH. `npm run dev` starts a browser-only preview with editable sample notes; local-folder access requires the desktop app. Sample notes persist in local storage and are explicitly labeled.

### Fast iteration

Run `npm run desktop` and leave it running while making changes. This opens the native app with live frontend updates; Rust changes automatically rebuild and restart it. The launcher automatically chooses an available frontend port, so an existing preview server does not block startup. The command finds Rust in the standard Cargo installation directory, so sourcing Cargo's environment is not needed for this command. Stop it with Ctrl-C.

Quit the installed Nova before starting development: both use the same saved folders and bookmarks. Unsaved edits are retained as local recovery drafts across reloads and native restarts. Development does not update `/Applications/Nova.app`; the Dock copy stays at its last installed version. No DMG or drag-to-Applications step is needed to try changes. Use `npm run package` when you need an installer to share.

## Use

- **Add folders**: keep up to 100 ordinary folders open together and browse Markdown (`.md`, `.markdown`, and `.mdx`, without JSX) and UTF-8 text files, including custom extensions and extensionless files. No vault is required. Custom file types are screened for text content before appearing in the explorer.
- **Source / Edit / Read**: raw Markdown, styled live editing, and a reading view. Edit supports headings, emphasis, links, lists, task checkboxes, quotes and inline code, plus a formatting toolbar. Complex tables, fenced code and other unsupported structures remain source in Edit; Read renders full supported Markdown. Switching modes does not rewrite the document. One document is mounted at a time. Inactive files are not loaded.
- Drag a folder handle to reorder roots. Arrow keys on the handle and the folder menu also reorder. Collapse roots independently; remove only removes the explorer entry. Drop folders from Finder/Explorer to add them. Folder order, root and nested-directory collapse state, mode, open tabs, and the active note are remembered in app-data `explorer.json`. Unavailable roots remain visible for retry.
- **Command-K / Ctrl-K**: search filenames, bookmark names and excerpts, and saved file contents. Use All / Files / Bookmarks / Text filters, arrows and Enter to navigate, and Escape to close. Results include their folder; text results open at their line in Source mode. The All filter also includes commands such as **Toggle line numbers**.
- **Command-F / Ctrl-F**: find within the note in Source or Edit, with match counts and Enter / Shift-Enter navigation. Expand **Search options & replace** for case-sensitive, whole-word, or regex matching, selecting all matches, and replacing one or all matches. Escape closes find.
- **Search scope**: Everywhere searches all added folders; Current tab searches the focused note, including unsaved edits, and jumps without saving or reloading. The scope is remembered for the session and Current tab is disabled without an open note.
- **Command-Shift-B / Ctrl-Shift-B**: bookmark a selection or the current line, or use the bookmark button beside the active editor line. Name, rename, remove, preview, and jump from the right rail. Switch between Current tab and All bookmarks to browse passages across added folders. Read-mode selection works when the selected visible text maps directly to Markdown source.
- **Command-S / Ctrl-S**: save. Switching files, closing tabs, and quitting preserve local recovery drafts without writing edits to the original file. Bookmark edits are retained with the draft until Save.
- **Command− / Ctrl−** and **Command+ / Ctrl+**: zoom the interface out or in (50–200%). Command= / Ctrl= also zooms in; Command-0 / Ctrl-0 resets to 100%.
- **New note**: click the new-tab + button or press Command-T / Ctrl-T to create `Untitled.txt` in the active folder (or the first available folder). Choose a different default extension in Settings, such as `.md`, `.json`, or a custom extension. Existing names get a numeric suffix. Markdown notes open in Edit; other text files open in Source. Closing an untouched empty untitled note created in the current session removes its empty file; notes with drafts, content, or a new name are retained.
- **Rename**: use the pencil beside a file, right-click → **Rename…**, or double-click a fixed tab. The dialog separates the file name and extension and previews the destination path. Enter applies; Escape cancels. Renaming within Nova carries bookmarks, stars, drafts, and the open tab to the new name.
- **File actions**: right-click a file to move it to an existing directory within the same root, reveal it in Finder/Explorer, or permanently delete it after confirmation. Moving carries bookmarks, stars, drafts, and tabs; deleting removes the file and its saved bookmarks.
- **Starred files**: toggle the star beside a filename, then use the explorer header’s star to show only starred files across added folders. Stars are stored as relative paths in a `.nova` JSON file at each root; this registry is excluded from the note list.
- **New window**: Command-N / Ctrl-N opens another Nova window.
- **Refresh folder**: rescan after files are added or removed externally.

Bookmarks live in Tauri's OS app-data directory, under `com.nova.notes.prototype/bookmarks`, keyed by canonical file path. They never add markup or metadata to notes folders. They follow edits using CodeMirror transaction mappings. On reopen, stored excerpts recover moved passages; missing excerpts are flagged. Renaming/moving a file outside Nova does not yet migrate its bookmarks. Deleted-anchor recovery through Undo is not implemented.

Saves compare the disk revision before writing and use a temporary file plus atomic replacement. A detected external change prevents the save and keeps edits open. Recovery drafts retain their original disk revision, so restoring a draft does not bypass conflict checks. Copy edits to a safe place and reconcile external changes when there is a conflict; reopening restores the draft. CRLF line endings are preserved for CRLF documents; mixed line endings normalize. Atomic replacement may not preserve all extended file attributes. This prototype is not a collaborative editor or a backup system.

## Workspace and formatting

Open **Settings** from the sidebar or with Command-comma / Ctrl-comma. Preferences save automatically on this device: Galaxy mode (translucent background), energy effects, editor text size, text width, line numbers, line highlight, word wrap, spellcheck, bookmark-panel visibility, and the default extension for new files. Text width applies to Source, Edit, and Read; text size applies to Source and Edit. The document toolbar also offers quick text-width and line-display controls.

Collapse navigation, bookmarks, top bars, or the status bar with the edge controls. Drag a side-panel divider to resize it; double-click to reset. Focused dividers support arrow keys (Shift for larger steps), Home/End, and Enter to reset. Panel widths and visibility are remembered. **Command-G / Ctrl-G** toggles focus mode; the exit control restores the workspace.

The formatting toolbar includes Undo/Redo, headings 1–6, bold, italic, strikethrough, inline code, ordered and unordered lists, tasks, and quotes. In Markdown notes, Command/Ctrl-B and -I apply bold and italic; Command/Ctrl-Shift-X applies strikethrough. Command/Ctrl-Alt-1 through -6 apply headings, and -0 returns to normal text. Command/Ctrl-Shift-7, -8, and -9 apply numbered lists, bullets, and quotes. Tab / Shift-Tab indent or outdent Markdown by four spaces. Formatting preserves existing indentation, and Read mode recognizes nested numbered lists that start above 1. Selection highlighting covers line breaks and blank lines; energy effects follow the selected passage.

## Tabs

Double-click an explorer filename to open it, or activate its focused button with the keyboard. When the active tab is an italic preview, opening another file replaces that preview; otherwise explorer files open as fixed tabs. Double-click a preview tab or edit its note to keep it open. Double-clicking a fixed tab opens the rename dialog. Opening an already open file selects its existing tab. Close tabs with their × button. Switching or closing retains unsaved edits as recovery drafts; reopening the file restores them. A recovery-storage failure keeps the note open and reports the problem.

Only the active editor is mounted. Open tabs keep in-memory editor states for cursor position and undo history; these are released when closed or replaced. External file changes invalidate the cached state on reopening. Restarting restores the ordered tab list, active note, editing mode, explorer folders, and collapsed directories. Desktop drafts are written atomically to the app-data `drafts` directory on each edit, independently of the development server port; the status bar confirms when the write finishes. Browser previews use local storage. Drafts are stored per folder and file on this device, including after their tabs close, and follow file renames and moves within Nova. Explicit Save clears a draft after the file and anchors are written. Recovery writes can fail if storage is unavailable or full; failures are reported and normal desktop close/quit is blocked until edits can be preserved or saved.

## Voice typing

Click **Dictate** in the document toolbar. On first use, download the English Whisper tiny.en model (77,704,715 bytes, about 78 MB) from the upstream whisper.cpp Hugging Face repository. Nova checks the download's SHA-256 before installing it in its OS app-data `speech` directory. The model is not bundled into the app or committed to Git.

Place the cursor where you want to write, press **Dictate**, allow microphone access, speak, then press **Stop**. Nova uses the system's default microphone and inserts the transcript at the original insertion point (which follows intervening edits). Voice typing inserts text; it does not replace a selected passage. Each transcript is a separate undo step and existing bookmarks continue to track edits. A recording stops automatically after two minutes.

**Cancel** discards the recording/result. File and folder switching and app close/quit are blocked during active dictation so a result cannot land in another note. Save the inserted text with the usual Save command. There is no live partial transcript yet.

Audio stays in memory on your machine; it is not written to disk or uploaded. Only the one-time model download uses the network. Audio is downmixed/resampled to 16 kHz mono and capped at 7.68 MB; Whisper loads only while transcribing, uses up to four CPU threads, and is released afterward. Transcription has an additional temporary memory cost that has not yet been benchmarked. This first model is English-only; accuracy varies with speech, background noise, and microphone quality.

On macOS, allow Nova in **System Settings → Privacy & Security → Microphone** if needed. On Windows, enable microphone access for desktop apps under **Settings → Privacy & security → Microphone**. The browser preview explains the feature but does not record; voice typing requires the desktop build. Use the arrow next to Dictate to reopen voice settings or download the model again if it becomes corrupted. A load error leaves the note untouched.

The speech engine can be checked with a known public JFK audio fixture without opening a microphone:

```sh
cargo test --manifest-path src-tauri/Cargo.toml actual_whisper_transcription -- --ignored --nocapture
```

This explicit integration test downloads the model and fixture into a temporary directory. Normal tests do not download a model or request microphone access.

## Bounds and current limitations

- Up to 32 MiB per UTF-8 text file and 50,000 notes per folder.
- Read mode paginates documents over 500,000 characters and prepares Markdown in a background worker. Pages preserve Markdown blocks and cross-document references; bookmarks jump to the corresponding page. The full source and parsed document still reside in memory, and a single oversized Markdown block stays together on one page.
- Text search streams saved files, returns at most 80 matches, and cancels superseded searches between reads. It skips files over 32 MiB and invalid UTF-8 content. `.git`, `.obsidian`, `node_modules`, `target`, and `.Trash` directories are excluded, and directory symlinks are not followed.
- No filesystem watcher, automatic reload, image attachments, plugin compatibility, or sync yet. The folder menu’s Refresh action and reopening a file pick up disk changes.
- Fonts are bundled locally. Markdown raw HTML is not executed. Image rendering is deliberately a placeholder in this first version.
- RAM targets are not benchmarked yet. Tauri's webview subprocesses must be included in any measurement.

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

The **Desktop installers** GitHub Actions workflow runs on every push and pull request, and can also be started with **Actions → Desktop installers → Run workflow**. It runs tests and generates separate Apple Silicon Mac, Intel Mac, and Windows x64 installers. Open a successful run and download its installer under **Artifacts**; filenames on the run include the commit SHA and downloads are retained for 14 days. GitHub requires sign-in to download Actions artifacts. These iteration builds are not published as GitHub Releases.

Installer generation does not configure developer certificates or notarization. Current iteration builds may require OS security approval to open; public distribution still needs signing setup, including Apple notarization. Existing Tauri signing environment variables and configuration are honored by the script. See [Tauri distribution](https://v2.tauri.app/distribute/). Generated installers stay out of Git.

```sh
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

Tests cover bookmark tracking and search, formatting, current-tab search, tabs, folder and session preferences, recovery drafts, find/replace matching, zoom shortcuts, large-document pagination and nested lists, custom extensions, note creation and renaming, empty-note cleanup, starred-file registries, move destinations, file scope, symlink escapes on Unix, stale-save rejection, and CRLF preservation. Windows has not been tested locally.

Architecture: React/TypeScript → Tauri IPC → Rust file operations. CodeMirror owns the live text buffer. Markdown rendering is lazy-loaded. Full-text search runs off the UI thread and does not retain all note bodies in memory.
