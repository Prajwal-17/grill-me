# AI providers

Settings → Providers offers **Codex** and **OmniRoute**. Each has an on/off switch.
Turn on either or both, then choose **Use for AI requests**. Only the selected
provider handles new challenges, quizzes, hints, discussions, and reviews.
Turning off the selected provider clears that selection; it never silently
switches to another provider. Turning a provider off does not sign out or delete
its credentials. Both-off is supported, and existing practice remains accessible.

## Codex: use your existing CLI account

Grill Me runs your installed `codex app-server` and reads its account and model
catalog. Like T3 Code's existing-CLI/direct-home mode, it preserves the host HOME
and uses the configured CODEX_HOME, inherited CODEX_HOME, or `~/.codex` by default.
An existing CLI login is available immediately: no separate Grill Me sign-in is
required. Status shows the account, ChatGPT plan, CLI version, and available
models. Refresh rechecks the connection.

If Codex is signed out, run `codex login` and refresh, or use **Sign in to Codex**.
That sign-in uses the selected Codex home and therefore the same account as the
CLI using that home. Turning Codex off stops Grill Me's owned connection without
logging out of the CLI. Grill Me never copies or rewrites authentication files.

Advanced settings expose the executable path and CODEX_HOME. Leave them empty
for automatic discovery. Custom home paths accept an absolute path or `~/path`.
If you previously signed into Grill Me's isolated home, those files are retained
under `<app data>/providers/<provider-id>/config`; you can select that directory
explicitly. New connections use the normal CLI home.

Grill Me does not install or update Codex. Model and supported reasoning choices
come from the CLI catalog. An unavailable model or reasoning selection is
reported before a turn starts. Local review workspaces and temporary files stay
in Grill Me's data directory. Turns are ephemeral, use read-only snapshot tools,
and disable shell execution, editing, hooks, web search, and configured app/MCP
integrations for the review. Submitted code is never executed.

## OmniRoute

Enter the OpenAI-compatible base endpoint (usually including `/v1`) and an API
key if required. Available models come from `/models`; Advanced → Custom model
ID accepts an OmniRoute combo name or another exact model ID. Without a key,
requests omit the Authorization header. Keys use the system credential store or
explicit session-only storage; there is no plaintext fallback.

## Models and errors

New configurations default to `gpt-6.1-sol` with high reasoning in production and
`gpt-6-luna` with medium reasoning in development. Saved choices are preserved.
Changes apply to subsequent requests. API requests send `reasoning.effort`;
Provider default omits an explicit effort. The gateway must support that choice.

Connection problems appear beside the relevant provider with recovery actions.
Outside Settings, the shared connection notice links back to Providers. Missing
executables, sign-in failures, unavailable models, unsupported settings, quota,
authentication, timeouts, and offline endpoints have specific errors. Refresh and
re-enabling never replay a failed request. Saved discussions retain partial text
and explicit retry actions. Existing OpenCode records remain stored for backwards
compatibility but are not offered in the two-provider Settings interface.

Run `bun run test:isolated` for temporary-data tests with fake providers. Tests
never access the user's real Codex account or make paid inference requests.
