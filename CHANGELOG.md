# Changelog

User-facing changes to Nova, grouped by development date. This history starts after the September 20, 2026 README feature update (`0469ec0`); it is not a complete history of earlier versions. Development dates below are commit dates; release headings separately identify verified installer publication.

See [available builds](https://github.com/Sthakur27/Nova/releases) for published installers and their source commits, or [the README](README.md) for an introduction.

## Unreleased

### 2026-10-05

#### Added

- A separate Cloud-only web preview with Nova's shared Source/Edit editor, browser-local offline copies, note creation/rename/search/export, and direct Google Drive sync. Conflicts and missing Drive files preserve local text; expired access prompts reconnection without blocking cached editing. Includes an installable offline shell and Vercel build configuration. The [hosted preview](https://nova-indol-pi.vercel.app) deploys automatically from GitHub main. Local Chrome sign-in and Drive create/update are verified; hosted Chrome sign-in and Cloud downloads are also verified. Physical iPhone verification remains pending.

#### Changed

- Web note creation, recovery copies, and renaming use in-app filename dialogs with inline errors and keyboard controls.

#### Fixed

- Fixed an illegal browser `fetch` invocation that prevented web Google sign-in and Drive requests.

### 2026-10-04

#### Fixed

- In formatted Edit, Backspace at the start of a list item removes extra blank space before it before removing the bullet, number, or checkbox. Empty paragraphs and trailing line breaks in the preceding item no longer have to be moved through the list to clear them.

## 0.2.132 — released 2026-09-29

Installer publication verified for [build-36618104410-1](https://github.com/Sthakur27/Nova/releases/tag/build-36618104410-1), built from source commit [`2115b16`](https://github.com/Sthakur27/Nova/commit/2115b16d81b9d6afe740f8e080073e0c7cbb6375). Signed updates and installers are available for Apple Silicon Mac, Intel Mac, and Windows x64.

The development history below is included in this build; some earlier changes also appeared in previous releases. The initial backfill covers commits through `7d47fbe`.

### 2026-09-29

#### Added

- Recent files in the left sidebar lists notes opened in the current Local folder and Cloud, with device-local history, location labels, and controls to remove entries or clear workspace history. Recent folders now lives in the folder menu alongside the Local and Cloud window actions.

#### Changed

- Navigation icons beneath Quick find are smaller and centered.

#### Fixed

- Fixed a Windows CI test-platform mismatch that blocked desktop installer and update publication: the macOS-only iPhone launcher tests now run only on Mac.

- Large Markdown notes now show Source and Read without a redundant Edit button. Restored Edit views select Source, and its tooltip explains the formatted-editing size limit. Split layouts retain Edit when another visible Markdown note supports it.

- Right-panel view icons stay centered in their buttons, including at narrow panel widths.

### 2026-09-28

#### Changed

- `./runios.sh` now defaults to a standalone iPhone install with a bundled interface, preventing dependence on the Mac’s development server when away. Use `--live` for live development; existing development installs need to be reinstalled through Xcode Run.

- Saved layouts now remember each note’s Source, Edit, or Read mode, including Previous state. Older layouts without recorded modes retain current view preferences.

### 2026-09-27

#### Changed

- Cloud-only windows and mobile show Passages and Starred files directly, without Cloud/Local headings or collapse controls. Mixed windows retain their independent section preferences.

- Cloud stays expanded with a plain section heading in Cloud-only windows; mixed windows retain their collapse controls.

- Sidebar navigation now groups Files (lines icon), Search, Open Folder in New Window, and Recents below Quick find. Hidden-file visibility stays in Settings and Command-K; Cloud and Local use matching neutral + buttons.

- Single-folder Local browsing now shows files directly beneath a header named for the folder, falling back to Local when space is tight with the full name and path in a tooltip. Sync errors in the bottom panel offer a red Review action.

- The desktop note toolbar exposes file location and Cloud actions beside View. Cloud notes open directly in Google Drive; Local notes show a muted cloud button for a confirmed Move to Cloud. Background and frosted-panel controls remain in the sidebar and Settings instead of the top toolbar.

- A single Cloud space shows its contents directly under Cloud, removing the redundant Notes row. Cloud and Local + buttons now open New file / New folder menus; Local supports nested folder creation too.

#### Fixed

- Cloud settings on desktop and mobile now offer Reconnect Google Drive for expired access without disconnecting first. Successful sign-in refreshes Cloud; the mobile setup screen also offers reconnect for saved accounts.

- Saved layouts and their shortcuts now belong to the open Local folder, with a separate nine-slot set for Cloud-only windows. Switching folders no longer shows layouts from a different folder; compatible older layouts are retained.

- Desktop tab strips automatically reveal the active file when opening, creating, or switching notes, including in narrow split panes.

- Refresh Cloud now syncs notes and folders inside existing spaces on desktop and iOS. Full sync requests wait behind focused-note checks instead of being skipped, and saves made during a running sync receive a follow-up pass.

#### Added

- An About Nova book icon below Quick find, alongside the navigation controls, opens the offline Welcome guide directly, with Changelog available inside the tabbed viewer. The heading no longer receives initial focus. Built-in pages are read-only and stay separate from your notes.

- Open a Cloud-only window from the sidebar folder menu or Recents without selecting a local folder. Cloud-only sessions retain local folders in Recents, show Google Drive setup when needed, and keep the Local section out of the way.

- Create nested folders in Cloud spaces, including empty folders that sync across devices. Move notes between folders or back to the root using folder suggestions while retaining their Drive identity, bookmarks, stars, drafts, and open tabs.

### 2026-09-26

#### Added

- Two-key desktop appearance shortcuts: Command-E / Ctrl-E cycles editor backgrounds; Command-L toggles Black/Frosted panels on Mac. Shortcuts work in focus mode, enable Galaxy mode when needed, and apply changes without pop-up notifications. Inline code remains available through the formatting toolbar and backticks.

- Desktop saved states remember named tab layouts, pane sizes, active panes/tabs, and visible notes’ scroll positions. Restoring leaves focus mode, panel visibility, and appearance unchanged. An automatic Previous state preserves the unsaved layout you leave and returns with Command-Option-0 / Ctrl-Alt-0. A right-edge hover control in focus mode provides state navigation and quick save without opening the sidebar. Sidebar states have icon-only confirmed overwrite controls, a rename dialog, whole-card hover/drag targets, purple insertion dividers between cards, drag isolation from sidebar resizing, and keyboard reordering that updates their shortcut numbers. Save and restore notifications dismiss after one second. Save up to nine device-local states and restore them with Command-Option-1–9 / Ctrl-Alt-1–9 while preserving recovery drafts and loading current file contents.

#### Changed

- Panel toggles now use Command-Option + arrows on Mac and Ctrl-Alt + arrows on Windows, freeing ordinary Command/Ctrl + arrows for cursor movement and preserving Shift-modified text selection.

#### Fixed

- The Down panel shortcut now matches the bottom-edge arrow, toggling the entire bottom panel while preserving the terminal’s open/closed state.

- Entering focus mode or collapsing the top bars now moves note content into the freed space. Scroll positions compensate for viewport-sized note padding in Source, Edit, and Read, and reverse when panels expand.

### 2026-09-25

#### Added

- Mobile focus mode hides navigation, file controls, toolbars, and status chrome while preserving editing and swipes between notes. Enter from the expand icon beside Open files; exit with the small top-right icon. A Galaxy toggle sits beside Focus and stays available while focused, replacing ineffective mobile translucency controls.

- `./runios.sh --standalone` opens Xcode for an iPhone build with a bundled interface, avoiding dependence on a reachable development server after installation. iOS also declares development-server local-network access, and the mobile guide covers blank-screen network troubleshooting.

- Drag files directly from the Explorer or Starred files into desktop editor panes, tab strips, or split edges without opening a tab first.

#### Changed

- Desktop focus mode reveals each editor pane’s tabs on top-edge hover or keyboard focus, allowing navigation without leaving focus mode or shifting the document.

- The navigation header uses compact icon-only Files and Search buttons. The Command-K / Ctrl-K launcher is labeled Quick find with a command icon, distinct from the magnifying glass for search across files.

- Mobile editing uses a fixed New note action, an Open files sheet, and full-panel left/right swipes anywhere on the editor. Outgoing and incoming notes follow the finger together, short swipes snap back, and switching cycles between the first and last open file. Renaming has explicit Rename/Cancel controls, and the formatting bar prioritizes common actions with a persistent keyboard-dismiss button; tapping blank note padding also dismisses the keyboard.

- Read mode is now optional on desktop and mobile: **Settings → Show Read mode** defaults off, including for existing installations. Saved reading tabs fall back to editing, while large Markdown notes retain their reader. The mode switch is hidden for plain-text files when Read is off, since only editing is available.

- The bottom-left navigation + now creates a note in the active folder, and the redundant Explorer-header folder-opening action is removed. Cloud and Local section labels both show chevrons and remember their independent collapsed state.
- Local folder rows expose a new-note + button on hover or keyboard focus (always visible on touch devices). Folder-opening controls now use a folder-open icon to distinguish them from note creation.

### 2026-09-24

#### Added

- Dedicated sidebar Search beside Files, opened with Command/Ctrl-Shift-F, with results grouped by file, collapsible Replace controls, and Advanced path filters. The command palette’s Replace entry opens this panel.
- An expand arrow in formatted Markdown Find reveals Replace and Replace All. Replacements preserve the surrounding source, support empty replacement text, and can be undone as a single action. Read mode prompts you to switch to Edit.

#### Fixed

- In-note Find stays inside its split editor panel, retains independent queries, and visibly highlights Markdown matches in Edit and Read with a distinct current result. Search fields use comfortable text padding and quiet focus styling without Galaxy effects.

### 2026-09-23

#### Added

- Heading outline beside Starred files and Passages, with live unsaved Markdown headings and navigation in Source, Edit, and Read.
- **Everywhere → Replace** in search previews and applies selected saved Local-file replacements with search filters, draft and revision guards, and bookmark remapping. Cloud files are excluded; replacement text is literal.
- Desktop detection of external changes to open Local files and expanded directories. Clean notes refresh automatically; dirty drafts and deleted open copies are retained with notices.
- A book icon in the desktop Settings header opens the README on GitHub in your default browser.
- Markdown Edit (outside code) and `.txt` files convert `->` and `<-` to → and ← as you type. Press Backspace immediately to restore the original characters.
- A **Code block** toolbar button and Command/Ctrl-Alt-C toggle multiline code in Markdown Edit and Source. In Edit, triple backticks followed by Enter also start a code block, optionally with a language name.
- Markdown Edit accepts `1` + Space and `1)` + Space to start numbered lists, alongside standard Markdown typing shortcuts.

#### Changed

- External Local-file detection now uses native filesystem notifications with burst coalescing and focus reconciliation instead of three-second polling. Only affected notes and directory listings refresh; loaded directory prefixes refresh in one pass, preserving draft protection.
- The Starred/Bookmarks switch spans the right panel, with the duplicate header add button removed. Passage-bookmark guidance, the add button, and the shortcut sit at the bottom of the panel.

#### Fixed

- Command-F / Ctrl-F searches Markdown in formatted Edit and Read without switching to Source.

- Opening Settings checks for fresh desktop updates without restarting Nova, with visible check status and retry controls. Restored the top-left update indicator.

- Bookmark buttons now add and remove passage bookmarks in Markdown Edit and Read, and filled Source gutter bookmarks can be removed directly. Bookmark icons no longer cover list bullets and align with the first text line in code blocks.

- Typing a checkbox marker after a bullet converts that item into a task without changing neighboring items.

### 2026-09-22

#### Added

- A remembered hidden-file toggle beside Local’s Recent and + buttons (shown on hover/focus), also available in Settings and Cmd/Ctrl-K settings. Advanced search has a separate remembered option to include hidden files and folders in search results.
- `.nova` JSON editing in normal tabs and editor panels with syntax highlighting, inline validation errors, explicit saves, recovery drafts, and stale-save protection. Nova-managed Cloud identities and tracking fields remain protected.

- Desktop Settings now always offers **Open README** under **About Nova**, opening the guide in your default browser even when no update is available.
- Filename search with Command-P / Ctrl-P, plus case-sensitive, whole-word, and regular-expression search and include/exclude path patterns. Matching options and path filters are remembered per workspace.
- A dedicated starred-file view alongside passage bookmarks, with separate collapsible Local and Cloud groups. Double-click a starred file to keep its tab open.
- Recent local folders with restored tabs, recovery drafts, and browsing state.
- Cloud settings actions for files removed from Drive: restore the saved local note as a new Cloud copy, or confirm deletion of the retained local note, bookmarks, and star.

#### Changed

- Each window focuses one local folder. Opening another folder creates a separate window; existing multi-folder sessions keep one focused folder and move the others to Recents. Cloud spaces remain available alongside it.
- Local directories load as you expand them, with **Load more** for large directories. Local folder reordering has been removed.
- Navigation sections and collapse controls have more consistent styling and spacing.

#### Fixed

- Tab indicators now distinguish unsaved changes correctly when content and bookmarks return to their saved state. Recovery drafts identical to saved content no longer leave notes marked as changed.

### 2026-09-21

#### Added

- Continuous and paginated reading layouts, including chunked rendering for large notes.
- Searchable settings with controls for choosing preference values from the command palette.
- **High performance** and **Saver** modes for Galaxy effects, and a remembered preference to hide tooltips.
- A common-format picker for new files and a direct action to open uploaded Cloud notes in Google Drive.

#### Changed

- New installations default to Markdown (`.md`); existing default-extension preferences remain in place.
- New, untouched empty notes stay on the device until their saved content changes or they are renamed. Previously uploaded notes still sync when emptied.
- Typography and reading controls live in the **View** menu. Appearance, Cloud controls, bookmark markers, and panel navigation have been refined.
- Galaxy rendering reuses geometry and limits redraws and particle work. Saver mode reduces animation frames and lets effects settle after interactions.

#### Fixed

- Improved window dragging from the editor and separation of bottom-panel visibility from terminal session state.

### 2026-09-20

#### Added

- Mobile **Reset from Google Drive…** recovery: download a fresh snapshot before replacing local notes and related state. Changes that have not uploaded are discarded; Drive files remain untouched. See [mobile recovery](docs/sync.md#reset-mobile-local-data-from-drive).
- Windows Google Drive build configuration and checks for filenames that Windows cannot store.

#### Changed

- Drive sync tracks files by Drive ID across renames and moves, and reuses reserved IDs on upload retries. **Update Nova on every device:** older builds do not understand the new registry format. See [Drive identity and migration](docs/sync.md#drive-identity-registry-v2).
- Frosted backgrounds and panels are unavailable on Windows. Existing Frosted preferences display as Black; macOS retains Frosted support.

## Maintaining this history

Add concise user-facing entries under **Unreleased**, grouped by date and **Added**, **Changed**, or **Fixed**. Include migration requirements and meaningful limitations. Combine small visual and performance changes instead of listing every commit.

When installer publication is confirmed, move the covered entries into a dated release section with its build tag and source commit. Keep any newer changes under **Unreleased**. Do not infer a published version from the package version or commit date. Release notes link to the changelog snapshot at their own source commit.
