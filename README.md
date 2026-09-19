# Nova

A local-first Mac and Windows notes prototype: ordinary folders, plain text and Markdown, filename-first search (including bookmark names and excerpts), and named bookmarks inside any note.

## Run

Requires Node.js 22+, Rust stable, and CMake (for the local speech engine). On macOS 11 or later, install Xcode Command Line Tools. On Windows install Visual Studio C++ Build Tools (Desktop development with C++) and WebView2. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run tauri dev
```

If Rust is newly installed on this machine, run `source "$HOME/.cargo/env"` first. `npm run dev` starts a browser-only preview with editable sample notes; local-folder access requires the desktop app. Sample notes persist in local storage and are explicitly labeled.

## Use

- **Add folders**: keep up to 100 ordinary folders open together and browse its `.md`, `.markdown`, `.mdx` (rendered as Markdown, without JSX), and `.txt` files. No vault or changes to folder structure.
- **Source / Edit / Read**: raw Markdown, styled live editing, and a reading view. Edit supports headings, emphasis, links, lists, task checkboxes, quotes and inline code, plus a formatting toolbar. Complex tables, fenced code and other unsupported structures remain source in Edit; Read renders full supported Markdown. Switching modes does not rewrite the document. One document is mounted at a time. Inactive files are not loaded.
- Drag a folder handle to reorder roots. Arrow keys on the handle and the folder menu also reorder. Collapse roots independently; remove only removes the explorer entry. Drop folders from Finder/Explorer to add them. Folder order, collapse state, mode and the active note are remembered in app-data `explorer.json`. Unavailable roots remain visible for retry.
- **Command-K / Ctrl-K**: search filenames first, then saved file contents across all added folders. Results include their folder. All / Files / Text filters; arrows and Enter navigate results. Selecting a text result opens its line in Source mode.
- **Command-Shift-B / Ctrl-Shift-B**: bookmark a selection or the current line. Name, rename, remove, preview, and jump from the right rail. Read-mode selection works when the selected visible text maps directly to Markdown source.
- **Command-S / Ctrl-S**: save. Switching files and closing the native window also save. Adding, renaming, or deleting a bookmark saves the note and its anchors.
- **Refresh folder**: rescan after files are added or removed externally.

Bookmarks live in Tauri's OS app-data directory, under `com.nova.notes.prototype/bookmarks`, keyed by canonical file path. They never add markup or metadata to notes folders. They follow edits using CodeMirror transaction mappings. On reopen, stored excerpts recover moved passages; missing excerpts are flagged. Renaming/moving a file outside Nova does not yet migrate its bookmarks. Deleted-anchor recovery through Undo is not implemented.

Saves compare the disk revision before writing and use a temporary file plus atomic replacement. A detected external change prevents the save and keeps edits open. Copy edits to a safe place before reopening when there is a conflict. CRLF line endings are preserved for CRLF documents; mixed line endings normalize. Atomic replacement may not preserve all extended file attributes. This prototype is not a collaborative editor or a backup system.

## Tabs

Single-click a file to open it in the one italic preview tab. Browsing replaces that preview only. Double-click a file or tab, click its plus button, or edit it to keep it open as a fixed tab. Clicking an already open file selects its existing tab. Close tabs with their × button. Switching or closing saves first; a save conflict keeps the current note open.

Only the active editor is mounted. Open tabs keep in-memory editor states for cursor position and undo history; these are released when closed or replaced. External file changes invalidate the cached state on reopening. The tab list is session-only; restarting restores the last active note.

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
- Formatted preview is limited to 500,000 characters; larger documents use the virtualized source editor.
- Text search streams saved files, returns at most 80 matches, and cancels superseded searches between reads. It skips files over 32 MiB and invalid UTF-8 content. `.git`, `.obsidian`, `node_modules`, `target`, and `.Trash` directories are excluded, and directory symlinks are not followed.
- No filesystem watcher, automatic reload, new-file UI, image attachments, plugin compatibility, or sync yet. The folder menu’s Refresh action and reopening a file pick up disk changes.
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

Command-K has an **Everywhere / Current tab** scope switch. Everywhere searches all added folders; Current tab searches the focused note, including unsaved edits, and jumps directly to the selected match without saving or reloading. The scope choice is remembered for the session. Current tab is disabled when no note is open.
