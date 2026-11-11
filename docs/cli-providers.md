# AI providers and retained CLI integrations

Production AI execution now runs through the embedded Pi agent runtime. See
[`pi-runtime.md`](pi-runtime.md) for the architecture, API connections, model
and reasoning selections, tools, persistence, and recovery.

Settings → Providers manages API connections only:

- OpenRouter
- OpenCode Go
- OmniRoute or another OpenAI-compatible endpoint
- OpenAI

Each connection has an on/off switch. Turn on one or more, then choose **Use for
AI requests**, or pick an exact connection/model in a composer. Only the chosen
API connection handles new challenges, quizzes, hints, discussions, and reviews.
Turning off the selected connection clears that selection; it never silently
switches to another provider. All-off is supported, and existing practice
remains accessible.

## Retained Codex and OpenCode CLI adapters

The Codex and OpenCode adapter implementations, their fixtures, isolated homes,
histories, credentials, and saved settings are preserved. They are inactive in
production:

- No CLI process starts at application startup or shutdown.
- Settings connection checks do not probe a CLI.
- The gateway never selects a CLI transport.
- The Connect and Sign-in actions are removed from the provider interface.
- Existing CLI route shapes remain recognized and return
  `INTEGRATION_INACTIVE` without starting a process.
- Saved CLI records stay readable but are hidden from active provider and model
  pickers. Their credentials and home directories are not deleted or rewritten.

This keeps the adapter work available for a later explicit integration while
ensuring the production AI path cannot use host CLI accounts.

## Conversation storage

Grill Me saves every user message, partial reply, and completed reply in its
local SQLite database. API providers receive only the current operation's
context. Previous challenges, learning evidence, unrelated conversations, and
automatic history enrichment are not added to AI requests. Explicitly selected
generation options and the current discussion transcript are preserved.

## Models and errors

Each API connection saves a default model and optional reasoning effort. A
composer selection applies to the next run and remains fixed for all of its tool
turns. Unsupported reasoning values are reported instead of being silently
downgraded. A saved legacy CLI selection produces an actionable “select an API
provider” state without changing the stored selection or blocking access to
saved practice.

Connection problems appear beside the relevant API connection. Missing keys,
unavailable models, unsupported reasoning, quota, authentication, timeouts,
offline endpoints, and missing tool support have specific errors. Partial
discussion text is retained and explicit retry creates a new run.

Run `bun run test:isolated` for temporary-data tests with fake providers. Tests
never access a real Codex/OpenCode account or make paid inference requests.
