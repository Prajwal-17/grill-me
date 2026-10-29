import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LocalSettings } from "@repo/contracts";
import { apiRequest } from "@/shared/lib/api-client";
export const settingsKey = ["local-settings"];
export function useSettingsMutation(onSuccess?: () => void) {
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
      onSuccess?.();
    },
  });
}
