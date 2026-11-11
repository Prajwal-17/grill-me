# Grill Me desktop

Run the complete app from the repository root with `bun dev`. Electron owns its
Bun/SQLite backend process and builds the React app in `apps/web` as its renderer.
Backend code stays in `packages/backend`, with no separate launch commands.

Settings → Providers offers Codex and OmniRoute, each with an on/off switch and
a separate selector for AI requests. Codex reuses the installed CLI login and
CODEX_HOME by default; Advanced settings allow a custom home. API keys use macOS Keychain or Linux Secret Service
or an explicit in-memory session. No backend environment files are inherited.
Connect project folders when submitting an implementation. Advanced settings control
review timeouts. The top-bar version opens Settings → About and the full changelog.

On macOS use Command in place of Ctrl; native menus and window controls are available.
The app opens maximized; `Ctrl++`, `Ctrl+-`, and `Ctrl+0` adjust persistent zoom.
`F11` toggles fullscreen, `Ctrl+,` opens Settings, and the header supplies compact
window controls. Source mode may use the existing development-only Chromium
sandbox fallback on restricted Linux hosts. Packaged applications do not enable
that fallback.

Development uses `grill-me-desktop-dev`, production `grill-me-desktop`, under the
Linux config directory, or `~/Library/Application Support/` on macOS. Each owns its SQLite database, private provider state,
Electron session, settings, uploads, snapshots, logs, and keyring namespace. Local
reviews inspect submitted snapshots without executing code. Conversation retries
are explicit; app startup marks partial unfinished responses interrupted.

Build channels are compiled into the main process and renderer, checked against
package metadata, and passed explicitly to the backend. A production binary
cannot be switched to development by exporting an environment variable.
Both editions use only local SQLite; no external database is required.

See [builds and releases](../../docs/desktop-release.md) for exact package commands,
CI workflows, versioning, installation, and storage. See
[CLI providers](../../docs/cli-providers.md) for authentication and history.

Linux launcher and window icons are generated from `apps/web/public/icon.svg`.
`bun run --cwd apps/desktop icons` exports static PNGs at native icon sizes to
`resources/icons`. Development and package builds regenerate these assets;
both editions use the same complete logo.

Only focused runtime tests remain. `bun run test:desktop` uses temporary data and
fake providers; no E2E runners or browser download is required.
