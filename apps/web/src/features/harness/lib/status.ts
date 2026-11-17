import type { HarnessThreadStatus } from "@repo/backend/shared/contracts";

/** Statuses that still produce transcript updates. */
export function isActiveThreadStatus(status: HarnessThreadStatus) {
  return status === "queued" || status === "running" || status === "waiting";
}
