# Changelog

## desktop-v0.1.7 - 1 Nov 2026

- Add private GitHub release updates without a separate update server. Collaborators connect with a profile email and a repository-scoped read-only token; the verified repository owner can reuse an existing GitHub CLI login.
- Show update availability in the header and add private update setup, download progress, cancellation, and an explicit install-and-restart confirmation in Settings → About.
- Encrypt saved update tokens using the operating system credential store. If secure storage is unavailable, keep the token only for the current session. Never package tokens or forward them to asset download hosts.
- Verify installer sizes and SHA256SUMS before installation, reject downgrades and incomplete releases, and keep development builds separate from production updates.
- Install Linux DEB updates with administrator approval and replace writable macOS app bundles from verified DMGs with a rollback copy. Preserve local profiles, practice, and provider settings.
- Report invalid or expired tokens, denied access, network failures, cancelled downloads, checksum failures, and installation problems with recovery instructions.

## desktop-v0.1.6 - 1 Nov 2026

- Reuse the installed Codex CLI account and configurable CODEX_HOME, with account and plan status.
- Simplify Settings to two providers, Codex and OmniRoute, with independent on/off switches and an explicit provider selector.
- Replace the extra Settings sidebar with tabs and a provider list/detail panel; keep errors inline and advanced paths out of the main setup flow.
- Show the installed desktop version in the top bar, with a link to the release history in Settings.
- Bundle the full desktop release history from 0.1.0 onward in Settings → About, and preview historical GitHub release-note backfills through the release script.
- Add per-provider reasoning settings and account model discovery. New production providers default to GPT-6.1 Sol with high reasoning; new development providers default to GPT-6 Luna with medium reasoning. Preserve saved model choices.
- Send the selected reasoning effort to Codex CLI turns and OpenAI-compatible Responses requests, including OmniRoute. Validate Codex model capabilities before starting a turn.
- Show provider connection problems before AI work, with retry and Settings actions. Report missing CLIs, sign-in failures/expiry, unavailable models, unsupported settings, authentication/access failures, rate limits, timeouts, malformed responses, and offline providers with recovery guidance.
- Remove standalone prompt-evaluation and keyring diagnostics, and consolidate test and release-note scripts.

## desktop-v0.1.5 - 31 Oct 2026

- Create challenges and quizzes directly from a focused Home composer, with separate drafts, prompt enhancement, and generation options.
- Add borderless category navigation for Settings and Preferences, enlarge sidebar controls, and move History, Settings, and Logs to the bottom.
- Simplify implementation submission with visible folder, file, and code sources and a combined source summary.
- Remove redundant quiz-list actions and desktop preference controls; keep appearance and provider configuration in Settings.
- Fix native keyring loading in the compiled desktop backend so saved provider credentials remain available.

## desktop-v0.1.4 - 30 Oct 2026

- Include the native credential-storage library in desktop installers so saved API keys can use the Linux keyring and macOS Keychain.
- Fail packaging when the credential loader or native binding is missing.

## desktop-v0.1.3 - 30 Oct 2026

- Introduce macOS desktop builds for Apple Silicon and Intel, including native menus, Keychain support, and separate development and production editions. The native credential library was added to installers in 0.1.4.
- The preceding 0.1.2 tag did not publish installers; its macOS changes first shipped in this release.
- Fix macOS project-folder permission errors and canonical temporary-path tests.
- Preserve Finder executable discovery in desktop isolation checks.

## desktop-v0.1.2 - 30 Oct 2026

- This tag's production build failed, so no installers or GitHub release were published. Its macOS support shipped in 0.1.3.
- Add isolated macOS Intel and Apple Silicon editions with Keychain storage,
  native application behavior, and ad-hoc DMG builds in CI.

## desktop-v0.1.1 - 30 Oct 2026

### Fixed

- Complete Linux launcher and window icons, including the steak and smoke

## desktop-v0.1.0 - 30 Oct 2026

First Linux desktop release.

### Features

- Personalized coding challenges, quizzes, and review conversations
- Connect local project folders and save snapshots when submitting reviews
- Codex CLI, OpenCode CLI, and OpenAI-compatible providers

### Refactored

- Run Electron, React, and the local SQLite backend together without Docker
- Keep development and production data, settings, and credentials separate

### Fixed

- Native folder selection and manually entered project paths
- Persistent zoom level and maximized startup
- Compact window controls, sidebar navigation, and settings
