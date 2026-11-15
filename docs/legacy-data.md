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

A fresh database applies the generated Drizzle migrations in `drizzle/`.
`0001_current_schema.sql` creates only live tables, indexes, and constraints;
`0002_immutability_triggers.sql` adds the generation-number triggers; and
`0003_simplify_challenges.sql` retires the unused challenge fields. It contains:

- no `*_legacy` tables,
- no `ai_logs`, `ai_log_events`, `agent_runs`, or `agent_run_events`,
- no `generation_counters`, `projects`, `submissions`, `review_jobs`,
  `verification_runs`, or `messages`.

`0000_desktop.sql` is the historical v1 baseline kept for migration history and
legacy test fixtures; it is recorded in `__drizzle_migrations` but not executed
on a fresh install. Fresh and upgraded databases expose the same live tables,
columns, indexes, and foreign keys; column order can differ after SQLite
`ALTER TABLE` upgrades.

## Generation numbers

`generation_counters` was removed. Display numbers are stored on
`challenges.challenge_number` and `quizzes.quiz_number`; the next number is
`MAX(number) + 1` per profile, allocated inside the existing write transaction.
Unique indexes and immutability triggers still prevent duplicates and rewrites.
The migration checks every legacy counter against the stored maximum and aborts
before renaming when they disagree.

## Retired challenge fields

`challenges.constraints`, `starter_code`, `completion_source`,
`calibration_version`, and `contract_version` were removed. The migration folds
any saved constraints and starter code into `problem_statement` first, so old
challenges keep their visible content, and copies `calibration_version` and
`contract_version` into `context_snapshot`. Completion is already recorded by
`status` and `completed_at`.

## Migration and recovery

Startup takes a verified backup before migration. New installs apply the
generated Drizzle migrations and set `user_version = 11`. Databases created by
an earlier build below v10 run the frozen legacy upgrader once (v1–v7 steps
unchanged, then v8 freezes retired tables and adds the number check, v9 adds
harness tables, and v10 moves `messages` to `messages_legacy`). The upgrader
only produces the v10 schema, so journal rows through
`0002_immutability_triggers` are stamped without replaying SQL and any newer
migration still runs against the result. Databases already at v11 without a
journal are stamped as migrated. All later schema changes are added with
`bun run --cwd packages/backend db:generate`; the frozen legacy path must not be
extended. Use the app's migration runner rather than `drizzle-kit migrate`,
because `0000_desktop.sql` is recorded as a historical marker instead of being
executed on a fresh install.

Use `bun scripts/migrate-check.ts <copy.sqlite>` to migrate a copy and print
versions, tables, row-count changes, integrity, foreign keys, numbers, triggers,
and paths. Run it on a copy before migrating a real data directory.
