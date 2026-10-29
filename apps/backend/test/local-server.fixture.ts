import { startLocalServer } from "@repo/backend/local/server";
import { sessionSecretStore } from "@repo/backend/local/secrets";
const server = await startLocalServer({
  dataRoot: process.env.GRILL_ME_HOME!,
  token: process.env.DESKTOP_API_TOKEN!,
  origins: ["grill-me://app"],
  keyring: sessionSecretStore(),
});
console.log(JSON.stringify({ port: server.port }));
process.stdin.resume();
process.stdin.on(
  "end",
  () => void server.stop().finally(() => process.exit(0)),
);
