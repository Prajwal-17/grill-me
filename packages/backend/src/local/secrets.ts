import { createHash } from "node:crypto";
export interface SecretStore {
  get(id: string): Promise<string | undefined>;
  set(id: string, value: string): Promise<void>;
  remove(id: string): Promise<void>;
  status(): Promise<{ available: boolean; message: string }>;
}
export function sessionSecretStore(): SecretStore {
  const secrets = new Map<string, string>();
  return {
    get: async (id) => secrets.get(id),
    set: async (id, value) => {
      secrets.set(id, value);
    },
    remove: async (id) => {
      secrets.delete(id);
    },
    status: async () => ({
      available: true,
      message: "Keys are held in memory until the backend closes.",
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
          message: `The ${process.platform === "darwin" ? "macOS Keychain" : "Linux keyring"} is locked or unavailable. Unlock it to save keys, or choose session only.`,
        };
      }
    },
  };
}

// Preserve the existing Linux API and credential namespace.
export const linuxSecretStore = nativeSecretStore;
