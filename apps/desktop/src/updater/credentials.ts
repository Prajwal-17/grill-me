import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export type UpdateCredentials = { email: string; token: string };
export type CredentialStore = {
  load(): Promise<UpdateCredentials | null>;
  save(value: UpdateCredentials): Promise<"saved-token" | "session-token">;
  clear(): Promise<void>;
};
export function updateCredentialStore(
  root: string,
  crypto: {
    available(): boolean;
    encrypt(value: string): Buffer;
    decrypt(value: Buffer): string;
  },
): CredentialStore {
  const path = join(root, "update-credentials.json");
  const schema = z.object({
    email: z.email(),
    token: z.string().min(1).max(8192),
  });
  let session: UpdateCredentials | null = null;
  return {
    async load() {
      if (session) return session;
      let encrypted: Buffer;
      try {
        encrypted = Buffer.from(await readFile(path, "utf8"), "base64");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new Error(
          "Cannot read update credentials. Enter your token again in Settings → About.",
          { cause: error },
        );
      }
      if (!crypto.available())
        throw new Error(
          "Unlock your system credential store, or enter an update token for this session.",
        );
      try {
        return schema.parse(JSON.parse(crypto.decrypt(encrypted)));
      } catch {
        throw new Error(
          "Cannot unlock the saved update token. Enter it again in Settings → About.",
        );
      }
    },
    async save(value) {
      schema.parse(value);
      if (!crypto.available()) {
        await rm(path, { force: true });
        session = value;
        return "session-token";
      }
      const temp = path + ".tmp";
      try {
        await writeFile(
          temp,
          crypto.encrypt(JSON.stringify(value)).toString("base64"),
          { mode: 0o600 },
        );
        await rename(temp, path);
      } catch {
        await rm(temp, { force: true }).catch(() => {});
        throw new Error(
          "Could not securely save the update token. Unlock the system credential store and retry.",
        );
      }
      session = value;
      return "saved-token";
    },
    async clear() {
      await rm(path, { force: true });
      session = null;
    },
  };
}
