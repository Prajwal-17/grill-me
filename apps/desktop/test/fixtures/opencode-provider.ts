// Loopback-only OpenCode protocol fixture. No external accounts or inference.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
if (process.argv.includes("--version")) {
  console.log("opencode 1.5.0");
  process.exit(0);
}
const home = process.env.XDG_DATA_HOME!;
const events = new Set<ReadableStreamDefaultController<Uint8Array>>();
const emit = (event: unknown) => {
  for (const client of events) {
    try {
      client.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
      );
    } catch {
      /* disconnected */
    }
  }
};
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request) {
    if (
      request.headers.get("authorization") !==
      `Basic ${Buffer.from("opencode:" + process.env.OPENCODE_SERVER_PASSWORD).toString("base64")}`
    )
      return new Response("Unauthorized", { status: 401 });
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/global/health")
      return Response.json({ healthy: true, version: "1.5.0" });
    if (path === "/provider")
      return Response.json({
        all: [
          {
            id: "fixture",
            name: "Fixture account",
            models: { model: { id: "fixture-model", name: "Fixture model" } },
          },
        ],
        connected: existsSync(join(home, "signed-in")) ? ["fixture"] : [],
      });
    if (path === "/provider/auth")
      return Response.json({ fixture: [{ type: "api", label: "API key" }] });
    if (path === "/auth/fixture") {
      const body = await request.json();
      if (body.type !== "api" || body.key !== "fixture-key")
        return new Response("Wrong key", { status: 401 });
      writeFileSync(join(home, "signed-in"), "fixture-only");
      return Response.json(true);
    }
    if (path === "/event")
      return new Response(
        new ReadableStream({
          start(controller) {
            events.add(controller);
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"server.connected","properties":{}}\n\n',
              ),
            );
          },
          cancel() {
            for (const client of events) events.delete(client);
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    if (path === "/session" && request.method === "POST") {
      writeFileSync(
        join(home, "permissions.json"),
        JSON.stringify(await request.json()),
      );
      return Response.json({ id: "ses_fixture" });
    }
    if (path === "/session/ses_fixture/message") {
      const body = await request.json();
      writeFileSync(join(home, "request.json"), JSON.stringify(body));
      const event = (type: string, properties: unknown) =>
        emit({ type, properties });
      await new Promise((resolve) => setTimeout(resolve, 30));
      event("message.updated", {
        info: { id: "user", sessionID: "ses_fixture", role: "user" },
      });
      event("message.part.updated", {
        part: {
          id: "user-part",
          messageID: "user",
          sessionID: "ses_fixture",
          type: "text",
          text: "User text must not become output",
        },
      });
      event("message.updated", {
        info: { id: "assistant", sessionID: "ses_fixture", role: "assistant" },
      });
      event("message.part.delta", {
        sessionID: "ses_fixture",
        messageID: "assistant",
        partID: "answer",
        field: "text",
        delta: "OpenCode ",
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      return Response.json({
        info: { id: "assistant", role: "assistant" },
        parts: [{ type: "text", text: "OpenCode response" }],
      });
    }
    if (path === "/session/ses_fixture/abort") return Response.json(true);
    if (path === "/session/ses_fixture" && request.method === "DELETE") {
      writeFileSync(join(home, "deleted-session"), "true");
      return Response.json(true);
    }
    return new Response("Unknown fixture route", { status: 404 });
  },
});
console.log(`opencode server listening on http://127.0.0.1:${server.port}`);
