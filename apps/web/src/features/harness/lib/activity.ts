import type { HarnessThreadSummary } from "@repo/backend/shared/contracts";

export const activityCategoryKeys = [
  "preparation",
  "reviews",
  "discussion",
  "hints",
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
  discussion: {
    label: "Discussion",
    empty: "No discussion activity yet.",
  },
  hints: {
    label: "Hints",
    empty: "No hint activity yet.",
  },
  other: {
    label: "Other",
    empty: "No other agent activity yet.",
  },
};

const kindCategories: Record<string, ActivityCategory> = {
  project_scaffold: "preparation",
  review: "reviews",
  chat: "discussion",
  hint: "hints",
};

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
    const key = activityCategory(thread.kind);
    groups.set(key, [...(groups.get(key) ?? []), thread]);
  }
  return activityCategoryKeys
    .filter((key) => key !== "other" || (groups.get(key)?.length ?? 0) > 0)
    .map((key) => ({
      key,
      label: activityCategoryMeta[key].label,
      threads: [...(groups.get(key) ?? [])].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
    }));
}

/** Chronological session number for a newest-first list. */
export function activitySessionNumber(index: number, total: number) {
  return `Session ${total - index}`;
}
