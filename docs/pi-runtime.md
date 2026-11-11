# Embedded Pi agent runtime

Grill Me runs every AI operation through the upstream Pi agent packages inside
the local Bun backend. Electron still owns the backend process and application
lifecycle. The Pi CLI is never launched, and the retained Codex/OpenCode CLI
adapters are inactive in production.

## Packages

The backend depends on a single compatible family:

- `@earendil-works/pi-agent-core@1.5.2` for the stateful `Agent` loop, native
  messages, tool execution, cancellation, and lifecycle events.
- `@earendil-works/pi-ai@1.5.2` for provider catalogues and streaming.

`@earendil-works/pi-coding-agent` is not required because review snapshots use a
narrow manifest-backed tool instead of Pi's host file/shell tools.

## Execution path

```text
existing action -> domain service -> ModelGateway -> Pi Agent -> provider/tools
  -> validated completion -> domain service -> existing SQLite records
```

Each run receives an authorized profile, an operation, the current input, an
optional API model/reasoning selection, and a fixed capability set. The gateway
resolves credentials from `SecretStore`, snapshots the provider/model/reasoning
choice, and creates a fresh `Agent`. Agents are never shared across profiles or
concurrent runs.

Limits are internal defaults: 12 model turns, 24 tool calls, two output-repair
attempts, and the configured judge timeout. At most two unrelated runs execute
at once; a second run for the same conversation is rejected. Cancellation aborts
the provider stream and any running tool.

## Native messages and results

Application instructions live in the system prompt. Current transcript turns
are reconstructed as native user/assistant messages. Challenge, document, web,
and submitted-code context is fenced as untrusted data in user content blocks
rather than a JSON-encoded prompt wrapper. Supported image attachments use native
image content blocks only when the selected model declares image input support;
unsupported image input is rejected before a run begins.

Structured operations expose one completion tool whose JSON Schema comes from
the existing Zod result schema. A successful run requires exactly one accepted
completion result. Schema and semantic failures are returned to the model for a
bounded correction; plain prose is never accepted as a domain result. Reviews
also expose `list_submission_files`, `read_submission_file`, and
`search_submission`, which enforce the saved snapshot manifest and resolved path
boundaries. No write or shell tool is registered.

## Providers and selections

Settings → Providers manages API connections:

- OpenRouter
- OpenCode Go
- OmniRoute or another OpenAI-compatible endpoint
- OpenAI

Custom endpoints declare their protocol and capabilities because a `/models`
response does not prove tool, image, or reasoning support. The composer model
picker groups entries by connection. Reasoning choices come from the selected
model's supported levels; unsupported stored values are reported instead of
being silently downgraded. An omitted selection uses the saved connection
default. The choice is fixed for the operation, including all tool turns and
output repair. Background quiz title generation runs inside the initiating quiz
run and therefore uses the same choice.

OpenCode Go is a direct API preset. It is unrelated to the retained
`kind: "opencode"` CLI record. The Pi provider identifier `opencode-go` is never
mapped to a CLI record.

## Tools and access

| Capability                  | Behavior                                                 |
| --------------------------- | -------------------------------------------------------- |
| Validated completion        | Active for structured generation, review, and extraction |
| Brave web search            | Active only when a search key is saved in Settings       |
| Public page retrieval       | Bounded, public-network only, revalidated on redirects   |
| Review snapshot read/search | Active only for an explicitly requested saved review     |
| Host file read/search       | Inactive                                                 |
| File write/edit             | Inactive                                                 |
| Shell execution             | Inactive, including during review                        |
| Learning-history tools      | Absent                                                   |

Web retrieval blocks loopback, private, link-local, metadata, and non-standard
port destinations, pins the validated address for each request, revalidates
redirects, bounds response size and content type, and never forwards inference
credentials. Retrieved text is untrusted content.

## Persistence and recovery

Application-owned `agent_runs` and `agent_run_events` tables store run ownership,
provider/model/reasoning metadata, lifecycle status, bounded native messages,
and tool events. Raw reasoning streams and request headers are not stored, and
credential-shaped values are redacted.

Practice tables, IDs, timestamps, indexes, profiles, and message formats are
unchanged. Schema version 3 is a forward-only, additive migration. Before a v2
database upgrades, startup creates verified owner-only backups of both SQLite
databases with `VACUUM INTO`; a backup failure stops startup before migration.
Unfinished runs are marked interrupted on startup, partial replies are retained,
and retries create a new run rather than replaying a tool sequence or write.

Rollback to an older binary requires a verified pre-upgrade backup because older
builds reject schema versions above 2. Stop the app, preserve the upgraded data
directory separately, and restore the backup rather than allowing newer data to
be overwritten silently.

## Legacy CLI preservation

The Codex/OpenCode adapter implementations, fixtures, homes, sessions, and saved
settings remain in the repository. They are not constructed at startup, not used
for connection checks, and not reachable from production AI execution or
sign-in. Their routes keep their shapes and return a stable
`INTEGRATION_INACTIVE` error without starting a process. Legacy records remain
readable but are hidden from active provider/model pickers.
