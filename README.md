# Grill-Me

Grill-Me is a local-first practice companion for developers. Describe what you
want to build, choose its scope and difficulty, work in your normal editor, ask
for a hint, submit your implementation, and mark the challenge completed when you have finished learning.

## Practice flow

1. Choose a local profile and optional stack, learning goal, topic familiarity, and known concepts.
2. Describe the topic, choose Focused / Feature / System and Easy / Medium / Hard / Grill, and generate a challenge.
3. Read a concise task with stable acceptance criteria. Each challenge saves a difficulty estimate out of 10 and the context used to generate it.
4. Code in your editor. Paste an implementation, upload source files, or connect a local project. There are no application file-count or file-size limits; attachments upload in chunks.
5. Submit for review. Self-contained exercises use OmniRoute; projects and submissions that need incremental exploration use the local Codex app-server judge.
6. Use Challenge, Submit, and Reviews tabs. Submit code without a written explanation, select an earlier submission or review run when needed, and mark completed when you decide. Pause and resume anytime.

The tabbed workspace keeps the task, submission, and selected review separate. Reviews assess correctness (4), implementation reasoning (3), and engineering judgment (3), each with evidence. Unknown dimensions remain unassessed. Submission scores are separate from challenge difficulty; hints and retries do not reduce the score. Topic progress appears in History without a global intelligence score.

System challenges request a bounded working core and assess design choices in code. No written explanation is required. Grill Me generates verification checks when a supported isolated runtime is available; you do not need to author tests. Inspection-only reviews state their execution limits. Accepted reviews do not complete the challenge. Mark completed records your decision independently; high scores cannot override unmet review requirements.

Prompts live under `apps/backend/src/modules/ai/prompts/`, with a shared policy, selected scope/difficulty policies, and short action-specific instructions. Context and requirements are frozen per challenge. Invalid output is never saved as a successful review. Generation allows one bounded retry for difficulty mismatch.

Preferences include an optional “Send recent challenges to AI” setting, off by default. Connect a folder by entering its path or browsing the folders available to Grill Me; connecting does not upload files. Save challenges for later from the workspace and reopen them from the separate Saved for later section in Challenges. Codex reviews use ephemeral sessions and link to their database-saved prompts, responses, and complete app-server protocol activity. Preferences includes a Codex model picker, defaulting to GPT-5.6 Sol. Run `bun run db:studio` to browse the local database.

Existing history is preserved. Old manual completions are labeled as legacy; historical scores and missing context are not invented. Local profile selection is not authentication; keep the app private to your machine.

See [runtime setup](docs/runtime-setup.md) for native Codex setup, optional Docker, verification images, storage, and diagnostics.

## AI request logs

Logs records each new AI operation: request checks, build generation, clarification,
solution reviews, and hints. The paginated `/logs` page provides status and
operation filters plus request/model search. Each `/logs/:id` detail page shows
the complete instructions, input, response text, raw provider response, stream
events, and errors, with copy actions. Requested and returned models are shown
separately, alongside duration, time to first token, and provider-reported token
usage and cost. Unreported values are left empty, not estimated.

Logging begins before the provider call and ends after output validation or
stream completion. Invalid JSON, failed validation, provider errors, incomplete
streams, and cancelled consumers keep their received payloads. After a backend
restart, unfinished records are marked interrupted. A log-storage failure warns
on the backend console without changing the model result. Each log represents
one application AI call; provider routing and internal retries are only visible
when the provider includes that information in its response.

Log payloads stay in the local PostgreSQL database, scoped to the active profile.
Transport credentials and known configured API keys are redacted. Full prompts,
personal context, attached code, and responses can still contain private data:
this local profile selector is not authentication, so do not expose the API or
database publicly. Logs have no automatic expiry and will grow with usage.
Existing calls cannot be reconstructed; only new calls are logged.

## Stack

- Bun + Turborepo
- Next.js 16, Tailwind CSS, shadcn/ui (Radix), TanStack Query
- Motion for interactions, respecting reduced-motion preferences
- AI interface patterns adapted from [Beautiful UI](https://www.beautifului.dev/)
- Empty-composer suggestions adapted from [Magic UI Typing Animation](https://magicui.design/docs/components/typing-animation)
- Hono on Bun
- Drizzle ORM + PostgreSQL 17
- OpenAI SDK pointed at an OpenAI-compatible endpoint such as OmniRoute

## Setup

Install dependencies:

```bash
bun install
```

Copy the backend environment example:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.local.example apps/web/.env.local
```

Start OmniRoute locally, add its API key/model to `apps/backend/.env`, then start
the app:

```bash
bun dev
```

- Web: http://localhost:8018
- API: http://localhost:8017
- Health check: http://localhost:8017/health

`bun dev` starts only the web and backend workspaces. Next.js 16 uses Turbopack by
default, including its persistent development cache.

## Local data

PostgreSQL runs in the `primary-production` Docker container. Its data persists
in the `primary-production-data` named volume. The cluster contains:

- `grill-me`: production/local Compose database
- `grill-me-dev`: native development database
- `grill-me-test`: isolated automated-test database

Submission files and other runtime data use these host paths:

- `/mnt/hdd/.config/grill-me/`: production submissions, uploads, evaluations, and Codex CLI
- `/mnt/hdd/.config/grill-me-dev/`: development runtime files
- `submissions/`: immutable submission snapshots
- `uploads/`: resumable file uploads
- `evaluations/`: prompt evaluation reports
- `codex-cli/`: the app-managed Codex CLI, when installed

Start PostgreSQL and apply tracked migrations before native development:

```bash
docker compose up -d postgres
bun db:generate
bun db:migrate
```

The backend loads `.env.development` for `bun dev` and uses `grill-me-dev`.
`bun db:migrate` and `bun db:studio` are development aliases. Their explicit
production counterparts are `bun db:migrate:prod` and `bun db:studio:prod`.
Docker always sets `APP_ENV=production` and connects to `grill-me`; it never
uses the development database. Shared model credentials remain in ignored
`.env`, while database/storage settings live in the ignored environment-specific
files. Copy `.env.development.example` and `.env.production.example` when
setting up a new checkout.

## Quality checks

```bash
bun run check
bun run lint
bun run lint:fix
bun run format
bun run format:check
bun run check-types
bun run build
```

## Environment

Backend variables:

- `APP_ENV`: selects `development`, `production`, or `test` defaults
- `GRILL_ME_HOME`: override submission/upload/evaluation/Codex storage
- `XDG_CONFIG_HOME`: standard config root used when `GRILL_ME_HOME` is unset
- `LLM_BASE_URL`: OpenAI-compatible base URL
- `LLM_API_KEY`: API key expected by the model gateway
- `LLM_MODEL`: model or OmniRoute alias
- `DATABASE_URL`: PostgreSQL connection URL
- `SNAPSHOT_ROOT`: override submission snapshot storage
- `UPLOAD_ROOT`: override resumable upload storage
- `EVALUATION_ROOT`: override prompt evaluation output
- `CODEX_INSTALL_ROOT`: override the app-managed Codex CLI directory
- `API_PORT`: Hono port
- `WEB_ORIGIN`: allowed browser origin

Web variable:

- `NEXT_PUBLIC_API_URL`: browser-visible Hono API URL
- `NEXT_PUBLIC_APP_ENV`: namespaces persisted browser state by environment

Structured generation and judging use validated JSON response schemas. Valid JSON wrapped in prose or code fences is accepted; empty, truncated, and schema-invalid responses produce retryable diagnostics without automatic regeneration. Provider-specific combo behavior still depends on Responses API support.

Frontend pages compose feature components; workspace state, selection queries, creation, scrolling, and attachment reads live in dedicated hooks. The workspace uses three tabs, with one selected submission and review run visible at a time. Shared layout, account navigation, and Markdown renderers live under shared/components. The application frame stays within the viewport; page content scrolls inside it.

For compatible providers, an empty clarification question with no choices is treated as no clarification. Invalid questions and choices remain rejected. If preparation fails, Create without clarification lets you proceed explicitly using your request and saved context.
