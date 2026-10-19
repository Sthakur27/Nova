# Nova web preview

[← Back to Nova](../README.md) · [Implementation specification](specs/nova-web.md)

Nova has a separate Cloud-only browser build that can be hosted as static files on Vercel. It uses the shared Markdown editor, browser storage for offline copies, and direct Google Drive requests. No Nova backend or Apple developer signing is needed.

Open the [hosted web preview](https://nova-indol-pi.vercel.app). This remains a preview; physical iPhone verification is pending. Automated tests cover storage, authorization, and sync behavior with simulated Drive responses. Local Chrome verification with a configured Web OAuth client covers Google authorization, downloading existing Cloud notes, creating a dedicated test note, and uploading edits after disconnect/reload/reconnect. Cross-device Drive interoperability and physical iPhone Home Screen behavior still need verification.

## What is included

- Existing Nova Cloud spaces and text notes, including notes inside existing subfolders.
- Source and formatted Edit, new notes, rename, search across downloaded filenames and text, and text export. Creation and rename use in-app dialogs: Enter submits, Escape cancels, and validation errors stay beside the filename.
- Immediate device saves, queued uploads, offline editing, and cached application assets for offline launch after the first successful online load.
- Use the panel button beside the note title to hide/show the sidebar (or return to notes on a phone). The bottom-left orbital controls offer New note, Appearance, Google Drive, and About Nova. Appearance changes the writing width for the current session. Routine sync details live in the Drive modal; save failures and conflicts remain visible in the workspace.
- Open the cloud icon in the bottom-left corner controls for account details, sync status, and Connect/Reconnect/Disconnect controls. Reconnecting to the same account keeps your open note. Sign-in finishes before background sync; unchanged notes only need a revision check. Conflict actions wait for the active sync to finish, while editing and export remain available. After you have connected Drive, expired access opens a prominent reconnect modal over a dimmed, blurred workspace. **Reconnect** opens Google sign-in directly; **Continue without syncing** or Escape dismisses reminders for one hour, including across reloads and other windows of the same site. Offline visits and other open dialogs defer the prompt. First-time setup remains available through the cloud icon. Google sign-in still starts with your button click.
- Conflict review with the Drive text visible alongside the retained local copy. **Use Drive copy** adopts the downloaded version and retains the previous local text for export. **Replace Drive with my version** confirms use of your local text and filename, keeps the reviewed Drive text as a recovery copy on this device, and queues a conditional upload. A newer Drive change triggers review again; the file stays in its current Drive folder. **Save local text as a new note** creates a separate note without changing the conflicted original.
- A missing Drive note stays on this device. It is never silently deleted or automatically recreated. Export it or explicitly save a separate new copy.

On a phone, swipe left or right across a note to cycle through the current sidebar list, or use the previous/next arrows below it. Search and space filters determine that list. Open **Note actions** (the three dots) for Source/Edit, Rename, Export, and **Cloud · Advanced…**. Tap the expand button for **Focus mode**; use the small top-right exit button or Escape to restore the controls. Focus keeps the editor and swiping active.

The web preview has a smaller interface than the native app. It does not offer Local folders, split panes, saved layouts, terminal, native dictation, folder creation/moves, or a full bookmark/settings interface. Device bookmark metadata is retained with cached notes but is not imported from or written to the native app's bookmark storage.

Offline edits upload automatically when Drive still matches the last synced copy. Nova records upload attempts before sending them, so a lost network reply followed by more editing can be reconciled without mistaking its own upload for another device’s edit. Genuinely different changes on both sides still require review.

Open **Note actions → Cloud · Advanced…** on desktop or phone for a targeted
retry, copy review, explicit text replacement, and **Move to .deleted…**. Replacements
retain recovery text and require a new review if either copy changes. Deletion
moves the original file into its space’s hidden `.deleted` folder in Drive; clean
copies disappear from updated devices on sync while unsynced edits stay available.
Move the file back to its original folder in Drive and refresh Cloud to restore it.
Linked files can retry without listing unrelated notes; new notes and filename or
location changes still require Refresh Cloud. Full sync prioritizes the selected
note after discovery and shows completed work progressively. Requests during an
active sync queue another pass.

Sync runs after saves settle, on Refresh Cloud, on returning to the foreground/online, and approximately once a minute while visible. Closing or suspending the web app can stop sync. Reopen and reconnect to finish pending uploads.

Only one web editor can run per browser origin at once. A second tab asks you to continue in the first or close it and reload. Browser storage is separate for each site origin and browser profile. Changing the hostname does not migrate downloaded notes or pending edits. Clearing site data can remove unsynced work; export important pending notes first. Nova requests persistent storage, but browsers decide whether to grant it.

The preview accepts supported text/code extensions, with a 2 MB note limit and a 32 MB download budget per sync pass. Unsupported, internal, and non-Nova files are excluded. Oversized notes, ambiguous roots, and excessively large/deep trees stop the affected sync safely.

## Recovery copies

Replaced text stays in this browser as recovery copies. Open a note’s **Note actions** (three dots) → **Recovery copies (count)** to export or delete individual copies. Close the dialog with its X button or Escape to return to writing. Copies do not add banners above the editor, including on mobile. Deleting requires confirmation and permanently removes only the selected recovery copy from this browser; the current note and Google Drive file are unchanged.

## Configure Google Drive

1. In **the same Google Cloud project used by Nova's desktop/iOS clients**, enable the Google Drive API and configure the OAuth consent screen. Add the intended account as a test user if the consent app is in testing mode.
2. Create an OAuth client of type **Web application**. Native client IDs cannot be reused for this browser flow.
3. Add the exact site origin under **Authorized JavaScript origins**, such as `https://your-nova-site.vercel.app`. For local development, add `http://localhost:1422` (or `http://127.0.0.1:1422` if that is the address you use). Origins do not include paths. Each preview origin needs its own authorization.
4. Set `VITE_GOOGLE_WEB_CLIENT_ID` to that client's ID in your ignored `.env.local` file or the Vercel project's environment settings. This is a public client ID; **never put a client secret or refresh token in a `VITE_` variable**.
5. Rebuild, open the page, then use the corner cloud icon and click **Connect Google Drive**. Allow Nova's `drive.file` access. It discovers the existing Nova `.nova` folder by its app property; a first-time account gets the same standard `.nova/Notes` structure used by native Nova.

No redirect endpoint or token-exchange server is required by this popup/token flow. The browser calls Google directly. See [Google's token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model).

## Run locally

Use the [normal frontend prerequisites](development.md#run-from-source-developers), then:

```sh
npm ci
npm run dev:web
```

Open the exact authorized local origin. The development server does not install the service worker. To test the production offline shell:

```sh
npm run build:web
npm run preview:web
```

The output is `dist-web/`. Ordinary `npm run build`, desktop, iOS, and browser demo commands keep their existing entry point. Web assets and the service worker are emitted only by web builds.

## Host on Vercel

Import this repository as a Vercel project. The checked-in `vercel.json` selects the Vite framework, `npm run build:web`, and `dist-web`. Configure the public Web OAuth client ID before building. Use a stable HTTPS hostname and register that exact origin with Google.

The service worker caches only this site's built shell assets. It does not cache Google requests, account tokens, or Drive responses. Notes live in IndexedDB. Online refreshes load the latest app; offline launches fall back to the installed shell. Offline-shell updates wait until the previous app windows close; Nova does not forcibly reload an editor with unsaved work. If an older installed version stays visible after refreshing, close all Nova tabs and installed-app windows, then reopen online. Do not clear website data to update: that would remove device copies and pending edits.

Before considering a deployment usable, test sign-in on its actual hostname and use a dedicated test note to verify browser → Drive → native and native → Drive → browser. Also test disconnected editing, reconnect, concurrent edits, and remote removal. The first production deployment was verified Ready on October 5, 2026, from `ccbfbfb`, in Vercel project `sid-thakurs-projects/nova` at `https://nova-indol-pi.vercel.app`. GitHub `Sthakur27/Nova` is connected, and pushes to `main` deploy automatically. The public Web OAuth client ID is configured in Vercel; the production origin is authorized in Google. Hosted Chrome sign-in was verified on October 5, downloading all 16 Cloud notes and opening the previously uploaded test note.

## On iPhone

Once the configured site is available, open it in Safari and use **Share → Add to Home Screen**. A web app does not use the seven-day Xcode development profile. Load it online once, connect Drive, and allow notes and the offline shell to download before relying on airplane-mode access.

Test Home Screen sign-in, software-keyboard editing, background/relaunch, offline edits, and reconnection on a real iPhone before relying on the preview for important work. Desktop browser emulation is not evidence of these native Safari behaviors.

## Verification commands

```sh
npm test
npm run build
npm run build:web
```

The browser tests use fake IndexedDB and simulated OAuth/Drive endpoints. They do not need credentials or modify real Drive notes. Native Rust code and platform integration are unchanged by the web preview.

### Remembering web authorization

Nova saves the verified Drive access token, account identity, and original expiry
in this browser’s local storage. Reopening the same site in the same browser
profile resumes sync while that token is valid. Expiration still requires
reconnection; saving the token does not extend Google’s access lifetime.
Disconnect or a Drive authorization rejection clears the saved token without
removing downloaded notes. When browser storage is blocked, the connection lasts
only for the current page session. No refresh token or client secret is stored.
Scripts running on Nova’s origin can access this token, as with other local
storage data; disconnect when finished on a shared browser profile.
