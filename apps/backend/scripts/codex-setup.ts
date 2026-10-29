import { mkdir } from "node:fs/promises";
import { CODEX_VERSION } from "../../../packages/backend/src/modules/judges/codex";
import {
  codexInstallPath,
  migrateLegacyData,
} from "../../../packages/backend/src/shared/storage/paths";
const existing = Bun.which(process.env.CODEX_BIN ?? "codex");
if (existing) {
  const child = Bun.spawn([existing, "--version"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  await child.exited;
  console.log(
    "Existing Codex CLI found. Run bun run codex:doctor to check authentication and compatibility.",
  );
} else {
  migrateLegacyData();
  const prefix = codexInstallPath();
  await mkdir(prefix, { recursive: true });
  const install = Bun.spawn(
    ["npm", "install", "--prefix", prefix, `@openai/codex@${CODEX_VERSION}`],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (await install.exited) throw new Error("Codex installation failed.");
  console.log(
    `Installed the tested CLI locally. Run ${prefix}/node_modules/.bin/codex login, then bun run codex:doctor.`,
  );
}
