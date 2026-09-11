# Grill-Me

Grill-Me is a local-first practice companion for developers. Tell it what you
just learned, get one focused challenge, work in your normal editor, ask for a
hint, paste your solution for review, and mark the challenge complete.

## V1 flow

1. Enter an email to create or resume a local profile.
2. See active and completed exercises on the Exercises home.
3. Describe what you just learned, choose a format, and answer one focused
   question only when essential context is missing.
4. Work through it in your own editor.
5. Clarify the brief, use one hint, or paste/attach a solution for review.
6. Mark it complete and find it in History.

The challenge workspace opens on the full-width Statement tab. Solution accepts
pasted work and attachments, Review shows streamed feedback, Reports summarizes
saved practice activity, and Chat is reserved for optional clarification. Hints
are available from the statement. Solution and chat drafts stay separate when
switching tabs.

The email is only a local profile selector. There is no authentication. Optional
guided profile preferences and optional Additional context personalize future prompts.
Experience, languages, stack, goals, and current focus use a shared option catalog.
Existing free-text preferences are retained under Previous preferences.

The interface supports light and dark appearance, saved in this browser.
Dark is the default; previous System selections migrate to Dark.
The sidebar hides completely and remembers its state. Ctrl+B toggles it (or the mobile drawer); a top reopen button remains available. History supports
search, format filters, and linked brief/discussion views.
IBM Plex fonts are hosted locally. All code stays in your external editor; the app
accepts pasted solutions and text/source-file attachments for review.

Challenge creation checks whether one multiple-choice clarification is essential,
then makes one generation request with format-specific instructions and your
context. There is no draft revision pass or automatic malformed-output repair.
Invalid responses return a retryable error without saving a partial exercise.

## Stack

- Bun + Turborepo
- Next.js 16, Tailwind CSS, shadcn/ui (Radix), TanStack Query
- Motion for interactions, respecting reduced-motion preferences
- AI interface patterns adapted from [Beautiful UI](https://www.beautifului.dev/)
- Hono on Bun
- Drizzle ORM + SQLite
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

- Web: http://localhost:3000
- API: http://localhost:3001
- Health check: http://localhost:3001/health

`bun dev` starts only the web and backend workspaces. Next.js 16 uses Turbopack by
default, including its persistent development cache.

## Database

The local database is created at `apps/backend/.data/grill-me.sqlite` and is
ignored by Git. Tracked migrations are applied when the backend starts.

```bash
bun db:generate
bun db:migrate
```

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

- `LLM_BASE_URL`: OpenAI-compatible base URL
- `LLM_API_KEY`: API key expected by the model gateway
- `LLM_MODEL`: model or OmniRoute alias
- `DATABASE_URL`: SQLite file path
- `API_PORT`: Hono port
- `WEB_ORIGIN`: allowed browser origin

Web variable:

- `NEXT_PUBLIC_API_URL`: browser-visible Hono API URL

Structured generation includes the JSON contract in both model instructions and the API schema. Valid JSON wrapped in prose or code fences is accepted; empty, truncated, and schema-invalid responses produce retryable diagnostics without automatic regeneration. Provider-specific combo behavior still depends on Responses API support.
