# Linux builds and releases

The desktop app is the only supported host. `bun dev` starts Electron and its
private backend together. There is no Docker, standalone server, or browser host.
Linux amd64 Debian packages are the current release target.

## Channels and data isolation

| Setting                    | Development                       | Production                    |
| -------------------------- | --------------------------------- | ----------------------------- |
| App ID                     | `local.grill-me.desktop-dev`      | `local.grill-me.desktop`      |
| Display name               | Grill Me Dev                      | Grill Me                      |
| Package and executable     | `grill-me-dev`                    | `grill-me`                    |
| Default user data          | `~/.config/grill-me-desktop-dev/` | `~/.config/grill-me-desktop/` |
| Renderer storage namespace | `grill-me.app.development`        | `grill-me.app.production`     |
| Electron partition         | `persist:grill-me-desktop-dev`    | `persist:grill-me-desktop`    |
| Keyring service prefix     | `grill-me-dev.` + data-root hash  | `grill-me.` + data-root hash  |
| Package directory          | `apps/desktop/release/dev/`       | `apps/desktop/release/prod/`  |

Paths follow `XDG_CONFIG_HOME` when configured. SQLite databases, window/zoom
preferences, Electron cache/session data, key references, provider authentication,
CLI runtime files, submissions, uploads, and logs are all within or scoped to the
edition's data folder. Both editions can run simultaneously, using separate
single-instance locks and dynamically allocated backend ports. Existing dev data
is retained. Neither edition reads the legacy production database or imports the
other edition's data. Choose providers and sign in separately in each edition.

The channel is selected at compile time with electron-vite's development or
production mode, then matched against electron-builder package metadata at
startup. The backend environment is constructed from an OS-variable allowlist;
inherited database URLs, model credentials, storage overrides, and channel
variables do not select an edition. `APP_ENV`, `NODE_ENV`, and
`GRILL_DESKTOP_CHANNEL` are supplied explicitly by Electron. All desktop channels
use SQLite. Production PostgreSQL settings and SQL migrations are not executed.
Do not point both editions at the same config directory using filesystem links.

## Local package commands

```sh
bun install --frozen-lockfile
bun run check
bun run test:desktop
bun run desktop:deb:dev  # Grill Me Dev
bun run desktop:deb      # Grill Me
```

For compiled resources without a Debian package, use `desktop:build:dev` or
`desktop:build`. Package commands always rebuild the matching channel before
packaging, so a leftover dev bundle cannot silently become a production package.
The startup metadata check also rejects channel mismatches. Both packages bundle
the backend runtime and renderer; users need no Bun, Node, Docker, or database
server. Installed CLI providers remain optional external executables.

Install the selected artifact with `sudo apt install ./path/to/package.deb`.
Install both packages to keep Grill Me and Grill Me Dev side by side. Upgrading
one edition migrates only its own SQLite data; uninstalling preserves user data.
Back up an edition's data folder with that application closed. Credentials stored
in the OS keyring need their own OS backup or a new sign-in. Data folders are
owner-only, not fully encrypted databases.

## Development CI builds

Run **Desktop Development Build** manually in GitHub Actions and supply a branch,
tag, or commit. It installs frozen dependencies, runs source checks and focused
SQLite/provider tests, builds a dev `.deb`, and uploads that single file without
a ZIP wrapper. Download the `.deb` directly from the run's **Artifacts** section
or the download link in its summary. GitHub sign-in is required. The artifact's
SHA-256 digest and source commit are available on the workflow run.

Development builds stay in workflow artifacts and never appear in GitHub
Releases. Artifacts expire after 14 days.

## Production builds and releases

This follows Relay's separate development builder configuration and
[tag-triggered desktop release workflow](https://github.com/Prajwal-17/relay/blob/master/.github/workflows/desktop-release.yaml),
with Linux Debian as the only target.

For a production artifact without publishing, manually dispatch **Desktop
Production Build and Release** with the desired ref. For a published release:

1. Update the version in `apps/desktop/package.json` and the root `package.json`.
2. Add a dated `## desktop-v<version> - DD Mon YYYY` entry to `CHANGELOG.md`,
   following the existing Features, Refactored, and Fixed sections. Keep it brief
   and describe changes without author names, contributor lists, or PR dumps.
3. Run `bun install --lockfile-only`, source checks, and focused tests; commit the
   changelog, version, and lockfile on the release branch.
4. Tag that commit `desktop-v<version>` (the first desktop release is
   `desktop-v0.1.0`) and push the tag: `git push origin desktop-v0.1.0`.
5. CI verifies that the tag matches the desktop package version and has a
   changelog entry, checks/tests the source, and builds the production `.deb`.
   It records one `SHA256SUMS` file to verify the download's integrity.
6. A separate release job publishes only the production `.deb` and `SHA256SUMS`.
   GitHub supplies the source ZIP and tar archives automatically. The release
   description uses the matching changelog entry verbatim, without generated
   contributor notes or extra metadata files. Only that job has `contents: write`;
   no production database credentials are used. Production installers are also
   retained as CI artifacts.

To verify an installer, download it and `SHA256SUMS` into the same folder and run
`sha256sum --check SHA256SUMS`.

Release tags must be unique. Correct a failed release with a new version/tag,
not by replacing an already distributed package. Automatic in-app updates and
other operating systems are outside this release setup. Browser and Electron E2E
suites are absent; packaging is checked by configuration and focused tests.
