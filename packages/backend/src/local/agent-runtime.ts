import type { ModelCatalog } from "@repo/contracts";
import type { SettingsService } from "./settings";
import type { AgentRuntime } from "../modules/ai/agent/types";
import {
  resolveAgentModel,
  type AgentConnection,
} from "../modules/ai/agent/providers";
import {
  catalogForConnection,
  testConnection,
} from "../modules/ai/agent/provider-catalog";

export type SettingsAgentRuntime = AgentRuntime & {
  catalog(): Promise<ModelCatalog>;
  test(provider: AgentConnection): ReturnType<typeof testConnection>;
  models(provider: AgentConnection): ReturnType<typeof catalogForConnection>;
};

export function createSettingsAgentRuntime(
  settings: SettingsService,
): SettingsAgentRuntime {
  return {
    async resolve(selection) {
      return resolveAgentModel(await settings.resolveSelection(selection));
    },
    timeoutMs: () => settings.runtime().judgeTimeoutMs,
    test: (provider) => testConnection(provider),
    models: (provider) => catalogForConnection(provider),
    async catalog() {
      const connections = await settings.apiConnections();
      const activeProviderId = (await settings.get()).activeProviderId;
      return {
        activeConnectionId: connections.some(
          (connection) => connection.id === activeProviderId,
        )
          ? activeProviderId
          : null,
        connections: await Promise.all(
          connections.map(async (connection) => {
            const models = await catalogForConnection(connection).catch(() => [
              {
                id: connection.model,
                name: connection.model,
                capabilities: connection.capabilities,
              },
            ]);
            const defaultModel =
              models.find((model) => model.id === connection.model)?.id ??
              models[0]?.id ??
              connection.model;
            const efforts =
              models.find((model) => model.id === defaultModel)?.capabilities
                ?.reasoningEfforts ?? [];
            return {
              id: connection.id,
              name: connection.name,
              preset: connection.preset,
              protocol: connection.protocol,
              models,
              defaultModel,
              defaultReasoningEffort:
                connection.reasoningEffort &&
                efforts.includes(connection.reasoningEffort)
                  ? connection.reasoningEffort
                  : undefined,
            };
          }),
        ),
      };
    },
  };
}
