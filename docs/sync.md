# Local and Cloud notes

Desktop Explorer separates **Local** folders from **Cloud** spaces. Local files
stay in the folders you chose. Connecting Google Drive never opts them into sync.
Mobile is Cloud only: its setup screen requires a Google Drive connection before
opening the editor, Explorer, search, or settings.

## Connect and use another device

On desktop, choose the cloud button beside Settings, then **Connect Google Drive**.
On iPhone or iPad, use the setup screen. Finish Google sign-in and return to Nova.
Nova discovers and downloads its Cloud spaces automatically; there is no restore
picker or local destination to choose. An empty account starts with **Notes**.

The same Cloud names appear on every device. Nova manages offline copies in its
private application data directory under `Synced/<account-and-Drive-ID hash>`.
These internal names are not the names shown in Explorer. On iOS the persisted
root is `mobile-sync/<hash>`, independent of the app's container location.

Nova stores managed files inside **.nova** in Google Drive. Use **Open in Drive**
in Cloud settings or the top bar to open the current Cloud space in your browser.
Each space's folder menu has **New note**. On desktop, a local note's context menu
has **Move to Cloud…**: the confirmation names the destination, then Nova saves a
complete Cloud copy on the device before removing the original. An existing note
with the same name blocks the move; it is never overwritten. Unsaved inactive
local drafts must be opened and saved first. The current action uses the first
Cloud space; dragging between Local and Cloud is not implemented.

## Autosave and status

Cloud notes save on the device shortly after typing pauses and before switching
notes. They then upload automatically. The Save control remains for Local notes.
Status distinguishes saving on this device, waiting to sync, syncing, up to date,
and sync errors. Cloud settings expose retry and connection errors.

Downloaded notes remain editable offline. Saved changes retry on foreground checks
and periodic checks while Nova is visible. Discovery and reconciliation run every
minute and when the app regains focus. The focused note is checked every five
seconds: one Drive metadata request compares its last modified time and version
with the synced receipt. If both match and the local content is unchanged, the
check returns before workspace discovery, content downloads, reconciliation or
writes. Boot and full periodic checks compare the complete Drive metadata listing
against persisted file IDs, paths, modification times and versions, and verify
the local file set and content receipts. An unchanged workspace returns before
reconciliation, downloads or registry writes. Metadata listing remains necessary
to discover new notes, removals and folder moves.
There is no closed-app background service.
Uninstalling the mobile app removes offline copies and any changes that have not
finished uploading.

## Identity and safety

A workspace's local `.nova` registry records its Cloud display name, Drive folder
ID and account identity, plus per-file Drive IDs and content receipts. New devices
use the remote folder ID, not the source computer's local folder path. Nova renames
and moves update the same Drive file. Remote renames follow the file ID locally,
provided there is no conflicting edit or destination collision.

Each reconciliation pass reads Drive before uploading. Incoming text replaces a
local file only if local contents match the last synced receipt. Conflicting local
and remote edits pause that file; neither version is silently overwritten. Open
edits and saved recovery drafts are protected. Automatic merge is not implemented.

**Deletion remains device-only in this version.** The delete dialog explains that
Drive copies are retained. A local tombstone prevents the retained copy from
reappearing on that device. A file removed from Drive pauses sync and retains its
local copy; Nova does not silently recreate it. Restore it in Drive to resume.

Disconnect requires confirmation, removes this device's saved credential, and
retains local and Drive files. Mobile returns to setup. It does not revoke Google's
app authorization. Existing Local folders and legacy selections do not participate
in the managed Cloud sync loop.

## Limits

- UTF-8 text files up to 32 MiB; initial downloads up to 512 MiB and 50,000 notes.
- Google Docs conversion, attachments, bookmark/star sync, and automatic merging
  are not available. Empty subfolders are not shown in the current Explorer.
- External filesystem renames are not inferred from file contents.
- Other backup applications can still upload files in their own watched folders.
- Browser previews and Android cannot connect to Drive.

## iOS configuration

Google sign-in uses ASWebAuthenticationSession with a state-checked PKCE callback.
Refresh credentials stay in the iOS Keychain; tokens never enter the webview or
workspace registry. The Swift bridge only handles browser authorization and opening
a Drive folder. Android sync remains unavailable.

Build configuration: create an **iOS** OAuth client in the same Google Cloud project
as desktop, with bundle ID `com.nova.notes.prototype`. Set
`NOVA_GOOGLE_IOS_CLIENT_ID=<client-id>.apps.googleusercontent.com` in `.env.local` or
the build environment, then rebuild the native app. This client needs no secret.
Desktop's client secret is not embedded in the iOS binary. Testing-mode Google apps
still require the signing-in account to be an approved test user.


## Live verification — 2026-09-20

Using brand-new test files only, verified with the signed iPhone simulator,
native desktop app, and Google Drive in Chrome:

- Cloud discovery and the Notes space appear automatically.
- Mobile Explorer shows Cloud without legacy local folders.
- Mobile edits autosave and appear in the Drive browser preview without Save.
- A brand-new local desktop fixture moves into Cloud through its confirmation
  dialog, retains its text, removes the local source, uploads to Drive, and
  appears automatically in the iPhone Explorer.
- Renaming the test note in Drive updates mobile after foregrounding.
- The desktop automatically receives the mobile note; desktop autosaved edits
  subsequently appear in the mobile editor.
- After backing up only the new test note’s mobile cache, a cold launch downloads
  and opens the existing Cloud note automatically, with the latest contents.
- An unconnected iPad simulator shows only the Cloud setup screen.
- The desktop Open in Drive shortcut opens the matching Notes folder in Chrome.

Physical-device and signed-in iPad sync remain separate checks. Local-copy collision tests
and the HTTP-backed reconciliation suite cover failure protection separately.

While Nova is visible and focused, the active Cloud note is checked every five seconds. Other notes keep the 60-second schedule. The faster check pauses for unsaved edits, a Local tab, or an unfocused window. This is polling, not live collaborative editing.
