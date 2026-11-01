import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildTarget } from "../src/build-target";
import { desktopIdentity } from "../src/identity";
const [platform, arch, channel] = process.argv.slice(2);
if (channel !== "development" && channel !== "production")
  throw new Error("Choose development or production packaging.");
buildTarget(platform ?? "", arch ?? "");
async function run(args: string[]) {
  const child = Bun.spawn(args, {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
  });
  if (await child.exited)
    throw new Error(`Packaging step failed: ${args.join(" ")}`);
}
await run([
  process.execPath,
  "run",
  channel === "development" ? "build:dev" : "build:prod",
]);
if (platform === "darwin")
  await run([process.execPath, "run", "scripts/generate-icons.ts"]);
await run([
  "bunx",
  "--no-install",
  "electron-builder",
  platform === "darwin" ? "--mac" : "--linux",
  platform === "darwin" ? "dmg" : "deb",
  `--${arch}`,
  "--config",
  channel === "development"
    ? "electron-builder.dev.yml"
    : "electron-builder.yml",
  "--publish",
  "never",
]);
// The updater verifies this signature before replacing a macOS installation.
// Check the same condition on each native runner before publishing its DMG.
if (platform === "darwin")
  await run([
    "/usr/bin/codesign",
    "--verify",
    "--deep",
    "--strict",
    join(
      "release",
      channel === "production" ? "prod" : "dev",
      arch === "arm64" ? "mac-arm64" : "mac",
      `${desktopIdentity(channel).executableName}.app`,
    ),
  ]);
