import { apiRequest } from "@/shared/lib/api-client";
import type {
  HarnessItem,
  HarnessRequestDecision,
  HarnessThread,
  HarnessThreadDetail,
  HarnessThreadSummary,
} from "@repo/backend/shared/contracts";

export type HarnessThreadFilter = {
  kind?: string;
  challengeId?: string;
  limit?: number;
};

export function listHarnessThreads(
  profileId: string,
  filter: HarnessThreadFilter = {},
  signal?: AbortSignal,
) {
  const query = new URLSearchParams();
  if (filter.kind) query.set("kind", filter.kind);
  if (filter.challengeId) query.set("challengeId", filter.challengeId);
  if (filter.limit) query.set("limit", String(filter.limit));
  const suffix = query.size ? `?${query.toString()}` : "";
  return apiRequest<HarnessThreadSummary[]>(
    `/harness${suffix}`,
    { signal },
    profileId,
  );
}

export function getHarnessThread(
  profileId: string,
  threadId: string,
  signal?: AbortSignal,
) {
  return apiRequest<HarnessThreadDetail>(
    `/harness/${threadId}`,
    { signal },
    profileId,
  );
}

export function getHarnessItem(
  profileId: string,
  threadId: string,
  itemId: string,
  signal?: AbortSignal,
) {
  return apiRequest<HarnessItem>(
    `/harness/${threadId}/items/${itemId}`,
    { signal },
    profileId,
  );
}

export function decideHarnessRequest(
  profileId: string,
  threadId: string,
  requestId: string,
  decision: HarnessRequestDecision,
) {
  return apiRequest<unknown>(
    `/harness/${threadId}/requests/${requestId}`,
    { method: "POST", body: JSON.stringify(decision) },
    profileId,
  );
}

export function stopHarnessThread(profileId: string, threadId: string) {
  return apiRequest<HarnessThread>(
    `/harness/${threadId}/stop`,
    { method: "POST", body: "{}" },
    profileId,
  );
}

export function retryHarnessThread(profileId: string, threadId: string) {
  return apiRequest<unknown>(
    `/harness/${threadId}/retry`,
    { method: "POST", body: "{}" },
    profileId,
  );
}
