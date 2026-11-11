import { createHash } from "node:crypto";
import { chmod, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
export interface SecretStore {
  get(id: string): Promise<string | undefined>;
  set(id: string, value: string): Promise<void>;
  remove(id: string): Promise<void>;
  status(): Promise<{ available: boolean; message: string }>;
}
export function fileSecretStore(dataRoot: string): SecretStore {
  const path = join(dataRoot, "secrets.json");
  let secrets: Record<string, string> | undefined;
  let tail: Promise<unknown> = Promise.resolve();
  function exclusive<T>(work: () => Promise<T>) {
    const pending = tail.then(work);
    tail = pending.catch(() => {});
    return pending;
  }
  const load = async () => {
    if (secrets) return secrets;
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      secrets = {};
      return secrets;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error("The local credential file is not valid JSON.", {
        cause: error,
      });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("The local credential file has an invalid format.");
    secrets = Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    // Repair permissions if the file was created by an older version or tool.
    await chmod(path, 0o600).catch(() => {});
    return secrets;
  };
  const persist = async (next: Record<string, string>) => {
    const temp = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, {
        mode: 0o600,
      });
      await chmod(temp, 0o600);
      await rename(temp, path);
      await chmod(path, 0o600);
    } catch (error) {
      await unlink(temp).catch(() => {});
      throw error;
    }
  };
  return {
    get: (id) => exclusive(async () => (await load())[id]),
    set: (id, value) =>
      exclusive(async () => {
        const next = { ...(await load()), [id]: value };
        await persist(next);
        secrets = next;
      }),
    remove: (id) =>
      exclusive(async () => {
        const current = await load();
        if (!(id in current)) return;
        const next = { ...current };
        delete next[id];
        await persist(next);
        secrets = next;
      }),
    status: () =>
      exclusive(async () => {
        try {
          await load();
          return {
            available: true,
            message:
              "Saved keys are stored in plaintext in this app's data folder with owner-only permissions (0600).",
          };
        } catch {
          return {
            available: false,
            message:
              "The local credential file is unreadable. Fix or remove it so keys can be saved.",
          };
        }
      }),
  };
}
export function nativeSecretStore(
  dataRoot: string,
  modulePath?: string,
): SecretStore {
  const service =
    (process.env.GRILL_DESKTOP_CHANNEL === "production"
      ? "grill-me."
      : "grill-me-dev.") +
    createHash("sha256").update(dataRoot).digest("hex").slice(0, 24);
  let nativeBinding: typeof import("@napi-rs/keyring") | undefined;
  const entry = async (id: string) => {
    if (!nativeBinding) {
      if (modulePath?.endsWith(".node")) {
        // Compiled Bun executables cannot resolve external .node files through
        // the package's JS loader. Load the packaged absolute binding directly.
        const binding = { exports: {} };
        process.dlopen(
          binding as Parameters<typeof process.dlopen>[0],
          modulePath,
        );
        nativeBinding = binding.exports as typeof import("@napi-rs/keyring");
      } else {
        nativeBinding = (await import(
          modulePath ?? "@napi-rs/keyring"
        )) as typeof import("@napi-rs/keyring");
      }
    }
    const { AsyncEntry } = nativeBinding;
    // A kernel keyring fallback is not persistent across reboot. Require Secret Service.
    if (!["linux", "darwin"].includes(process.platform))
      throw new Error("Native credential storage is unsupported on this OS.");
    return new AsyncEntry(
      service,
      id,
      process.platform === "linux"
        ? { linux: { store: "secret-service" } }
        : undefined,
    );
  };
  return {
    get: async (id) => (await (await entry(id)).getPassword()) ?? undefined,
    set: async (id, value) => {
      await (await entry(id)).setPassword(value);
    },
    remove: async (id) => {
      const item = await entry(id);
      if ((await item.getPassword()) != null) await item.deletePassword();
    },
    status: async () => {
      try {
        await (await entry("availability-probe")).getPassword();
        return {
          available: true,
          message: `Saved keys are protected by your ${process.platform === "darwin" ? "macOS Keychain" : "Linux keyring"}.`,
        };
      } catch {
        return {
          available: false,
          message: `The ${process.platform === "darwin" ? "macOS Keychain" : "Linux keyring"} is locked or unavailable. Unlock it to save keys, or choose the owner-only plaintext file.`,
        };
      }
    },
  };
}

// Preserve the existing Linux API and credential namespace.
export const linuxSecretStore = nativeSecretStore;
