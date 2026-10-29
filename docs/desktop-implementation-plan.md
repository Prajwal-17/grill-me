# Desktop application implementation plan

## Scope and fixed decisions

- Extend the existing Electron PR, using small, reviewable commits on its current branch.
- Keep Electron, electron-vite, Vite, React, Bun, Hono, Drizzle and SQLite.
- Support Linux Debian packages only. Do not build an executable or package locally during this work.
- Develop and verify against disposable/local SQLite databases. Never connect to, migrate, copy or delete production data.
- Support both fullscreen and maximized startup, with fullscreen as the initial default and a windowed option.
- Support multiple OpenAI-compatible providers first. Native Anthropic/Gemini adapters are outside this iteration.
- Use T3Code as an architectural reference and Relay as the build/workflow reference.
- Retain the existing web deployment entry points and PostgreSQL behavior until an explicit deployment.

## 1. Shared packages and explicit startup

- [ ] Extract `packages/backend` containing services, models, database adapters, storage, jobs and HTTP handlers.
- [ ] Export a side-effect-free application/runtime factory; importing the package must not open a database or start listeners/workers.
- [ ] Keep `apps/backend` as the independently runnable CLI/legacy deployment host.
- [ ] Extract `packages/ui` containing the React routes, features, components, styles, assets and stores.
- [ ] Keep `apps/web` as the independently runnable Vite host, and make Electron render the same package.
- [ ] Introduce `packages/contracts` for validated settings and transport messages and `packages/client` for the WebSocket connection.
- [ ] Replace desktop source-rewriting aliases with explicit SQLite selection behind the shared database boundary.
- [ ] Keep PostgreSQL selection explicit for the existing production entry point; local launchers reject production overrides.
- [ ] Update workspace dependencies, TypeScript/ESLint/Vite/Tailwind paths, tests, migration resources and Docker build inputs after extraction.

Acceptance: the backend package can be imported without a database; the same UI and services run from both desktop and web hosts; existing routes, storage keys and desktop SQLite data remain usable.

## 2. Local runtime and development commands

- [ ] `bun dev`: Electron, private local backend and renderer HMR, all from source.
- [ ] `bun dev:web`: browser UI and authenticated local SQLite backend, without Docker.
- [ ] `bun dev:backend`: independently running local backend.
- [ ] `bun dev:ui`: UI against an already running local backend.
- [ ] Retain an explicitly named PostgreSQL development command for the legacy deployment workflow.
- [ ] Have Electron launch a separate Bun backend process importing the shared package; do not run SQLite/LLM jobs inside Electron main.
- [ ] Define readiness, error reporting and clean shutdown, including child jobs and database handles.
- [ ] Prevent multiple backend owners of one SQLite data directory; isolate standalone, desktop and test roots by default.
- [ ] Keep the current desktop development data location and stable renderer origin.

Acceptance: both source-mode launch paths create/use only their intended local data, expose understandable startup errors, and release resources on exit.

## 3. WebSocket application transport

- [ ] Add a versioned, Zod-validated protocol with request IDs, responses, errors, events, cancellation and subscriptions.
- [ ] Use WebSockets for application reads/writes, provider settings, generation/review progress and small structured operations.
- [ ] Keep HTTP for health, assets and file transfers; retain legacy HTTP APIs for deployment compatibility.
- [ ] Reuse service/validation/error behavior for HTTP and WebSocket requests rather than duplicating domain logic.
- [ ] Include profile scoping, origin/host checks, authentication, payload limits and bounded buffering.
- [ ] Supply authenticated bootstrap information without putting credentials in persistent browser storage or logs.
- [ ] Connect Electron directly to the loopback WebSocket endpoint; the custom asset protocol remains HTTP-only.
- [ ] Add heartbeat/reconnect behavior; refresh state/subscriptions after reconnect and never automatically replay mutations.
- [ ] Remove polling for local generation/review status once event subscriptions are active; preserve HTTP client compatibility for legacy hosting.

Acceptance: profile/settings/challenge/quiz flows work over WebSockets, live progress arrives without polling, invalid/unauthorized frames are rejected, and disconnects cannot create duplicate submissions or jobs.

## 4. In-app settings and secrets

- [ ] Add a Settings route reachable before profile selection, from app navigation, the native menu and Ctrl+,.
- [ ] Keep machine/provider settings separate from existing profile learning preferences.
- [ ] Add provider creation, editing, deletion, active selection, endpoint/model fields, key replacement/removal, and connection testing.
- [ ] Persist non-secret settings and credential references; return only saved-key status after saving.
- [ ] Add a shared `SecretStore` interface with a Linux Secret Service implementation and an explicitly session-only implementation.
- [ ] Require the persistent Secret Service backend, with no automatic weak/plaintext persistence fallback.
- [ ] Report unavailable/locked keyring states in the UI and allow explicit session-only credentials.
- [ ] Keep API keys out of SQLite, browser persistence, logs, URLs, process arguments and the backend child environment.
- [ ] Apply settings to new provider calls without restarting; snapshot a running job's provider configuration.
- [ ] Migrate existing desktop `backend.env` settings once. Remove a plaintext key only after the keyring write/read is verified; preserve the file if migration fails.
- [ ] Support the existing native Codex/project/review settings through validated controls without accepting arbitrary environment overrides.
- [ ] Provide local backend status, data-folder access and redacted diagnostics.

Acceptance: settings survive restart, persisted secrets are OS-protected, failed saves preserve previous settings, API responses/logs do not reveal saved keys, and standalone mode has the same settings behavior.

## 5. Desktop window controls

- [ ] Add fullscreen, maximized and windowed startup choices; fullscreen is the first-launch default.
- [ ] Add F11 fullscreen toggling and persist the selected startup preference independently of temporary window toggles.
- [ ] Add Ctrl++/Ctrl+= and Ctrl+- zoom, Ctrl+0 reset, native menu commands and settings controls.
- [ ] Clamp zoom to usable bounds, persist it, and show the current percentage.
- [ ] Expose only a narrow, validated preload bridge for bootstrap/window/native actions, with sender checks.
- [ ] Preserve context isolation, disabled Node integration and packaged renderer sandboxing.

Acceptance: keyboard/menu/settings controls agree, settings persist after restart, and the renderer cannot invoke arbitrary Electron/filesystem APIs.

## 6. Relay-inspired CI and packaging

References:

- https://github.com/Prajwal-17/relay/blob/master/.github/workflows/desktop-dev-build.yaml
- https://github.com/Prajwal-17/relay/blob/master/apps/desktop/electron-builder.yml
- https://github.com/Prajwal-17/relay/blob/master/apps/desktop/electron-builder.dev.yml

- [ ] Add `checks.yml` for formatting, lint, types, isolated SQLite/transport/settings tests and source-mode desktop smoke verification.
- [ ] Add `desktop-dev-build.yml` with manual dispatch and a branch input, following Relay's simple dev-build model.
- [ ] Use pinned Bun/Node versions and frozen dependency installation on Linux.
- [ ] Separate common packaging defaults from the dev identity in `electron-builder.dev.yml`; activate only the dev edition.
- [ ] Bundle renderer, standalone local backend, worker and migration resources; include native secret-store resources if needed.
- [ ] Build Debian only, with no publishing and no production secrets or database access.
- [ ] Smoke-test the packaged app in CI with disposable data and fake provider credentials.
- [ ] Upload the Debian artifact, checksum and failure diagnostics with commit identification.
- [ ] Keep production releases, auto-updates, Windows/macOS and AppImage outside this iteration.

## Verification and commit sequence

1. Commit this plan before implementation.
2. Extract packages and verify import boundaries, types and existing disposable SQLite tests; commit.
3. Implement local runtime/authenticated transport, verify protocol behavior and both source launch paths; commit.
4. Implement settings/credentials and native window controls, verify failures/persistence and real rendered settings; commit.
5. Add CI/packaging configuration and updated developer instructions; validate configuration without building locally; commit.
6. Run final formatting, lint, types, isolated SQLite tests and source-mode desktop/browser smoke checks. Fix regressions in follow-up commits.
7. Push this branch to update the existing PR and rewrite its title/body around the final implementation and actual validation.

Tests must use temporary data roots and fake providers. Live production PostgreSQL, production deployment commands and real provider calls are not part of verification. Local `build`, `package:*` and Debian installation commands must not run during implementation.
