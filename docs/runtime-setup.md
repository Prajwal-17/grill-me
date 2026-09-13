Local runtime setup
===================

Use the native path for this personal tool. Run `bun install`, copy the existing backend and web environment examples to their corresponding ignored local environment files, then run `bun run codex:setup`, `bun run codex:doctor`, and `bun dev`.

The backend environment example points to OmniRoute at `http://localhost:20128/v1` with model alias `auto`. OmniRoute must be running independently; `bun dev` starts Grill Me's web and backend only. Keep configured credentials in ignored environment files. The local API listens on loopback by default.

The tested Codex CLI version is 0.153.4. Setup reuses an existing executable or installs that version inside the backend's ignored `.data/codex-cli` directory. Authenticate with `codex login` (or the installed local binary). `CODEX_BIN` may select another executable and `CODEX_MODEL` may select a model available to that login. Run doctor after a CLI upgrade; the vendored protocol types match the tested version, including experimental snapshot tools.

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

Connect an absolute local project path. In Docker, use the container path under `/projects`. Credential files, dependency/generated directories, and symlinks are excluded from snapshots. Missing required context is reported rather than guessed. Snapshots, manifests, reviews, and verification records persist locally. Historical statements and prose feedback are retained; old scores and context are left unknown.

`DIRECT_REVIEW_CONTEXT_TOKENS` controls routing capacity, not accepted file size. `JUDGE_TIMEOUT_MS` controls review duration. `SNAPSHOT_ROOT` and `UPLOAD_ROOT` select local storage locations. Keep database, snapshot, and upload directories together when backing up the tool. Abandoned uploads currently remain until manually removed from local storage; do not remove uploads still referenced by a draft.

Optional Docker application profile
-----------------------------------

Set `GRILL_PROJECTS_PATH` to a host project directory, configure OmniRoute's address so it is reachable from the backend container (container localhost is not the host), then run:

```bash
docker compose up --build -d
docker compose exec backend codex login --device-auth
docker compose exec backend bun run codex:doctor
```

Web and API ports bind to host loopback. Database and Codex authentication use separate named volumes; project mounts are read-only. This profile supports project inspection. Automatic verification is intended for the native backend with Docker available; the default compose profile does not expose a host Docker socket or run privileged Docker-in-Docker. Both application profiles share the same prompts and judging contract.

Validation commands
-------------------

```bash
bun test
bun run check
bun run build
bun run codex:doctor
bun run --cwd apps/backend scripts/smoke-judge.ts
```

The smoke command makes a real Codex request against a disposable multi-file fixture. Prompt calibration can be run with `bun run --cwd apps/backend scripts/evaluate-prompts.ts`; it requires the configured OmniRoute service and makes 12 generation requests. It writes inspectable results instead of treating length and score checks as proof of semantic quality.

Implementation validation — 2026-09-13
---------------------------------------

The implementation passes 22 automated tests, formatting, lint, type checks, and the production build. Tests cover saved context, scoring/acceptance gates, retained submissions and retries, stale reviews, uploads beyond the old limits, immutable snapshots and path boundaries, Codex transport failures/reconnection, and legacy migration preservation. The local database was backed up under `apps/backend/.data/backups/` before applying the additive migration.

A browser check against the real API with a deterministic model fixture passed generation, contextual help, seven attachments, review and learner-controlled completion, topic history, preferences, and a narrow-screen layout without horizontal overflow. This checks application behavior, not live model quality.

A real Codex 0.153.4 app-server review inspected a disposable two-file Python implementation and returned accepted, 9/10, explicitly inspection-only. A fresh connection read its persistent session history, and its saved request, response, and tool activity were verified. Its snapshot tools worked with shell execution disabled.

The existing `.env.example` connection settings were copied to the ignored backend `.env`. At validation time, OmniRoute at `localhost:20128` refused connections, and Docker was not installed. Consequently live OmniRoute generation/direct reviews, cross-judge calibration, actual isolated harness execution, and the Docker application image remain unverified. The calibration script and runner are implemented; these checks must be run once those services are available. Do not interpret numeric difficulty-band validation as proof that generated tasks are semantically calibrated.

Codex review history
--------------------

Open Reviews, select a submission and review run, and expand “Codex session and logs.” The saved-log link opens the full prompt, structured request, response, and recorded tool activity. Copy the session command to inspect that conversation in the CLI:

```bash
codex resume <session-id>
```

To find review sessions in the picker with the tested CLI version:

```bash
codex resume --all --include-non-interactive
```

Run these commands with the same Codex home/login as the backend. For the Docker profile, use `docker compose exec backend codex resume <session-id>` so the CLI reads the container's persistent `/codex-state` volume. Use Grill Me to request subsequent reviews because its custom file tools are provided by its backend; the standalone CLI does not host them.

Reviews created before 2026-09-13 used ephemeral sessions. Their database logs remain available, but their CLI conversation history cannot be recovered. New reviews persist their Codex session and link its log to the saved review, including unsuccessful reviews when a log was created. Changing completion state never deletes these records.
