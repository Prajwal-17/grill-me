import { useQuery } from "@tanstack/react-query";
import type { ModelCatalog, ModelSelection } from "@repo/contracts";
import { apiRequest } from "@/shared/lib/api-client";
import { useAppStore } from "@/shared/stores/app-store";

export function useModelCatalog() {
  return useQuery({
    queryKey: ["settings", "model-catalog"],
    queryFn: () => apiRequest<ModelCatalog>("/settings/catalog"),
    staleTime: 30_000,
    retry: false,
  });
}

export function useComposerModel() {
  const catalog = useModelCatalog();
  const stored = useAppStore((state) => state.composerModel);
  const setStored = useAppStore((state) => state.setComposerModel);
  const connections = catalog.data?.connections ?? [];
  const storedConnection = stored
    ? connections.find((connection) => connection.id === stored.providerId)
    : undefined;
  const storedModel = storedConnection?.models.find(
    (model) => model.id === stored?.model,
  );
  const activeConnection =
    connections.find(
      (connection) => connection.id === catalog.data?.activeConnectionId,
    ) ?? (connections.length === 1 ? connections[0] : undefined);
  const connection = stored ? storedConnection : activeConnection;
  const model = stored
    ? storedModel
    : (connection?.models.find(
        (entry) => entry.id === connection.defaultModel,
      ) ?? connection?.models[0]);
  const reasoningEfforts =
    model?.capabilities?.reasoningEfforts ?? model?.reasoningEfforts ?? [];
  const reasoning =
    stored?.reasoningEffort !== undefined
      ? stored.reasoningEffort
      : connection?.defaultReasoningEffort;
  const selection: ModelSelection | undefined =
    connection && model
      ? {
          providerId: connection.id,
          model: model.id,
          reasoningEffort:
            model.capabilities?.reasoning && reasoningEfforts.length
              ? (reasoning ?? null)
              : undefined,
        }
      : undefined;
  return {
    catalog,
    connections,
    connection,
    model,
    reasoningEfforts,
    reasoning,
    selection,
    setSelection(value: ModelSelection | null) {
      setStored(value);
    },
  };
}
