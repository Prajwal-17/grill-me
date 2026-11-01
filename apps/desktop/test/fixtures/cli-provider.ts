// Fixture executable: never invokes a model or reads a user's credentials.
import { createInterface } from "node:readline";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
if (process.argv.includes("--version")) {
  console.log("codex 0.153.4");
  process.exit(0);
}
const home = process.env.CODEX_HOME!;
writeFileSync(join(home, "child-pid"), String(process.pid));
const send = (value: unknown) =>
  process.stdout.write(JSON.stringify(value) + "\n");
const respond = (id: unknown, result: unknown) => send({ id, result });
for await (const line of createInterface({ input: process.stdin })) {
  const event = JSON.parse(line);
  if (event.method === "initialize") respond(event.id, {});
  if (event.method === "config/read")
    respond(event.id, { config: { mcp_servers: {}, plugins: {} } });
  if (event.method === "account/read")
    respond(event.id, {
      account: existsSync(join(home, "signed-in")) ? { type: "chatgpt" } : null,
      requiresOpenaiAuth: true,
    });
  if (event.method === "account/login/start") {
    respond(event.id, { authUrl: "https://auth.openai.com/fixture-login" });
    setTimeout(
      () => writeFileSync(join(home, "signed-in"), "fixture-only"),
      250,
    );
  }
  if (event.method === "model/list")
    respond(event.id, {
      data: event.params.cursor
        ? [
            {
              id: "second",
              model: "second-model",
              displayName: "Second model",
              supportedReasoningEfforts: [{ reasoningEffort: "medium" }],
              defaultReasoningEffort: "medium",
            },
          ]
        : [
            {
              id: "fixture",
              model: "fixture-model",
              displayName: "Fixture model",
              isDefault: true,
              supportedReasoningEfforts: ["medium", "high", "xhigh"].map(
                (reasoningEffort) => ({ reasoningEffort }),
              ),
              defaultReasoningEffort: "high",
            },
          ],
      nextCursor: event.params.cursor ? null : "page-two",
    });
  if (event.method === "thread/start") {
    writeFileSync(join(home, "thread.json"), JSON.stringify(event.params));
    respond(event.id, { thread: { id: "fixture-thread" } });
  }
  if (event.method === "turn/start") {
    writeFileSync(join(home, "turn.json"), JSON.stringify(event.params));
    respond(event.id, { turn: { id: "fixture-turn" } });
    const text = event.params.input[0].text;
    if (text.includes("CRASH")) {
      process.exit(2);
    }
    if (text.includes("WAIT")) continue;
    setTimeout(() => {
      send({
        method: "item/agentMessage/delta",
        params: { threadId: "fixture-thread", delta: "Saved " },
      });
      send({
        method: "item/agentMessage/delta",
        params: { threadId: "fixture-thread", delta: "response" },
      });
      send({
        method: "turn/completed",
        params: { threadId: "fixture-thread", turn: { status: "completed" } },
      });
    }, 25);
  }
}
