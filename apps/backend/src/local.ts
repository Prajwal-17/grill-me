import { fileURLToPath } from "node:url";
import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  unlinkSync,
  readFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { backendEnvironment } from "@repo/backend/local/environment";
import { startLocalServer } from "@repo/backend/local/server";
const root = resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
  process.env.GRILL_LOCAL_HOME ?? ".data/standalone-dev",
);
const port = Number(process.env.LOCAL_BACKEND_PORT ?? 18028);
const webPort = Number(process.env.LOCAL_WEB_PORT ?? 8028);
const token = randomBytes(32).toString("hex");
const env = backendEnvironment({
  dataRoot: root,
  token,
  port,
  rendererRoot: "",
  settings: {},
});
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, env);
const server = await startLocalServer({
  dataRoot: root,
  token,
  port,
  origins: [`http://127.0.0.1:${webPort}`, `http://localhost:${webPort}`],
});
const connectionPath = join(root, "connection.json");
mkdirSync(root, { recursive: true, mode: 0o700 });
const connection = JSON.stringify({
  url: `http://127.0.0.1:${server.port}`,
  token,
});
writeFileSync(connectionPath, connection, { mode: 0o600 });
chmodSync(connectionPath, 0o600);
console.log(
  `Local SQLite backend ready at http://127.0.0.1:${server.port}. UI: http://127.0.0.1:${webPort}`,
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try {
    if (readFileSync(connectionPath, "utf8") === connection)
      unlinkSync(connectionPath);
  } catch {
    /* already removed */
  }
  await server.stop();
  process.exit(0);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
