import type {
  Provider,
  ProviderConnection,
} from "@repo/backend/shared/contracts";
import { CodexConnection } from "./codex";
import { OpenCodeConnection } from "./opencode";
import { AppError } from "../../shared/errors/app-error";
import {
  executable,
  providerEnvironment,
  providerError,
  type GenerationInput,
} from "./common";
export { type TextTransport } from "./common";
export function createCliProviders(root: string) {
  const disconnected = new Set<string>();
  const entries = new Map<
    string,
    {
      identity: string;
      connection: Promise<CodexConnection | OpenCodeConnection>;
    }
  >();
  async function connection(provider: Provider) {
    if (provider.enabled === false || disconnected.has(provider.id))
      throw new AppError(
        "PROVIDER_DISCONNECTED",
        "Disconnected. Connect again when ready.",
        503,
      );
    const identity = JSON.stringify([
      provider.kind,
      provider.binaryPath,
      provider.codexHome,
    ]);
    let entry = entries.get(provider.id);
    if (entry?.identity !== identity) {
      if (entry) void entry.connection.then((c) => c.close()).catch(() => {});
      const pending = (async () => {
        const { env } = await providerEnvironment(root, provider);
        const binary = await executable(provider, env);
        return provider.kind === "codex"
          ? CodexConnection.start(root, provider, binary.path, binary.version)
          : OpenCodeConnection.start(
              root,
              provider,
              binary.path,
              binary.version,
            );
      })();
      entry = { identity, connection: pending };
      entries.set(provider.id, entry);
      void pending.catch(() => {
        if (entries.get(provider.id)?.connection === pending)
          entries.delete(provider.id);
      });
    }
    return entry!.connection;
  }
  function stop(id: string) {
    const entry = entries.get(id);
    entries.delete(id);
    if (entry) void entry.connection.then((c) => c.close()).catch(() => {});
  }
  return {
    async connect(provider: Provider) {
      disconnected.delete(provider.id);
      return this.status(provider);
    },
    async status(provider: Provider): Promise<ProviderConnection> {
      try {
        return await (await connection(provider)).status();
      } catch (error) {
        stop(provider.id);
        const failure = providerError(error, provider.kind);
        return {
          installed: failure.code !== "CLI_NOT_INSTALLED",
          connected: false,
          authenticated: false,
          version: null,
          binaryPath: null,
          models: [],
          code: failure.code,
          message: failure.message,
        };
      }
    },
    async signIn(
      provider: Provider,
      input: {
        providerId?: string;
        methodIndex?: number;
        key?: string;
        code?: string;
        complete?: boolean;
      } = {},
    ) {
      try {
        disconnected.delete(provider.id);
        const c = await connection(provider);
        if (c instanceof CodexConnection) return await c.signIn();
        return await c.signIn({
          providerId: input.providerId ?? "",
          methodIndex: input.methodIndex ?? 0,
          ...input,
        });
      } catch (error) {
        throw providerError(error, provider.kind);
      }
    },
    transport(provider: Provider) {
      return {
        async *run(input: GenerationInput) {
          try {
            yield* (await connection(provider)).run({
              ...input,
              model: provider.model,
              reasoningEffort: provider.reasoningEffort,
            });
          } catch (error) {
            throw providerError(error, provider.kind);
          }
        },
      };
    },
    disconnect(id: string) {
      disconnected.add(id);
      stop(id);
    },
    enable(id: string) {
      disconnected.delete(id);
    },
    reset(id: string) {
      stop(id);
    },
    async close() {
      const all = [...entries.values()];
      entries.clear();
      await Promise.allSettled(
        all.map(async (entry) => (await entry.connection).close()),
      );
    },
  };
}
export type CliProviders = ReturnType<typeof createCliProviders>;
