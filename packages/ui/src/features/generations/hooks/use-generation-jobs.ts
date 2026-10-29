import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { generationKeys, getGenerationJobs } from "../api/generation-api";
import { isGenerating, type GenerationJob } from "../types";

export function useGenerationJobs(profileId?: string, poll = false) {
  return useQuery({
    queryKey: generationKeys.list(profileId),
    queryFn: ({ signal }) => getGenerationJobs(profileId!, signal),
    enabled: Boolean(profileId),
    refetchInterval: poll
      ? (query) => (query.state.data?.some(isGenerating) ? 1500 : 10_000)
      : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 1000,
    retry: 1,
  });
}
export function useSaveGenerationJob() {
  const queries = useQueryClient();
  return useCallback(
    (job: GenerationJob) => {
      queries.setQueryData<GenerationJob[]>(
        generationKeys.list(job.profileId),
        (current) => [
          job,
          ...(current ?? []).filter((item) => item.id !== job.id),
        ],
      );
      queries.setQueryData(generationKeys.detail(job.profileId, job.id), job);
      void queries.invalidateQueries({
        queryKey: generationKeys.list(job.profileId),
      });
    },
    [queries],
  );
}
