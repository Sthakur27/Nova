# Nova web application specification

Date: October 5, 2026. Status: first preview implemented; awaiting live Drive and physical iPhone validation. Not a deployed release.

## Purpose

Provide a Cloud-only Nova web application hosted as static files on Vercel. It must work in Safari on iPhone, including as a Home Screen web app, without Xcode signing, a Nova backend, or a separate notes database service. Google Drive remains the shared source of Cloud files. The desktop and native iOS apps retain their existing behavior.

## Architecture

- Build the existing React/TypeScript project in an explicit `web` Vite mode. Keep the native entry point and browser demo unchanged in ordinary builds.
- Reuse Nova's Markdown editor in a separate web shell. Avoid pretending that browser storage implements native filesystem or Tauri APIs.
- Use Google Identity Services' browser token model with a **Web application** OAuth client in the same Google Cloud project as Nova's native clients. Register each exact HTTPS origin (and localhost for development). Request `drive.file`; do not embed client secrets or persist access tokens.
- Identify the account through Drive's `about.user.permissionId`. Key cached notes by account and file ID, retaining their current space ID separately so moving a note does not change its identity. Remember the last account only for reopening its local cache; cached identity does not authorize network requests.
- Discover the existing `.nova` folder by `novaKey=nova-notes-v1`, and Cloud space folders by their Nova app properties. Preserve Drive IDs across native/web use. Never infer identity from a filename or access ordinary Local folders.
- Store downloaded text, its last synced baseline, pending edits, local bookmarks, reserved upload IDs, and recovery copies in IndexedDB. A save succeeds only after transaction completion. Denied storage and quota failures must stay visible and must not be reported as saved.
- Use a service worker for the versioned application shell only. Never cache Google API responses or OAuth traffic in the service worker. Offline note content belongs in IndexedDB. A new shell activates on a subsequent launch, without forcibly reloading an editor.

## First implementation milestone

Deliver a runnable, Vercel-ready preview with these complete paths:

1. Connect/reconnect Google Drive from a user gesture; discover existing Cloud spaces or provision the standard `.nova/Notes` space for a first-time account.
2. Download Nova text notes, including notes inside existing subfolders; list spaces and search downloaded filenames/text.
3. Open and edit with the shared Source/Edit editor, create notes, rename notes, and save edits locally before attempting upload.
4. Reopen cached notes offline or after Google authorization expires. Keep a visible distinction between saving, saved locally, pending upload, synced, and sync errors. Request reconnection without blocking local editing.
5. Sync on explicit refresh, after local edits settle, and when the app returns to the foreground or online. Do not promise sync after iOS suspends or closes the app.
6. Download clean remote changes. Update existing files with an ETag precondition and a verified baseline. Keep both versions on conflicts; present the Drive copy and allow an explicit choice or export of local work. A missing remote file never silently deletes local work or automatically resurrects it.
7. Reserve and persist Drive IDs before creating notes so retries after ambiguous network failures do not create duplicate files. Preserve edits made while an upload is in flight.
8. Export a local note, including when sign-in or sync fails. Keep device-only bookmarks with the cached note; do not replace native bookmark metadata.
9. Permit only one active web editor per origin using Web Locks, preventing competing tabs from sending stale writes. A second tab explains how to continue in the first.
10. Provide an installable manifest and offline shell, deployment instructions, and automated storage/auth/sync regression tests.

This milestone intentionally has a smaller shell than desktop Nova. Split panes, saved layouts, terminal, native dictation, local folders, folder creation/moves, deletion, full bookmark UI, and settings parity are later work. No native files or Drive registries are migrated or overwritten to enable the preview.

## Data safety and reconciliation

Each cached note has a local revision, current text/name, remote baseline text/name/parent, remote ID, space ID, and pending/conflict state. The network reconciler snapshots a note, verifies current remote metadata/content, and uses conditional writes. A transaction must not replace a newer local revision with downloaded text. Successful uploads advance the remote baseline to exactly the uploaded snapshot; later local edits remain pending.

Remote content and names are untrusted. Ignore Google-native documents, non-Nova files, internal registries, unsafe names, and oversized files. Bound pagination, traversal depth, total downloads, and per-note size. Stop on ambiguous Nova root folders. Do not publish tokens, credentials, or note bodies to analytics/logs.

Google access tokens stay in memory. Expiration or a 401 pauses network sync; obtaining another token requires a user gesture. Disconnect clears authorization, not cached notes. Switching accounts must never upload one account's queued edits to another account. Any request started with an old connection must be cancelled or ignored before subsequent work proceeds.

Browser storage can be evicted or cleared. Request persistent storage when supported and provide export; clearly distinguish local-only edits from uploaded notes. Device-only removal, reset, and multi-account cache management require explicit later design before exposing destructive controls.

## Deployment and configuration

`npm run dev:web` runs the preview. `npm run build:web` produces static output for Vercel. `VITE_GOOGLE_WEB_CLIENT_ID` is public configuration and is the only web OAuth build setting; existing native secrets must never be copied into a `VITE_` variable.

A stable production origin is needed for OAuth and offline storage. Preview URLs are separate origins with separate caches and must be explicitly authorized before testing Google sign-in. Configure Google Drive API, consent screen/test users as applicable, and the Web client in the existing Nova Google project. Verify access to existing native-created spaces with a real account before calling interoperability complete.

No deployment or live Drive verification is implied by a successful local build. Record the actual deployment URL and verification results when available. Live verification should use a dedicated test note and preserve existing notes.

## Acceptance and verification

- Unit/integration tests: account isolation, token expiry/cancellation, pagination and unsafe remote data, IndexedDB commit/abort and stale saves, offline reload, conflict preservation, conditional-write rejection, upload retry with the same ID, edits during sync, and remote deletion.
- Run the full existing frontend suite and native/default plus web production builds. Native integration is not changed; browser tests do not establish native correctness.
- Browser verification: configured/unconfigured first launch, responsive phone/desktop layout, offline cached edit/reload, storage failure, conflict and reconnect controls, and application-shell update behavior.
- Physical iPhone verification before release: Safari OAuth popup, Home Screen installation, airplane-mode launch/edit/reopen, background/foreground, software keyboard, and reconnect followed by sync to desktop.
- Review README, Welcome, Changelog, user guide, sync/mobile guides, and developer documentation against actual shipped scope. Keep user-visible changes under Unreleased until publication is verified.

## Implementation evidence

October 5, 2026: the first preview is implemented in `src/web`, with separate Vite build commands and Vercel configuration. All 603 frontend tests pass, including 36 web/storage/auth/sync/shell checks. Both the ordinary production build and web production build pass; Vite reports large-bundle warnings. Local Chromium checks with synthetic notes confirm phone-width layout, an offline edit surviving reload, the installed offline shell, and the second-tab edit guard. Documentation links and whitespace checks pass.

Follow-up live Chrome verification on October 5 configured a Web OAuth client in the existing Nova Google project for `http://127.0.0.1:1422`. Real Google sign-in downloaded 15 existing Cloud notes. A dedicated synthetic test note was created and its content verified in Google Drive. An edit made while disconnected survived page reload and uploaded after reconnection, exercising the conditional update path. The live test exposed an illegal `fetch` receiver in account verification and Drive requests; both now call through the global receiver, with regression tests. All 605 frontend tests and both production builds pass.

Vercel production deployment `dpl_AEe6F3aGWFZ8YTL75eUJJ532ptMQ` was verified Ready on October 5 from `ccbfbfb` at `https://nova-indol-pi.vercel.app`, linked to GitHub `main`. The public OAuth client ID is configured; hosted sign-in is pending authorization of the production origin. Cross-device round trips, live concurrent-conflict rejection, OAuth in Safari/Home Screen mode, and physical iPhone keyboard/background behavior remain release gates. The existing native app reported sync attention during inspection, so no native round-trip result is claimed. Native Rust integration was not changed. Welcome was reviewed and remains accurate; this fix does not change its instructions.

## Later milestones

Bring the web shell closer to native Nova: folders and moves, tabs, full bookmark/star controls, richer search, settings, and an explicit device-only delete/recovery workflow. Evaluate a small authentication backend only if reconnect friction is unacceptable; it is not required for direct Drive access.

## References

- [Google browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Drive file uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [Apple Home Screen web apps](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios)
- [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Nova development guide](../development.md), [Drive guide](../sync.md), [mobile guide](../mobile.md)
