import { spawn, type ChildProcess } from "node:child_process";
const children: ChildProcess[] = [];
let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      if (child.pid) process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already stopped */
    }
  }
  process.exitCode = code;
};
for (const args of [
  ["run", "dev:backend"],
  ["run", "dev:ui"],
]) {
  const child = spawn(process.execPath, args, {
    cwd: new URL("..", import.meta.url),
    env: process.env,
    detached: true,
    stdio: "inherit",
  });
  children.push(child);
  child.once("error", () => stop(1));
  child.once("exit", (code) => stop(code ?? 1));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
