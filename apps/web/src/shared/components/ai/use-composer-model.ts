import { useQuery } from "@tanstack/react-query";
import type {
  ModelCatalog,
  ModelSelection,
} from "@repo/backend/shared/contracts";
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
  // The saved default drives anything the user has not picked explicitly.
  const defaultSelection = catalog.data?.defaultSelection ?? null;
  const defaultConnection = defaultSelection
    ? connections.find(
        (connection) => connection.id === defaultSelection.providerId,
      )
    : undefined;
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
  const connection = stored
    ? storedConnection
    : (defaultConnection ?? activeConnection);
  const defaultModel = defaultConnection
    ? (defaultConnection.models.find(
        (entry) => entry.id === defaultSelection?.model,
      ) ??
      defaultConnection.models.find(
        (entry) => entry.id === defaultConnection.defaultModel,
      ) ??
      defaultConnection.models[0])
    : undefined;
  const model = stored
    ? storedModel
    : defaultConnection
      ? defaultModel
      : (connection?.models.find(
          (entry) => entry.id === connection.defaultModel,
        ) ?? connection?.models[0]);
  const reasoningEfforts =
    model?.capabilities?.reasoningEfforts ?? model?.reasoningEfforts ?? [];
  const reasoning =
    stored?.reasoningEffort !== undefined
      ? stored.reasoningEffort
      : !stored &&
          defaultConnection &&
          defaultSelection?.reasoningEffort !== undefined
        ? defaultSelection.reasoningEffort
        : connection?.defaultReasoningEffort;
  const selection: ModelSelection | undefined =
    connection && model
      ? {
          providerId: connection.id,
          model: model.id,
          reasoningEffort:
            model.capabilities?.reasoning &&
            (reasoningEfforts.length > 0 || reasoning === "none")
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
