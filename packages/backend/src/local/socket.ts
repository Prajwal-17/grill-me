import type { ServerWebSocket } from "bun";
import { Hono } from "hono";
import {
  upgradeWebSocket,
  websocket as bunWebSocket,
  type BunWebSocketData,
} from "hono/bun";
import { clientFrameSchema, type ServerFrame } from "../shared/contracts";

const PROTOCOL = "grill-me-v1";
const MAX_CLIENTS = 16;
const MAX_PENDING = 32;
const MAX_SEEN = 1024;
const MAX_BUFFERED = 1024 * 1024;
const MAX_PAYLOAD = 1024 * 1024;

type Client = {
  socket: ServerWebSocket<BunWebSocketData>;
  pending: Map<string, AbortController>;
  subscribed: boolean;
  seen: Set<string>;
};
export type SocketHubOptions = {
  app: Hono;
  origins: string[];
  tickets: Map<string, number>;
};
export type SocketHub = {
  routes: Hono;
  notify: (tables?: string[]) => void;
  close: () => void;
};
export const socketHandler: Bun.WebSocketHandler<BunWebSocketData> = {
  ...bunWebSocket,
  maxPayloadLength: MAX_PAYLOAD,
  backpressureLimit: MAX_BUFFERED,
  closeOnBackpressureLimit: true,
  idleTimeout: 60,
};

export function createSocketHub({
  app,
  origins,
  tickets,
}: SocketHubOptions): SocketHub {
  const allowed = new Set(origins);
  const clients = new Set<Client>();
  let revision = 0;
  const send = (client: Client, frame: ServerFrame) => {
    if (client.socket.getBufferedAmount() > MAX_BUFFERED) {
      client.socket.close(1013, "Client too slow");
      return;
    }
    client.socket.send(JSON.stringify(frame));
  };
  async function handleMessage(client: Client, raw: unknown) {
    let frame;
    try {
      frame = clientFrameSchema.parse(JSON.parse(String(raw)));
    } catch {
      client.socket.close(1008, "Invalid request");
      return;
    }
    if (frame.type === "ping") {
      send(client, { type: "pong" });
      return;
    }
    if (frame.type === "subscribe") {
      client.subscribed = true;
      send(client, { type: "changed", revision });
      return;
    }
    if (frame.type === "cancel") {
      client.pending.get(frame.id)?.abort();
      return;
    }
    if (client.pending.size >= MAX_PENDING || client.seen.has(frame.id)) {
      send(client, {
        type: "error",
        id: frame.id,
        error: {
          code: "REQUEST_REJECTED",
          message: "Duplicate request or too many pending requests.",
          retryable: false,
        },
      });
      return;
    }
    // Keep a bounded history; reconnects never cause client-side mutation replay.
    if (client.seen.size >= MAX_SEEN) {
      client.socket.close(1008, "Reconnect to continue");
      return;
    }
    client.seen.add(frame.id);
    const controller = new AbortController();
    client.pending.set(frame.id, controller);
    try {
      const call = frame.call;
      const headers = new Headers({ "Content-Type": "application/json" });
      if (call.profileId) headers.set("X-Profile-Id", call.profileId);
      if (call.stream) headers.set("Accept", "application/x-ndjson");
      const request = new Request(new URL(call.path, "http://local.internal"), {
        method: call.method,
        headers,
        body: call.body === undefined ? undefined : JSON.stringify(call.body),
        signal: controller.signal,
      });
      const response = await app.fetch(request);
      if (
        call.stream &&
        response.ok &&
        response.headers.get("Content-Type")?.includes("ndjson")
      ) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          let index;
          while ((index = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.type === "delta")
              send(client, {
                type: "delta",
                id: frame.id,
                delta: event.delta,
              });
            else if (event.type === "done")
              send(client, {
                type: "result",
                id: frame.id,
                data: event.data,
              });
            else if (event.type === "error")
              send(client, {
                type: "error",
                id: frame.id,
                error: event.error,
              });
          }
          if (done) break;
        }
        if (controller.signal.aborted) await reader.cancel();
      } else {
        const body = (await response.json()) as {
          data?: unknown;
          error?: { code: string; message: string; retryable: boolean };
        };
        if (body.error)
          send(client, {
            type: "error",
            id: frame.id,
            error: body.error,
          });
        else if (!response.ok) throw new Error("Request failed");
        else send(client, { type: "result", id: frame.id, data: body.data });
      }
    } catch {
      if (!controller.signal.aborted)
        send(client, {
          type: "error",
          id: frame.id,
          error: {
            code: "REQUEST_FAILED",
            message: "The local request failed. Check settings and try again.",
            retryable: false,
          },
        });
    } finally {
      client.pending.delete(frame.id);
    }
  }

  const routes = new Hono();
  routes.get("/ws", async (context) => {
    const request = context.req.raw;
    const origin = request.headers.get("Origin");
    if (!origin || !allowed.has(origin) || clients.size >= MAX_CLIENTS)
      return context.text("Forbidden", 403);
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return context.text("Upgrade required", 426);
    const protocols = (request.headers.get("Sec-WebSocket-Protocol") ?? "")
      .split(",")
      .map((value) => value.trim());
    const ticket = protocols
      .find((value) => value.startsWith("ticket."))
      ?.slice(7);
    const expiry = ticket ? tickets.get(ticket) : undefined;
    if (ticket) tickets.delete(ticket);
    if (!protocols.includes(PROTOCOL) || !expiry || expiry < Date.now())
      return context.text("Unauthorized", 401);
    let client: Client | undefined;
    const response = await upgradeWebSocket(context, {
      onOpen(_event, socket) {
        client = {
          socket: socket.raw as ServerWebSocket<BunWebSocketData>,
          pending: new Map(),
          subscribed: false,
          seen: new Set(),
        };
        clients.add(client);
      },
      onClose() {
        if (!client) return;
        clients.delete(client);
        for (const controller of client.pending.values()) controller.abort();
        client.pending.clear();
      },
      onMessage(event) {
        if (!client) return;
        void handleMessage(client, event.data).catch(() => {
          client?.socket.close(1011, "Internal error");
        });
      },
    });
    return response ?? context.text("Upgrade required", 426);
  });

  return {
    routes,
    notify(tables) {
      revision++;
      for (const client of clients)
        if (client.subscribed)
          send(client, { type: "changed", revision, tables });
    },
    close() {
      for (const client of clients)
        client.socket.close(1001, "Backend closing");
    },
  };
}
