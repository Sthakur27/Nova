# Working on Nova

Nova is a React/TypeScript and Tauri/Rust notes app. Read the relevant source and [developer guide](docs/development.md) before changing behavior. Preserve ordinary-file ownership, recovery drafts, bookmarks, and Local/Cloud boundaries.

## Finish the work, including Git

For implementation and documentation tasks, the default definition of done is: implement, verify, evaluate documentation, commit, and push. The user should not have to ask separately for `git add`, `git commit`, or `git push`.

- Follow explicit user exceptions such as “do not commit,” “keep this local,” or “open a PR.” Read-only reviews and planning requests do not require edits or commits.
- Start by checking the branch, working-tree status, and remote/upstream. Preserve unrelated user or agent changes. Include earlier uncommitted work from the same authorized task; do not sweep unrelated changes into the commit.
- Work on the current branch unless the user requests another workflow or isolation is necessary. For a new branch, use `codex/` unless instructed otherwise.
- Before committing, inspect the complete diff, including new files, run appropriate checks, and complete the documentation review below. Stage explicit paths or hunks belonging to the task. Never commit secrets, local credentials, generated installers, or unrelated files.
- Write a concise commit message describing the resulting behavior. Commit and push to the current branch’s upstream without asking for routine confirmation. If no upstream exists and `origin` is the intended repository, push the branch with `git push -u origin <branch>`.
- A push to `main` triggers the desktop installer and release workflow. This is part of the authorized default completion flow; do not require a separate routine approval or manually create a duplicate release.
- Never force-push, reset away others’ work, or bypass hooks or failing checks to finish. If a push is rejected, fetch and inspect the divergence; reconcile safely when possible. If credentials, branch protection, ambiguous remote ownership, or conflicts prevent completion, report the exact blocker and what remains instead of claiming success.
- Verify the push succeeded. In the final response, summarize the change, validation, documentation decision, and commit/branch pushed. Distinguish a successful push from successful CI or installer publication; do not claim remote checks passed without checking them.

## Evaluate documentation before every commit

Decide which of these need updating based on the final behavior, and make the relevant changes in the same task. Do not mechanically edit every document for every change.

- **[README.md](README.md):** prominent features, first-run steps, defaults, shortcuts, platform support, or limitations. Promote substantial new capabilities with concise user-facing descriptions; keep detailed controls in the guides. Check existing claims for drift when behavior changes.
- **[CHANGELOG.md](CHANGELOG.md):** user-visible features, behavior changes, fixes, meaningful performance improvements, and migration requirements. Add concise entries under **Unreleased**, following its date and Added/Changed/Fixed structure. Group related work; avoid a raw commit dump. Internal refactors, tests alone, and documentation-only edits usually do not need an entry unless they change something users need to know.
- **[Reference guide](docs/user-guide.md):** detailed controls, settings, search, tabs, editing, and saving behavior.
- **[Drive guide](docs/sync.md) / [mobile guide](docs/mobile.md):** sync, offline behavior, recovery, platform availability, and setup changes.
- **[Developer guide](docs/development.md) / [update release guide](docs/app-updates.md):** build commands, prerequisites, architecture, CI, packaging, and release changes.
- Update screenshots when changed UI makes them materially misleading and a representative capture is available. Do not invent screenshots or present browser-only behavior as verified native behavior.
- Keep development dates separate from release dates. Move changelog entries out of Unreleased only after verifying installer publication and recording the build tag/source commit. A local version number, commit, or successful push alone is not proof of release.
- If no documentation change is warranted, briefly state why in the final response.

## Verification

Choose checks proportionate to the change and follow any more specific requirements in the relevant guide.

- Frontend behavior: relevant Vitest tests (`npm test -- <test paths>`) and `npm run build` for TypeScript/build validation. Run the full suite for broad changes.
- Native behavior: relevant Rust tests with `cargo test --manifest-path src-tauri/Cargo.toml`, plus native verification when the behavior depends on the OS, windows, filesystem, or platform APIs.
- Documentation-only changes: check local links/anchors and `git diff --check`; application tests are not necessary. For CI or release-script edits, validate the changed syntax and generated output without publishing merely to test it.
- Add or update meaningful tests for changed behavior and regressions. Do not add tests that only repeat implementation details or tests for prose edits.
- Report checks actually run and any meaningful verification gaps. Never call a browser preview proof that native integration works.
