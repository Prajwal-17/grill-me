# Grill Me

Grill Me is a Linux and macOS desktop practice companion. Describe a topic, generate a
challenge or quiz, work in your editor, and submit code for a review. Questions,
reviews, quizzes, and partial AI replies are saved locally.

## Run the application

Requires Bun 1.4.1 and Node.js 24 or newer for source development:

```sh
bun install
bun dev
```

This opens the complete Electron application, including its private local backend
and React UI. There are no separate web/backend launch modes and no Docker setup.
React changes hot reload; restart after backend changes.

Use your installed Codex or OpenCode CLI, or an OmniRoute endpoint, in
**Settings → Providers**. Turn a provider on, then choose which one handles AI
requests. Grill Me does not install Codex or OpenCode. See
[CLI connections and conversation recovery](docs/cli-providers.md).

## Development and production

|                             | Development                       | Production                    |
| --------------------------- | --------------------------------- | ----------------------------- |
| Application                 | Grill Me Dev                      | Grill Me                      |
| Debian package / executable | `grill-me-dev`                    | `grill-me`                    |
| Data directory              | `~/.config/grill-me-desktop-dev/` | `~/.config/grill-me-desktop/` |
| Build output                | `apps/desktop/release/dev/`       | `apps/desktop/release/prod/`  |

The table shows Linux paths; the config root follows `XDG_CONFIG_HOME`. macOS
uses `~/Library/Application Support/` with the same edition directory names. Both editions can be installed
and running simultaneously. SQLite, settings, window preferences, zoom, Electron
sessions, browser storage, keyring entries or plaintext credential files, uploads, snapshots,
and logs are separate. Both editions use their own local SQLite database; no
external database is required. Existing dev data stays in the same folder. Data
is never copied between editions automatically.
Codex reuses the host CLI account by default; choose a custom CODEX_HOME in
Advanced provider settings when you need a separate account.

## Build and release

```sh
bun run desktop:deb:dev  # development Debian package
bun run desktop:deb      # production Debian package
bun run desktop:dmg:arm64:dev  # Apple Silicon development DMG
bun run desktop:dmg:arm64      # Apple Silicon production DMG
bun run desktop:dmg:x64:dev    # Intel development DMG
bun run desktop:dmg:x64        # Intel production DMG
```

These commands build packages; normal development needs only `bun dev`.
[Desktop build and release instructions](docs/desktop-release.md) describe manual
CI builds, versioning, tag-triggered GitHub releases, installation, and isolation.
The desktop version in the top bar opens Settings → About, where the complete
release history is available. The same history is maintained in
[CHANGELOG.md](CHANGELOG.md) and used for GitHub release notes.

## Checks

```sh
bun run check           # formatting, lint, TypeScript
bun test:desktop        # disposable SQLite, domain/provider/isolation tests
```

Browser/Electron E2E suites and their CI steps have been removed. Focused tests
use temporary data and fake providers, with no production database or paid model
calls. SQL migration history is retained as source history, not a deployment path.

The shared implementation lives in `packages/backend`, `packages/ui`,
`packages/contracts`, and `packages/client`; Electron is the application host.
