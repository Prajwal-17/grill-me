// OpenCode 2 protocol fixture, derived from the installed CLI's OpenAPI schema.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
if (process.argv.includes("--version")) {
  console.log("opencode v2.2.0");
  process.exit(0);
}
const home = process.env.XDG_DATA_HOME!;
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
const emit = (event: unknown) => {
  for (const c of clients)
    try {
      c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      /* closed */
    }
};
const signed = () => existsSync(join(home, "signed-in"));
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request) {
    if (
      request.headers.get("authorization") !==
      `Basic ${Buffer.from("opencode:" + process.env.OPENCODE_SERVER_PASSWORD).toString("base64")}`
    )
      return new Response("", { status: 401 });
    const path = new URL(request.url).pathname;
    const json = (data: unknown) => Response.json({ data });
    if (path === "/api/info")
      return Response.json({ version: "2.2.0", pid: process.pid });
    if (path === "/api/integration")
      return json([
        {
          id: "fixture",
          name: "Fixture account",
          methods: [
            { type: "key", label: "API key" },
            { type: "oauth", id: "browser", label: "Browser login" },
          ],
          connections: [],
        },
      ]);
    if (path === "/api/provider")
      return json([{ id: "fixture", name: "Fixture account" }]);
    if (path === "/api/model")
      return json(
        signed()
          ? [
              {
                id: "fixture-model",
                providerID: "fixture",
                name: "Fixture v2 model",
                enabled: true,
              },
            ]
          : [],
      );
    if (path === "/api/integration/fixture/connect/key") {
      const body = await request.json();
      if (body.key !== "fixture-key") return new Response("", { status: 401 });
      writeFileSync(join(home, "signed-in"), "true");
      return new Response(null, { status: 204 });
    }
    if (path === "/api/integration/fixture/connect/oauth")
      return json({
        attemptID: "attempt-fixture",
        url: "https://example.test/login",
        instructions: "Use the fixture browser flow.",
        mode: "code",
        time: { created: 1, expires: 9999999999999 },
      });
    if (
      path === "/api/integration/fixture/connect/oauth/attempt-fixture/complete"
    ) {
      const body = await request.json();
      if (body.code !== "fixture-code")
        return new Response("", { status: 400 });
      writeFileSync(join(home, "signed-in"), "true");
      return new Response(null, { status: 204 });
    }
    if (path === "/api/integration/fixture/connect/oauth/attempt-fixture")
      return json({ status: signed() ? "complete" : "pending" });
    if (path === "/api/event")
      return new Response(
        new ReadableStream({
          start(controller) {
            clients.add(controller);
            controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
          },
          cancel() {
            clients.clear();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    if (path === "/api/session" && request.method === "POST") {
      writeFileSync(join(home, "created-session"), "true");
      writeFileSync(
        join(home, "permissions.json"),
        JSON.stringify(await request.json()),
      );
      return json({ id: "ses_v2" });
    }
    if (
      path === "/api/experimental/session/ses_v2/instructions/entries/grill-me"
    ) {
      writeFileSync(
        join(home, "instructions.json"),
        JSON.stringify(await request.json()),
      );
      return new Response(null, { status: 204 });
    }
    if (path === "/api/session/ses_v2/prompt") {
      const body = await request.json();
      if (!body.text.includes("WAIT"))
        setTimeout(() => {
          emit({
            type: "session.text.delta",
            data: {
              sessionID: "ses_v2",
              assistantMessageID: "assistant",
              ordinal: 0,
              delta: "OpenCode 2 ",
            },
          });
          emit({
            type: "session.text.ended",
            data: {
              sessionID: "ses_v2",
              assistantMessageID: "assistant",
              ordinal: 0,
              text: "OpenCode 2 response",
            },
          });
          emit({
            type: "session.execution.succeeded",
            data: { sessionID: "ses_v2" },
          });
        }, 20);
      return json({ id: "user-message" });
    }
    if (path === "/api/session/ses_v2/interrupt")
      return new Response(null, { status: 204 });
    if (path === "/api/session/ses_v2" && request.method === "DELETE") {
      writeFileSync(join(home, "deleted-session"), "true");
      return new Response(null, { status: 204 });
    }
    return new Response("", { status: 404 });
  },
});
console.log(`opencode server listening on http://127.0.0.1:${server.port}`);
