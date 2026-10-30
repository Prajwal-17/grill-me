import { spawn } from "node:child_process";
import { buildTarget } from "../src/build-target";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";

buildTarget(process.platform, process.arch);
const root = resolve(import.meta.dir, "..");
const inherited = { ...process.env };
// Terminals hosted by Electron may inherit this from their parent application.
delete inherited.ELECTRON_RUN_AS_NODE;
const args = [
  "x",
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
const dev = spawn(process.execPath, args, {
  detached: true,
  cwd: root,
  env: {
    ...inherited,
    DESKTOP_DEV_BUN: process.execPath,
    DESKTOP_DEV_API_TOKEN: randomBytes(32).toString("hex"),
    DESKTOP_DEV_API_PORT: inherited.DESKTOP_DEV_API_PORT ?? "18027",
  },
  stdio: "inherit",
});
let stopping = false;
const signal = (value: NodeJS.Signals) => {
  if (!dev.pid) return;
  try {
    process.kill(-dev.pid, value);
  } catch {
    /* already exited */
  }
};
const stop = () => {
  if (stopping) return;
  stopping = true;
  signal("SIGTERM");
  setTimeout(() => signal("SIGKILL"), 3000);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
dev.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
dev.once("exit", (code) => {
  process.exitCode = code ?? (stopping ? 0 : 1);
});
