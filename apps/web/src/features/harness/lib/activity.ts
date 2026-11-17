import type { HarnessThreadSummary } from "@repo/backend/shared/contracts";

export const activityCategoryKeys = [
  "preparation",
  "reviews",
  "other",
] as const;

export type ActivityCategory = (typeof activityCategoryKeys)[number];

export const activityCategoryMeta: Record<
  ActivityCategory,
  { label: string; empty: string }
> = {
  preparation: {
    label: "Preparation",
    empty: "No project preparation activity yet.",
  },
  reviews: {
    label: "Reviews",
    empty: "No review activity yet.",
  },
  other: {
    label: "Other",
    empty: "No other agent activity yet.",
  },
};

const kindCategories: Record<string, ActivityCategory> = {
  project_scaffold: "preparation",
  review: "reviews",
};

export function isVisibleActivityKind(kind: string) {
  return !["chat", "hint", "clarify", "discussion"].includes(kind);
}

export function activityCategory(kind: string): ActivityCategory {
  return kindCategories[kind] ?? "other";
}

export type ActivityGroup = {
  key: ActivityCategory;
  label: string;
  threads: HarnessThreadSummary[];
};

export function groupActivityThreads(
  threads: HarnessThreadSummary[],
): ActivityGroup[] {
  const groups = new Map<ActivityCategory, HarnessThreadSummary[]>();
  for (const thread of threads) {
    if (!isVisibleActivityKind(thread.kind)) continue;
    const key = activityCategory(thread.kind);
    groups.set(key, [...(groups.get(key) ?? []), thread]);
  }
  return activityCategoryKeys
    .filter((key) => key !== "other" || (groups.get(key)?.length ?? 0) > 0)
    .map((key) => ({
      key,
      label: activityCategoryMeta[key].label,
      threads: [...(groups.get(key) ?? [])].sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          right.id.localeCompare(left.id),
      ),
    }));
}

/** Chronological session number for a newest-first list. */
export function activitySessionNumber(
  index: number,
  total: number,
  kind?: string,
) {
  return `${kind === "review" ? "Review" : "Session"} ${total - index}`;
}

/** Present legacy setup markers as ordinary messages without altering history. */
export function setupMessageText(text: string | null) {
  if (!text) return text;
  const marker = text.match(
    /^Attempt \d+ · (Initial preparation|Resumed from attempt \d+|Retry after attempt \d+|Fresh project folder after attempt \d+) · Prepare (.+)$/s,
  );
  if (!marker) return text;
  if (marker[1]!.startsWith("Resumed"))
    return "Continue setting up the codebase.";
  if (marker[1]!.startsWith("Retry")) return "Retry the codebase setup.";
  if (marker[1]!.startsWith("Fresh"))
    return "Set up the codebase in a new folder.";
  return `Set up the codebase for ${marker[2]}.`;
}
