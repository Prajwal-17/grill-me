import { startLocalServer } from "@repo/backend/local/server";
if (
  !["development", "production"].includes(
    process.env.GRILL_DESKTOP_CHANNEL ?? "",
  ) ||
  process.env.APP_ENV !== process.env.GRILL_DESKTOP_CHANNEL ||
  !process.env.DESKTOP_API_TOKEN ||
  !process.env.GRILL_ME_SQLITE_PATH
)
  throw new Error("Start Grill Me through the Electron application.");
const server = await startLocalServer({
  dataRoot: process.env.GRILL_ME_HOME!,
  token: process.env.DESKTOP_API_TOKEN,
  port: Number(process.env.API_PORT ?? 0),
  origins: [process.env.DESKTOP_WEB_ORIGIN ?? "grill-me://app", "null"],
  rendererRoot: process.env.DESKTOP_RENDERER_ROOT,
  keyringModule: process.env.GRILL_KEYRING_MODULE,
});
console.log(JSON.stringify({ event: "desktop-ready", port: server.port }));
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  void server.stop().finally(() => process.exit(0));
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.stdin.resume();
process.stdin.on("end", stop);
