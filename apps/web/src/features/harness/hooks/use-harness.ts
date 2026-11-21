import {
  queryOptions,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { HarnessRequestDecision } from "@repo/backend/shared/contracts";
import {
  decideHarnessRequest,
  getHarnessItem,
  getHarnessThread,
  listHarnessThreads,
  retryHarnessThread,
  stopHarnessThread,
  type HarnessThreadFilter,
} from "../api/harness-api";
import { isActiveThreadStatus } from "../lib/status";

export const harnessKeys = {
  all: (profileId?: string) => ["harness-threads", profileId] as const,
  list: (profileId: string, filter: HarnessThreadFilter) =>
    ["harness-threads", profileId, filter] as const,
  detail: (profileId: string, id: string) =>
    ["harness-thread", profileId, id] as const,
  item: (profileId: string, threadId: string, itemId: string) =>
    ["harness-item", profileId, threadId, itemId] as const,
};

export function useHarnessThreads(
  profileId: string | undefined,
  filter: HarnessThreadFilter = {},
  options: { enabled?: boolean; refetchInterval?: number } = {},
) {
  return useQuery({
    queryKey: harnessKeys.list(profileId ?? "", filter),
    queryFn: ({ signal }) => listHarnessThreads(profileId!, filter, signal),
    enabled: Boolean(profileId) && (options.enabled ?? true),
    refetchInterval:
      options.refetchInterval ??
      ((query) =>
        query.state.data?.some((thread) => isActiveThreadStatus(thread.status))
          ? 1000
          : false),
  });
}

/** Full item payload; the thread detail trims large fields for transport. */
export function useHarnessItem(
  profileId: string | undefined,
  threadId: string | undefined,
  itemId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: harnessKeys.item(profileId ?? "", threadId ?? "", itemId ?? ""),
    queryFn: ({ signal }) =>
      getHarnessItem(profileId!, threadId!, itemId!, signal),
    enabled: Boolean(profileId && threadId && itemId) && enabled,
    staleTime: 30_000,
  });
}

export function useHarnessThread(
  profileId: string | undefined,
  threadId: string | undefined,
) {
  return useQuery(threadOptions(profileId, threadId));
}

function threadOptions(
  profileId: string | undefined,
  threadId: string | undefined,
) {
  return queryOptions({
    queryKey: harnessKeys.detail(profileId ?? "", threadId ?? ""),
    queryFn: ({ signal }) => getHarnessThread(profileId!, threadId!, signal),
    enabled: Boolean(profileId && threadId),
    refetchInterval: (query) => {
      const status = query.state.data?.thread.status;
      return status && isActiveThreadStatus(status) ? 1000 : false;
    },
  });
}

export function useHarnessTranscripts(profileId: string, threadIds: string[]) {
  return useQueries({
    queries: threadIds.map((id) => threadOptions(profileId, id)),
  });
}

export function useHarnessDecision(profileId: string, threadId: string) {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      requestId: string;
      decision: HarnessRequestDecision;
    }) =>
      decideHarnessRequest(
        profileId,
        threadId,
        input.requestId,
        input.decision,
      ),
    onSuccess: async () => {
      await Promise.all([
        queries.invalidateQueries({
          queryKey: harnessKeys.detail(profileId, threadId),
        }),
        queries.invalidateQueries({ queryKey: harnessKeys.all(profileId) }),
      ]);
    },
  });
}

export function useStopHarnessThread(profileId: string) {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => stopHarnessThread(profileId, threadId),
    onSuccess: async (_result, threadId) => {
      await Promise.all([
        queries.invalidateQueries({
          queryKey: harnessKeys.detail(profileId, threadId),
        }),
        queries.invalidateQueries({ queryKey: harnessKeys.all(profileId) }),
      ]);
    },
  });
}

export function useRetryHarnessThread(profileId: string) {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => retryHarnessThread(profileId, threadId),
    onSuccess: async (_result, threadId) => {
      await Promise.all([
        queries.invalidateQueries({
          queryKey: harnessKeys.detail(profileId, threadId),
        }),
        queries.invalidateQueries({ queryKey: harnessKeys.all(profileId) }),
      ]);
    },
  });
}
