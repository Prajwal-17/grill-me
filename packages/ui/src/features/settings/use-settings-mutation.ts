import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LocalSettings } from "@repo/contracts";
import { apiRequest } from "@/shared/lib/api-client";
import { providerHealthKey } from "./provider-health";
export const settingsKey = ["local-settings"];
export function useSettingsMutation(onSuccess?: (data: LocalSettings) => void) {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (input: { path: string; method?: string; body?: unknown }) =>
      apiRequest<LocalSettings>(input.path, {
        method: input.method ?? "POST",
        ...(input.body !== undefined
          ? { body: JSON.stringify(input.body) }
          : {}),
      }),
    onSuccess: (data) => {
      queries.setQueryData(settingsKey, data);
      void queries.invalidateQueries({ queryKey: providerHealthKey });
      void queries.invalidateQueries({ queryKey: ["provider-models"] });
      void queries.invalidateQueries({ queryKey: ["provider-status"] });
      void queries.invalidateQueries({
        queryKey: ["settings", "model-catalog"],
      });
      onSuccess?.(data);
    },
  });
}
