# Grill Me

Grill Me is a local-first desktop app for developers who want to practice by building. Generate a coding challenge or quiz, work in your own editor, and get AI feedback on your work.

## Features

- Generate challenges and quizzes from a topic or supplied context.
- Prepare a local workspace and build with your preferred editor.
- Review your work with AI feedback and revisit previous scorecards.
- Keep practice data in a local SQLite database.
- Choose an installed Codex or OpenCode CLI, or an OpenAI-compatible OmniRoute endpoint as your AI provider.

Grill Me runs on Linux and macOS. AI features require a configured provider; the app does not install CLI providers for you. Reviews inspect your workspace without executing submitted code.

## Getting started

For development, install [Bun 1.4.1](https://bun.sh/) and Node.js 24 or newer, then run:

```sh
bun install
bun dev
```

On first launch, choose where to store app data and challenge workspaces. Configure an AI provider in **Settings → Providers** to start generating challenges and quizzes.

## Built with

Electron, React, TypeScript, Vite, Bun, Hono, Drizzle ORM, and SQLite. Electron runs the React interface and a private local backend.

## Project structure

- `apps/web` — React interface
- `apps/desktop` — Electron host and packaging
- `packages/backend` — local backend, database, and AI providers

## Development checks

```sh
bun run check
bun run test:desktop
```

See the [application guide](docs/application-guide.md) for storage, provider, workspace, and packaging details, and the [changelog](CHANGELOG.md) for release history.
