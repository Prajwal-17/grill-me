# Changelog

## desktop-v0.4.0 - 17 Nov 2026

### Fixed

- Show the exact problem when an AI run's final result is rejected, so the model
  can correct it and a failed preparation explains itself instead of repeating a
  generic message.

### Changed

- Allow project preparation more turns and commands so a complete practice
  project can finish within the run budget.

## desktop-v0.3.0 - 17 Nov 2026

A refreshed challenge workspace with focused tabs, a file viewer, and one
full-width transcript.

### Added

- Browse a prepared project's files in a read-only viewer that opens as a side
  panel or full width.

### Changed

- Split the challenge page into Overview, Review, Activity, and Quizzes tabs.
- Move the agent transcript into a full-width Activity tab, grouped by
  category.
- Open a challenge workspace in Cursor, Zed, or VS Code, remembering the chosen
  editor.
- Collapse challenge questions under "Ask about this challenge" until opened.
- Simplify Settings → About into one release list with a version index.
- Show only the reasoning efforts the selected model supports.
- Read challenge briefs in a wider, softer column.
- Hide scrollbars while keeping wheel, trackpad, touch, and keyboard scrolling.

### Fixed

- Make Copy actions work again in the desktop app.
- Match agent permissions to the shared dropdown style.
- Open challenges whose saved brief exceeds the generation limit instead of
  failing the list.

### Removed

- Remove the duplicate challenge reference panel.
- Remove the legacy Logs page.

## desktop-v0.2.0 - 15 Nov 2026

Challenge workspaces, guided project preparation, reviews, and a durable
transcript for every AI run.

### Added

- Give every challenge a local folder for code, notes, and artifacts, seeded
  once with the brief and starter code.
- Open a challenge workspace in the file manager, Cursor, Zed, VS Code, or a
  JetBrains IDE.
- Ask where app data and workspaces live during first-run setup, with sensible
  defaults.
- Prepare a guided project from a generated challenge, with separate source,
  configuration, tests, docs, and a failing TODO exercise.
- Let preparation request setup and check commands, each with explicit
  approval.
- Recover interrupted preparation with Resume, Retry, or Fresh without losing
  earlier files.
- Review an attempt against its completion criteria, marking each one pass,
  partial, or fail with the file and line that proves it.
- Show a durable transcript for every agent run, with tool calls, approvals,
  token usage, and stop or retry.
- Add one app-wide agent permission mode: approval required, auto-accept edits,
  auto, or full access.
- Let challenge and quiz generation inspect pasted context, links, and images
  in a temporary workspace.
- Add `bun run db:studio:dev` and `bun run db:studio:prod` for Drizzle Studio.

### Changed

- Use generated Drizzle migrations as the only schema source; existing
  databases upgrade once and keep their data.
- Allocate challenge and quiz numbers from stored rows instead of a counter
  table.
- Create only active tables on fresh installs; upgraded databases keep retired
  data under `*_legacy` names.
- Remove five unused challenge fields, folding their saved values into the
  challenge text and saved context.
- Require prepared projects to include a TODO, real tests, configuration, docs,
  and a migration when storage is needed.

### Fixed

- Generate challenge specifications separately from project files.
- Open the actual project folder from workspace actions.
- Keep existing challenge files untouched when a workspace is added or opened.
- Allow `.env.example` while still blocking real `.env` files.
- Refuse symbolic links for workspace metadata and app-owned folders.
- Honor the milestones requested in the generated challenge.
- Require setup and check approval before preparation completes.
- Keep proposed setup, check, and run commands visible after other commands run.
- Upgrade existing databases that hit legacy table renames at startup.
- Keep model and reasoning lists scrollable in composers and the quiz dialog.
- Always offer a no-reasoning option next to supported reasoning levels.
- Stop the Generate quiz dialog from replaying its entrance animation.
- Simplify the Generate quiz dialog: no quiz-type subtitle, icon-only close.
- Show a standalone quiz's prompt on its start screen and while answering.
- Regenerate quiz titles with the selected model.

### Removed

- Remove solution reviews and verification; existing rows stay as legacy data.
- Stop writing AI request logs; the Logs page is read-only with a legacy
  banner.
- Remove the standalone History page; completed builds stay under Challenges.

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
