# Grill Me

Grill Me is a Linux desktop practice companion. Describe a topic, generate a
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

Connect an installed Codex/OpenCode CLI or an OpenAI-compatible endpoint in
**Settings → AI providers**. Grill Me does not install either CLI. See
[CLI connections and conversation recovery](docs/cli-providers.md).

## Development and production

|                             | Development                       | Production                    |
| --------------------------- | --------------------------------- | ----------------------------- |
| Application                 | Grill Me Dev                      | Grill Me                      |
| Debian package / executable | `grill-me-dev`                    | `grill-me`                    |
| Data directory              | `~/.config/grill-me-desktop-dev/` | `~/.config/grill-me-desktop/` |
| Build output                | `apps/desktop/release/dev/`       | `apps/desktop/release/prod/`  |

The config root follows Linux `XDG_CONFIG_HOME`. Both editions can be installed
and running simultaneously. SQLite, settings, window preferences, zoom, Electron
sessions, browser storage, keyring entries, CLI authentication, uploads, snapshots,
and logs are separate. Production desktop uses its own local SQLite database;
it does not connect to the old production PostgreSQL database. Existing dev data
stays in the same folder. Data is never copied between editions automatically.

## Build and release

```sh
bun run desktop:deb:dev  # development Debian package
bun run desktop:deb      # production Debian package
```

These commands build packages; normal development needs only `bun dev`.
[Desktop build and release instructions](docs/desktop-release.md) describe manual
CI builds, versioning, tag-triggered GitHub releases, installation, and isolation.

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
