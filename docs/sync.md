# Google Drive sync

Google Drive is optional and currently available in configured desktop builds.
Open **Settings → Google Drive → Set up sync**, or the cloud button beside Settings.
Choose **Connect Google Drive**, finish sign-in in your browser, and return to Nova.
The app requests `drive.file` access and stores its refresh token in the system
credential store. Sign-in can be cancelled and times out after five minutes.
Browser previews and iPhone/iPad builds cannot connect yet.

After connecting, **Sync** appears in the sidebar and top tab bar. A tab’s cloud
button focuses that file in the dialog; explorer cloud buttons toggle individual
file choices. The workspace menu also opens sync settings. Switch workspaces or
search paths in the dialog. Cloud icons show selection; per-file messages show
upload results and errors. Use the explorer header’s cloud filter to show only
selected files, optionally combined with the star filter.

## Upload saved notes

Selected notes upload after Save or a selection change, following a short delay.
Only saved file contents upload; unsaved recovery drafts stay local. **Sync now**
saves the active note first, then checks incoming changes and uploads selected saved files in the workspace
chosen in the dialog. **Open in Drive** opens the workspace’s cloud folder from
the Sync dialog, the button beside the top-bar connection status, or
**Settings → Google Drive → Workspace folder**.

Nova creates a `.nova` folder in Google Drive with a folder for each workspace,
preserving note subfolders. Uploads accept UTF-8 text up to 32 MiB per file.
Bookmarks, stars, drafts, and the local `.nova` registry are not uploaded.
Local upload receipts record the last uploaded contents separately for each account.

An unchanged cloud copy is skipped. Updates compare the remote contents with the
last local receipt and use a conditional revision guard. A different remote version
pauses that file’s upload and reports the problem. Review both versions in Drive
and Nova; downloading a fresh workspace makes another local copy for comparison.
There is no automatic merge or conflict-copy creation.

## Bring notes to another desktop

1. Connect the same Google account and open **Sync**.
2. Choose **Bring notes to this device**, then a Drive workspace.
3. Choose a local parent folder and select **Download & open workspace**.

Nova creates a new uniquely named subfolder without overwriting existing local
files, downloads Nova-managed text files, and adds the workspace to navigation.
The new workspace remembers its Drive link and includes the downloaded notes for
future uploads; new notes remain local unless included explicitly or by a folder
default. Restore is limited to 512 MiB total, 50,000 notes, 32 MiB per note, and
bounded folder nesting. Google Docs documents are not converted to text.

## Selection rules

- Workspaces start local only. Each added workspace is configured separately.
- Include a workspace or subfolder to include its existing and future notes by default.
- A file or subfolder may explicitly include, explicitly exclude, or inherit.
- The nearest explicit choice wins. Changing a parent keeps child exceptions.
- Counts show effective file selections, not successful uploads. A local-by-default
  folder may contain explicitly included notes.
- Explicit file choices follow renames and moves performed in Nova. Inherited
  choices adopt the destination folder’s default. Deletion removes the file’s rule.
- Choices persist in the workspace `.nova` registry alongside stars. Invalid or
  unknown policy versions display an error and default to no selections.
- The current explorer derives subfolders from notes: empty folders do not appear.
- Other sync software is outside Nova’s control. Keeping a note local in Nova
  cannot exclude it from Google Drive for desktop or another backup program.

## Current limits

- Initial setup downloads into a new workspace. Selected paths then receive
  background checks every minute while Nova is running; there is no push service.
- Upload scheduling is in memory. There is no durable offline queue or failure-specific
  retry/backoff; periodic checks can try again, or save again or use **Sync now** after resolving an error.
- Renames and moves inside Nova preserve Drive IDs. External filesystem renames
  are not inferred automatically. Deletions do not propagate to the other copy.
- Changes that turn off effective sync, including inherited folder defaults, ask
  for confirmation. **Keep syncing** or Escape cancels; **Turn off sync** applies
  the change. Disconnect also asks for confirmation. Existing local and Drive
  files remain, an upload already in progress may finish, and other devices keep
  their own settings.
- Excluding a file stops future uploads and downloads but retains both copies.
  Disconnect removes this device’s saved credential; it does not delete Drive
  files or revoke the Google account’s app authorization.
- Overlapping local workspaces have independent selections. An exclusion in one
  does not prevent another included workspace from uploading the same file.
- Workspace/file identity still depends on local paths for newly uploaded folders.
  Synced and downloaded workspaces store an explicit Drive link. Portable
  bookmarks and stable identities across arbitrary external moves remain future work.

## Developer connection smoke test

The standalone `scripts/test-drive-connection.py` checks desktop OAuth and a
Drive upload/read-back independently of Nova. It does not save an app connection or use
its sync selections. Run it manually with Python 3 and a desktop OAuth client:

```sh
python3 scripts/test-drive-connection.py --client-id YOUR_DESKTOP_CLIENT_ID
```

Enter the client secret at the hidden prompt, then open the printed authorization
URL in your browser. The script uses PKCE, a state-checked loopback callback, and
`drive.file` permission. Authorization times out after 30 minutes.

The test creates a new **Nova connection test** folder and a generated Markdown
note, downloads the note, and checks that its bytes match. It never reads local
notes or saves tokens; test artifacts remain in Drive for inspection or manual
removal. A successful test does not enable sync inside Nova. This manual network
test is separate from `npm test` and requires Google API/OAuth setup.

## Incoming changes, renames, and deletion safety

While connected, Nova checks selected workspaces shortly after launch, every minute,
and when the window regains focus. Save and selection changes also schedule a sync.
Each pass reads Drive before uploading. A remote change replaces a local file only
when the local content matches its last-synced hash. Different edits on both sides
pause that file; Nova does not merge or discard either version. Open unsaved edits
and native recovery drafts are protected. Clean open notes refresh after downloads.
New Drive files download only into paths included by this device's sync rules.

The local `.nova` registry now records Drive file IDs, their previous remote paths,
and content receipts per account. Renames and moves made inside Nova carry these
records and update the same Drive file. Remote renames follow the ID locally, unless
there is a conflicting edit, another local rename, an excluded destination, or an
existing file at that path. Renames made outside Nova are not inferred from hashes;
they may look like a local deletion plus a new file and need manual review.

Deletion is deliberately local in this version. Deleting a note in Nova leaves a
registry tombstone so its retained Drive copy does not automatically download again.
A missing Drive ID pauses sync and keeps the local file; it never silently recreates
the Drive copy. Restore the cloud file to resume. Empty cloud folders are retained.
Turning sync off stops both directions for that path and leaves both existing copies.
An already-issued upload may finish. Other devices retain their own selection rules.

Validation includes native HTTP-backed reconciliation tests for incoming changes,
conflicts, ID-preserving renames, destination collisions, deleted-file tombstones,
opt-out and draft protection. Real Google Drive verification requires native Keychain
access and is separate from these deterministic tests.
