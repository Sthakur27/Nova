# Desktop update releases

Nova uses Tauri's updater with a public verification key in `src-tauri/tauri.conf.json`. GitHub Actions stores the corresponding private key in the `TAURI_SIGNING_PRIVATE_KEY` repository secret. Keep a secure backup of that private key: existing installed apps trust this key, so replacing it without a migration breaks their updates. Updater signing is separate from Apple notarization and Windows publisher signing.

The desktop workflow builds all three supported targets before publishing a complete release. It gives every build version `0.2.<GITHUB_RUN_NUMBER>` through a Tauri configuration override. `GITHUB_RUN_ID` and the attempt identify the immutable release tag; the increasing run number orders app versions. Re-running the same workflow run does not create a new app version; start a new run for a new update.

Signed builds include Mac `.app.tar.gz` archives, the Windows NSIS `.exe`, and their `.sig` files. `scripts/prepare-release.mjs` requires every installer, updater package, and signature before writing `latest.json`. The manifest points at the version-specific release assets, so subsequent releases cannot change the bytes referenced by an older manifest. The release remains a draft until every asset is uploaded.

Pushes to main require the signing secret. Fork PR builds without access to secrets can still build ordinary installers, but do not generate signed update packages. Local `npm run package` also builds regular installers unless `TAURI_SIGNING_PRIVATE_KEY` is provided as a key file path or its contents.

To validate a rollout, install an older updater-enabled build, publish a higher version, and check download, installation, restart, and draft recovery on Apple Silicon, Intel Mac, and Windows. Also check an offline request, failed download, and a second open window. The initial release containing this updater must be installed manually by existing users.

The updater runs only on desktop. It checks three seconds after launch and whenever Settings opens, with overlapping checks deduplicated. Checks do not replace an active download or a downloaded update. A top-left update icon opens Settings for available updates and stays visible during download and once ready to restart. Settings displays check progress and errors and allows manual retries. Settings → About Nova always offers **Open README**, which opens the project README in the system browser. The update button appears in the same section only when a newer version is available. Update state lives at the app level, so closing Settings does not cancel a download or lose a downloaded update. Downloads are user initiated and verified by Tauri. Installation waits for an explicit restart action; the UI blocks interaction while preserving the session and current draft. Other windows must be closed before installation. Native window creation is locked during installation, and the normal quit interception is bypassed for the updater's Windows installer exit. On Mac, Nova explicitly restarts after installation.

## Changelog and release notes

Maintain user-facing changes in the root [changelog](../CHANGELOG.md), grouped under **Unreleased** until installer publication is confirmed. Record features, changed behavior, fixes, and migration requirements. The initial backfill uses development dates and does not claim those dates are releases.

The desktop workflow includes a **What changed** link in each release, pinned to `CHANGELOG.md` at that build’s source commit. After confirming a published installer, move its covered entries into a dated release section with the build tag and source commit; leave newer entries under Unreleased.
