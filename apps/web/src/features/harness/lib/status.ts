import type {
  HarnessThreadStatus,
  HarnessItem,
} from "@repo/backend/shared/contracts";

/** Statuses that still produce transcript updates. */
export function isActiveThreadStatus(status: HarnessThreadStatus) {
  return status === "queued" || status === "running" || status === "waiting";
}

export function activityWorkingLabel(
  status: HarnessThreadStatus,
  items: Pick<HarnessItem, "status" | "type">[],
) {
  if (!isActiveThreadStatus(status)) return null;
  if (status === "queued") return "Starting…";
  if (status === "waiting") return "Waiting for your response…";
  if (
    items.some(
      (item) =>
        item.status === "running" &&
        !["assistant_message", "reasoning", "user_message"].includes(item.type),
    )
  )
    return "Working…";
  return "Thinking…";
}
