# Changelog

## Unreleased

### Added

#### Agent runs

- Add a durable transcript for every agent run. Generation notifications, the
  challenge Runs tab, and the project preparation panel show turns, tool calls,
  approvals, token usage, and stop or retry controls.

#### Permissions

- Add one app-wide agent permission mode in Settings → Advanced: approval
  required, auto-accept edits, auto, or full access. The mode applies to the
  next turn, and pending approvals stay pending.

#### App data and workspaces

- Give every challenge a local workspace folder for code, notes, artifacts, and
  subfolders. New challenges seed a brief and starter code once, existing files
  are never replaced, older challenges get a folder when opened, and a moved
  workspace root is relinked without moving user files.
- Open a challenge workspace in the file manager or an installed editor such as
  Zed, VS Code, Cursor, or a JetBrains IDE. Choose the workspace root in
  Settings → Advanced.
- Ask where Grill Me keeps app data and challenge workspaces during first-run
  setup, with labelled defaults, native folder selection, and a skip action.
  Custom parents get edition-specific child folders, the choice is remembered,
  and existing installations keep their data where it is.

#### Challenge generation

- Let challenge and quiz generation inspect pasted context in a temporary
  research workspace. Public links and image URLs can be fetched and viewed,
  files can be read and written, and shell commands can process downloads
  before the result is written.

#### Project preparation

- Prepare a guided project after each generated challenge. Grill Me freezes the
  specification, then scaffolds separate files for source, configuration,
  migrations, fixtures, documentation, a rubric, milestones, and a failing TODO
  exercise. Core logic stays unfinished, only one scaffold writes per challenge,
  partial files survive failures and cancellation, and existing files and
  earlier attempts are never replaced.
- Let project scaffolding request dependency setup and check commands with
  explicit install and network disclosures. Commands wait for individual or
  attempt-wide approval, rejected or stale requests never run, cancellation
  stops them, and a restart never replays them. Reported results must match real
  command outcomes, and a failed check does not block prepared files from being
  ready.
- Recover interrupted project preparation with Resume, Retry, and Fresh. Resume
  continues the existing folder only when the journal is valid and unchanged,
  Retry reuses the saved specification in a new folder, and Fresh starts a new
  folder even when the journal is corrupt. Earlier attempts and files are
  preserved.

#### Developer tools

- Add `bun run db:studio:dev` and `bun run db:studio:prod` to open the matching
  SQLite database in Drizzle Studio. Both use the saved data folder and honor
  `GRILL_ME_SQLITE_PATH`.

### Changed

#### Database and migrations

- Use generated Drizzle migrations as the only schema source. Fresh installs
  apply the current schema, existing databases keep their data and upgrade once,
  and future changes use `bun run db:generate`.
- Allocate challenge and quiz numbers from stored rows instead of a counter
  table. Existing numbers stay unchanged, and the migration stops if an old
  counter disagrees with the stored maximum.
- Create only active tables on a fresh install. Upgraded databases keep retired
  data under `*_legacy` names, and new installs never create those tables.

#### Project preparation

- Require prepared projects to include a TODO in generated source,
  stack-appropriate configuration and documentation, a generated test, a real
  failing exercise test, and a migration when persistent storage is required.
  Reject single-file projects when a multi-file project is requested, and reject
  manual or always-failing exercise checks.

### Fixed

#### Challenge workspaces and preparation

- Generate challenge specifications separately from project files, so new
  projects are no longer bundled into one starter file.
- Open the actual project folder from workspace actions.
- Keep existing challenge files untouched when a workspace is added or opened.
- Allow safe `.env.example` templates while still blocking real `.env` files.
- Honor the milestones requested in the generated challenge.
- Require setup and check approval before preparation completes.
- Refuse symbolic links for workspace metadata and for app-owned data and
  workspace folders, so writes stay inside the selected real parent.
- Keep proposed setup, check, and run commands visible after other commands run,
  so setup no longer hides the remaining instructions.

#### Quiz flow

- Keep model and reasoning lists scrollable in creation composers and the
  Generate quiz dialog.
- Always include a no-reasoning option next to the model's supported reasoning
  levels.
- Stop the Generate quiz dialog and backdrop from replaying their entrance
  animation when typing is followed by a click inside the dialog.
- Remove the redundant quiz-type subtitle and the Cancel label from the Generate
  quiz dialog, and use an icon-only close button.
- Show a standalone quiz's original prompt on its start screen and while
  answering questions.
- Regenerate quiz titles with the selected model instead of the provider
  default, so accounts are not denied access to a model they chose.

### Removed

- Remove solution reviews and verification. Their routes, services, prompts,
  and UI are gone. Existing submissions, review jobs, and verification rows stay
  stored as legacy data and are not shown.
- Stop writing AI request logs. The Logs page is read-only, shows a legacy
  banner, still lists old requests, and has an empty state on fresh installs.
- Remove the standalone History page and its practice-progress summary.
  Completed and stopped builds remain in Challenges → Completed.

## desktop-v0.1.13 - 11 Nov 2026

### Added

- Add 3-question quizzes and a custom quiz length, capped at 30 questions.

### Changed

- Generate quizzes in a focused single-screen dialog that keeps the quiz
  collection visible, and choose the model and reasoning effort before
  generating.
- Remove word-count targets from challenge scope policies so generated briefs
  are shaped by the task and selected scope instead of an arbitrary length.

## desktop-v0.1.12 - 11 Nov 2026

### Changed

- Restore the React app to `apps/web`, move backend tests beside
  `packages/backend`, and simplify the workspace so frontend code, the RPC
  client, contracts, and preference options no longer live in separate packages;
  desktop behavior and stored data are unchanged.
- Show quiz generation progress and cancellation in the notification popover
  only, so the quizzes page no longer repeats a "Generating quiz" card above the
  list.

### Fixed

- Clear the quiz prompt after a quiz is queued so the next Generate quiz panel
  starts with an empty prompt.

## desktop-v0.1.11 - 09 Nov 2026

### Added

- Add an owner-only plaintext API key file (`secrets.json`, mode `0600`) as a fallback when the system credential store is unavailable; it persists without prompts, but any process running as you can read it

## desktop-v0.1.10 - 08 Nov 2026

### Changed

- Keep OpenCode sessions after each request so conversation history stays available
- Rebuild Settings with the same category column as Preferences
- Revamp Providers with full-width rows, searchable pickers, and visible labels
- Mask API keys and add reveal controls

### Removed

- Remove PostgreSQL support; SQLite is now the only database

## desktop-v0.1.9 - 06 Nov 2026

Patch release fixing OpenCode discovery.

### Fixed

- Find OpenCode installed in `~/.opencode/bin` when launched without the shell `PATH`

## desktop-v0.1.8 - 06 Nov 2026

OpenCode added as a selectable provider with grouped models.

### Added

- Add OpenCode for challenges, quizzes, hints, discussions, and reviews
- Group OpenCode models by upstream provider
- Add a searchable model picker with provider labels

### Changed

- Send JSON schemas to OpenCode 2 structured requests
- Use task-neutral session instructions for generation and review

## desktop-v0.1.7 - 01 Nov 2026

Private GitHub updates without a separate server.

### Added

- Add private GitHub release updates
- Connect with a profile email and repository-scoped read-only token
- Reuse the owner's existing GitHub CLI login
- Show update availability in the header
- Add download progress, cancellation, and install confirmation
- Encrypt saved tokens with the OS credential store, or keep them session-only
- Verify sizes and `SHA256SUMS`, and reject downgrades or incomplete releases
- Install Linux DEBs with administrator approval
- Replace writable macOS bundles from verified DMGs with a rollback copy
- Preserve profiles, practice, and provider settings
- Report token, access, download, checksum, and install errors
- Add recovery steps for failed updates

### Fixed

- Match macOS updater paths and signatures to `grill-me.app` and `grill-me-dev.app`

## desktop-v0.1.6 - 01 Nov 2026

Provider setup simplified with reasoning controls and release history.

### Added

- Reuse the installed Codex CLI account and `CODEX_HOME`
- Show Codex account and plan status
- Add per-provider reasoning settings and model discovery
- Default production providers to GPT-6.1 Sol with high reasoning
- Default development providers to GPT-6 Luna with medium reasoning
- Show the installed version in the top bar
- Add release history to Settings → About
- Add provider connection errors with retry and Settings actions

### Changed

- Reduce Settings to Codex and OmniRoute with independent switches
- Replace the Settings sidebar with tabs and a provider details panel
- Send reasoning effort to Codex and OpenAI-compatible providers
- Validate Codex model capabilities before starting a turn

### Removed

- Remove prompt-evaluation and keyring diagnostics
- Consolidate test and release-note scripts

## desktop-v0.1.5 - 31 Oct 2026

Challenge and quiz creation unified on Home, with navigation refinements.

### Added

- Create challenges and quizzes from the focused Home composer
- Keep separate drafts for challenge and quiz creation
- Add prompt enhancement and generation options

### Changed

- Add borderless category navigation to Settings and Preferences
- Enlarge sidebar controls and move History, Settings, and Logs to the bottom
- Simplify submission with visible folder, file, and code sources
- Remove redundant quiz-list actions and desktop preference controls

### Fixed

- Fix native keyring loading in the compiled backend

## desktop-v0.1.4 - 30 Oct 2026

Native credential storage shipped in installers.

### Fixed

- Include native credential storage in desktop installers
- Use Linux keyring and macOS Keychain for saved API keys
- Fail packaging when the credential loader or native binding is missing

## desktop-v0.1.3 - 30 Oct 2026

First release with macOS builds; 0.1.2 did not publish and native credentials shipped in 0.1.4.

### Added

- Add macOS builds for Apple Silicon and Intel
- Add native menus, Keychain support, and separate dev/prod editions

### Fixed

- Fix macOS project-folder permission errors
- Fix canonical temporary-path tests
- Preserve Finder executable discovery in desktop isolation checks

## desktop-v0.1.2 - 30 Oct 2026

This tag's production build failed, so no installers or GitHub release were published; macOS support shipped in 0.1.3.

### Added

- Add isolated macOS Intel and Apple Silicon editions
- Add Keychain storage and native application behavior
- Add ad-hoc DMG builds in CI

## desktop-v0.1.1 - 30 Oct 2026

Linux icon fixes.

### Fixed

- Complete Linux launcher and window icons
- Include the steak and smoke mark

## desktop-v0.1.0 - 30 Oct 2026

First Linux desktop release.

### Added

- Personalized coding challenges, quizzes, and review conversations
- Local project folders and review snapshots
- Codex CLI, OpenCode CLI, and OpenAI-compatible providers

### Changed

- Run Electron, React, and SQLite without Docker
- Keep development and production data separate

### Fixed

- Native folder selection and manual project paths
- Persistent zoom and maximized startup
- Compact window controls, sidebar navigation, and settings
