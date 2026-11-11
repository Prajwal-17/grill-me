import {
  createModels,
  createProvider,
  getSupportedThinkingLevels,
  type CredentialStore,
  type Model,
  type MutableModels,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { opencodeGoProvider } from "@earendil-works/pi-ai/providers/opencode-go";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { googleGenerativeAIApi } from "@earendil-works/pi-ai/api/google-generative-ai.lazy";
import type {
  ModelCapabilities,
  Provider,
  ProviderHealth,
  ProviderModel,
  ProviderPreset,
  ProviderProtocol,
  ReasoningEffort,
} from "@repo/contracts";
import { AppError } from "../../../shared/errors/app-error";
import { apiModels } from "../../../local/providers/api";

export type AgentConnection = Provider & { apiKey?: string };
export type ResolvedAgentModel = {
  connection: {
    id: string;
    name: string;
    preset: ProviderPreset;
    protocol: ProviderProtocol;
    endpoint?: string;
  };
  model: Model<string>;
  models: MutableModels;
  streamFn: StreamFn;
  providerModel: ProviderModel;
  thinkingLevel: "off" | Exclude<ReasoningEffort, "none" | "ultra">;
  requestedReasoning: ReasoningEffort | null;
  searchKey?: string;
};

const CONTRACT_LEVELS: ReasoningEffort[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

function piLevel(level: Exclude<ReasoningEffort, "none" | "ultra">) {
  return level;
}

function contractLevels(levels: readonly string[]): ReasoningEffort[] {
  return levels.flatMap((level) => {
    const value = level === "off" ? "none" : level;
    return CONTRACT_LEVELS.includes(value as ReasoningEffort)
      ? [value as ReasoningEffort]
      : [];
  });
}

function capabilitiesFor(model: Model<string>): ModelCapabilities {
  return {
    tools: true,
    images: model.input.includes("image"),
    reasoning: Boolean(model.reasoning),
    ...(model.reasoning
      ? { reasoningEfforts: contractLevels(getSupportedThinkingLevels(model)) }
      : {}),
  };
}

function providerModel(model: Model<string>): ProviderModel {
  const capabilities = capabilitiesFor(model);
  return {
    id: model.id,
    name: model.name || model.id,
    ...(capabilities.reasoningEfforts
      ? { reasoningEfforts: capabilities.reasoningEfforts }
      : {}),
    capabilities,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  };
}

function defaultBaseUrl(preset: ProviderPreset) {
  return preset === "openrouter"
    ? "https://openrouter.ai/api/v1"
    : preset === "openai"
      ? "https://api.openai.com/v1"
      : undefined;
}

function withBaseUrl(
  models: readonly Model<string>[],
  baseUrl?: string,
): Model<string>[] {
  return baseUrl ? models.map((model) => ({ ...model, baseUrl })) : [...models];
}

function apiFor(protocol: ProviderProtocol) {
  switch (protocol) {
    case "openai-completions":
      return openAICompletionsApi();
    case "anthropic-messages":
      return anthropicMessagesApi();
    case "google-generative-ai":
      return googleGenerativeAIApi();
    case "openai-responses":
    default:
      return openAIResponsesApi();
  }
}

function customModel(
  connection: AgentConnection,
  modelId: string,
  baseUrl: string,
): Model<string> {
  const declared = connection.capabilities;
  const reasoning = Boolean(declared.reasoning);
  const efforts = declared.reasoningEfforts?.length
    ? declared.reasoningEfforts
    : CONTRACT_LEVELS.filter((level) => level !== "xhigh" && level !== "max");
  const supported = new Set(
    efforts.map((level) => (level === "none" ? "off" : level)),
  );
  const thinkingLevelMap: Record<string, string | null> = {};
  for (const level of ["minimal", "low", "medium", "high"] as const)
    if (!supported.has(level)) thinkingLevelMap[level] = null;
  for (const level of ["xhigh", "max"] as const)
    thinkingLevelMap[level] = supported.has(level) ? level : null;
  return {
    id: modelId,
    name: modelId,
    api: connection.protocol,
    provider: `grill-${connection.id}`,
    baseUrl,
    input: declared.images ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
    reasoning,
    ...(reasoning ? { thinkingLevelMap } : {}),
  };
}

function credentialStore(providerId: string, apiKey?: string): CredentialStore {
  return {
    read: async (id) =>
      id === providerId && apiKey
        ? { type: "api_key" as const, key: apiKey }
        : undefined,
    list: async () =>
      apiKey ? [{ providerId, type: "api_key" as const }] : [],
    modify: async (id, fn) =>
      fn(
        id === providerId && apiKey
          ? { type: "api_key", key: apiKey }
          : undefined,
      ),
    delete: async () => {},
  };
}

function builtInProvider(connection: AgentConnection) {
  const endpoint = connection.endpoint?.replace(/\/+$/, "");
  switch (connection.preset) {
    case "openrouter":
      return endpoint
        ? withBaseUrl(openrouterProvider().getModels(), endpoint)
        : [...openrouterProvider().getModels()];
    case "opencode-go":
      return [...opencodeGoProvider().getModels()];
    case "openai":
      return endpoint
        ? withBaseUrl(openaiProvider().getModels(), endpoint)
        : [...openaiProvider().getModels()];
    default:
      return undefined;
  }
}

export function piProviderId(
  connection: Pick<AgentConnection, "id" | "preset">,
) {
  return ["openrouter", "opencode-go", "openai"].includes(connection.preset)
    ? connection.preset
    : `grill-${connection.id}`;
}

function ensureApiConnection(connection: AgentConnection) {
  if (connection.kind !== "openai")
    throw new AppError(
      "API_PROVIDER_REQUIRED",
      "This is a legacy CLI connection and is inactive. Select an API provider in Settings → Providers.",
      503,
    );
  if (
    connection.preset === "custom" ||
    connection.preset === "omniroute" ||
    connection.preset === "openai"
  ) {
    if (!connection.endpoint)
      throw new AppError(
        "PROVIDER_ENDPOINT_REQUIRED",
        "Add this API connection's endpoint in Settings → Providers.",
        503,
      );
  }
}

export function resolveAgentModel(
  connection: AgentConnection,
  selection?: {
    model?: string | null;
    reasoningEffort?: ReasoningEffort | null;
  },
): ResolvedAgentModel {
  ensureApiConnection(connection);
  const piId = piProviderId(connection);
  if (
    !connection.apiKey &&
    ["openrouter", "opencode-go", "openai"].includes(connection.preset)
  )
    throw new AppError(
      "KEY_UNAVAILABLE",
      `Enter ${connection.name}'s API key in Settings → Providers.`,
      503,
    );
  const modelId = (selection?.model ?? connection.model).trim();
  if (!modelId || modelId === "auto")
    throw new AppError(
      "PROVIDER_MODEL_REQUIRED",
      "Choose an exact model for this API connection in Settings → Providers.",
      503,
    );
  const endpoint = connection.endpoint?.replace(/\/+$/, "");
  const baseUrl =
    connection.preset === "opencode-go"
      ? undefined
      : endpoint || defaultBaseUrl(connection.preset);
  if (!baseUrl && connection.preset !== "opencode-go")
    throw new AppError(
      "PROVIDER_ENDPOINT_REQUIRED",
      "Add this API connection's endpoint in Settings → Providers.",
      503,
    );
  let models: MutableModels;
  let model: Model<string> | undefined;
  let providerModelEntry: ProviderModel;
  if (connection.preset === "custom" || connection.preset === "omniroute") {
    if (!baseUrl) throw new Error("Unreachable API endpoint state");
    const custom = customModel(connection, modelId, baseUrl);
    const provider = createProvider({
      id: piId,
      name: connection.name,
      baseUrl,
      auth: {
        apiKey: {
          name: `${connection.name} API key`,
          resolve: async () =>
            connection.apiKey
              ? { auth: { apiKey: connection.apiKey } }
              : { auth: {} },
        },
      },
      models: [custom],
      api: { [connection.protocol]: apiFor(connection.protocol) },
    });
    models = createModels({
      credentials: credentialStore(piId, connection.apiKey),
    });
    models.setProvider(provider);
    model = models.getModel(piId, modelId);
    const base = providerModel(custom);
    providerModelEntry = {
      ...base,
      capabilities: {
        tools: connection.capabilities.tools,
        images: connection.capabilities.images,
        reasoning: connection.capabilities.reasoning,
        ...(base.capabilities?.reasoningEfforts
          ? { reasoningEfforts: base.capabilities.reasoningEfforts }
          : {}),
      },
    };
  } else {
    const catalog = builtInProvider(connection);
    if (!catalog) throw new Error("Unreachable API preset state");
    const factory =
      connection.preset === "openrouter"
        ? openrouterProvider()
        : connection.preset === "opencode-go"
          ? opencodeGoProvider()
          : openaiProvider();
    const provider = {
      ...factory,
      baseUrl: baseUrl ?? factory.baseUrl,
      ...(endpoint
        ? { getModels: () => withBaseUrl([...factory.getModels()], endpoint) }
        : {}),
    };
    models = createModels({
      credentials: credentialStore(piId, connection.apiKey),
    });
    models.setProvider(provider);
    const piModel = catalog.find((entry) => entry.id === modelId);
    if (!piModel)
      throw new AppError(
        "PROVIDER_MODEL_UNAVAILABLE",
        `${connection.name} does not offer ${modelId}. Choose an available model in Settings → Providers.`,
        503,
      );
    model = models.getModel(piId, modelId);
    providerModelEntry = providerModel(piModel);
  }
  if (!model)
    throw new AppError(
      "PROVIDER_MODEL_UNAVAILABLE",
      `${connection.name} does not offer ${modelId}. Choose an available model in Settings → Providers.`,
      503,
    );
  const requested = selection?.reasoningEffort ?? connection.reasoningEffort;
  const supported = providerModelEntry.capabilities?.reasoningEfforts ?? [];
  if (requested && requested !== "none") {
    if (!providerModelEntry.capabilities?.reasoning)
      throw new AppError(
        "PROVIDER_REASONING_UNSUPPORTED",
        `${connection.name} · ${modelId} does not support reasoning effort. Choose a non-reasoning setting in Settings → Providers.`,
        400,
      );
    if (!supported.includes(requested))
      throw new AppError(
        "PROVIDER_REASONING_UNSUPPORTED",
        `${connection.name} · ${modelId} does not support "${requested}" reasoning. Choose a supported effort in Settings → Providers.`,
        400,
      );
  }
  return {
    connection: {
      id: connection.id,
      name: connection.name,
      preset: connection.preset,
      protocol: connection.protocol,
      endpoint: baseUrl,
    },
    model,
    models,
    streamFn: models.streamSimple.bind(models),
    providerModel: providerModelEntry,
    thinkingLevel:
      requested && requested !== "none"
        ? piLevel(requested as Exclude<ReasoningEffort, "none" | "ultra">)
        : "off",
    requestedReasoning: requested ?? null,
  };
}

export async function catalogForConnection(
  connection: AgentConnection,
): Promise<ProviderModel[]> {
  ensureApiConnection(connection);
  if (connection.preset === "custom" || connection.preset === "omniroute") {
    const models = await listCustomModels(connection);
    return models.map((id) => ({
      id,
      name: id,
      capabilities: {
        tools: connection.capabilities.tools,
        images: connection.capabilities.images,
        reasoning: connection.capabilities.reasoning,
        ...(connection.capabilities.reasoning
          ? {
              reasoningEfforts: [
                ...new Set([
                  "none" as const,
                  ...(connection.capabilities.reasoningEfforts?.length
                    ? connection.capabilities.reasoningEfforts
                    : CONTRACT_LEVELS.filter(
                        (level) => level !== "xhigh" && level !== "max",
                      )),
                ]),
              ],
            }
          : {}),
      },
    }));
  }
  const catalog = builtInProvider(connection) ?? [];
  const entries = catalog.map(providerModel);
  if (entries.length) return entries;
  return [{ id: connection.model, name: connection.model }];
}

async function listCustomModels(connection: AgentConnection) {
  const configured = connection.model.trim();
  if (!configured || configured === "auto") return [];
  try {
    const response = await fetch(
      `${connection.endpoint!.replace(/\/+$/, "")}/models`,
      {
        headers: connection.apiKey
          ? { Authorization: `Bearer ${connection.apiKey}` }
          : {},
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      return [configured];
    }
    const body = (await response.json()) as { data?: { id?: unknown }[] };
    if (!Array.isArray(body?.data)) return [configured];
    const ids = body.data.flatMap((model) =>
      typeof model?.id === "string" && model.id ? [model.id] : [],
    );
    return ids.includes(configured) ? ids : [configured, ...ids];
  } catch {
    return [configured];
  }
}

export async function testConnection(
  connection: AgentConnection,
): Promise<ProviderHealth> {
  try {
    ensureApiConnection(connection);
    if (!connection.apiKey && connection.preset !== "custom")
      return {
        ok: false,
        code: "KEY_UNAVAILABLE",
        message: "Enter this API connection's key in Settings → Providers.",
      };
    if (connection.preset === "custom" || connection.preset === "omniroute") {
      await apiModels({ ...connection, endpoint: connection.endpoint! });
      return {
        ok: true,
        message: "Connection successful. Models are checked on each request.",
      };
    }
    const catalog = builtInProvider(connection) ?? [];
    resolveAgentModel(connection);
    return {
      ok: catalog.some((model) => model.id === connection.model) ? true : false,
      message: catalog.some((model) => model.id === connection.model)
        ? "Connection successful. Model access is checked when making a request."
        : "The saved model is unavailable. Choose an available model in Settings.",
      ...(catalog.some((model) => model.id === connection.model)
        ? {}
        : { code: "PROVIDER_MODEL_UNAVAILABLE" }),
    };
  } catch (error) {
    if (error instanceof AppError)
      return { ok: false, code: error.code, message: error.message };
    return {
      ok: false,
      code: "PROVIDER_CONNECTION_FAILED",
      message: "The API connection could not be checked. Try again.",
    };
  }
}

export type StreamOptions = SimpleStreamOptions;
