import { expect, test } from "bun:test";
import { LocalClient } from "./rpc-client";

test("disconnect rejects an in-flight mutation and reconnects without replaying it", async () => {
  let opens = 0,
    mutations = 0;
  let reconnected!: () => void;
  const secondOpen = new Promise<void>((resolve) => {
    reconnected = resolve;
  });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      if (server.upgrade(request)) return;
      return new Response(null, { status: 400 });
    },
    websocket: {
      open() {
        if (++opens === 2) reconnected();
      },
      message(socket, raw) {
        const frame = JSON.parse(String(raw));
        if (frame.type === "request") {
          mutations++;
          socket.close(1012, "Fixture restart");
        }
      },
    },
  });
  const client = new LocalClient(async () => ({
    wsUrl: `ws://127.0.0.1:${server.port}`,
    ticket: "fixture",
  }));
  const off = client.onChange(() => {});
  try {
    await expect(
      client.request({
        path: "/mutation",
        method: "POST",
        body: { once: true },
      }),
    ).rejects.toMatchObject({ code: "CONNECTION_LOST" });
    await secondOpen;
    expect(mutations).toBe(1);
  } finally {
    off();
    client.close();
    await server.stop(true);
  }
});

test("abort sends a cancellation frame for an already submitted request", async () => {
  let submitted!: () => void, cancelled!: (id: string) => void;
  const received = new Promise<void>((r) => {
    submitted = r;
  });
  const cancellation = new Promise<string>((r) => {
    cancelled = r;
  });
  let requestId = "";
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      if (server.upgrade(request)) return;
      return new Response(null, { status: 400 });
    },
    websocket: {
      message(_socket, raw) {
        const frame = JSON.parse(String(raw));
        if (frame.type === "request") {
          requestId = frame.id;
          submitted();
        }
        if (frame.type === "cancel") cancelled(frame.id);
      },
    },
  });
  const client = new LocalClient(async () => ({
    wsUrl: `ws://127.0.0.1:${server.port}`,
    ticket: "fixture",
  }));
  try {
    const controller = new AbortController();
    const pending = client.request(
      { path: "/held" },
      { signal: controller.signal },
    );
    await received;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(await cancellation).toBe(requestId);
  } finally {
    client.close();
    await server.stop(true);
  }
});
