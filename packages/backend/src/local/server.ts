import {
  mkdirSync,
  openSync,
  writeFileSync,
  readFileSync,
  closeSync,
  unlinkSync,
  chmodSync,
} from "node:fs";
import { resolve, join, sep, extname } from "node:path";
import type { ServerWebSocket } from "bun";
import {
  clientFrameSchema,
  type ServerFrame,
  type ConnectionBootstrap,
} from "@repo/contracts";
import { createBackend } from "../index";
import { onDatabaseChange } from "./changes";
import { createSettingsService } from "./settings";
import { settingsRoutes } from "./settings-routes";
import { configuredModel } from "./model";
import type { SecretStore } from "./secrets";
import { createCliProviders } from "./providers";

type SocketData = {
  pending: Map<string, AbortController>;
  subscribed: boolean;
  seen: Set<string>;
};
export type LocalServerOptions = {
  dataRoot: string;
  token: string;
  port?: number;
  origins: string[];
  rendererRoot?: string;
  keyring?: SecretStore;
  keyringModule?: string;
};
function ownDirectory(root: string) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  const path = join(root, "backend.lock");
  const marker = JSON.stringify({
    pid: process.pid,
    nonce: crypto.randomUUID(),
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, "wx", 0o600);
      writeFileSync(fd, marker);
      closeSync(fd);
      return () => {
        try {
          if (readFileSync(path, "utf8") === marker) unlinkSync(path);
        } catch {
          /* already released */
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let stale = false;
      try {
        const { pid } = JSON.parse(readFileSync(path, "utf8"));
        if (!Number.isSafeInteger(pid) || pid < 1)
          throw new Error(
            "Invalid backend lock; close the app and inspect backend.lock.",
            { cause: error },
          );
        try {
          process.kill(pid, 0);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === "ESRCH") stale = true;
        }
      } catch (e) {
        throw new Error("Cannot acquire the local backend lock.", { cause: e });
      }
      if (!stale)
        throw new Error(
          "This data folder already has a running backend. Close it or choose a different local data folder.",
          { cause: error },
        );
      unlinkSync(path);
    }
  }
  throw new Error("Cannot acquire the local backend lock.");
}
export async function startLocalServer(options: LocalServerOptions) {
  if (
    (process.env.APP_ENV === "production" &&
      (process.env.GRILL_ME_DESKTOP !== "1" ||
        process.env.GRILL_DESKTOP_CHANNEL !== "production")) ||
    options.token.length < 32
  )
    throw new Error(
      "Local servers require an Electron runtime and a strong launcher token.",
    );
  const root = resolve(options.dataRoot);
  process.umask(0o077);
  const cli = createCliProviders(root);
  const release = ownDirectory(root);
  let settings: ReturnType<typeof createSettingsService> | undefined;
  let runtime: Awaited<ReturnType<typeof createBackend>> | undefined;
  try {
    settings = createSettingsService(root, {
      keyring: options.keyring,
      modulePath: options.keyringModule,
      cli,
    });
    const config = settings;
    runtime = await createBackend({
      database: { dialect: "sqlite", path: join(root, "grill-me.sqlite") },
      llm: configuredModel(settings, cli),
      providerStatus: async () => {
        try {
          const provider = await config.snapshot();
          const status = await config.testProvider(provider.id);
          return {
            configured: true,
            online: status.ok,
            message: status.message,
          };
        } catch {
          return {
            configured: false,
            online: false,
            message: "Configure an AI provider in Settings.",
          };
        }
      },
      providerModels: async () => {
        const provider = await config.snapshot();
        if (provider.kind === "openai")
          return {
            models: [{ id: provider.model, label: provider.model }],
            defaultModel: provider.model,
          };
        const status = await cli.status(provider);
        if (!status.connected)
          throw new (await import("../shared/errors/app-error")).AppError(
            status.code ?? "PROVIDER_DISCONNECTED",
            status.message,
            503,
            true,
          );
        return {
          models: status.models.map((m) => ({ id: m.id, label: m.name })),
          defaultModel:
            provider.model === "auto"
              ? (status.models[0]?.id ?? "auto")
              : provider.model,
        };
      },
      webOrigin: options.origins.join(","),
    });
    const backend = runtime;
    const app = runtime.app;
    app.route("/settings", settingsRoutes(settings, cli));
    const renderer = options.rendererRoot
      ? resolve(options.rendererRoot)
      : null;
    const tickets = new Map<string, number>();
    const clients = new Set<ServerWebSocket<SocketData>>();
    let revision = 0;
    const allowed = new Set(options.origins);
    const trusted = (request: Request) => {
      const origin = request.headers.get("Origin");
      return !origin || allowed.has(origin);
    };
    const send = (socket: ServerWebSocket<SocketData>, frame: ServerFrame) => {
      if (socket.getBufferedAmount() > 1024 * 1024) {
        socket.close(1013, "Client too slow");
        return;
      }
      socket.send(JSON.stringify(frame));
    };
    const notify = onDatabaseChange((tables) => {
      revision++;
      for (const socket of clients)
        if (socket.data.subscribed)
          send(socket, { type: "changed", revision, tables });
    });
    const nonce = crypto.randomUUID();
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: options.port ?? 0,
      idleTimeout: 0,
      maxRequestBodySize: 16 * 1024 * 1024,
      async fetch(request, server) {
        const url = new URL(request.url);
        if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
          return new Response("Forbidden host", { status: 403 });
        if (!trusted(request))
          return new Response("Forbidden origin", { status: 403 });
        if (url.pathname === "/ws") {
          if (!request.headers.get("Origin") || clients.size >= 16)
            return new Response("Forbidden", { status: 403 });
          const protocols = (
            request.headers.get("Sec-WebSocket-Protocol") ?? ""
          )
            .split(",")
            .map((v) => v.trim());
          const ticket = protocols
            .find((v) => v.startsWith("ticket."))
            ?.slice(7);
          const expiry = ticket ? tickets.get(ticket) : undefined;
          if (ticket) tickets.delete(ticket);
          if (
            !protocols.includes("grill-me-v1") ||
            !expiry ||
            expiry < Date.now()
          )
            return new Response("Unauthorized", { status: 401 });
          if (
            server.upgrade(request, {
              headers: { "Sec-WebSocket-Protocol": "grill-me-v1" },
              data: { pending: new Map(), subscribed: false, seen: new Set() },
            })
          )
            return;
          return new Response("Upgrade required", { status: 426 });
        }
        if (request.headers.get("Authorization") !== `Bearer ${options.token}`)
          return new Response("Unauthorized", { status: 401 });
        if (url.pathname === "/_local/bootstrap" && request.method === "POST") {
          if (request.headers.get("Sec-Fetch-Site") === "cross-site")
            return new Response("Forbidden", { status: 403 });
          for (const [key, expiry] of tickets)
            if (expiry < Date.now()) tickets.delete(key);
          if (tickets.size >= 128)
            return new Response("Too many bootstrap requests", { status: 429 });
          const ticket = crypto.randomUUID() + crypto.randomUUID();
          tickets.set(ticket, Date.now() + 30000);
          return Response.json(
            {
              wsUrl: `ws://127.0.0.1:${server.port}/ws`,
              ticket,
            } satisfies ConnectionBootstrap,
            { headers: { "Cache-Control": "no-store" } },
          );
        }
        if (url.pathname === "/health") return app.fetch(request);
        if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
          url.pathname = url.pathname.slice(4) || "/";
          return app.fetch(new Request(url, request));
        }
        if (!renderer || !["GET", "HEAD"].includes(request.method))
          return new Response("Not found", { status: 404 });
        let path: string;
        try {
          path = resolve(renderer, "." + decodeURIComponent(url.pathname));
        } catch {
          return new Response("Bad path", { status: 400 });
        }
        if (path !== renderer && !path.startsWith(renderer + sep))
          return new Response("Forbidden", { status: 403 });
        let file = Bun.file(path);
        if (!(await file.exists()) || path === renderer) {
          if (extname(url.pathname))
            return new Response("Not found", { status: 404 });
          path = join(renderer, "index.html");
          file = Bun.file(path);
        }
        if (!(await file.exists()))
          return new Response("Renderer not found", { status: 503 });
        const headers = {
          "Content-Type": file.type,
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:${server.port}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
        };
        if (path.endsWith("index.html")) {
          headers["Content-Type"] = "text/html;charset=utf-8";
          return new Response(
            request.method === "HEAD"
              ? null
              : (await file.text()).replaceAll(
                  "<script",
                  `<script nonce="${nonce}"`,
                ),
            { headers },
          );
        }
        return new Response(request.method === "HEAD" ? null : file, {
          headers,
        });
      },
      websocket: {
        data: {} as SocketData,
        maxPayloadLength: 1024 * 1024,
        backpressureLimit: 1024 * 1024,
        closeOnBackpressureLimit: true,
        idleTimeout: 60,
        open(socket) {
          clients.add(socket);
        },
        close(socket) {
          clients.delete(socket);
          for (const c of socket.data.pending.values()) c.abort();
          socket.data.pending.clear();
        },
        async message(socket, raw) {
          let frame;
          try {
            frame = clientFrameSchema.parse(JSON.parse(String(raw)));
          } catch {
            socket.close(1008, "Invalid request");
            return;
          }
          if (frame.type === "ping") {
            send(socket, { type: "pong" });
            return;
          }
          if (frame.type === "subscribe") {
            socket.data.subscribed = true;
            send(socket, { type: "changed", revision });
            return;
          }
          if (frame.type === "cancel") {
            socket.data.pending.get(frame.id)?.abort();
            return;
          }
          if (
            socket.data.pending.size >= 32 ||
            socket.data.seen.has(frame.id)
          ) {
            send(socket, {
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
          if (socket.data.seen.size >= 1024) {
            socket.close(1008, "Reconnect to continue");
            return;
          }
          socket.data.seen.add(frame.id);
          const controller = new AbortController();
          socket.data.pending.set(frame.id, controller);
          try {
            const call = frame.call;
            const headers = new Headers({ "Content-Type": "application/json" });
            if (call.profileId) headers.set("X-Profile-Id", call.profileId);
            if (call.stream) headers.set("Accept", "application/x-ndjson");
            const request = new Request(
              new URL(call.path, "http://local.internal"),
              {
                method: call.method,
                headers,
                body:
                  call.body === undefined
                    ? undefined
                    : JSON.stringify(call.body),
                signal: controller.signal,
              },
            );
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
                    send(socket, {
                      type: "delta",
                      id: frame.id,
                      delta: event.delta,
                    });
                  else if (event.type === "done")
                    send(socket, {
                      type: "result",
                      id: frame.id,
                      data: event.data,
                    });
                  else if (event.type === "error")
                    send(socket, {
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
                send(socket, {
                  type: "error",
                  id: frame.id,
                  error: body.error,
                });
              else if (!response.ok) throw new Error("Request failed");
              else
                send(socket, { type: "result", id: frame.id, data: body.data });
            }
          } catch {
            if (!controller.signal.aborted)
              send(socket, {
                type: "error",
                id: frame.id,
                error: {
                  code: "REQUEST_FAILED",
                  message:
                    "The local request failed. Check settings and try again.",
                  retryable: false,
                },
              });
          } finally {
            socket.data.pending.delete(frame.id);
          }
        },
      },
    });
    backend.start();
    return {
      port: server.port!,
      settings: config,
      stop: async () => {
        notify();
        for (const socket of clients) socket.close(1001, "Backend closing");
        await server.stop(true);
        await cli.close();
        await backend.stop();
        config.close();
        release();
      },
    };
  } catch (error) {
    await cli.close();
    await runtime?.stop();
    settings?.close();
    release();
    throw error;
  }
}
