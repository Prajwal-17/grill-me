# Changelog

## Unreleased

## desktop-v0.1.4 - 30 Oct 2026

- Include the native credential-storage library in desktop installers so saved API keys can use the Linux keyring and macOS Keychain.
- Fail packaging when the credential loader or native binding is missing.

## desktop-v0.1.3 - 30 Oct 2026

- Fix macOS project-folder permission errors and canonical temporary-path tests.
- Preserve Finder executable discovery in desktop isolation checks.

## desktop-v0.1.2 - 30 Oct 2026

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
