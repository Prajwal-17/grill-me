import type {
  ProviderHealth,
  ProviderModel,
} from "@repo/backend/shared/contracts";
import { AppError } from "../../../shared/errors/app-error";
import { apiModels } from "../../../local/providers/api";
import {
  builtInProvider,
  CONTRACT_LEVELS,
  ensureApiConnection,
  providerModel,
  resolveAgentModel,
  type AgentConnection,
} from "./providers";

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
  const preferred = Boolean(configured && configured !== "auto");
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
      return preferred ? [configured] : [];
    }
    const body = (await response.json()) as { data?: { id?: unknown }[] };
    if (!Array.isArray(body?.data)) return preferred ? [configured] : [];
    const ids = body.data.flatMap((model) =>
      typeof model?.id === "string" && model.id ? [model.id] : [],
    );
    return !preferred || ids.includes(configured) ? ids : [configured, ...ids];
  } catch {
    return preferred ? [configured] : [];
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
    const configured = connection.model.trim();
    const selected = catalog.find((model) => model.id === configured);
    resolveAgentModel(connection);
    return {
      ok: Boolean(selected),
      message: selected
        ? "Connection successful. Model access is checked when making a request."
        : "The saved model is unavailable. Choose an available model in Settings.",
      ...(selected ? {} : { code: "PROVIDER_MODEL_UNAVAILABLE" }),
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
