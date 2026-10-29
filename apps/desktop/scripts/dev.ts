import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";

const root = resolve(import.meta.dir, "..");
const inherited = { ...process.env };
// Terminals hosted by Electron may inherit this from their parent application.
delete inherited.ELECTRON_RUN_AS_NODE;
const args = [
  "bunx",
  "--no-install",
  "electron-vite",
  "dev",
  "--mode",
  "development",
];
if (process.platform === "linux") {
  const restricted = (path: string, value: string) => {
    try {
      return readFileSync(path, "utf8").trim() === value;
    } catch {
      return false;
    }
  };
  const namespacesBlocked =
    restricted("/proc/sys/kernel/apparmor_restrict_unprivileged_userns", "1") ||
    restricted("/proc/sys/kernel/unprivileged_userns_clone", "0");
  const electronPath = createRequire(import.meta.url)("electron") as string;
  const helper = statSync(resolve(dirname(electronPath), "chrome-sandbox"));
  if (namespacesBlocked && !(helper.uid === 0 && helper.mode & 0o4000)) {
    console.warn(
      "Development only: this Linux host restricts Chromium sandboxing; using --noSandbox. Renderer Node access remains disabled.",
    );
    args.push("--noSandbox");
  }
}
const dev = Bun.spawn(args, {
  cwd: root,
  env: {
    ...inherited,
    DESKTOP_DEV_BUN: process.execPath,
    DESKTOP_DEV_API_TOKEN: randomBytes(32).toString("hex"),
    DESKTOP_DEV_API_PORT: inherited.DESKTOP_DEV_API_PORT ?? "18027",
  },
  stdout: "inherit",
  stderr: "inherit",
});
const stop = () => dev.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.exitCode = await dev.exited;
