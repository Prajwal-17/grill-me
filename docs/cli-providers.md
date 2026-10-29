# Local CLI providers

Grill Me uses the Codex or OpenCode executable already installed on your Linux
machine. It does not download, bundle, update, or install either CLI. Docker is
not required for the desktop application.

Open Settings → AI providers → Add provider. Choose Codex CLI or OpenCode CLI,
enter a name, and save. Leave the executable field empty to detect the CLI in
PATH, or select an absolute executable path. Sign in from the saved provider's
connection panel, choose an available model, and select Use provider. The same
provider handles generation, hints, quizzes, discussions, and submission reviews.
A model change applies to subsequent requests. Existing OpenAI-compatible API
connections remain supported; their saved keys stay in the Linux keyring or
session storage selected for that connection.

## Sign-in and runtime ownership

Codex is controlled through its app-server stdio protocol. Its browser sign-in
flow runs through that app-server. OpenCode runs an authenticated loopback server;
its own provider API supplies available accounts, sign-in methods, and models.
OpenCode 1.x and 2.x use separate adapters for their respective HTTP/event APIs.
OAuth links open in the system browser. API credentials entered for an OpenCode
account are passed to OpenCode, not saved in Grill Me's settings database.

Each CLI connection gets an independent directory under `providers/<provider-id>`
in this installation's data directory. Codex uses its own CODEX_HOME there;
OpenCode uses separate XDG config, data, state, and cache directories. The app
does not copy credentials or link session directories from `~/.codex` or the
normal OpenCode home. Sign-in is therefore specific to this installation even
when the executable is already installed. CLI-managed authentication files are
inside the owner-only data directory; they use the CLI's credential storage,
not Grill Me's API-key keyring. This is local access protection, not encryption
of the whole data directory.

Grill Me starts and stops only the processes it owns. Disconnecting stops the
connection and clears its active-provider selection; the disconnected state
survives reloads and backend restarts until Connect or Use provider is selected.
Authentication remains for reconnection. Removing a provider also removes its configuration and any
Grill Me-managed API key. CLI sign-in files remain in the private installation
data directory. No global CLI installation, credentials, or history are deleted.

## Conversation storage and recovery

`grill-me.sqlite` stores discussions and reviews for this installation. A user
message and pending reply are committed before requesting a response. Partial
text is checkpointed during streaming and saved on failure or cancellation.
Replies record completed, failed, cancelled, or interrupted status. Retry creates
a new reply to the original user message, without duplicating the request.
Only completed conversation history is used as context for subsequent requests.
Concurrent responses for the same challenge are rejected.

Codex review/discussion threads are ephemeral; Grill Me reconstructs context from
its local messages. OpenCode sessions are temporary and deleted after completion
or cancellation. Its runtime files stay within the installation directory if a
process crash prevents cleanup. App startup marks unfinished replies interrupted;
it never automatically repeats a model request. Provider inference still sends
the request to the account/model service selected through the CLI.

Reviews inspect saved submission snapshots. Codex receives bounded read-only file
tools. OpenCode has read/search permissions with shell, editing, external-directory
access, and other tools denied. Local reviews never execute submitted code and
report inspection-only evidence. Existing scoring and explicit challenge
completion rules remain unchanged.

## Errors and verification

Missing executables, invalid versions, sign-in requirements, missing models,
startup failures, provider exits, timeouts, and cancellation are reported in the
connection panel or saved response. Raw stderr and authentication protocol traffic
are not included in user-facing errors. Reconnection does not replay requests.

Run `bun run test:desktop` for isolated SQLite and fake CLI protocol tests.
These use temporary data folders and fake providers; they do not invoke paid
models, access production databases, or build a desktop package. Browser/Electron
E2E suites have been removed. Run the full app with `bun dev` for manual checks.
