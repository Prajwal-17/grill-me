import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { access, lstat, mkdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { UpdateError } from "./github";
const execute = promisify(execFile);
export const shellQuote = (value: string) =>
  "'" + value.replaceAll("'", "'\\''") + "'";

// Contains paths only, never credentials. Rename in the same parent makes replacement
// atomic; keep the previous app until the replacement is in place, and roll back on failure.
export function macInstallScript(input: {
  pid: number;
  source: string;
  destination: string;
  stage: string;
  log: string;
}) {
  const destination = shellQuote(input.destination),
    source = shellQuote(input.source);
  const backup = shellQuote(input.destination + ".grill-update-backup");
  const replacement = shellQuote(input.destination + ".grill-update-new");
  return `#!/bin/sh
set -eu
exec >>${shellQuote(input.log)} 2>&1
attempt=0
while kill -0 ${input.pid} 2>/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -gt 60 ]; then exit 1; fi
  sleep 1
done
if [ -e ${backup} ] || [ -e ${replacement} ]; then exit 1; fi
saved=0
recover() {
  status=$?
  trap - EXIT
  if [ "$status" -ne 0 ]; then
    if [ "$saved" -eq 1 ] && [ -d ${backup} ]; then
      /bin/rm -rf ${destination}
      /bin/mv ${backup} ${destination}
    fi
    /bin/rm -rf ${replacement}
    /usr/bin/open ${destination} || true
  fi
  exit "$status"
}
trap recover EXIT
/usr/bin/ditto ${source} ${replacement}
/bin/mv ${destination} ${backup}
saved=1
/bin/mv ${replacement} ${destination}
/usr/bin/open ${destination}
trap - EXIT
/bin/rm -rf ${backup} ${shellQuote(input.stage)}
`;
}
export async function installNativeUpdate(input: {
  platform: string;
  installer: string;
  version: string;
  root: string;
  executable: string;
  appId: string;
  bundleName: string;
  quit(): void;
  relaunch(): void;
}) {
  if (input.platform === "linux") {
    try {
      await execute(
        "/usr/bin/pkexec",
        ["/usr/bin/dpkg", "--install", input.installer],
        {
          timeout: 5 * 60 * 1000,
          maxBuffer: 1024 * 1024,
        },
      );
    } catch {
      throw new UpdateError(
        "Installation was cancelled or failed. Approve the administrator prompt and retry. If pkexec is unavailable, install the downloaded .deb using your package manager.",
      );
    }
    input.relaunch();
    input.quit();
    return;
  }
  if (input.platform !== "darwin")
    throw new UpdateError(
      "Automatic installation is unavailable on this platform.",
    );
  const destination = resolve(dirname(input.executable), "../..");
  if (
    basename(destination) !== input.bundleName ||
    destination.startsWith("/Volumes/")
  )
    throw new UpdateError(
      "Move Grill Me into Applications before installing an update.",
    );
  try {
    await access(dirname(destination), constants.W_OK);
  } catch {
    throw new UpdateError(
      "This app location is not writable. Move Grill Me into your user Applications folder, then retry the update.",
    );
  }
  for (const suffix of [".grill-update-backup", ".grill-update-new"]) {
    const existing = await lstat(destination + suffix).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (existing)
      throw new UpdateError(
        "A previous update left a backup next to the app. Move it aside before retrying, or reinstall the DMG manually.",
      );
  }
  const stage = join(input.root, "updates", "mac-stage");
  const mount = join(input.root, "updates", "mac-mount");
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true, mode: 0o700 });
  await mkdir(mount, { recursive: true, mode: 0o700 });
  const source = join(stage, input.bundleName);
  let mounted = false;
  try {
    await execute(
      "/usr/bin/hdiutil",
      [
        "attach",
        "-readonly",
        "-nobrowse",
        "-mountpoint",
        mount,
        input.installer,
      ],
      { timeout: 60000 },
    );
    mounted = true;
    await execute("/usr/bin/ditto", [join(mount, input.bundleName), source], {
      timeout: 120000,
    });
    const plist = join(source, "Contents", "Info.plist");
    const identifier = await execute("/usr/libexec/PlistBuddy", [
      "-c",
      "Print :CFBundleIdentifier",
      plist,
    ]);
    const version = await execute("/usr/libexec/PlistBuddy", [
      "-c",
      "Print :CFBundleShortVersionString",
      plist,
    ]);
    if (
      identifier.stdout.trim() !== input.appId ||
      version.stdout.trim() !== input.version
    )
      throw new Error("Bundle identity mismatch");
    await execute(
      "/usr/bin/codesign",
      ["--verify", "--deep", "--strict", source],
      { timeout: 60000 },
    );
  } catch {
    await rm(stage, { recursive: true, force: true });
    throw new UpdateError(
      "Could not prepare the macOS update. The installed app is unchanged. Retry or reinstall the downloaded DMG manually.",
    );
  } finally {
    if (mounted)
      await execute("/usr/bin/hdiutil", ["detach", mount], {
        timeout: 30000,
      }).catch(() => {});
  }
  const script = join(input.root, "updates", "install-mac.sh");
  const log = join(input.root, "update-install.log");
  await writeFile(
    script,
    macInstallScript({ pid: process.pid, source, destination, stage, log }),
    { mode: 0o700 },
  );
  const child = spawn("/bin/sh", [script], {
    detached: true,
    stdio: "ignore",
    cwd: input.root,
  });
  await new Promise<void>((done, fail) => {
    child.once("spawn", done);
    child.once("error", fail);
  });
  child.unref();
  input.quit();
}
