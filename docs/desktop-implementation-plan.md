# Desktop application implementation plan

## Scope and fixed decisions

- Extend the existing Electron PR, using small, reviewable commits on its current branch.
- Keep Electron, electron-vite, Vite, React, Bun, Hono, Drizzle and SQLite.
- Support Linux Debian packages only. Do not build an executable or package locally during this work.
- Develop and verify against disposable/local SQLite databases. Never connect to, migrate, copy or delete production data.
- Start maximized by default, offer windowed startup, and retain F11 for manual fullscreen.
- Support multiple OpenAI-compatible providers first. Native Anthropic/Gemini adapters are outside this iteration.
- Use T3Code as an architectural reference and Relay as the build/workflow reference.
- Retain the existing web deployment entry points and PostgreSQL behavior until an explicit deployment.

## 1. Shared packages and explicit startup

- [x] Extract `packages/backend` containing services, models, database adapters, storage, jobs and HTTP handlers.
- [x] Export a side-effect-free application/runtime factory; importing the package must not open a database or start listeners/workers.
- [x] Keep `apps/backend` as the independently runnable CLI/legacy deployment host.
- [x] Extract `packages/ui` containing the React routes, features, components, styles, assets and stores.
- [x] Keep `apps/web` as the independently runnable Vite host, and make Electron render the same package.
- [x] Introduce `packages/contracts` for validated settings and transport messages and `packages/client` for the WebSocket connection.
- [x] Replace desktop source-rewriting aliases with explicit SQLite selection behind the shared database boundary.
- [x] Keep PostgreSQL selection explicit for the existing production entry point; local launchers reject production overrides.
- [x] Update workspace dependencies, TypeScript/ESLint/Vite/Tailwind paths, tests, migration resources and Docker build inputs after extraction.

Acceptance: the backend package can be imported without a database; the same UI and services run from both desktop and web hosts; existing routes, storage keys and desktop SQLite data remain usable.

## 2. Local runtime and development commands

- [x] `bun dev`: Electron, private local backend and renderer HMR, all from source.
- [x] `bun dev:web`: browser UI and authenticated local SQLite backend, without Docker.
- [x] `bun dev:backend`: independently running local backend.
- [x] `bun dev:ui`: UI against an already running local backend.
- [x] Retain an explicitly named PostgreSQL development command for the legacy deployment workflow.
- [x] Have Electron launch a separate Bun backend process importing the shared package; do not run SQLite/LLM jobs inside Electron main.
- [x] Define readiness, error reporting and clean shutdown, including child jobs and database handles.
- [x] Prevent multiple backend owners of one SQLite data directory; isolate standalone, desktop and test roots by default.
- [x] Keep the current desktop development data location and stable renderer origin.

Acceptance: both source-mode launch paths create/use only their intended local data, expose understandable startup errors, and release resources on exit.

## 3. WebSocket application transport

- [x] Add a versioned, Zod-validated protocol with request IDs, responses, errors, events, cancellation and subscriptions.
- [x] Use WebSockets for application reads/writes, provider settings, generation/review progress and small structured operations.
- [x] Keep HTTP for health, assets and file transfers; retain legacy HTTP APIs for deployment compatibility.
- [x] Reuse service/validation/error behavior for HTTP and WebSocket requests rather than duplicating domain logic.
- [x] Include profile scoping, origin/host checks, authentication, payload limits and bounded buffering.
- [x] Supply authenticated bootstrap information without putting credentials in persistent browser storage or logs.
- [x] Connect Electron directly to the loopback WebSocket endpoint; the custom asset protocol remains HTTP-only.
- [x] Add heartbeat/reconnect behavior; refresh state/subscriptions after reconnect and never automatically replay mutations.
- [x] Remove polling for local generation/review status once event subscriptions are active; preserve HTTP client compatibility for legacy hosting.

Acceptance: profile/settings/challenge/quiz flows work over WebSockets, live progress arrives without polling, invalid/unauthorized frames are rejected, and disconnects cannot create duplicate submissions or jobs.

## 4. In-app settings and secrets

- [x] Add a Settings route reachable before profile selection, from app navigation and Ctrl+,.
- [x] Keep machine/provider settings separate from existing profile learning preferences.
- [x] Add provider creation, editing, deletion, active selection, endpoint/model fields, key replacement/removal, and connection testing.
- [x] Persist non-secret settings and credential references; return only saved-key status after saving.
- [x] Add a shared `SecretStore` interface with a Linux Secret Service implementation and an explicitly session-only implementation.
- [x] Require the persistent Secret Service backend, with no automatic weak/plaintext persistence fallback.
- [x] Report unavailable/locked keyring states in the UI and allow explicit session-only credentials.
- [x] Keep API keys out of SQLite, browser persistence, logs, URLs, process arguments and the backend child environment.
- [x] Apply settings to new provider calls without restarting; snapshot a running job's provider configuration.
- [x] Migrate existing desktop `backend.env` settings once. Remove a plaintext key only after the keyring write/read is verified; preserve the file if migration fails.
- [x] Support the existing native Codex/project/review settings through validated controls without accepting arbitrary environment overrides.
- [x] Provide local backend status, data-folder access and redacted diagnostics.

Acceptance: settings survive restart, persisted secrets are OS-protected, failed saves preserve previous settings, API responses/logs do not reveal saved keys, and standalone mode has the same settings behavior.

## 5. Desktop window controls

- [x] Add maximized and windowed startup choices; maximized is the first-launch default.
- [x] Add F11 fullscreen toggling and persist the selected startup preference independently of temporary window toggles.
- [x] Add Ctrl++/Ctrl+= and Ctrl+- zoom, Ctrl+0 reset and settings controls.
- [x] Clamp zoom to usable bounds, persist it, and show the current percentage.
- [x] Use a frameless window with minimize, maximize/restore and close controls in the existing header; remove the native menu and separate title bar without changing page/navigation structure.
- [x] Keep caption controls available across routes, profile selection and open menus; retain draggable header backgrounds and clickable header actions.
- [x] Retain Ctrl+, settings, F11 fullscreen, Ctrl+R/F5 reload, Ctrl+Shift+I developer tools and Ctrl+W/Ctrl+Q close shortcuts without a native menu. Open the data folder through Settings.
- [x] Expose only a narrow, validated preload bridge for bootstrap/window/native actions, with sender checks.
- [x] Preserve context isolation, disabled Node integration and packaged renderer sandboxing.

Acceptance: caption/keyboard/settings controls agree, settings persist after restart, the browser host has no desktop captions, and the renderer cannot invoke arbitrary Electron/filesystem APIs.

## 6. Relay-inspired CI and packaging

References:

- https://github.com/Prajwal-17/relay/blob/master/.github/workflows/desktop-dev-build.yaml
- https://github.com/Prajwal-17/relay/blob/master/apps/desktop/electron-builder.yml
- https://github.com/Prajwal-17/relay/blob/master/apps/desktop/electron-builder.dev.yml

- [x] Add `checks.yml` for formatting, lint, types, isolated SQLite/transport/settings tests and source-mode desktop smoke verification.
- [x] Add `desktop-dev-build.yml` with manual dispatch and a branch input, following Relay's simple dev-build model.
- [x] Use pinned Bun/Node versions and frozen dependency installation on Linux.
- [x] Separate common packaging defaults from the dev identity in `electron-builder.dev.yml`; activate only the dev edition.
- [x] Bundle renderer, standalone local backend, worker and migration resources; include native secret-store resources if needed.
- [x] Build Debian only, with no publishing and no production secrets or database access.
- [x] Smoke-test the packaged app in CI with disposable data and fake provider credentials.
- [x] Upload the Debian artifact, checksum and failure diagnostics with commit identification.
- [x] Keep production releases, auto-updates, Windows/macOS and AppImage outside this iteration.

## Verification and commit sequence

1. Commit this plan before implementation.
2. Extract packages and verify import boundaries, types and existing disposable SQLite tests; commit.
3. Implement local runtime/authenticated transport, verify protocol behavior and both source launch paths; commit.
4. Implement settings/credentials and native window controls, verify failures/persistence and real rendered settings; commit.
5. Add CI/packaging configuration and updated developer instructions; validate configuration without building locally; commit.
6. Run final formatting, lint, types, isolated SQLite tests and source-mode desktop/browser smoke checks. Fix regressions in follow-up commits.
7. Push this branch to update the existing PR and rewrite its title/body around the final implementation and actual validation.

Tests must use temporary data roots and fake providers. Live production PostgreSQL, production deployment commands and real provider calls are not part of verification. Local `build`, `package:*` and Debian installation commands must not run during implementation.

## Implementation and verification record

- Plan committed before implementation; shared packages and the local runtime/settings were committed separately on the existing PR branch.
- Shared backend import is tested without valid database configuration or listeners.
- Source-mode desktop and standalone browser smoke tests cover the shared UI, provider settings and SQLite profiles. Browser application requests use WebSockets.
- 121 isolated tests cover the existing domain behavior, transactions, provider persistence/failures, connection authentication/ticket reuse, cancellation and reconnect without mutation replay.
- Native Secret Service storage passed a round-trip in a private D-Bus session with a disposable encrypted GNOME keyring; the normal user keyring was not accessed.
- Electron builder inheritance and schema were validated without invoking a build. Workflow YAML was parsed locally.
- Formatting, lint and TypeScript checks are required before final handoff. Linux Debian packaging and the packaged-app smoke are configured for manual CI and have deliberately not been run locally.
- The legacy PostgreSQL/Docker deployment entry points were retained and their source paths updated; production databases and deployments were not accessed.

- Follow-up: startup now defaults to maximized, migrates legacy fullscreen settings without discarding zoom, and restores saved zoom after navigation. The Electron source smoke verifies zoom across a complete process restart.
- Frameless follow-up: source smoke verifies native maximize/restore and close, both themes, and saved zoom after reload and a complete process restart. Browser smoke confirms desktop captions are absent. Finish review accepted all four captures with no material fixes; no local package build or production access was used.
