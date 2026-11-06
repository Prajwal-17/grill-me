import { Database } from "bun:sqlite";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "dotenv";
import { z } from "zod";
import {
  providerSchema,
  providerInputSchema,
  runtimeSettingsSchema,
  defaultProviderSettings,
  type ProviderInput,
  type LocalSettings,
  type RuntimeSettings,
  type SettingsApi,
} from "@repo/contracts";
import { AppError } from "../shared/errors/app-error";
import { changed } from "./changes";
import type { CliProviders } from "./providers";
import { apiModels } from "./providers/api";
import { providerError } from "./providers/common";
import {
  nativeSecretStore,
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
  disconnectedProviders: z.array(z.string().uuid()).default([]),
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
    cli?: CliProviders;
    channel?: "development" | "production";
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
  const keyring =
    options.keyring ?? nativeSecretStore(root, options.modulePath);
  const session = options.session ?? sessionSecretStore();
  const providerDefaults = defaultProviderSettings(
    options.channel ?? process.env.GRILL_DESKTOP_CHANNEL ?? "development",
  );
  const saved = db.query("SELECT document FROM settings WHERE id=1").get() as {
    document: string;
  } | null;
  let document: Document = saved
    ? documentSchema.parse(JSON.parse(saved.document))
    : {
        version: 1,
        providers: [],
        activeProviderId: null,
        disconnectedProviders: [],
        runtime: runtimeSettingsSchema.parse({}),
        migrated: false,
      };
  for (const id of document.disconnectedProviders) options.cli?.disconnect(id);
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
        "The key could not be saved. Unlock your system credential store or choose session only.",
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
        enabled:
          provider.enabled &&
          !document.disconnectedProviders.includes(provider.id),
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
      providerDefaults,
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
      if (previous && previous.kind !== provider.kind)
        throw new AppError(
          "PROVIDER_KIND_IMMUTABLE",
          "Add a new provider to use a different connection type.",
          400,
        );
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
      const record = {
        ...provider,
        // Existing on/off state changes only through the dedicated switch action.
        // A stale settings form must not re-enable a provider after it was turned off.
        enabled: previous?.enabled ?? provider.enabled,
        endpoint: provider.kind === "openai" ? provider.endpoint : undefined,
        storage: mode,
        credential,
      };
      if (
        previous &&
        (previous.binaryPath !== provider.binaryPath ||
          previous.codexHome !== provider.codexHome)
      )
        options.cli?.reset(provider.id);
      try {
        persist({
          ...document,
          providers: [
            ...document.providers.filter((p) => p.id !== record.id),
            record,
          ],
          activeProviderId:
            document.activeProviderId === record.id && !record.enabled
              ? null
              : (document.activeProviderId ??
                (!record.enabled ||
                document.disconnectedProviders.includes(record.id)
                  ? null
                  : record.id)),
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
        options.cli?.disconnect(id);
        persist({
          ...document,
          providers: document.providers.filter((p) => p.id !== id),
          disconnectedProviders: document.disconnectedProviders.filter(
            (p) => p !== id,
          ),
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
        const selected = document.providers.find((p) => p.id === id);
        if (selected?.enabled === false)
          throw new AppError(
            "PROVIDER_DISABLED",
            "Turn this provider on before selecting it.",
            409,
          );
        if (selected && selected.kind !== "openai")
          await options.cli?.connect(selected);
        persist({
          ...document,
          activeProviderId: id,
          disconnectedProviders: document.disconnectedProviders.filter(
            (p) => p !== id,
          ),
        });
        return get();
      }),
    saveRuntime: (input) =>
      exclusive(async () => {
        persist({ ...document, runtime: runtimeSettingsSchema.parse(input) });
        applyRuntime();
        return get();
      }),
    testProvider: async (id) => {
      try {
        const value = await snapshot(id);
        if (value.kind !== "openai") {
          const status = await options.cli!.status(value);
          if (!status.connected)
            return { ok: false, message: status.message, code: status.code };
          const model =
            value.model === "auto"
              ? status.models[0]
              : status.models.find((m) => m.id === value.model);
          if (!model)
            return {
              ok: false,
              code: "PROVIDER_MODEL_UNAVAILABLE",
              message:
                "The saved model is unavailable. Choose an available model in Settings.",
            };
          if (
            value.kind === "codex" &&
            value.reasoningEffort &&
            model.reasoningEfforts &&
            !model.reasoningEfforts.includes(value.reasoningEffort)
          )
            return {
              ok: false,
              code: "PROVIDER_REASONING_UNSUPPORTED",
              message:
                "The saved reasoning effort is unavailable for this model. Choose a supported effort in Settings.",
            };
          return { ok: true, message: status.message };
        }
        await apiModels(value);
        return {
          ok: true,
          message:
            "Connection successful. Model access is checked when making a request.",
        };
      } catch (error) {
        const failure = providerError(error, "API provider");
        return { ok: false, message: failure.message, code: failure.code };
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
        contextTokens: Number(old.DIRECT_REVIEW_CONTEXT_TOKENS ?? 12000),
        judgeTimeoutMs: Number(old.JUDGE_TIMEOUT_MS ?? 900000),
      });
      if (mode === "keyring") {
        const text = await readFile(legacyPath, "utf8");
        await writeFile(
          legacyPath,
          text.replace(
            /^\s*(?:export\s+)?LLM_API_KEY\s*=.*$/gm,
            "# LLM_API_KEY migrated to the system credential store",
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
        "Turn on Codex, OpenCode, or OmniRoute in Settings → Providers, then select one for AI requests.",
        503,
      );
    if (
      !provider.enabled ||
      document.disconnectedProviders.includes(provider.id)
    )
      throw new AppError(
        "PROVIDER_DISABLED",
        "This provider is turned off. Enable it in Settings → Providers.",
        503,
      );
    let apiKey: string | undefined;
    if (provider.credential) {
      try {
        apiKey = await store(provider.storage).get(provider.credential);
      } catch {
        throw new AppError(
          "KEYRING_UNAVAILABLE",
          "Unlock your system credential store to use this provider.",
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
  async function provider(id: string) {
    const value = document.providers.find((p) => p.id === id);
    if (!value)
      throw new AppError(
        "PROVIDER_NOT_FOUND",
        "Choose an existing provider.",
        404,
      );
    if (value.kind === "openai")
      throw new AppError(
        "PROVIDER_TYPE_INVALID",
        "This action requires a CLI provider.",
        400,
      );
    return value;
  }
  return {
    ...api,
    snapshot,
    runtime: () => ({ ...document.runtime }),
    provider,
    setProviderEnabled: (id: string, enabled: boolean) =>
      exclusive(async () => {
        const selected = document.providers.find((p) => p.id === id);
        if (!selected)
          throw new AppError(
            "PROVIDER_NOT_FOUND",
            "Choose an existing provider.",
            404,
          );
        persist({
          ...document,
          providers: document.providers.map((p) =>
            p.id === id ? { ...p, enabled } : p,
          ),
          disconnectedProviders: enabled
            ? document.disconnectedProviders.filter((p) => p !== id)
            : [...new Set([...document.disconnectedProviders, id])],
          activeProviderId: enabled
            ? (document.activeProviderId ?? id)
            : document.activeProviderId === id
              ? null
              : document.activeProviderId,
        });
        if (enabled) options.cli?.enable(id);
        else options.cli?.disconnect(id);
        return get();
      }),
    models: async (id: string) => {
      const value = await snapshot(id);
      if (value.kind === "openai") return apiModels(value);
      const status = await options.cli!.status(value);
      if (!status.connected)
        throw new AppError(
          status.code ?? "PROVIDER_DISCONNECTED",
          status.message,
          503,
          true,
        );
      return status.models;
    },
    health: async () => api.testProvider(document.activeProviderId ?? ""),
    applyRuntime,
    connectProvider: (id: string) =>
      exclusive(async () => {
        const value = await provider(id);
        if (!value.enabled)
          throw new AppError(
            "PROVIDER_DISABLED",
            "Turn on this provider before connecting it.",
            409,
          );
        const status = await options.cli!.connect(value);
        persist({
          ...document,
          disconnectedProviders: document.disconnectedProviders.filter(
            (p) => p !== id,
          ),
        });
        return status;
      }),
    disconnectProvider: (id: string) =>
      exclusive(async () => {
        await provider(id);
        persist({
          ...document,
          activeProviderId:
            document.activeProviderId === id ? null : document.activeProviderId,
          disconnectedProviders: [
            ...new Set([...document.disconnectedProviders, id]),
          ],
        });
        options.cli!.disconnect(id);
        return get();
      }),
    close: () => db.close(),
  };
}
export type SettingsService = ReturnType<typeof createSettingsService>;
