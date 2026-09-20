# Sync selection and planned Google Drive support

Open **Sync** in the global sidebar or top tab bar to choose notes for future sync.
Each note tab also has a cloud control that opens and focuses that note’s choice.
Use the folder picker to switch workspaces, or search for a file or subfolder.
These controls are available in compact layouts too. The workspace **… → Sync
selection…** menu opens the same settings. Cloud icons indicate selection, never
a successful upload; connection status is shown separately.
The app saves selections only. In-app Google Drive sign-in, uploads, downloads,
portable bookmarks, and conflict reconciliation are not implemented yet.
No account is connected and nothing is uploaded.

## Selection rules

- Workspaces start local only. Each added workspace is configured separately.
- Include a workspace or subfolder to include its existing and future notes by default.
- A file or subfolder may explicitly include, explicitly exclude, or inherit.
- The nearest explicit choice wins. Changing a parent keeps child exceptions.
- Counts show effective file selections, not uploaded files. A local-by-default
  folder may contain explicitly included notes.
- Explicit file choices follow renames and moves performed in Nova. Inherited
  choices adopt the destination folder’s default. Deletion removes the file’s rule.
- Choices persist in the workspace `.nova` registry alongside stars. Invalid or
  unknown policy versions display an error and default to no selections.
- The current explorer derives subfolders from notes: empty folders do not appear.
- Other sync software is outside Nova’s control. Keeping a note local in Nova
  cannot exclude it from Google Drive for desktop or another backup program.

## Developer connection smoke test

The standalone `scripts/test-drive-connection.py` checks desktop OAuth and a
Drive upload/read-back independently of Nova. It does not connect the app or use
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

## Next implementation stage

Use a direct desktop OAuth connection and a Nova-created Drive folder with the
narrow `drive.file` permission. Each user signs in to their own account. Nova’s
maintainer registers one desktop OAuth client in Google’s developer console;
users do not create developer projects. No application server is required.

No paid services, billing accounts, or paid quota increases are part of the plan.
Use free standard API quotas, batch work and back off when throttled. Storage-full
and quota errors must leave local editing available and explain why sync is waiting.
Google may change its terms; verify current limits before shipping.

Before enabling uploads, implement:

- Stable workspace and note IDs; no absolute local paths in remote metadata.
- A per-device mapping from selected cloud workspaces to local folders.
- Portable bookmarks bundled only with included notes; no upload of the whole
  `.nova` registry, which can contain excluded filenames and metadata.
- Local revision history, a durable transfer queue, retries and conditional writes.
- Conflict copies for simultaneous changes; never silently overwrite divergent edits.
- Rename/deletion tracking and reconciliation across offline devices.
- Explicit semantics for opting out after upload: stop future transfers while
  retaining local files; disclose that existing remote/device copies remain.
  Removing remote copies must be a separate, explicit operation.
- Treat externally renamed/moved files as unrecognized until identity is resolved;
  do not accidentally upload a formerly excluded note under a new path.
- Overlapping workspace detection so an included parent cannot bypass an exclusion
  configured through a separately opened child workspace.
- OS-protected refresh-token storage, disconnect/revocation, and visible sync status.

References: [desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app),
[Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth),
[usage policy](https://developers.google.com/workspace/tools-safety).
