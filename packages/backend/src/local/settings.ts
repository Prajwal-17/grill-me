import { Database } from "bun:sqlite";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "dotenv";
import { z } from "zod";
import {
  providerSchema,
  providerInputSchema,
  runtimeSettingsSchema,
  type ProviderInput,
  type LocalSettings,
  type RuntimeSettings,
  type SettingsApi,
} from "@repo/contracts";
import { AppError } from "../shared/errors/app-error";
import { changed } from "./changes";
import {
  linuxSecretStore,
  sessionSecretStore,
  type SecretStore,
} from "./secrets";
const recordSchema = providerSchema.extend({
  storage: z.enum(["keyring", "session"]),
  credential: z.string().uuid().optional(),
});
const documentSchema = z.object({
  version: z.literal(1),
  providers: z.array(recordSchema),
  activeProviderId: z.string().uuid().nullable(),
  runtime: runtimeSettingsSchema,
  migrated: z.boolean().default(false),
});
type Document = z.infer<typeof documentSchema>;
export function createSettingsService(
  root: string,
  options: {
    keyring?: SecretStore;
    session?: SecretStore;
    modulePath?: string;
  } = {},
) {
  const db = new Database(join(root, "settings.sqlite"), {
    create: true,
    strict: true,
  });
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL)",
  );
  void chmod(join(root, "settings.sqlite"), 0o600);
  const keyring = options.keyring ?? linuxSecretStore(root, options.modulePath);
  const session = options.session ?? sessionSecretStore();
  const saved = db.query("SELECT document FROM settings WHERE id=1").get() as {
    document: string;
  } | null;
  let document: Document = saved
    ? documentSchema.parse(JSON.parse(saved.document))
    : {
        version: 1,
        providers: [],
        activeProviderId: null,
        runtime: runtimeSettingsSchema.parse({}),
        migrated: false,
      };
  let sessionImported = false;
  let tail: Promise<unknown> = Promise.resolve();
  function exclusive<T>(work: () => Promise<T>) {
    const pending = tail.then(work);
    tail = pending.catch(() => {});
    return pending;
  }
  const store = (mode: "keyring" | "session") =>
    mode === "keyring" ? keyring : session;
  const persist = (next: Document) => {
    db.query(
      "INSERT INTO settings(id,document) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document",
    ).run(JSON.stringify(next));
    document = next;
    changed("settings");
  };
  const legacyPath = join(root, "backend.env");
  const legacy = async () => {
    try {
      return parse(await readFile(legacyPath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
  const protect = async (mode: "keyring" | "session", value: string) => {
    const id = crypto.randomUUID();
    try {
      await store(mode).set(id, value);
      if ((await store(mode).get(id)) !== value)
        throw new Error("Key verification failed");
      return id;
    } catch {
      await store(mode)
        .remove(id)
        .catch(() => {});
      throw new AppError(
        "KEYRING_UNAVAILABLE",
        "The key could not be saved. Unlock your Linux keyring or choose session only.",
        503,
        true,
      );
    }
  };
  const get: SettingsApi["get"] = async () => {
    const status = await keyring.status();
    const providers = await Promise.all(
      document.providers.map(async ({ credential, ...provider }) => ({
        ...provider,
        hasKey: credential
          ? await store(provider.storage)
              .get(credential)
              .then(Boolean)
              .catch(() => false)
          : false,
      })),
    );
    const old = !document.migrated ? await legacy() : null;
    return {
      providers,
      activeProviderId: document.activeProviderId,
      runtime: document.runtime,
      keyring: status,
      migration: {
        pending: Boolean(old) && !sessionImported,
        message: old
          ? "Existing backend.env settings can be imported. A plaintext key is removed only after verified keyring storage."
          : null,
      },
    } satisfies LocalSettings;
  };
  async function saveProvider(input: ProviderInput) {
    return exclusive(async () => {
      const parsed = providerInputSchema.parse(input);
      const { apiKey, removeKey, ...provider } = parsed;
      const previous = document.providers.find((p) => p.id === provider.id);
      let credential = previous?.credential;
      let mode = previous?.storage ?? provider.storage;
      if (apiKey) {
        mode = provider.storage;
        credential = await protect(mode, apiKey);
      } else if (removeKey) {
        credential = undefined;
        mode = provider.storage;
      } else if (
        previous?.credential &&
        previous.storage !== provider.storage
      ) {
        let value: string | undefined;
        try {
          value = await store(previous.storage).get(previous.credential);
        } catch {
          throw new AppError(
            "KEYRING_UNAVAILABLE",
            "Unlock your keyring before changing key storage.",
            503,
            true,
          );
        }
        if (!value)
          throw new AppError(
            "KEY_UNAVAILABLE",
            "Enter the API key again to change its storage.",
            400,
          );
        mode = provider.storage;
        credential = await protect(mode, value);
      }
      const record = { ...provider, storage: mode, credential };
      try {
        persist({
          ...document,
          providers: [
            ...document.providers.filter((p) => p.id !== record.id),
            record,
          ],
          activeProviderId: document.activeProviderId ?? record.id,
        });
      } catch (error) {
        if (credential && credential !== previous?.credential)
          await store(mode)
            .remove(credential)
            .catch(() => {});
        throw error;
      }
      if (previous?.credential && previous.credential !== credential)
        await store(previous.storage)
          .remove(previous.credential)
          .catch(() => {});
      return get();
    });
  }
  const api: SettingsApi = {
    get,
    saveProvider,
    removeProvider: (id) =>
      exclusive(async () => {
        z.string().uuid().parse(id);
        const previous = document.providers.find((p) => p.id === id);
        persist({
          ...document,
          providers: document.providers.filter((p) => p.id !== id),
          activeProviderId:
            document.activeProviderId === id ? null : document.activeProviderId,
        });
        if (previous?.credential)
          await store(previous.storage)
            .remove(previous.credential)
            .catch(() => {});
        return get();
      }),
    activateProvider: (id) =>
      exclusive(async () => {
        if (id && !document.providers.some((p) => p.id === id))
          throw new AppError(
            "PROVIDER_NOT_FOUND",
            "Choose an existing provider.",
            404,
          );
        persist({ ...document, activeProviderId: id });
        return get();
      }),
    saveRuntime: (input) =>
      exclusive(async () => {
        persist({ ...document, runtime: runtimeSettingsSchema.parse(input) });
        applyRuntime();
        return get();
      }),
    testProvider: async (id) => {
      const value = await snapshot(id);
      const url = new URL(value.endpoint + "/models");
      try {
        const response = await fetch(url, {
          headers: value.apiKey
            ? { Authorization: `Bearer ${value.apiKey}` }
            : {},
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        });
        await response.body?.cancel();
        return {
          ok: response.ok,
          message: response.ok
            ? "Connection successful."
            : `Provider returned HTTP ${response.status}. Check its endpoint and API key.`,
        };
      } catch {
        return {
          ok: false,
          message:
            "Cannot reach the provider. Check the endpoint and whether the provider is running.",
        };
      }
    },
    migrateLegacy: async (mode) => {
      const old = await legacy();
      if (!old || document.migrated) return get();
      // Session-only imports leave the original file intact so keys survive restart.
      await saveProvider({
        id: crypto.randomUUID(),
        name: "Imported provider",
        endpoint: old.LLM_BASE_URL ?? "http://127.0.0.1:20128/v1",
        model: old.LLM_MODEL ?? "auto",
        storage: mode,
        ...(old.LLM_API_KEY ? { apiKey: old.LLM_API_KEY } : {}),
      });
      await api.saveRuntime({
        codexBin: old.CODEX_BIN ?? "",
        codexModel: old.CODEX_MODEL ?? "",
        projectsRoot: old.PROJECTS_ROOT ?? "",
        contextTokens: Number(old.DIRECT_REVIEW_CONTEXT_TOKENS ?? 12000),
        judgeTimeoutMs: Number(old.JUDGE_TIMEOUT_MS ?? 900000),
      });
      if (mode === "keyring") {
        const text = await readFile(legacyPath, "utf8");
        await writeFile(
          legacyPath,
          text.replace(
            /^\s*(?:export\s+)?LLM_API_KEY\s*=.*$/gm,
            "# LLM_API_KEY migrated to the Linux keyring",
          ),
          { mode: 0o600 },
        );
        persist({ ...document, migrated: true });
      }
      if (mode === "session") sessionImported = true;
      return get();
    },
  };
  function applyRuntime() {
    const r = document.runtime;
    for (const [k, v] of Object.entries({
      CODEX_BIN: r.codexBin,
      CODEX_MODEL: r.codexModel,
      PROJECTS_ROOT: r.projectsRoot,
      DIRECT_REVIEW_CONTEXT_TOKENS: String(r.contextTokens),
      JUDGE_TIMEOUT_MS: String(r.judgeTimeoutMs),
    })) {
      if (v) process.env[k] = v;
      else delete process.env[k];
    }
  }
  async function snapshot(id = document.activeProviderId) {
    const provider = document.providers.find((p) => p.id === id);
    if (!provider)
      throw new AppError(
        "MODEL_NOT_CONFIGURED",
        "Add and select an AI provider in Settings.",
        503,
      );
    let apiKey: string | undefined;
    if (provider.credential) {
      try {
        apiKey = await store(provider.storage).get(provider.credential);
      } catch {
        throw new AppError(
          "KEYRING_UNAVAILABLE",
          "Unlock your Linux keyring to use this provider.",
          503,
          true,
        );
      }
      if (!apiKey)
        throw new AppError(
          "KEY_UNAVAILABLE",
          "Enter this provider's API key again in Settings.",
          503,
        );
    }
    return { ...provider, apiKey };
  }
  applyRuntime();
  return { ...api, snapshot, applyRuntime, close: () => db.close() };
}
export type SettingsService = ReturnType<typeof createSettingsService>;
