# Grill Me desktop development edition

The Electron shell and standalone web host share `@repo/ui`, `@repo/client`,
`@repo/contracts` and `@repo/backend`. The local backend runs in a separate Bun
process with SQLite. Docker and PostgreSQL are not needed for either local mode.
The Debian package bundles the backend runtime; installed users do not need Bun
or Node. AI requests require an OpenAI-compatible provider supporting the Responses API
and structured output used by the existing backend. Native Codex reviews
also require a Codex CLI installation and its login.

## Source development

Use the repository's Bun version and Node.js 24 or newer:

```sh
bun install
bun dev                # Electron + private backend + React HMR
bun dev:web            # browser UI + local SQLite backend
bun dev:backend        # backend independently
bun dev:ui             # UI against the standalone backend
```

Desktop and standalone commands use the same packages and separate local data.
The standalone UI defaults to `http://127.0.0.1:8028`; its backend uses port 18028.
`LOCAL_WEB_PORT`, `LOCAL_BACKEND_PORT` and an absolute `GRILL_LOCAL_HOME` can
select another isolated standalone instance. Restart the launcher after backend
changes. React changes hot reload. Source development does not compile the
standalone backend executable or create packages.

`bun dev:postgres` retains the legacy PostgreSQL web development workflow.
Production hosting still uses the existing backend entry point and HTTP API.
Neither local launcher reads backend environment files or accepts an inherited
production database URL/storage root.

On Linux hosts that restrict unprivileged user namespaces and lack a configured
Chromium SUID helper, the source launcher adds `--noSandbox` with a warning.
Renderer Node integration remains disabled and context isolation remains enabled.
The packaged application does not add this fallback. CI's headless packaged smoke
explicitly supplies `--no-sandbox` for its disposable test process only.

## Application settings

Open **Settings** in the sidebar, **Application → Settings…**, or press `Ctrl+,`.
Settings are also available on the profile-selection screen.

- Save multiple OpenAI-compatible providers with endpoint, model and optional key.
- Select the provider used by new requests; use **Test connection** to check it.
- Replace or remove a saved key without reading it back into the UI.
- Configure native Codex paths/models, project folders and review limits.
- The app starts maximized by default, with an optional windowed startup mode.
- Use `Ctrl++` / `Ctrl+=`, `Ctrl+-` and `Ctrl+0` for persistent application zoom.
  `F11` toggles fullscreen without changing the selected startup mode.

API keys use Linux Secret Service through `@napi-rs/keyring`, requiring its
persistent `secret-service` backend. GNOME Keyring and compatible Secret Service
implementations can supply it. When unavailable/locked, Settings offers an explicit
**Session only** mode. Session keys disappear when the backend closes. The app
does not silently save plaintext keys. Keys are not stored in SQLite, browser
storage, process arguments, child environment variables or application logs.

Existing desktop `backend.env` files are detected in Settings. **Import to keyring**
verifies the stored key before removing the plaintext key assignment. A failed
vault write preserves the original file. Session-only import leaves that file
intact and can be repeated after restart. New installations do not create it.
Provider changes apply without restarting; running generation/review jobs retain
the provider configuration captured when they started.

## Data and lifecycle

Desktop data remains in `$XDG_CONFIG_HOME/grill-me-desktop-dev`, normally
`~/.config/grill-me-desktop-dev/`. Standalone development defaults to the
repository's ignored `.data/standalone-dev/`.

- `grill-me.sqlite`: profiles, practice, jobs and redacted AI logs.
- `settings.sqlite`: non-secret provider/runtime settings and opaque key references.
- `desktop-settings.json`: desktop startup mode and zoom.
- `backend.log`: desktop backend diagnostics.
- Uploads, submissions, Codex state and Electron's development browser session.

Local data directories have owner-only permissions. Keyring entries are scoped
to the development edition and the data root. There is no full-database encryption;
use operating-system disk encryption when that is required. Close the app before
backing up its data; keyring credentials must be configured again on a new machine.
Uninstalling retains local data. Existing desktop SQLite data and browser storage
keys remain compatible.

One backend owns each local data folder. Starting another against that folder
fails with an actionable error. A stale lock from an exited process is recovered.
Closing Electron stops its backend and child process group. The standalone
launcher stops both its UI and server on exit. Interrupted jobs recover under the
existing lease/retry rules. Local reviews inspect submitted code without running
it; Docker verification stays disabled for local mode.

## Communication and package boundaries

`@repo/backend` exposes an explicit factory: importing it does not start listeners,
open a database or run migrations. Database adapters use real SQLite/PostgreSQL
tables and execution behind one small typed boundary; no source-rewriting plugin
is involved. SQLite transactions serialize reads/writes and notify subscribers
after committed mutations. Production SQL migration contents are unchanged.

Application reads/writes and streamed responses use a validated, versioned
WebSocket protocol. Shared HTTP handlers retain domain validation and errors.
Committed database changes invalidate active client queries, replacing local job
polling. Reconnect refreshes subscriptions/state and never replays mutations.
HTTP remains for files, health, assets and connection bootstrap.

The backend binds only to loopback and requires a launcher token. WebSocket
upgrades require a short-lived, single-use ticket and an allowed origin. Desktop
uses a narrow, sender-checked preload bridge to obtain connection bootstrap and
native window actions. The stable `grill-me://app` origin serves packaged assets;
WebSockets connect directly to the backend. Standalone Vite proxies bootstrap,
WebSocket and HTTP file traffic; its token stays server-side in an owner-only
connection file. The renderer has no Node integration or arbitrary native API.

## Verification

```sh
bun run check
bun run test:desktop
xvfb-run -a bun run --cwd apps/desktop test:dev
bun run --cwd apps/desktop test:web
bun run --cwd apps/desktop test:keyring  # requires GNOME Keyring and dbus-run-session
```

Tests use temporary data and fake providers/vaults. Source smoke tests exercise
both actual hosts, settings, SQLite login and WebSocket application traffic. UI
captures are written into ignored `.data/`. The PostgreSQL suite remains available
only through the explicit isolated PostgreSQL test runner.

## Development CI and Debian artifacts

`checks.yml` runs source checks, isolated tests and both source smoke tests.
`desktop-dev-build.yml` follows Relay's manually dispatched workflow with a
branch/tag/commit input. It builds Linux `.deb` only, smoke-tests the packaged app,
and uploads the package, SHA-256 checksum and source commit. It does not publish
a release, deploy services or require real AI/database credentials.

`electron-builder.yml` owns common packaging resources; `electron-builder.dev.yml`
owns the dev application identity. The backend, parser worker and native keyring
loader/binding live outside ASAR. Main/preload workspace dependencies are bundled.
Package creation, when explicitly requested or run in CI, is `bun run desktop:deb`.
No package build is part of `bun dev` or the source checks above.
