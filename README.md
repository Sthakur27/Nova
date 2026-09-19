# Nova

A local-first Mac and Windows notes prototype: ordinary folders, plain text and Markdown, filename-first search, and named bookmarks inside any note.

## Run

Requires Node.js 22+ and Rust stable. On macOS install Xcode Command Line Tools. On Windows install Visual Studio C++ Build Tools (Desktop development with C++) and WebView2. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run tauri dev
```

If Rust is newly installed on this machine, run `source "$HOME/.cargo/env"` first. `npm run dev` starts a browser-only preview with editable sample notes; local-folder access requires the desktop app. Sample notes persist in local storage and are explicitly labeled.

## Use

- **Open a folder**: browse its `.md`, `.markdown`, `.mdx` (rendered as Markdown, without JSX), and `.txt` files. No vault or changes to folder structure.
- **Write / Read**: CodeMirror source editing and formatted Markdown. One document is mounted at a time. Inactive files are not loaded.
- **Command-K / Ctrl-K**: search filenames first, then saved file contents. All / Files / Text filters; arrows and Enter navigate results. Selecting a text result opens its line in Write mode.
- **Command-Shift-B / Ctrl-Shift-B**: bookmark a selection or the current line. Name, rename, remove, preview, and jump from the right rail. Read-mode selection works when the selected visible text maps directly to Markdown source.
- **Command-S / Ctrl-S**: save. Switching files and closing the native window also save. Adding, renaming, or deleting a bookmark saves the note and its anchors.
- **Refresh folder**: rescan after files are added or removed externally.

Bookmarks live in Tauri's OS app-data directory, under `com.nova.notes.prototype/bookmarks`, keyed by canonical file path. They never add markup or metadata to notes folders. They follow edits using CodeMirror transaction mappings. On reopen, stored excerpts recover moved passages; missing excerpts are flagged. Renaming/moving a file outside Nova does not yet migrate its bookmarks. Deleted-anchor recovery through Undo is not implemented.

Saves compare the disk revision before writing and use a temporary file plus atomic replacement. A detected external change prevents the save and keeps edits open. Copy edits to a safe place before reopening when there is a conflict. CRLF line endings are preserved for CRLF documents; mixed line endings normalize. Atomic replacement may not preserve all extended file attributes. This prototype is not a collaborative editor or a backup system.

## Bounds and current limitations

- Up to 32 MiB per UTF-8 text file and 50,000 notes per folder.
- Formatted preview is limited to 500,000 characters; larger documents use the virtualized source editor.
- Text search streams saved files, returns at most 80 matches, and cancels superseded searches between reads. It skips files over 32 MiB and invalid UTF-8 content. `.git`, `.obsidian`, `node_modules`, `target`, and `.Trash` directories are excluded, and directory symlinks are not followed.
- No filesystem watcher, automatic reload, new-file UI, multiple tabs, image attachments, live inline Markdown, plugin compatibility, or sync yet. Refresh and reopening a file pick up disk changes.
- Fonts are bundled locally. Markdown raw HTML is not executed. Image rendering is deliberately a placeholder in this first version.
- RAM targets are not benchmarked yet. Tauri's webview subprocesses must be included in any measurement.

## Verify / build

```sh
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

Tests cover live anchor movement, external reanchoring, missing passages, emoji offsets, search ranking, file scope, symlink escapes on Unix, stale-save rejection, and CRLF preservation. A GitHub Actions workflow builds on Mac and Windows when pushed; Windows has not been tested locally.

Architecture: React/TypeScript → Tauri IPC → Rust file operations. CodeMirror owns the live text buffer. Markdown rendering is lazy-loaded. Full-text search runs off the UI thread and does not retain all note bodies in memory.
