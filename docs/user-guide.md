# Nova reference guide

[← Back to Nova](../README.md) · [Developer guide](development.md)

Detailed controls, file behavior, voice typing, and current limits. For a quick introduction, start with [Your first few minutes](../README.md#your-first-few-minutes).

## Use

- **Add folders**: keep up to 100 ordinary folders open together and browse Markdown (`.md`, `.markdown`, and `.mdx`, without JSX) and UTF-8 text files, including custom extensions and extensionless files. No vault is required. Custom file types are screened for text content before appearing in the explorer.
- **Source / Edit / Read**: Source edits raw Markdown. For Markdown notes up to 500,000 characters, Edit and Read share the same document layout, including headings, formatted text, nested lists, tasks, quotes, code blocks, and tables. Edit adds a formatting toolbar and direct text editing; Read only allows task checkboxes to change. Tab/Shift-Tab nest and outdent list items. Switching modes does not rewrite the file; checkbox toggles change only the check character. Unsupported constructs remain intact and can be edited in Source. Larger Markdown notes use source editing and a paginated reader. Inactive files are not loaded.
- Drag a folder handle to reorder roots. Arrow keys on the handle and the folder menu also reorder. Collapse roots independently; remove only removes the explorer entry. Drop folders from Finder/Explorer to add them. Folder order, root and nested-directory collapse state, mode, open tabs, and the active note are remembered in app-data `explorer.json`. Unavailable roots remain visible for retry.
- **Command-K / Ctrl-K**: search filenames, bookmark names and excerpts, and saved file contents. Use All / Files / Bookmarks / Text filters, arrows and Enter to navigate, and Escape to close. Results include their folder; text results open at their line in Source mode. The All filter also includes commands such as **Toggle line numbers**.
- **Command-F / Ctrl-F**: find within the note (opens Source from the formatted Edit/Read document), with match counts and Enter / Shift-Enter navigation. Expand **Search options & replace** for case-sensitive, whole-word, or regex matching, selecting all matches, and replacing one or all matches. Escape closes find.
- **Search scope**: Everywhere searches all added folders; Current tab searches the focused note, including unsaved edits, and jumps without saving or reloading. The scope is remembered for the session and Current tab is disabled without an open note.
- **Command-Shift-B / Ctrl-Shift-B**: bookmark a selection or the current line, or use the bookmark button beside the active editor line. Name, rename, remove, preview, and jump from the right rail. Switch between Current tab and All bookmarks to browse passages across added folders. Read-mode selection works when the selected visible text maps directly to Markdown source.
- **Command-S / Ctrl-S**: save. Switching files, closing tabs, and quitting preserve local recovery drafts without writing edits to the original file. Bookmark edits are retained with the draft until Save.
- **Command− / Ctrl−** and **Command+ / Ctrl+**: zoom the interface out or in (50–200%). Command= / Ctrl= also zooms in; Command-0 / Ctrl-0 resets to 100%.
- **New note**: click the new-tab + button or press Command-T / Ctrl-T to create `Untitled.txt` in the active folder (or the first available folder). Choose a different default extension in Settings, such as `.md`, `.json`, or a custom extension. Existing names get a numeric suffix. Markdown notes default to Edit; other text files default to Source. Your last chosen mode is remembered per file extension across folders; extensionless files share their own preference. Closing an untouched empty untitled note created in the current session removes its empty file; notes with drafts, content, or a new name are retained.
- **Rename**: use the pencil beside a file, right-click → **Rename…**, or double-click a fixed tab. The dialog separates the file name and extension and previews the destination path. Enter applies; Escape cancels. Renaming within Nova carries bookmarks, stars, drafts, and the open tab to the new name.
- **File actions**: right-click a file to move it to an existing directory within the same root, reveal it in Finder/Explorer, or permanently delete it after confirmation. Moving carries bookmarks, stars, drafts, and tabs; deleting removes the file and its saved bookmarks.
- **Starred files**: toggle the star beside a filename, then use the explorer header’s star to show only starred files across added folders. Stars are stored as relative paths in a `.nova` JSON file at each root; this registry is excluded from the note list.
- **New window**: Command-N / Ctrl-N opens another Nova window on the welcome screen, with the same folder list and no restored tabs.
- **Refresh folder**: rescan after files are added or removed externally.

Bookmarks live in Tauri's OS app-data directory, under `com.nova.notes.prototype/bookmarks`, keyed by canonical file path. They never add markup or metadata to notes folders. They follow edits using CodeMirror transaction mappings. On reopen, stored excerpts recover moved passages; missing excerpts are flagged. Renaming/moving a file outside Nova does not yet migrate its bookmarks. Deleted-anchor recovery through Undo is not implemented.

Saves compare the disk revision before writing and use a temporary file plus atomic replacement. A detected external change prevents the save and keeps edits open. Recovery drafts retain their original disk revision, so restoring a draft does not bypass conflict checks. Copy edits to a safe place and reconcile external changes when there is a conflict; reopening restores the draft. CRLF line endings are preserved for CRLF documents; mixed line endings normalize. Atomic replacement may not preserve all extended file attributes. This prototype is not a collaborative editor or a backup system.

## Workspace and formatting

Open **Settings** from the sidebar or with Command-comma / Ctrl-comma. Preferences save automatically on this device: Galaxy mode, editor text size, text width, line spacing, line numbers, line highlight, word wrap, spellcheck, bookmark-panel visibility, and the default extension for new files. Text width, text size, and line spacing apply to Source, Edit, and Read. Choose Compact, Default, Relaxed, or Spacious line spacing in Settings or the toolbar. The toolbar’s text-width and line-spacing menus support arrow keys, Home/End, and Escape, returning focus to the trigger after a selection. With Galaxy mode enabled, the **Translucent background** icon switches the editor between translucent and solid backgrounds and remembers the choice separately. Line numbers and line highlighting are available in the source editor.

Galaxy mode also enables motion and glow around the focused workspace. Click the Nova emblem for a three-second **Supernova** effect around the window, even with Galaxy mode off. Reduced-motion preferences replace the burst animation with a steady rim that clears afterward.

Scroll above the first line or below the last line to make room around your note. Mouse-wheel and trackpad scrolling extend this blank space as you approach its edge without adding text. Open editor tabs retain their scroll position and added space when switching files.

Collapse navigation, bookmarks, top bars, or the status bar with the edge controls. Drag a side-panel divider to resize it; double-click to reset. Focused dividers support arrow keys (Shift for larger steps), Home/End, and Enter to reset. Panel widths and visibility are remembered. **Command-G / Ctrl-G** toggles focus mode: entering hides all panels, and exiting expands them all, including any previously collapsed panels. The exit control does the same.

The formatting toolbar includes Undo/Redo, headings 1–6, bold, italic, strikethrough, inline code, ordered and unordered lists, tasks, and quotes. In Markdown notes, Command/Ctrl-B and -I apply bold and italic; Command/Ctrl-Shift-X applies strikethrough. Command/Ctrl-Alt-1 through -6 apply headings, and -0 returns to normal text. Command/Ctrl-Shift-7, -8, and -9 apply numbered lists, bullets, and quotes. In formatted Edit, Tab / Shift-Tab nest or outdent list items; in Source, they indent or outdent Markdown by four spaces. Source formatting preserves existing indentation, and Read mode recognizes nested numbered lists that start above 1. Command-A / Ctrl-A selects the whole focused document, including nested lists. Source selection highlighting covers line breaks and blank lines; energy effects follow the selected passage in Source and the fallback reader.

## Tabs

Single-click an explorer filename to open it, or activate its focused button with the keyboard. The first file opens in an italic preview tab. When the active tab is a preview, opening another file replaces that preview; otherwise explorer files open as fixed tabs. Double-click a preview tab or edit its note to keep it open. Double-clicking a fixed tab opens the rename dialog. Opening an already open file selects its existing tab. Close tabs with their × button. Switching or closing retains unsaved edits as recovery drafts; reopening the file restores them. A recovery-storage failure keeps the note open and reports the problem.

Only the active editor is mounted. Open tabs keep in-memory editor states for cursor position and undo history; these are released when closed or replaced. External file changes invalidate the cached state on reopening. Restarting restores the ordered tab list, active note, editing mode, explorer folders, and collapsed directories. Desktop drafts are written atomically to the app-data `drafts` directory on each edit, independently of the development server port; the status bar confirms when the write finishes. Browser previews use local storage. Drafts are stored per folder and file on this device, including after their tabs close, and follow file renames and moves within Nova. Explicit Save clears a draft after the file and anchors are written. Recovery writes can fail if storage is unavailable or full; failures are reported and normal desktop close/quit is blocked until edits can be preserved or saved.

## Voice typing

Click the **Dictate** microphone icon in the document toolbar. Hover or focus it to see voice-typing status and the recording timer. On first use, download the English Whisper tiny.en model (77,704,715 bytes, about 78 MB) from the upstream whisper.cpp Hugging Face repository. Nova checks the download's SHA-256 before installing it in its OS app-data `speech` directory. The model is not bundled into the app or committed to Git.

Place the cursor where you want to write, press **Dictate**, allow microphone access, speak, then click the stop icon to insert the transcript. Nova uses the system's default microphone and inserts the transcript at the original insertion point (which follows intervening edits). Voice typing inserts text; it does not replace a selected passage. Each transcript is a separate undo step and existing bookmarks continue to track edits. A recording stops automatically after two minutes.

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
- Rich document editing is limited to notes up to 500,000 characters; larger notes use the source editor. Read mode paginates documents over 500,000 characters and prepares Markdown in a background worker. Pages preserve Markdown blocks and cross-document references; bookmarks jump to the corresponding page. Task checkboxes remain interactive in the paginated reader, and toggling one preserves the current page. The full source and parsed document still reside in memory, and a single oversized Markdown block stays together on one page.
- Text search streams saved files, returns at most 80 matches, and cancels superseded searches between reads. It skips files over 32 MiB and invalid UTF-8 content. `.git`, `.obsidian`, `node_modules`, `target`, and `.Trash` directories are excluded, and directory symlinks are not followed.
- No filesystem watcher, automatic reload, image attachments, plugin compatibility, or sync yet. The folder menu’s Refresh action and reopening a file pick up disk changes.
- Fonts are bundled locally. Markdown raw HTML is not executed. Image rendering is deliberately a placeholder in this first version.
- RAM targets are not benchmarked yet. Tauri's webview subprocesses must be included in any measurement.
