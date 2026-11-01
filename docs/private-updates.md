# Private desktop updates

Grill Me 0.1.7 and later checks this private repository's stable `desktop-vX.Y.Z`
GitHub releases at startup and every six hours. You can also check in Settings →
About. It uses GitHub directly; no update server, public mirror, or embedded token
is needed. Releases must contain the matching architecture's installer and
`SHA256SUMS`. A release is published only after all three native builds succeed.

## Create a read-only token for a friend

As `Prajwal-17`, open [GitHub's fine-grained token settings](https://github.com/settings/personal-access-tokens/new).
Give the token a recognisable name, such as `Grill Me – friend name`, and choose an
expiration date. Set:

- **Resource owner:** `Prajwal-17`.
- **Repository access:** Only select repositories → `grill-me`.
- **Repository permissions → Contents:** Read-only.
- **Metadata:** Read-only (automatically included). Leave every other permission unset.

Generate the token and give it privately to that friend. Prefer a separate token
per friend so you can revoke or rotate one without affecting everyone. GitHub
shows the secret only once. Do not put it into a commit, release note, installer,
screenshot, or issue.

This owner-created token is deliberately restricted to one repository and read
access. It also permits reading that repository's source code, because GitHub
uses the same Contents permission for release downloads. A friend's email is a
local profile label, not GitHub authentication: API access belongs to the account
that created the token. Existing collaborators can already download the initial
installer through GitHub while signed into their own account.

Fine-grained tokens currently have limitations for outside/repository
collaborators. For this personal repository, generate the restricted tokens from
the owner's account as described above; do not assume a collaborator can select
someone else's personal repository when creating their own fine-grained token.
Classic tokens with the `repo` scope grant broader read/write access and are not
the read-only option described here.

References: [GitHub token creation and limitations](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens),
[release asset Contents: read permission](https://docs.github.com/en/rest/releases/assets#get-a-release-asset).

## Connect the app

Install 0.1.7 manually once; 0.1.6 and earlier do not have an updater. At first
profile setup, enter an email and the token. Existing profiles can connect under
Settings → About → Application updates. Tokens are validated against GitHub and
private repository access before they are accepted. If a token expires or is
revoked, enter a replacement there. An existing profile remains usable offline.

The owner can run `gh auth login --hostname github.com` on the same machine using
the `Prajwal-17` account. Grill Me reuses that existing CLI login after verifying
the GitHub account and repository access, so no manual update-token entry is
needed. Entering an owner's email does not bypass authentication. The app never
embeds the developer's credentials in builds. If the CLI is missing, signed into
another account, or unavailable, the owner can use a restricted token instead.

Tokens stay in Electron's main process after entry. Persisted tokens are encrypted
with Electron safeStorage backed by macOS Keychain or a secure Linux credential
store, inside the production data directory's owner-readable
`update-credentials.json`. If that store is unavailable or Linux selects
`basic_text`, the token stays in memory only and must be entered again after
restart. Updates never silently fall back to plaintext storage. OS keychain
prompts may recur after an ad-hoc-signed macOS app changes. “Disconnect updates”
removes the app's saved token and downloaded cache; it does not revoke the token
on GitHub or sign out the owner's CLI. An owner CLI session is rediscovered on
the next app launch.

## Download and install

The header shows when an update is available. Open Settings → About, download the
update, and keep using the app. Downloads show progress, can be cancelled, and
must match the release's file size and SHA256 checksum. Credentials are sent only
to `api.github.com`, never to redirected asset hosts. Drafts, prereleases, older
versions, incomplete releases, and unsupported architectures are not installed.

After download, finish any AI request, then choose **Install and restart** and
confirm. No update installs automatically. Your database and settings remain in
the existing production data directory.

- **Linux x64:** the app uses `/usr/bin/pkexec /usr/bin/dpkg --install` and waits for
  administrator approval. If policy denies installation or pkexec is absent,
  install the cached DEB using your normal package manager. Cancelling approval
  leaves the download available for retry.
- **macOS arm64/x64:** install the app outside the DMG, in a writable Applications
  folder (for example `~/Applications`). The updater mounts the DMG read-only,
  checks the bundle identifier, version and code signature, stages the app, waits
  for the old process to exit, and replaces the bundle. A rollback copy is retained
  during replacement; immediate installation/launch failures restore the previous
  app. It cannot detect a later crash after macOS accepts the launch. If the
  application parent is not writable, move the app or install the DMG manually.
  These releases remain ad-hoc signed, without Apple notarization; the updater
  does not bypass Gatekeeper.

Downloaded installers are in `<production data directory>/updates/`. On Linux
this defaults to `~/.config/grill-me-desktop/updates/`; on macOS it is
`~/Library/Application Support/grill-me-desktop/updates/`. A macOS helper failure
is logged to `update-install.log` in that data directory. Installation errors keep
the app open when possible and explain how to retry or install manually. A new
app launch rechecks GitHub; a download interrupted by quitting must be started
again. Development editions do not authenticate or install production updates.
