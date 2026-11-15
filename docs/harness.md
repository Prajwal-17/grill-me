# Harness runs

Grill Me records every agent run as a harness thread. Rows are written directly
to SQLite; there is no event-sourcing projection. The existing table change
notifications drive React Query invalidation, so the renderer refreshes threads,
turns, and items as they are written.

## Tables

| Table                   | Purpose                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `harness_threads`       | One durable run: kind, title, status, challenge link, transport, model, runtime mode, and the resumable native thread ID when a CLI provides one.     |
| `harness_turns`         | One user input and its permission/model snapshot. `runtime_mode` is copied when the turn starts, so later Settings changes affect the next turn only. |
| `harness_turn_attempts` | One provider attempt for a turn. Retrying a failed turn creates a new turn; a transport that retries inside one turn gets another attempt row.        |
| `harness_items`         | Ordered transcript rows. `(thread_id, ordinal)` is unique and allocated inside `BEGIN IMMEDIATE`.                                                     |
| `harness_attachments`   | Files, images, URLs, diffs, reports, and snapshots linked to a thread, turn, or item.                                                                 |

`generation_jobs.harness_thread_id` points at the thread for a challenge or quiz
generation job. Project preparation, chat, hints, and ancillary runs link through
`harness_threads.challenge_id` and `kind`.

## Item types

`user_message`, `assistant_message`, `reasoning`, `command_execution`,
`file_change`, `file_read`, `file_search`, `web_search`, `tool_call`,
`user_input_request`, `approval_request`, `system_notice`, `error`.

### Payload conventions

- `command_execution`: `{ callId, input, cwd, output, exitCode }`
- `file_change`: `{ callId, operation, path, oldPath?, diff? }`
- requests: `{ requestId, kind, prompt, options?, decision?, answer? }`

Decisions live in the item payload. Request items start `pending` and move to
`completed`, `cancelled`, or `failed`. Thread and turn status use `queued`,
`running`, `waiting`, `completed`, `failed`, `cancelled`, or `interrupted`.

## Lifecycle

1. A feature creates a thread and a turn, or lets the agent executor create one
   for an ancillary run.
2. Starting a turn marks the thread and turn `running`, appends an attempt, and
   writes the `user_message` item.
3. Provider events append or update items. `message_end` writes assistant text
   and any thinking text as separate `reasoning` and `assistant_message` items.
4. A permission or clarification request moves the run to `waiting` until the
   user answers in the transcript or the run stops.
5. Completion stores token usage and marks the thread, turn, and attempt
   `completed`. Failures record an `error` item and the error code/message.
6. Startup recovery marks unfinished threads, turns, attempts, and items as
   interrupted/failed. Pending in-memory approvals are rejected. Nothing is
   replayed automatically.

## Permissions

Settings → Advanced stores one app-wide `agentPermissions` mode in
`settings.sqlite`:

| Action                      | approval-required | auto-accept-edits | auto  | full-access |
| --------------------------- | ----------------- | ----------------- | ----- | ----------- |
| read workspace              | allow             | allow             | allow | allow       |
| write/edit workspace        | ask               | allow             | allow | allow       |
| run command in workspace    | ask               | ask               | allow | allow       |
| install / network           | ask               | ask               | ask   | allow       |
| outside workspace / secrets | ask               | ask               | ask   | deny        |

`modules/ai/agent/permission-policy.ts` is the only decision point. Tools call
it before acting; when the decision is `ask`, the project scaffold asks through
the harness and stores the request as an `approval_request` item. Project
command rows remain the durable record of an approved command and its result.

## API

- `GET /harness?kind=&challengeId=&limit=`
- `GET /harness/:id`
- `POST /harness/:id/turns`
- `POST /harness/:id/stop`
- `POST /harness/:id/retry`
- `POST /harness/:id/requests/:requestId`

All routes require `X-Profile-Id` and filter by it. The renderer uses
`features/harness` for queries and invalidates on `harness_threads`,
`harness_turns`, and `harness_items` changes.
