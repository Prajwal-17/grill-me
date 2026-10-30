# Grill Me desktop

Run the complete app from the repository root with `bun dev`. Electron owns its
Bun/SQLite backend process and the React renderer in `renderer/`. Backend and UI
logic remain shared workspace packages, with no separate launch commands.

Use Settings for installed Codex/OpenCode connections, model selection,
OpenAI-compatible endpoints, credentials, project folders, and review timeouts.
CLI authentication is scoped to each edition. API keys use Linux Secret Service
or an explicit in-memory session. No backend environment files are inherited.
In Local runtime, enter the projects folder path directly or use the folder
button to choose a directory. Save runtime settings applies either choice;
canceling the picker leaves the current path unchanged.

The app opens maximized; `Ctrl++`, `Ctrl+-`, and `Ctrl+0` adjust persistent zoom.
`F11` toggles fullscreen, `Ctrl+,` opens Settings, and the header supplies compact
window controls. Source mode may use the existing development-only Chromium
sandbox fallback on restricted Linux hosts. Packaged applications do not enable
that fallback.

Development uses `grill-me-desktop-dev`, production `grill-me-desktop`, under the
Linux config directory. Each owns its SQLite database, private provider state,
Electron session, settings, uploads, snapshots, logs, and keyring namespace. Local
reviews inspect submitted snapshots without executing code. Conversation retries
are explicit; app startup marks partial unfinished responses interrupted.

Build channels are compiled into the main process and renderer, checked against
package metadata, and passed explicitly to the backend. A production binary
cannot be switched to development by exporting an environment variable.
Production also uses SQLite and refuses PostgreSQL in the desktop runtime.

See [builds and releases](../../docs/desktop-release.md) for exact package commands,
CI workflows, versioning, installation, and storage. See
[CLI providers](../../docs/cli-providers.md) for authentication and history.

Linux launcher and window icons are generated from `renderer/public/icon.svg`.
`bun run --cwd apps/desktop icons` exports static PNGs at native icon sizes to
`resources/icons`. Development and package builds regenerate these assets;
both editions use the same complete logo.

Only focused runtime tests remain. `bun run test:desktop` uses temporary data and
fake providers; no E2E runners or browser download is required.
