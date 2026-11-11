# Embedded Pi agent runtime implementation plan

Status: proposed implementation plan only. No runtime or data changes are made by
this document.

## 1. Agreed scope

Embed Pi's actual agent loop and `Agent` object inside Grill Me's existing Bun
backend. Use the upstream packages; do not implement another agent loop or launch
the Pi CLI. Electron continues to own the backend process and application lifecycle.

Route every existing AI operation through the embedded runtime: challenge
preparation/generation, quizzes and titles, hints, discussions, reviews,
verification planning, prompt enhancement, and resume extraction. Preserve the
existing buttons, routes, domain validation, completion rules, and quiz autosave.
Challenge and quiz generation remain explicit actions. Do not add a general
assistant that orchestrates the application, retrieves learning history, or makes
practice decisions for the user.

Add only the UI needed to configure API connections and select a model and
reasoning effort in the chat/composer. Defer a broader interface redesign.

### Interpretation of overlapping answers

- The explicit request to disconnect and never use the CLI integrations takes
  precedence over the earlier mention of Codex CLI as a provider. Keep both CLI
  implementations and their saved configuration, but make neither reachable from
  production AI execution, connection checks, sign-in, or startup.
- OpenCode Go is a direct API provider, separate from the retained OpenCode CLI.
- “No local access for now” means the agent cannot browse the machine, edit files,
  or run commands. Prepare integration points for Pi's existing tools, but do not
  activate filesystem or shell tools. Explicitly submitted content and existing
  application-created review snapshots remain usable for the existing review
  workflow; they do not grant access to the source folder or other host paths.
- Keep ordinary messages within the current discussion as conversation context.
  Exclude previous challenges, learning evidence, unrelated conversations, and
  automatic profile/history enrichment. Keep explicitly selected generation
  options. Resume extraction receives only the document submitted for that action.
- Use bounded runs with explicit retry and interruption recovery. Do not introduce
  background autonomy, automatic mutation replay, or persistent learner memory.

## 2. Existing integration points

- `packages/backend/src/modules/ai/model-gateway.ts` is the domain-facing AI
  contract. Preserve it while replacing its production implementation.
- `packages/backend/src/local/model.ts` currently resolves a provider, constructs
  `createOpenAIModel`, and attaches CLI transport when appropriate. Replace this
  wiring with the Pi gateway and an immutable configuration snapshot per run.
- `modules/ai/openai.model.ts` currently performs structured requests and text
  streaming. Its prompt builders flatten conversation/context into text, including
  JSON-stringified inputs. Replace the active path with typed messages and tools.
- `local/server.ts`, `local/settings.ts`, and `local/settings-routes.ts` can start
  or probe CLI integrations. Disconnect those call sites as well as the gateway.
- `local/settings.ts` stores provider metadata in a separate `settings.sqlite`.
  Credentials already have a `SecretStore`; keep that boundary.
- `shared/database/db.sqlite.ts` currently supports practice schema version 2.
  New runtime persistence must be additive and leave those migration steps intact.
- Challenge and message services currently retrieve recent challenges/evidence.
  Bypass these lookups when assembling new AI requests; preserve their stored data
  and existing history screens.

## 3. Dependencies and embedding choice

Use the published Pi agent-core and AI packages as direct backend dependencies.
The current upstream documents `@earendil-works/pi-agent-core` and
`@earendil-works/pi-ai`; earlier releases used a different namespace. Pin a mutually
compatible published release after checking its exports, license, and Bun build.
Do not mix packages from different release families or depend on GitHub `main`.
The core supplies stateful execution, native messages, tool execution, and events;
the AI layer supplies provider access. [Agent-core documentation](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)

If reusing exported tool factories, add the compatible
`@earendil-works/pi-coding-agent` package. Import only supported public exports;
never private source paths. Pi exposes read, edit, write, shell, and search/list
tool factories. These are reusable implementations, not permission boundaries.
[Upstream tools](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/tools/index.ts)

Use core `Agent` directly for this phase. Grill Me owns persistence, credentials,
instructions, and task completion. Do not use the coding SDK's default session
factory, which discovers host resources and creates its own settings/session
state unless explicitly overridden. [SDK configuration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)

First implementation gate: prove the selected packages run under Bun 1.4.1 and in
the compiled desktop backend using a fake streaming provider. Inventory dynamic
imports, runtime assets, and native dependencies. Resolve packaging issues before
changing the application AI path; do not substitute a hand-written loop.

## 4. Backend structure and lifecycle

Add `packages/backend/src/modules/ai/agent/` with these responsibilities:

| Module         | Responsibility                                                         |
| -------------- | ---------------------------------------------------------------------- |
| `runtime.ts`   | Create an upstream `Agent`, subscribe, run, cancel, and release it     |
| `gateway.ts`   | Implement the existing `ModelGateway` methods                          |
| `messages.ts`  | Convert domain inputs and current transcripts to native Pi messages    |
| `tasks.ts`     | Task instructions, allowed tools, result schema, and limits            |
| `providers.ts` | Build isolated provider/model configurations and capability metadata   |
| `tools/`       | Validated result tools, web tools, and inactive local-tool integration |
| `events.ts`    | Map upstream events to stable application-owned events                 |
| `store.ts`     | Persist run metadata and bounded event/message records                 |

The execution path is:

`existing action → domain service → ModelGateway → Pi Agent → provider/tools → validated result → domain service → existing SQLite records`

Each run receives an authorized profile, operation, current input, optional model
selection, cancellation signal, and a fixed capability set. Resolve credentials
on the backend, snapshot the provider/model/reasoning choice, and create a fresh
agent. Never share mutable agent state across profiles or concurrent runs.

Pi owns the model/tool continuation loop. Grill Me owns authorization, permitted
tools, limits, persistence, and the final domain write. Abort on cancellation or
backend shutdown, await settlement, and remove subscriptions. Initialization stays
inside `createBackend`; imports must not start processes or initialize databases.

Initial limits: maximum 12 model turns, 24 tool calls, two output-repair attempts,
and the existing configured operation timeout, whichever limit arrives first.
Limit tool output and total context independently. One active run per existing
conversation/generation resource; unrelated resources may proceed within a small
backend concurrency limit of two. Make these internal defaults, not a new settings
dashboard. Check cancellation and limits before every model request and tool call.

## 5. Native messages and structured results

Do not send a serialized transcript or escaped JSON request as the user's message.

- Put application and operation instructions in the system prompt.
- Preserve each current user/assistant turn as its own native message with its
  role and ordered content blocks. Send the user's actual text as user content.
- Supply task options and current challenge/reference material as clearly labeled
  context blocks. Keep untrusted code, documents, and web content separate from
  instructions. Do not promote text found in those sources into system authority.
- Preserve tool calls as assistant tool-call blocks and responses as correlated
  tool-result messages, retaining call IDs and ordering through persistence.
- Use supported image content blocks for attachments when the selected model can
  accept them. Reject unsupported input clearly before a run begins.
- Keep JSON for schema definitions, tool arguments, database storage, and wire
  encoding. Avoid nested stringify/parse prompt protocols and parsing structured
  domain output out of Markdown prose.

For operations producing domain objects, expose one operation-specific completion
tool, such as `complete_challenge` or `complete_quiz`. Derive its argument JSON
Schema from the existing Zod result schema. Validate arguments and semantic rules
on the backend; retain quiz coverage/count checks and resume evidence validation.
These completion tools collect a result in memory; they do not insert records or
call the generation service recursively.

A successful structured run requires exactly one accepted completion result.
The runtime stops through the supported upstream lifecycle hook after completion;
only then does the service perform its normal transaction. Reject duplicate
completion calls, unknown tools, malformed arguments, and mismatched operations.
Schema failures return a concise tool error for bounded correction. Plain prose
without completion is not success. Never save an invalid or partial challenge.

Discussion and hints stream ordinary assistant text. Keep research/status text
from structured generation separate from the final artifact. Models without
working tool calling cannot generate structured artifacts through this path;
report the limitation rather than silently reverting to JSON-in-text prompting.

## 6. Providers, models, reasoning, and credentials

Initial supported connections:

- OpenCode Go through Pi's direct API provider.
- OpenRouter through its Pi provider.
- OpenAI-compatible custom endpoints, including existing OmniRoute settings.
- Additional native Pi providers through the same catalog/configuration layer,
  enabled only when their authentication and protocol have been verified.

OpenCode documents Pi's `opencode-go` provider and personal API keys. This does
not require the installed OpenCode CLI or its stored login.
[OpenCode's Pi integration](https://opencode.ai/docs/console/harnesses/pi/)

Preserve existing provider kind values, IDs, keys, endpoints, and credential
references. Extend metadata additively to distinguish API presets/protocols from
legacy CLI kinds. In particular, Pi's provider identifier `opencode` must never
be confused with Grill Me's existing `kind: "opencode"` CLI record.

Use native provider implementations where available; do not force every model
through an OpenAI Responses endpoint. Custom connections declare the supported
protocol and capabilities. A `/models` response alone does not prove support for
tools, image inputs, or reasoning. Preserve explicit custom model IDs and allow
capabilities to be configured when the endpoint does not publish them.

Build a backend catalog keyed by saved connection plus model ID. Normalize
supported reasoning options from the selected provider/model. Map them explicitly
to Pi's supported levels or provider options. Preserve legacy stored effort
values even when currently unsupported; report that choice rather than silently
downgrading it or sending arbitrary effort strings.

The composer model picker groups entries by API connection. The reasoning picker
offers only supported values plus provider default; omit explicit reasoning for
non-reasoning models. Add optional typed selection fields to existing request
schemas. Omitted selection uses the saved API default. Selection applies to the
next run and is fixed for all its tool turns and output repair. Background title
generation inherits the initiating run's choice. Keep composer defaults in the
existing edition-scoped renderer preference store; validate them on the backend.

No automatic provider fallback. A saved CLI selection produces an actionable
“select an API provider” state without changing the stored selection or preventing
access to saved practice. API failures use `AppError`/`providerError` and preserve
partial discussion text.

Use `SecretStore` for API/search credentials and supply them directly to the
request-scoped Pi provider. Do not use host Pi auth files, inherit host CLI logins,
or mutate process-global environment variables to select credentials. Redact
secrets and authorization headers from persisted events and errors.

## 7. Tools and access boundaries

Use an application-owned registry with explicit per-operation allowlists. Do not
auto-load Pi extensions, skills, MCP servers, project instructions, host settings,
or environment-discovered credentials.

| Capability                                   | Initial behavior                                                 |
| -------------------------------------------- | ---------------------------------------------------------------- |
| Validated operation completion               | Active for structured generation/extraction/review tasks         |
| Public web search                            | Available when a search API is explicitly configured             |
| Public page retrieval                        | Available with bounded responses and public-network restrictions |
| Read/search submitted snapshot               | Available only during an explicitly requested existing review    |
| Host file read/search                        | Inactive                                                         |
| File write/edit                              | Inactive                                                         |
| Shell execution                              | Inactive, including during review                                |
| Learning history/profile database tools      | Absent                                                           |
| Agent-initiated challenge/quiz orchestration | Deferred; services still own explicit actions                    |

Provide `web_search` as a host tool independent of model-provider support. Proposed
first adapter: Brave Search API, using a separately configured key in
`SecretStore`; leave search unavailable when not configured. This is an additional
service, not something an inference API key automatically supplies.
[Search API reference](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started)

Implement public-page retrieval with scheme, DNS/address, port, redirect, timeout,
content-type, and size restrictions, including revalidation at connection and each
redirect. Block loopback, private/link-local networks, local files, and metadata
addresses. Use a transport that pins validated destinations to prevent DNS
rebinding. Never forward inference credentials to retrieved URLs. Return bounded
source text and URLs; treat retrieved instructions as untrusted content.

For review snapshots, reuse Pi read/search factories only through constrained
operations that enforce the snapshot manifest and resolved path boundaries,
including symlinks. A `cwd` alone is insufficient. No write or shell tool may be
registered. If the pinned factory lacks the required enforcement hook, use a
narrow manifest-backed custom tool instead. Submitted code is never executed.

Keep a factory seam for Pi's local coding tools, but expose no runtime activation
switch yet. Enabling host editing or shell access is a later feature with its own
access design; this phase grants none.

## 8. Disconnect CLI integrations without deleting them

Retain `local/providers/codex.ts`, `opencode.ts`, related implementation files,
fixtures, and adapter tests. Leave CLI homes, histories, credentials, and settings
untouched.

Remove production construction/injection of `createCliProviders`, CLI gateway
transport selection, startup health probes, and CLI connect/sign-in UI actions.
Keep existing CLI-specific route shapes recognized, but return a stable inactive
integration error without starting a process. Preserve adapter code for later
explicit integration. Legacy records remain readable through compatibility code;
hide them from active provider/model pickers.

Test the entire production path with process-spawn and CLI-factory spies: startup,
Settings, health checks, generation, review, and shutdown must not use CLI adapters.

## 9. Persistence and SQLite preservation

Keep all existing practice tables, IDs, timestamps, indexes, profiles, stored
formats, and migration history. Do not rewrite old messages into Pi messages or
move practice records to a Pi-managed database. Adapt old current-conversation
messages in memory when needed.

Add application-owned `agent_runs` and `agent_run_events` tables if required for
run recovery and diagnostics. Store profile/operation ownership, optional existing
resource references, selected provider/model/reasoning, lifecycle status, and
ordered versioned native-message/tool events. Preserve structured content rather
than flattening it into the legacy message text column. Keep assistant display
text in the existing message records and use new tables for tool details. Store
bounded, redacted events; omit raw private reasoning streams and request headers.

Use a new forward-only `PRAGMA user_version = 3` step if version 2 remains the
latest schema at implementation time. Do not edit `0000_desktop.sql` or released
migration logic. Synchronize the Drizzle schema and a new migration with the
runtime migration, and ensure fresh installs execute the full migration chain.
Write through the shared adapter so notifications and transaction semantics remain
correct.

Extend the settings document with defaulted optional fields; keep version-1
documents readable and preserve dormant CLI records and credential references
when saving. Do not reset settings on a parse or upgrade failure.

Before migration, create verified, owner-only backups of both SQLite databases
using a consistent SQLite backup mechanism or a stopped/checkpointed database;
never copy a live WAL database's main file alone. Abort before migration if the
backup fails. Keep migration transactional, validate foreign keys and integrity,
and leave the original data directory in place. Do not access the developer's
real database during implementation or tests.

Migration tests must populate a previous-schema database with multiple profiles,
challenges, quizzes/answers, messages in every status, submissions, reviews, and
settings including CLI records. Compare existing values, counts, IDs, timestamps,
indexes, and relationships after upgrade. Verify credential references and files
are unchanged. Test fresh creation, repeated startup, interrupted migration,
failure rollback, backup failure, and cross-profile isolation.

On startup, mark unfinished runs interrupted and retain partial replies. Never
resume a tool sequence or replay a write automatically. Explicit retry creates a
new run associated with the original operation. Full durable session continuation,
branching, and compaction are deferred. Rollback to an older binary requires a
verified pre-upgrade backup: the current older app rejects schema versions above 2. Document restoration with the app stopped and preserve the upgraded directory
separately so newer data is not overwritten silently.

## 10. Minimal interface and transport

Reuse existing React controls, tokens, loading states, connection notices, and
explicit retry/stop behavior. Add model and reasoning selectors to discussion and
generation composers; retain the existing form options. Settings provides only
the API connection fields and optional web-search configuration needed for this
phase. No tool timeline, agent dashboard, memory UI, or new general-chat flow.

Keep renderer domain traffic on `apiRequest`/`streamRequest` and the existing
authenticated WebSocket transport. Map runtime events to application-owned types
in `packages/contracts`; do not expose Pi's dependency-specific event union as
the public protocol. Preserve existing text stream formats and add optional
metadata or an opt-in event channel for progress. Retain request IDs, bounded
queues, cancellation, and backpressure. Bump `PROTOCOL_VERSION` only if a breaking
wire change proves necessary.

## 11. Implementation sequence and completion gates

1. **Prove dependency compatibility.** Pin coherent upstream packages, use Bun to
   install, run a fake-provider model/tool/result cycle, and verify compiled
   backend imports/assets. No paid calls or host accounts.
2. **Add contracts and API provider resolution.** Extend configuration and request
   selections additively; implement catalog/capability mapping and secret lookup.
   Test old settings documents and unsupported reasoning selections.
3. **Build runtime and native message adapters.** Exercise actual Pi continuation,
   tool results, cancellation, limits, and isolation. Assert that conversation
   roles/content blocks survive without serialized transcript wrappers.
4. **Implement task completion and web tools.** Validate completion schemas,
   semantic failures, bounded repair, missing search configuration, and hostile web
   input. Add constrained snapshot reads for existing reviews.
5. **Add persistence and compatibility.** Implement backups, additive migration,
   run events, and interrupted-run recovery; pass populated-database tests before
   switching the production gateway.
6. **Switch all existing AI operations.** Implement the Pi `ModelGateway`, remove
   history enrichment, and disconnect every production CLI entry point. Retain
   legacy adapter fixtures/tests. No fallback to the old JSON-in-text path.
7. **Add minimal selectors.** Carry an immutable model/reasoning choice from each
   composer through its complete operation. Verify existing actions and records
   remain usable when no API provider is configured.
8. **Verify and document.** Run `bun run check`, `bun run test:desktop`, and
   `bun run desktop:build`. Update `docs/cli-providers.md`, relevant desktop docs,
   and `CHANGELOG.md` under Unreleased only when behavior is implemented. Run
   installer checks only on the matching supported native OS/architecture and
   explicitly report any platform check not run. Add no Playwright/E2E suite.

Acceptance requires fake-provider coverage of every gateway method, a real Pi
multi-turn tool cycle, exact-once validated domain persistence, current-conversation
message reconstruction, no history enrichment, no host access, no CLI startup,
model/reasoning propagation, cancellation during model and tool execution,
partial-output recovery, tool failure/limit handling, and data-preserving upgrades.
“Exact-once” here means duplicate completion calls or client reconnects cannot
commit the same operation twice; cancellation around commit must return/recover the
already committed result rather than silently generate another artifact.

## 12. Result of this phase

Grill Me uses an embedded upstream Pi agent for all existing AI actions, with
native messages and validated tool results. Users select API models and reasoning
in the composer. Public web tools can assist generation when configured. Existing
CLI integrations remain preserved and disconnected. Local host access, history
personalization, broader orchestration, and interface redesign stay deferred.
Existing SQLite practice and settings data remain readable through tested additive
changes and a documented backup/restore path.
