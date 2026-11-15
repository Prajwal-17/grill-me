# Legacy data

Grill Me keeps retired practice data readable. Migration v8 freezes the retired
feature tables and v10 moves the old chat transcript out of the live path.

## Retired tables

| Current name                 | Previous name         |
| ---------------------------- | --------------------- |
| `projects_legacy`            | `projects`            |
| `submissions_legacy`         | `submissions`         |
| `review_jobs_legacy`         | `review_jobs`         |
| `verification_runs_legacy`   | `verification_runs`   |
| `ai_logs_legacy`             | `ai_logs`             |
| `ai_log_events_legacy`       | `ai_log_events`       |
| `agent_runs_legacy`          | `agent_runs`          |
| `agent_run_events_legacy`    | `agent_run_events`    |
| `generation_counters_legacy` | `generation_counters` |
| `messages_legacy`            | `messages`            |

Rules:

- Never write to a `*_legacy` table. There is no compatibility write path.
- Never drop, rename, or rewrite legacy rows as part of an ordinary feature.
- Keep legacy reads profile-scoped. The Logs page only reads
  `ai_logs_legacy`/`ai_log_events_legacy`, and only for the active profile.
- Old chat and hint rows in `messages_legacy` remain visible through the message
  reader. Old rows with mode `review` are not surfaced because reviews are
  retired; the rows stay in SQLite.
- Review and submission rows are retained, not surfaced. There is no route or
  UI that reads them.

## Reviews and logs are retired

- Review routes, services, prompts, and UI were deleted. `review_jobs` and
  `verification_runs` stay as legacy rows.
- New AI runs are not written to `ai_logs`. They are harness transcripts; the
  Logs page is read-only and shows a legacy banner.
- There is no new logging system.

## Fresh installs

A fresh database is created from `drizzle/fresh.sql`. It contains only
live tables, indexes, and triggers:

- no `*_legacy` tables,
- no `ai_logs`, `ai_log_events`, `agent_runs`, or `agent_run_events`,
- no `generation_counters`, `projects`, `submissions`, `review_jobs`,
  `verification_runs`, or `messages`.

`0000_desktop.sql` stays on disk for the v1–v7 upgrade path but is not used to
create a new database. Fresh and upgraded databases have the same live schema
when compared without legacy objects.

## Generation numbers

`generation_counters` was removed. Display numbers are stored on
`challenges.challenge_number` and `quizzes.quiz_number`; the next number is
`MAX(number) + 1` per profile, allocated inside the existing write transaction.
Unique indexes and immutability triggers still prevent duplicates and rewrites.
The migration checks every legacy counter against the stored maximum and aborts
before renaming when they disagree.

## Migration and recovery

Startup takes a verified backup before migration. Upgrade steps are append-only:
v1–v7 run unchanged, then v8 freezes retired tables and adds the number check,
v9 adds harness tables, and v10 moves `messages` to `messages_legacy`. A new
install applies `fresh.sql` and sets `user_version = 10`.

Use `bun scripts/migrate-check.ts <copy.sqlite>` to migrate a copy and print
versions, tables, row-count changes, integrity, foreign keys, numbers, triggers,
and paths. Run it on a copy before migrating a real data directory.
