# Grill Me

Grill Me is a local-first desktop practice companion for developers. Users create
challenges and quizzes, build in their own editor, submit code or connect a local
project, and receive AI reviews. Data stays on the machine in the edition's data
directory. Electron is the desktop host for the Vite React app in `apps/web`; the
Bun backend is a private local component, not a separately hosted service.

## Stack

- Bun 1.4.1 workspaces with Turborepo; Node.js 24 or newer for source tooling.
- Electron 43 with electron-vite, Vite 7, and React 19.
- Hono and Zod on the backend.
- Drizzle ORM over SQLite (`bun:sqlite`, WAL mode); no PostgreSQL database or
  Docker setup.
- React Router for routes, TanStack Query for server state, Zustand for client state.
- AI providers: installed Codex CLI, installed OpenCode CLI, or an
  OpenAI-compatible OmniRoute endpoint.

## Repository map

- `apps/web` — the Vite React SPA, its routes, features, components, styles,
  assets, client state, and WebSocket RPC client. Electron builds this app as its
  renderer. See [`apps/web/AGENTS.md`](apps/web/AGENTS.md) for frontend rules.
- `apps/desktop` — Electron main/preload processes, window behavior, private
  updates, build scripts, and packaging config.
- `packages/backend/test` — backend, local-server, contracts, resume, and
  project integration tests. There is no separate backend application host.
- `packages/backend` — Hono app, domain modules, local RPC server, provider
  adapters, SQLite schema/migrations, storage, AI prompts, and the shared
  transport contracts and preference options under `src/shared`.
- `scripts` — isolated test runner and release-note extraction.
- `docs` — retained legacy-data notes only.

## Commands

Run commands from the repository root.

```sh
bun install              # install workspace dependencies
bun dev                  # complete Electron app, backend, and renderer
bun run check            # Prettier, ESLint, and TypeScript
bun run web:build        # compile the Vite app without Electron
bun run test:desktop     # alias for the isolated SQLite test suite
bun run test:isolated    # canonical temporary-data test command
bun run desktop:build    # compile the production app without an installer
bun run desktop:deb      # Linux x64 production Debian package
bun run desktop:dmg:arm64  # Apple Silicon production DMG (macOS host)
bun run desktop:dmg:x64    # Intel production DMG (macOS host)
```

Package-level checks are available with `bun run lint` and
`bun run check-types` inside each workspace.

## Working agreements

- Use Bun for installs and scripts; do not add npm, yarn, or pnpm lockfiles.
- Keep changes scoped to the request and match the surrounding formatting. Do not
  reformat unrelated files or rewrite generated output.
- Never commit local data, credentials, or build artifacts such as `.data/`,
  `apps/desktop/release/`, `apps/desktop/resources/backend/`, `out/`, `.turbo/`,
  or `.impeccable/review/`.
- Do not use real Codex/OpenCode accounts, paid inference, production data, or
  production credentials for development or tests.
- Run development, debugging, and UI verification only in the development edition
  with a development-scoped database, data root, Electron session partition,
  renderer storage, and credential namespace. Prefer an isolated temporary
  development root with fake seed data. Never launch or use the production app
  for development; never read, copy, migrate, or write the production database,
  data directory, or credentials; never point a development process at
  production paths. Production and release packaging run only when separately
  and explicitly requested, with the production identity invariant in
  Architecture and security rules intact.
- Update the relevant docs and `CHANGELOG.md` when behavior changes. If a native
  packaging or platform check was not run, say so instead of claiming success.

## Git and pull requests

- Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`) with an imperative,
  concise subject. Add a short body only when the change needs context.
- Keep pull request descriptions short and factual: list what changed and why.
  Do not dump logs, generated output, or unrelated implementation detail.
- Include screenshots or other reviewable artifacts in the pull request when the
  change has visible UI or another artifact worth inspecting.
- Never name a branch with a `t3/` prefix, including a name suggested by T3 Code.
  Use a descriptive branch such as `feat/<topic>`, `fix/<topic>`, `chore/<topic>`,
  or `docs/<topic>`.
- If a branch is accidentally named with `t3/`, rename it before opening a pull
  request. If it was already pushed, push the corrected branch, open the pull
  request from it, and close the superseded pull request.

## Architecture and security rules

- Electron owns process lifecycle. `apps/desktop/src/main.ts` compiles the
  backend child process, starts it on loopback with a random bearer token, and
  loads the renderer from `grill-me://app` (or the Vite dev URL). The renderer
  source belongs in `apps/web`; Electron builds it through electron-vite. Do not
  recreate a UI package under `packages` or add a standalone backend/browser
  launch path.
- Keep development and production identities aligned across the build channel,
  data directory, Electron session partition, renderer storage key, credential
  namespace, and installer output. A production binary must never be switchable
  to development through an environment variable.
- The renderer is sandboxed with context isolation and no Node integration.
  Native capabilities must go through the narrow `window.desktopBridge` preload
  surface. Validate the sender, frame origin, and payload in the main process;
  never broaden a typed IPC channel into a general filesystem or shell bridge.
- The local backend binds `127.0.0.1` only. HTTP requests require the launcher
  bearer token; WebSocket connections require a short-lived ticket and the
  `grill-me-v1` subprotocol. Keep origin checks, payload limits, backpressure,
  and clean shutdown intact.
- Never expose secrets in the renderer, URLs, logs, process arguments, SQLite, or
  request payloads. API keys go through `SecretStore` (macOS Keychain, Linux
  Secret Service, or an explicit owner-only plaintext file at
  `<data root>/secrets.json` with `0600` permissions); update tokens use Electron
  `safeStorage`. Plaintext credential storage must stay user-selectable or the
  fallback used when the OS credential store is unavailable, and the file must
  never be world-readable.
- SQLite is the only database runtime. Keep `schema.sqlite.ts`,
  `schema.legacy.ts`, the generated SQL files under `drizzle/`, their
  `drizzle/meta/` journal and snapshots, and the generated
  `migration-files.ts` manifest in sync. Add schema changes with
  `bun run --cwd packages/backend db:generate`, then bump `DATABASE_VERSION` in
  `db.sqlite.ts` so startup backs up the previous database; do not add a
  hand-maintained fresh-schema file. Follow the compatibility rules below;
  existing practice data must remain readable.
- Write through the shared database adapter (`db`, `first`, `lockRows`,
  `databaseNow`, `nextGenerationNumber`) so write notifications reach the
  renderer. Keep profile scoping in every query and never trust a profile ID
  supplied by a rendered page without authorization checks.

## Backend conventions

- Domain code lives under `packages/backend/src/modules/<domain>` and is
  typically split into routes, controller, service, model, and Zod schema
  layers. Keep HTTP handling thin; business rules and ownership checks belong in
  the service.
- Validate all input with Zod. Throw `AppError` for expected failures, passing
  the code, message, HTTP status, retryable flag, and optional details.
  Controllers return `{ data }`; the shared error handler returns
  `{ error: { code, message, retryable } }`.
- Read the profile from the `X-Profile-Id` header. Streaming endpoints emit
  NDJSON; long AI operations are cancellable and must not replay automatically
  after a disconnect.
- Provider behavior belongs behind `ModelGateway`. CLI-specific code lives in
  `packages/backend/src/local/providers`; map failures through `providerError`
  instead of leaking raw stderr or credentials. OpenCode gets an isolated home
  per provider; Codex uses its configured home and reuses the host CLI login by
  default.
- Reviews inspect the challenge workspace with read-only tools and must never
  execute submitted code. Preserve the explicit, user-controlled completion, scoring,
  and quiz autosave semantics.
- `packages/backend` must stay side-effect free on import. `createBackend`
  initializes the database, recovers interrupted work, and returns the app.

## Compatibility and data preservation

This is a long-lived application with real user practice data, not a disposable
child project. New features and schema changes must preserve existing rows,
columns, tables, indexes, IDs, timestamps, profiles, and migration history.

- Prefer additive, forward-only migrations. Do not reset or recreate the
  database, delete old migrations, or rewrite released migration files to make a
  change easier.
- Never drop a table or column, rename or rewrite stored data, change a stored
  format incompatibly, or remove support for existing records as part of an
  ordinary feature. Keep old data readable and existing behavior working.
- If a change requires data loss, a destructive rewrite, or removal or
  replacement of previous migrations, stop and ask the developer for explicit
  approval before implementing or running it. Ask in the development session;
  do not ask end users, add a runtime confirmation, or decide silently.
- For an approved destructive migration, provide a backup and rollback path,
  keep the migration transactional, validate foreign keys, and document the
  impact in the change.
- Test migrations against a populated database from the previous schema, not
  only a clean install. Add new `PRAGMA user_version` steps and keep existing
  migrations immutable.
- Preserve existing API contracts, route and URL behavior, settings keys, and
  stored record shapes unless the developer explicitly approves a break.

## Contracts and transport

- `packages/backend/src/shared/contracts.ts` is the source of truth for the IPC
  bridge, RPC protocol, provider settings, and runtime settings. Update the
  schema and inferred types together, and bump `PROTOCOL_VERSION` for breaking
  wire changes.
- `packages/backend/src/shared/preferences.ts` holds the shared preference and
  technology-stack options. Keep frontend and backend imports on that module
  instead of duplicating option lists.
- Application reads and writes use `apiRequest` / `streamRequest`; desktop
  traffic travels over the WebSocket client. Do not call `fetch` for domain data
  in feature code. File uploads and downloads may use HTTP where required.
- Preserve request IDs, cancellation, event subscriptions, and bounded pending
  request behavior. Reconnects refresh state rather than replaying mutations.

## Testing and verification

- Add focused tests beside the module or in the matching workspace test folder.
  Use temporary data roots and fake providers; never use real Codex/OpenCode
  accounts, paid inference, production databases, or production credentials.
- Capture screenshots and other UI evidence from the development edition running
  with development configuration. A "DEV" badge alone is not proof: confirm the
  session, data directory, and database actually belong to development. Do not
  launch the production app to obtain them.
- Run `bun run check` and `bun run test:desktop` before handoff. Browser/Electron
  E2E and Playwright suites are intentionally absent; do not add them.
- Packaging must run on the matching native OS/arch and rebuilds the selected
  channel. Cross-builds, universal macOS bundles, Windows, and Linux ARM are
  unsupported.

## Changelog and releases

`CHANGELOG.md` is user-facing release history and the source of GitHub release
notes and Settings → About. Keep it readable and grouped by impact:

- Put unreleased work under `## Unreleased`, grouped under `### Added`,
  `### Changed`, `### Fixed`, or `### Removed`.
- Use one bullet per user-visible outcome. Explain what changed and why it
  matters; do not paste commit messages, session logs, or implementation trivia.
- Released entries are newest first and use the exact heading
  `## desktop-vX.Y.Z - D Mon YYYY`. The release script and the About screen parse
  this format; missing or empty entries fail publishing.
- Do not rewrite shipped entries except to correct a factual error. Before
  tagging, bump the root and desktop versions, update the lockfile, move the
  relevant `Unreleased` notes into a new version entry, and run
  `python3 scripts/release-notes.py <version>` to verify extraction.
