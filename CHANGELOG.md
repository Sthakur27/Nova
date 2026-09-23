# Changelog

User-facing changes to Nova, grouped by development date. This history starts after the September 20, 2026 README feature update (`0469ec0`); it is not a complete history of earlier versions. Dates below are commit dates, not installer release dates.

See [available builds](https://github.com/Sthakur27/Nova/releases) for published installers and their source commits, or [the README](README.md) for an introduction.

## Unreleased

Entries describe source changes; availability in published installers has not been verified. The initial backfill covers commits through `7d47fbe`.

### 2026-09-23

#### Added

- A **Code block** toolbar button and Command/Ctrl-Alt-C toggle multiline code in Markdown Edit and Source. In Edit, triple backticks followed by Enter also start a code block, optionally with a language name.
- Markdown Edit accepts `1` + Space and `1)` + Space to start numbered lists, alongside standard Markdown typing shortcuts.

#### Fixed

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
