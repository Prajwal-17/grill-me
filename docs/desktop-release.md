# Desktop builds and releases

`bun dev` starts the complete Electron application, local Bun backend, and React
renderer on Linux or macOS. Install Node (see `.node-version`) and Bun 1.4.1, then
run `bun install --frozen-lockfile`. There are no separate backend/web commands.
Installed packages include Bun, SQLite, the renderer, resume parser worker, and
the matching native credential binding. Codex/OpenCode remain optional installed
executables.

## Editions and data

| Identity                  | Development                    | Production                   |
| ------------------------- | ------------------------------ | ---------------------------- |
| App ID                    | `local.grill-me.desktop-dev`   | `local.grill-me.desktop`     |
| Product / macOS bundle    | Grill Me Dev.app               | Grill Me.app                 |
| Linux package             | `grill-me-dev`                 | `grill-me`                   |
| Data directory name       | `grill-me-desktop-dev`         | `grill-me-desktop`           |
| Electron session          | `persist:grill-me-desktop-dev` | `persist:grill-me-desktop`   |
| Renderer storage          | `grill-me.app.development`     | `grill-me.app.production`    |
| Credential service prefix | `grill-me-dev.`                | `grill-me.`                  |
| Installer output          | `apps/desktop/release/dev/`    | `apps/desktop/release/prod/` |

On macOS, data is under `~/Library/Application Support/<data directory name>/`.
On Linux it is under `$XDG_CONFIG_HOME/<data directory name>/`, defaulting to
`~/.config/`. Each directory owns its SQLite database, settings, uploads, review
snapshots, logs, provider authentication, and Electron session data. Both editions
can be installed and run side by side. Neither reads or migrates production
PostgreSQL or the other edition's data. Choose providers and sign in separately.
Back up data with the edition closed. Uninstalling retains data.

API keys use macOS Keychain or Linux Secret Service through `@napi-rs/keyring`.
The existing Linux service prefix plus SHA-256 data-root hash is unchanged.
Keychain uses the same per-edition namespace scheme. A locked/unavailable store
reports an error; there is no automatic plaintext fallback. Session-only memory
storage is an explicit choice. OS credentials need their own backup or re-entry.

Finder does not load shell startup files. Executable discovery preserves inherited
PATH priority and adds both Homebrew prefixes, `~/.local/bin`, `~/.bun/bin`,
`~/.opencode/bin`, npm-global, Volta, pnpm, Cargo, and installed nvm/fnm versions.
Explicit executable paths in Settings take precedence. Custom installations can
be selected there. Provider config and authentication remain edition-scoped.

macOS uses the native title bar, traffic lights, application/Edit/Window menus,
and Command shortcuts (copy/paste/undo/select all, zoom, reload, settings, sidebar).
Closing the window keeps the app running; Dock activation restores it. Command-Q
quits and terminates the backend process group. Linux keeps its compact caption.
Both retain maximized startup, persistent zoom, folder selection, local project
connections, and snapshot reviews.

## Packaging

Run checks separately from packaging:

```sh
bun run check
bun run test:desktop
# Linux x64 host:
bun run desktop:deb
bun run desktop:deb:dev
# Apple Silicon macOS host:
bun run desktop:dmg:arm64
bun run desktop:dmg:arm64:dev
# Intel macOS host:
bun run desktop:dmg:x64
bun run desktop:dmg:x64:dev
```

Corresponding desktop-package scripts use `package:` instead of `desktop:`.
`desktop:build` / `desktop:build:dev` compile resources without an installer.
Packaging always rebuilds the chosen channel. Host OS and architecture must match
Electron, compiled Bun, and native Keychain/Secret Service binding. Cross builds,
universal macOS bundles, Windows, and Linux ARM packages are rejected. On Apple
Silicon use a native arm64 shell/Bun/Node for arm64 packages; Intel CI supplies
native x64 builds. Target metadata is checked before packaging and on startup.

macOS packaging generates `resources/icon.icns` reproducibly from the full-color
`renderer/public/icon.svg` using pinned resvg and PNG ICNS chunks. Run
`bun run --cwd apps/desktop icons:mac` to regenerate separately. No macOS icon
utilities run during Linux development. The bundle, Dock, and DMG use this icon.

Linux installation: `sudo apt install ./grill-me-<version>-amd64.deb`.
On macOS open the matching architecture DMG and drag the application to
Applications; the two editions have different bundle names and IDs.

These macOS builds use ad-hoc signing, without an Apple Developer identity or
notarization. They provide no verified developer identity. Gatekeeper may block
downloaded builds. For a trusted download, use macOS System Settings → Privacy &
Security → Open Anyway if macOS offers it; managed Macs may prohibit opening it.
Do not disable Gatekeeper or change system security settings. There is no native
automatic updater. Install subsequent builds manually.

## CI downloads and releases

Manually run **Desktop Development Build** with a branch/tag/commit. Native
`ubuntu-24.04` (x64), `macos-15` (arm64), and `macos-15-intel` runners run frozen
install, source checks, isolated tests, and package Grill Me Dev. Each installer
has a download link in the workflow summary. Development installers are uploaded
directly without a ZIP wrapper and expire after 14 days. The private repository
requires GitHub access to download artifacts. Development never publishes Releases.

**Desktop Production Build and Release** supports manual artifact-only builds.
A push of `desktop-v<version>` checks the desktop manifest version, builds all
three production installers, then publishes one release only after all builds
succeed. Only the publishing job has release-writing permission. Production CI
artifacts are archives containing an installer; release assets are just the
`.deb`, two architecture-specific `.dmg` files, and SHA256SUMS, alongside GitHub's
automatic source archives. No development installers, updater feeds, blockmaps,
updater ZIPs, or SOURCE_COMMIT files are published.

Before a future release, update root/desktop versions, lockfile, and a matching
`## <version>` entry in root CHANGELOG.md. Release notes contain only that entry;
missing entries fail publishing. Tags must be unique. This implementation does
not change the current version, push tags, trigger CI, or publish a release.

The workflow follows Relay's separate dev configuration and tag-release style.
Architecture labels follow [GitHub's runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
Direct installer uploads use [upload-artifact's archive option](https://github.com/actions/upload-artifact).
Ad-hoc signing uses the [electron-builder v26 macOS configuration](https://www.electron.build/v26/docs/api/app-builder-lib.interface.macconfiguration/).

Linux isolated tests do not verify macOS execution, Keychain permission prompts,
Dock behavior, signing, or DMG installation. Validate these on each native Mac
architecture before distributing widely. Browser/Electron E2E tests are absent.
