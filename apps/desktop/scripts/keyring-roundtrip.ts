// Run inside dbus-run-session. Every keyring file and D-Bus service is disposable.
import { mkdtemp, mkdir, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linuxSecretStore } from "@repo/backend/local/secrets";
const root = await mkdtemp(join(tmpdir(), "grill-keyring-test-"));
const control = join(root, "control");
await mkdir(control, { mode: 0o700 });
const env = {
  ...process.env,
  XDG_DATA_HOME: join(root, "data"),
  XDG_CONFIG_HOME: join(root, "config"),
  XDG_CACHE_HOME: join(root, "cache"),
  GNOME_KEYRING_CONTROL: control,
};
const daemon = Bun.spawn(
  [
    "gnome-keyring-daemon",
    "--foreground",
    "--unlock",
    "--components=secrets",
    "--control-directory",
    control,
  ],
  { env, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
);
daemon.stdin.write("disposable-test-password");
daemon.stdin.end();
try {
  const ready = Bun.spawn(
    [
      "gdbus",
      "wait",
      "--session",
      "--timeout",
      "10",
      "org.freedesktop.secrets",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  if ((await ready.exited) !== 0)
    throw new Error("Private Secret Service did not start.");
  const store = linuxSecretStore(root);
  const id = crypto.randomUUID();
  const secret = "native-keyring-fixture-" + crypto.randomUUID();
  if (!(await store.status()).available)
    throw new Error("Private keyring is not available.");
  await store.set(id, secret);
  if ((await linuxSecretStore(root).get(id)) !== secret)
    throw new Error("Keyring readback failed.");
  const files = await readdir(join(root, "data/keyrings"), { recursive: true });
  for (const name of files) {
    const path = join(root, "data/keyrings", name);
    try {
      if ((await readFile(path)).includes(secret))
        throw new Error("The secret was stored as plaintext.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EISDIR") throw error;
    }
  }
  await store.remove(id);
  if ((await store.get(id)) !== undefined)
    throw new Error("Key removal failed.");
  console.log(
    "Native Secret Service round-trip passed using a private D-Bus session and encrypted disposable keyring.",
  );
} finally {
  daemon.kill("SIGTERM");
  await daemon.exited;
  await rm(root, { recursive: true, force: true });
}
