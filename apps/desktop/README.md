# Grill Me desktop development edition

Electron + electron-vite reuses the React interface and Hono services. A compiled
Bun executable supplies the backend and SQLite runtime inside the Linux package.
Using the installed app requires neither Docker, PostgreSQL, Node.js, nor Bun.
AI generation still needs a running OpenAI-compatible provider such as OmniRoute;
Codex project reviews need a native Codex CLI and its login.

## Develop

On Linux, install the repository's Bun version and Node.js 24 or newer, then:

```sh
bun install
bun dev
```

This opens Electron, starts its private backend, and enables React hot reload.
The backend runs directly from source in development. Restart `bun dev` after
backend changes; development never compiles the standalone executable or packages the app.
Do not start a database container or run PostgreSQL migrations for desktop use.
The separate web/PostgreSQL development workflow remains `bun dev:web`.

On Linux hosts that restrict unprivileged user namespaces and lack a configured
Chromium SUID helper, the development launcher automatically adds `--noSandbox`
and prints a warning. This relaxes Chromium's operating-system sandbox only for
source development; renderer Node integration remains disabled and context
isolation stays enabled. The packaged launcher never adds this fallback.

## Build and install a Debian package

```sh
bun run desktop:deb
sudo apt install ./apps/desktop/release/grill-me-dev-0.1.1-amd64.deb
```

Open **Grill Me Dev** from the application menu or run `grill-me-dev`.
Builds target the Linux host architecture; the example above is for x86-64.
The package manager installs ordinary Electron system-library dependencies.
The build downloads Electron and packaging tools on the first run.
`bun run desktop:build` builds without creating or installing a package.

## Configure AI

Choose **Application → Configure AI…**, edit `backend.env`, and choose
**Application → Restart**. Supply the provider's URL, API key, and model:

```dotenv
LLM_BASE_URL=http://127.0.0.1:20128/v1
LLM_API_KEY=your-local-provider-key
LLM_MODEL=auto
# Optional; useful when the desktop launcher cannot find Codex in PATH:
# CODEX_BIN=/absolute/path/to/codex
# CODEX_MODEL=your-codex-model
# PROJECTS_ROOT=/absolute/path/to/projects
```

Credentials are not copied from the backend's environment files and are never
bundled in the `.deb`. Only the documented AI, Codex, project-root, and review
limit settings are accepted. Database URLs and storage overrides are ignored.
The app runs without an AI key; generation reports configuration instructions.

## Data and production isolation

Desktop files live in `$XDG_CONFIG_HOME/grill-me-desktop-dev`, normally
`~/.config/grill-me-desktop-dev/`:

- `grill-me.sqlite`, plus SQLite WAL/SHM files while running
- `backend.env` and `backend.log`
- submissions, uploads, and app-managed Codex storage
- Electron's session, profile selection, theme, and quiz recovery storage

**Application → Open desktop data folder** opens this directory. SQLite schema
migrations run automatically at startup. Close the app before backing up the
entire directory; retain any WAL/SHM files if backing up a running instance.
Uninstalling the package retains this directory. Reinstalling retains your data.

This development edition starts with an empty SQLite database. It does not
connect to, copy, migrate, or delete the existing development or production
PostgreSQL databases. Existing Docker and PostgreSQL production configuration
and migrations are retained for the web deployment. Changing the desktop build
mode does not enable production database access.

Desktop reviews inspect submitted source without executing it. Docker-based
verification is disabled for this edition, even if Docker is installed. Native
Codex exploration still works. Closing the last window stops the backend and
its child processes. Queued jobs resume when reopened; interrupted running jobs
become explicitly retryable after their lease expires.

## Verify

```sh
bun run test:desktop
bun run check
xvfb-run -a bun run --cwd apps/desktop test:dev
bun run desktop:deb
xvfb-run -a bun run --cwd apps/desktop test:smoke
```

The SQLite suite uses a disposable directory and a fake provider. It exercises
the existing backend integration suite plus SQLite transaction and configuration
isolation checks. It never starts Docker or uses a real database/provider.
The development smoke test starts `bun dev` with a temporary profile and checks
actual rendered typography, layout, logo/input sizing, and SQLite profile login.
It runs entirely from source and does not build an executable or package.
The smoke script launches the packaged executable with a temporary Electron
profile and mock provider; it checks real profile creation, preference saving,
PDF/DOCX imports, deep links, renderer isolation, and restart persistence. It
requires Xvfb on headless Linux. It does not install the package on the host.

## Implementation boundaries

`electron.vite.config.ts` builds the existing web source with development storage
keys and a separate configuration directory. `scripts/build-backend.ts` replaces
the PostgreSQL database and schema modules with their SQLite counterparts and
compiles the backend into an executable and bundles the resume worker beside it. A PostgreSQL guard
fails closed if a desktop entry ever imports the wrong database module.

The SQLite adapter uses Drizzle's asynchronous SQLite proxy dialect backed by
`bun:sqlite`, preserving the services' asynchronous transactions. A process-wide
queue includes both reads and writes; `BEGIN IMMEDIATE` replaces PostgreSQL row
locks. Counters are allocated in the same transaction as generated content.
SQLite timestamps retain milliseconds, JSON uses typed text columns, foreign
keys are enabled, and WAL supports local persistence. The small database type
boundary exposes the existing service query types; actual SQL and column mapping
come entirely from SQLite. Update both schemas when adding shared fields, and
run the SQLite and isolated PostgreSQL suites when changing shared queries.

Packaged assets sit outside ASAR so the standalone backend can read them. The
sandboxed renderer has no Node integration or privileged IPC API. A stable
`grill-me://app` protocol forwards to a random loopback port with an ephemeral
secret supplied only by Electron. Other local HTTP clients cannot access that
backend without its secret. Development uses electron-vite's same-origin proxy
on a separate loopback port. External links open in the system browser.
