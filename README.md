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
and React UI. The renderer source lives in `apps/web` and can be compiled on its
own with `bun run web:build`; the shipped runtime remains Electron. There are no
separate web/backend launch modes and no Docker setup. React changes hot reload;
restart after backend changes.

Use your installed Codex or OpenCode CLI, or an OmniRoute endpoint, in
**Settings → Providers**. Turn a provider on, then choose which one handles AI
requests. Grill Me does not install Codex or OpenCode; configure the installed
CLI or endpoint in Settings → Providers.

API connections require an explicit model in Settings → Providers. An unset or
`auto` model blocks requests instead of selecting another catalog model.

## First launch and storage

A fresh installation opens a setup window before the database or backend starts.
Choose a parent folder for app data and challenge workspaces, use the clearly
labelled defaults, or skip with the defaults. A chosen parent gets a named child
folder (`Grill Me` / `Grill Me Dev` for app data and `Grill Me Workspaces` /
`Grill Me Dev Workspaces` for workspaces), so files are never dumped directly
into the selected folder. The choice is remembered; setup is not repeated.

Existing installations keep their current data directory and are not asked to
move anything. If a saved location is unavailable, setup reopens instead of
silently starting an empty database.

## Generation context

Challenge and quiz requests can include pasted text, public `http` or `https`
links, and image links. During generation the local agent can fetch those
sources, inspect images when the selected model accepts them, and use a
temporary workspace with file and shell tools to process downloaded material.
The workspace is created for one run, scrubbed of credentials, and deleted when
generation finishes; built-in URL fetching only allows public `http` or `https`
sources.

## Challenge workspaces

Each challenge gets a local workspace folder with a frozen brief. Preparation
uses your request and the brief to decide what belongs in `project/`. A
from-scratch exercise can start with just `CHALLENGE.md`. An implementation
exercise can get starter material, and a debugging exercise can get a usable
project that exhibits the reported symptoms without clues to the defect.
Files, tests, and setup commands are included when the exercise needs them.

Preparation reports list the checks that actually ran and identify verification
that was skipped or blocked. A project can be ready to start without having
passed runtime checks. Unresolved preparation failures are reported separately
from intentional exercise behavior. Existing workspaces and saved reports stay
readable.
Reviews reassess the current workspace on each request and preserve earlier
scorecards. Select a numbered review to reopen its full evidence and feedback;
Activity labels review runs by number and records the actual model used.
Hints and discussions are no longer part of the application. Existing conversation
records remain stored and available through the read-only compatibility API;
retired generation and send endpoints return `410 FEATURE_REMOVED` without
calling a provider. No database reset or migration is needed.
Setup and checks pause for your command approval; listing commands in a README
does not count as running them. A single workspace control opens the current
project in a detected editor or its folder, or copies the path. Activity is a
dedicated full-width tab with preparation, reviews, and every recorded tool call; the Files button opens a read-only project
tree and source viewer without leaving the challenge. Preparation attempts keep
their durable rows, while initial preparation, resume, retry, and fresh setup stay in one
continuous chat without numbered attempt headers or session dividers. Older split
setup histories remain readable in that same conversation. Activity follows new
messages smoothly, pauses when you read history, and respects reduced motion. Older starter files and previous
project attempts remain untouched.
Choose the workspace root in **Settings → Advanced → Challenge workspace**.

## Development and production

|                             | Development                       | Production                    |
| --------------------------- | --------------------------------- | ----------------------------- |
| Application                 | Grill Me Dev                      | Grill Me                      |
| Debian package / executable | `grill-me-dev`                    | `grill-me`                    |
| Config directory            | `~/.config/grill-me-desktop-dev/` | `~/.config/grill-me-desktop/` |
| Default app data root       | the config directory              | the config directory          |
| Custom app data folder      | `Grill Me Dev`                    | `Grill Me`                    |
| Build output                | `apps/desktop/release/dev/`       | `apps/desktop/release/prod/`  |

The table shows Linux paths; the config root follows `XDG_CONFIG_HOME`. macOS
uses `~/Library/Application Support/` with the same edition directory names. Both editions can be installed
and running simultaneously. SQLite, settings, window preferences, zoom, Electron
sessions, browser storage, keyring entries or plaintext credential files, uploads, snapshots,
challenge workspaces, and logs are separate. A custom app data root contains the
edition's practice data but the launcher config directory keeps the setup record,
window preferences, and Electron session. Both editions use their own local SQLite database; no
external database is required. Existing data stays in its current folder unless
the user explicitly chooses another root during setup. Data is never copied
between editions automatically.
Codex reuses the host CLI account by default; choose a custom CODEX_HOME in
Advanced provider settings when you need a separate account.

## Build and release

```sh
bun run desktop:deb:dev  # development Debian package
bun run desktop:appimage:dev  # development AppImage (Linux x64)
bun run desktop:deb      # production Debian package
bun run desktop:dmg:arm64:dev  # Apple Silicon development DMG
bun run desktop:dmg:arm64      # Apple Silicon production DMG
bun run desktop:dmg:x64:dev    # Intel development DMG
bun run desktop:dmg:x64        # Intel production DMG
```

These commands build packages; normal development needs only `bun dev`.
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

## Inspecting the database

```sh
bun run db:studio:dev   # development edition
bun run db:studio:prod  # production edition
```

Open <https://local.drizzle.studio> to browse the selected database through the
local Studio server on port 4983. On Linux, development uses
`~/.config/grill-me-desktop-dev/grill-me.sqlite` and production uses
`~/.config/grill-me-desktop/grill-me.sqlite`; macOS uses the corresponding
`~/Library/Application Support` folders. Both commands honor the saved first-run
data folder and can be pointed elsewhere with
`GRILL_ME_SQLITE_PATH=/path/to/grill-me.sqlite`. The production command only
opens production data when explicitly requested. Studio can edit rows; use the
read-only backup path rather than hand-editing data you want to keep.

The frontend lives in `apps/web`; Electron renders that Vite app. The backend and
its shared transport contracts and preference options live in `packages/backend`.
