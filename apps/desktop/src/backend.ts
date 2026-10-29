import { resolve, sep, extname } from "node:path";
import { createApp } from "../../backend/src/app";
import { createOpenAIModel } from "../../backend/src/modules/ai/openai.model";
import { logModel } from "../../backend/src/modules/logs/log.model";
import { createReviewService } from "../../backend/src/modules/reviews/review.service";
import {
  migrateDatabase,
  sqlite,
} from "../../backend/src/shared/database/db.sqlite";

if (
  process.env.APP_ENV !== "development" ||
  !process.env.DESKTOP_API_TOKEN ||
  process.env.DESKTOP_API_TOKEN.length < 32
) {
  throw new Error(
    "The desktop backend must be started by the development desktop launcher.",
  );
}
await migrateDatabase();
await logModel.markInterrupted();
const llm = createOpenAIModel();
await createReviewService(llm).recover();
const app = createApp({ llm, webOrigin: process.env.DESKTOP_WEB_ORIGIN ?? "" });
const renderer = process.env.DESKTOP_RENDERER_ROOT
  ? resolve(process.env.DESKTOP_RENDERER_ROOT)
  : null;
const token = `Bearer ${process.env.DESKTOP_API_TOKEN}`;
const nonce = crypto.randomUUID();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.API_PORT ?? 0),
  idleTimeout: 0,
  async fetch(request) {
    if (request.headers.get("Authorization") !== token)
      return new Response("Unauthorized", { status: 401 });
    const url = new URL(request.url);
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
      path = resolve(renderer, "index.html");
      file = Bun.file(path);
    }
    if (!(await file.exists()))
      return new Response("Renderer not built", { status: 503 });
    const headers = {
      "Content-Type": file.type,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
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
    return new Response(request.method === "HEAD" ? null : file, { headers });
  },
});
app.generations.start();
console.log(JSON.stringify({ event: "desktop-ready", port: server.port }));
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  app.generations.stop();
  void server.stop(true).finally(() => {
    sqlite.close();
    process.exit(0);
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
// The parent keeps stdin open. EOF also stops us if Electron crashes.
process.stdin.resume();
process.stdin.on("end", stop);
