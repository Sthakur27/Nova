# Nova feature goals

Captured September 23, 2026 from a comparison with Obsidian and Atom. These are
product goals, not claims about released features. Preserve ordinary-file
ownership, recovery drafts, bookmarks, and the Local/Cloud boundary throughout.

## Current implementation batch

The following three features were implemented in parallel and integrated on
September 23, 2026. Automated tests, browser checks, and an isolated macOS native
smoke test passed. Windows has not been verified locally; installer publication
is tracked separately.

- [x] **Automatically detect external local file changes.** Refresh clean open
  notes and folder listings when files change outside Nova. Preserve unsaved
  edits and recovery drafts, surface conflicts or deletions, and retain stale-save
  protection. Uses native nonrecursive filesystem notifications for open tabs
  and expanded directories, with burst coalescing, focus/error reconciliation,
  and single-pass directory refreshes; no recurring repo scan.
- [x] **Replace across files.** Dedicated Search sidebar (Command/Ctrl-Shift-F)
  with collapsible replacement controls, grouped file results, a reviewable preview,
  file selection, and explicit application of replacements. Respect search filters,
  disk revisions, open drafts, bookmarks, and Local/Cloud save behavior. Report
  partial failures without silently overwriting changed files. The initial
  implementation covers saved Local files only; Cloud files are excluded. Preview
  is bounded and replacement text is literal. See the [reference guide](docs/user-guide.md#replace-across-files).
- [x] **Heading outline.** Provide a clickable table of contents for the active
  Markdown note, reflecting unsaved edits and heading hierarchy. Navigate in the
  current reading/editing mode where supported and work alongside passage bookmarks.

## High-priority opportunities

- [ ] **Linked notes and backlinks.** Link or create notes with completion, show
  incoming references, and handle renames. Support portable Markdown links as
  well as considering `[[wikilinks]]`.
- [ ] **Images and attachments.** Paste/drop screenshots, render images, and link
  PDFs stored as ordinary files. Define attachment locations and Cloud transfer
  behavior explicitly.
- [ ] **Templates and daily notes.** Create/open today's note in one action and
  insert reusable meeting, journal, or project templates with date placeholders.
- [ ] **Broader command palette.** Make actions such as splitting panes, moving
  notes, changing views, and inserting templates searchable from the keyboard.
- [ ] **Browsable version history.** Keep bounded snapshots of previous saved
  content with previews/diffs and explicit restoration. Complement recovery drafts.
- [ ] **References to bookmarked passages.** Link from a note to a named passage
  bookmark and show incoming references beside that passage. Build on Nova's
  existing excerpt tracking without silently injecting metadata into source files.

## Medium-priority opportunities

- [ ] **Tags and note properties.** Organize across folders using tags, project,
  status, and dates; later support filtered lists and table views.
- [ ] **Reusable text snippets.** Expand short triggers into repeated prose or
  code with editable placeholders, complementing whole-note templates.

## Deferred exploration

- [ ] **Global relationship graph.** Revisit after note linking is useful and reliable.
- [ ] **Infinite canvas.** Explore spatial organization of notes and attachments.
- [ ] **Plugin marketplace and extension API.** Revisit after core workflows and
  storage contracts stabilize; evaluate permissions and compatibility costs.

## Sequencing and completion

After the current batch, consider templates/daily notes and the command palette
as contained improvements, followed by attachments and links/backlinks. Invest
in version history and structured organization as collections grow. This ordering
is provisional, not a delivery commitment.

Mark a goal complete only after implementation, meaningful verification,
documentation review, and integration. Record release publication separately from
local development and Git pushes.

## References

- [Obsidian core features](https://obsidian.md/help/plugins)
- [Obsidian internal links and block references](https://obsidian.md/help/links)
- [Obsidian attachments](https://obsidian.md/help/attachments)
- [Obsidian daily notes](https://obsidian.md/help/plugins/daily-notes)
- [Obsidian file recovery](https://obsidian.md/help/plugins/file-recovery)
- [Atom command palette](https://github.com/atom/command-palette)
- [Atom find and replace](https://github.com/atom/find-and-replace)
- [Atom snippets](https://github.com/atom/snippets)

Atom was sunset in 2022; it is a source of interaction ideas, not a proposed dependency.
