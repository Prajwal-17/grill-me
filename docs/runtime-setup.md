Local runtime setup
===================

Use the native path for this personal tool. Run `bun install`, copy the existing backend and web environment examples to their corresponding ignored local environment files, then run `bun run codex:setup`, `bun run codex:doctor`, and `bun dev`.

The backend environment example points to OmniRoute at `http://localhost:20128/v1` with model alias `auto`. OmniRoute must be running independently; `bun dev` starts Grill Me's web and backend only. Keep configured credentials in ignored environment files. The local API listens on loopback by default.

The tested Codex CLI version is 0.153.4. Setup reuses an existing executable or installs that version under `~/.config/grill-me/codex-cli`. Authenticate with `codex login` (or the installed local binary). `CODEX_BIN` may select another executable. Preferences → Code reviews selects the model for new review runs; the default is `gpt-5.6-sol`. The picker reads the installed app-server model catalog and also accepts a model ID. `CODEX_MODEL` is only a fallback for scripts that do not pass a profile setting. Run doctor after a CLI upgrade; the vendored protocol types match the tested version, including experimental snapshot tools.

Codex uses a backend-owned stdio connection. Snapshot list, read, and literal-search tools expose only the saved submission directory, with paged output and no file-size limit. This supports inspection on hosts where the CLI's shell sandbox is unavailable. Shell execution is not needed for judging. Approval requests are denied, and source modifications are never applied.

Automatic verification
----------------------

Install and start Docker on the native host to enable isolated execution. Pull only the runtime images you use:

```bash
docker pull python:3.13-alpine
docker pull node:24-alpine
docker pull oven/bun:1.4.2-alpine
docker pull golang:1.25-alpine
```

The runner uses pre-pulled images, disabled networking, read-only source mounts, restricted resources, temporary test files, and a 30-second check timeout. It does not install arbitrary submission dependencies. Unsupported stacks, missing images, and unavailable runtimes are reported as inspection-only or incomplete verification. A failing test blocks acceptance only if its expected behavior follows from an original criterion.

Small submissions use OmniRoute for both harness generation and judging. Codex project reviews can request the same isolated runner after exploring files. The submitted source is never repaired by either judge.

Files and persistence
---------------------

There are no application limits on file count or file size. Browser attachments upload in chunks; the per-request chunk bound is a transport safeguard, not a file-size limit. Project capture streams file copies and hashes. Actual disk space, provider context, and runtime resources remain finite; large submissions use Codex's incremental file tools. Nothing is silently cut off to fit OmniRoute.

Use Connect folder to enter an absolute local project path or browse to it. Connecting stores the path without uploading or copying files; submitting creates the immutable review snapshot. In Docker, use the container path under `/projects`. Credential files, dependency/generated directories, and symlinks are excluded from snapshots. Missing required context is reported rather than guessed. Snapshots, manifests, reviews, and verification records persist locally. Historical statements and prose feedback are retained; old scores and context are left unknown.

`DIRECT_REVIEW_CONTEXT_TOKENS` controls routing capacity, not accepted file size. `JUDGE_TIMEOUT_MS` controls review duration. Runtime data defaults to `~/.config/grill-me`; `GRILL_ME_HOME` moves the complete app directory, while the specific database, snapshot, upload, evaluation, and Codex install variables override individual paths. Missing legacy data is copied from `apps/backend/.data` without overwriting the new location. Abandoned uploads currently remain until manually removed from local storage; do not remove uploads still referenced by a draft.

Optional Docker application profile
-----------------------------------

Set `GRILL_PROJECTS_PATH` to a host project directory, configure OmniRoute's address so it is reachable from the backend container (container localhost is not the host), then run:

```bash
docker compose up --build -d
docker compose exec backend codex login --device-auth
docker compose exec backend bun run codex:doctor
```

Web and API ports bind to host loopback. The host's `${HOME}/.config/grill-me` directory is mounted at `/root/.config/grill-me`, so native and Compose runs share the same database, submissions, uploads, evaluations, and backups. Codex authentication remains in its separate named volume, and project mounts are read-only. This profile supports project inspection. Automatic verification is intended for the native backend with Docker available; the default compose profile does not expose a host Docker socket or run privileged Docker-in-Docker. Both application profiles share the same prompts and judging contract.

Validation commands
-------------------

```bash
bun test
bun run check
bun run build
bun run codex:doctor
bun run --cwd apps/backend scripts/smoke-judge.ts
```

The smoke command makes a real Codex request against a disposable multi-file fixture. Prompt calibration can be run with `bun run --cwd apps/backend scripts/evaluate-prompts.ts`; it requires the configured OmniRoute service and makes one generation call for each of the 12 mode/difficulty combinations. Add `--regressions` to run only the two reported Codex App Server and job-processor examples. It writes inspectable results instead of treating length and score checks as proof of semantic quality.

Implementation validation — 2026-09-13
---------------------------------------

All 32 automated tests, formatting, lint, type checks, and the production build pass. The model-settings browser check verified the available model catalog, default selection, save/reload, and mobile layout. Drizzle Studio started successfully with the bundled driver. Tests cover saved context, challenge numbering, scoring/acceptance gates, retained submissions and retries, stale reviews, uploads beyond the old limits, immutable snapshots and path boundaries, Codex transport failures/reconnection, database migrations, and no-overwrite legacy storage migration. Local backups now live under `~/.config/grill-me/backups/`.

A browser check against the real API with a deterministic model fixture passed generation, contextual help, seven attachments, review and learner-controlled completion, topic history, preferences, and a narrow-screen layout without horizontal overflow. This checks application behavior, not live model quality.

A real Codex 0.153.4 app-server review inspected a disposable two-file Python implementation and returned accepted, 9/10, explicitly inspection-only. The current smoke check verified that full protocol logs remain in the database and the ephemeral session is unavailable to a fresh Codex connection. Its snapshot tools worked with shell execution disabled.

The existing `.env.example` connection settings were copied to the ignored backend `.env`. At validation time, OmniRoute at `localhost:20128` refused connections, and Docker was not installed. Consequently live OmniRoute generation/direct reviews, cross-judge calibration, actual isolated harness execution, and the Docker application image remain unverified. The calibration script and runner are implemented; these checks must be run once those services are available. Do not interpret numeric difficulty-band validation as proof that generated tasks are semantically calibrated.

Codex review history
--------------------

Open Reviews, select a submission and review run, and expand “Codex session and logs.” The saved-log link opens prompts, response text, and the protocol transcript. Each sent and received JSON-RPC message is appended to `ai_log_events` immediately, including initialization, configuration reads, thread/turn requests and acknowledgements, notifications, tool calls, tool failures, and interruption requests. Credentials are redacted. Partial transcripts survive backend restarts. If transcript persistence fails, the review fails instead of silently continuing unlogged.

New reviews use `ephemeral: true`. They cannot be resumed in Codex CLI; use Grill Me's saved logs and reassessment flow. Historical persistent sessions are not deleted. Changing completion state never deletes database review records. This records the app-server protocol exposed to Grill Me, not Codex's internal provider network traffic or hidden reasoning.

Drizzle Studio
--------------

After pulling changes, run `bun install` and `bun run db:migrate`, then `bun run db:studio` from the repository root (or `bunx drizzle-kit studio` inside `apps/backend`). Studio uses the included `@libsql/client` driver; the application continues using Bun SQLite. Both open the same `DATABASE_URL` file. Studio's configuration adds the `file:` URL prefix required by the driver. No database engine conversion is needed.

Challenge quality
-----------------

Prompt version `practice-v2.3` preserves the explicitly requested subject. New briefs have at most 4/6/8 atomic criteria for focused/feature/system, 320 characters per criterion, and prompt-guided prose targets of 120 words for focused/easy, 200 for other focused tasks, 220 for feature, and 300 for system. Starter code is excluded from the prose budget; submission files remain unlimited. Historical contracts are not revalidated against these new limits.

Generation uses a single model call and basic structured-response validation. There is no separate AI checker, difficulty-band rejection, total-word-count gate, or automatic repair loop. Topic relevance and easy-system calibration are handled by the generation prompt. The numeric difficulty remains the generator’s estimate, not an independently verified score. Existing code-review judges and verification are unchanged.

Save for later moves a challenge into a separate list under Challenges without marking it completed or changing its contract, difficulty, submissions, or reviews. Resume moves it back into active practice. This uses a new value in the existing SQLite text status column; no additional database migration is needed.
