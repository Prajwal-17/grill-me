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
import { type ConnectionBootstrap } from "@repo/backend/shared/contracts";
import { createBackend } from "../index";
import { onDatabaseChange } from "./changes";
import { createSettingsService } from "./settings";
import { settingsRoutes } from "./settings-routes";
import { configuredModel } from "./model";
import type { SecretStore } from "./secrets";
import { backupBeforeMigration } from "./backup";
import { createSocketHub, socketHandler } from "./socket";

export type LocalServerOptions = {
  dataRoot: string;
  token: string;
  port?: number;
  origins: string[];
  rendererRoot?: string;
  keyring?: SecretStore;
  keyringModule?: string;
  /** Default for new challenge folders when no workspace setting exists. */
  workspaceDefaultRoot?: string;
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
  const release = ownDirectory(root);
  let settings: ReturnType<typeof createSettingsService> | undefined;
  let runtime: Awaited<ReturnType<typeof createBackend>> | undefined;
  try {
    await backupBeforeMigration(root, [
      join(root, "grill-me.sqlite"),
      join(root, "settings.sqlite"),
    ]);
    settings = createSettingsService(root, {
      keyring: options.keyring,
      modulePath: options.keyringModule,
      workspaceDefault: options.workspaceDefaultRoot,
    });
    const config = settings;
    runtime = await createBackend({
      database: { dialect: "sqlite", path: join(root, "grill-me.sqlite") },
      llm: configuredModel(settings),
      workspaceRoot: () => config.workspaceRoot(),
      providerStatus: async () => {
        try {
          const provider = await config.snapshot();
          const status = await config.testProvider(provider.id);
          return {
            configured: true,
            online: status.ok,
            message: status.message,
          };
        } catch (error) {
          return {
            configured: false,
            online: false,
            message:
              error instanceof
              (await import("../shared/errors/app-error")).AppError
                ? error.message
                : "Configure an AI provider in Settings.",
          };
        }
      },
      providerModels: async () => {
        const provider = await config.snapshot();
        const models = await config.models(provider.id);
        return {
          models: models.map((model) => ({
            id: model.id,
            label: model.name,
          })),
          defaultModel:
            provider.model === "auto"
              ? (models[0]?.id ?? "auto")
              : provider.model,
        };
      },
      webOrigin: options.origins.join(","),
    });
    const backend = runtime;
    const app = runtime.app;
    app.route("/settings", settingsRoutes(settings));
    const renderer = options.rendererRoot
      ? resolve(options.rendererRoot)
      : null;
    const tickets = new Map<string, number>();
    const allowed = new Set(options.origins);
    const trusted = (request: Request) => {
      const origin = request.headers.get("Origin");
      return !origin || allowed.has(origin);
    };
    const sockets = createSocketHub({
      app,
      origins: options.origins,
      tickets,
    });
    const unsubscribe = onDatabaseChange(sockets.notify);
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
        if (url.pathname === "/ws")
          return sockets.routes.fetch(request, server);
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
      websocket: socketHandler,
    });
    backend.start();
    return {
      port: server.port!,
      settings: config,
      stop: async () => {
        unsubscribe();
        sockets.close();
        await server.stop(true);
        await backend.stop();
        config.close();
        release();
      },
    };
  } catch (error) {
    await runtime?.stop();
    settings?.close();
    release();
    throw error;
  }
}
