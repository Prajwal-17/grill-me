import { startLocalServer } from "@repo/backend/local/server";
import { memorySecretStore } from "./fixtures/memory-secret-store";
const server = await startLocalServer({
  dataRoot: process.env.GRILL_ME_HOME!,
  token: process.env.DESKTOP_API_TOKEN!,
  origins: ["grill-me://app"],
  keyring: memorySecretStore(),
});
console.log(JSON.stringify({ port: server.port }));
process.stdin.resume();
process.stdin.on(
  "end",
  () => void server.stop().finally(() => process.exit(0)),
);
