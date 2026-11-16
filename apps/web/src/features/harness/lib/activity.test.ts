import { describe, expect, test } from "bun:test";
import type { HarnessThreadSummary } from "@repo/backend/shared/contracts";
import {
  activityCategory,
  activitySessionNumber,
  groupActivityThreads,
} from "./activity";

function thread(
  kind: string,
  createdAt: string,
  id = `${kind}-${createdAt}`,
): HarnessThreadSummary {
  return {
    id,
    profileId: "11111111-1111-4111-8111-111111111111",
    kind,
    title: `${kind} thread`,
    status: "completed",
    challengeId: "22222222-2222-4222-8222-222222222222",
    parentThreadId: null,
    transport: "api",
    connectionId: null,
    model: "fixture",
    reasoningEffort: null,
    runtimeMode: "approval-required",
    nativeThreadId: null,
    errorCode: null,
    errorMessage: null,
    createdAt,
    updatedAt: createdAt,
    completedAt: createdAt,
    turnCount: 1,
    itemCount: 2,
  };
}

describe("activity categories", () => {
  test("keeps the four known categories in order and groups every session", () => {
    const groups = groupActivityThreads([
      thread("hint", "2026-11-16T10:00:00.000Z", "hint-1"),
      thread("project_scaffold", "2026-11-16T09:00:00.000Z", "prep-1"),
      thread("project_scaffold", "2026-11-16T11:00:00.000Z", "prep-2"),
      thread("review", "2026-11-16T12:00:00.000Z"),
      thread("chat", "2026-11-16T13:00:00.000Z"),
    ]);
    expect(groups.map((group) => group.key)).toEqual([
      "preparation",
      "reviews",
      "discussion",
      "hints",
    ]);
    expect(groups[0]!.threads.map((entry) => entry.id)).toEqual([
      "prep-2",
      "prep-1",
    ]);
    expect(groups[1]!.threads).toHaveLength(1);
    expect(groups[2]!.threads).toHaveLength(1);
    expect(groups[3]!.threads).toHaveLength(1);
  });

  test("does not hide unsupported thread kinds", () => {
    const groups = groupActivityThreads([
      thread("clarification", "2026-11-16T10:00:00.000Z"),
    ]);
    expect(groups.map((group) => group.key)).toEqual([
      "preparation",
      "reviews",
      "discussion",
      "hints",
      "other",
    ]);
    expect(groups.at(-1)?.threads[0]?.kind).toBe("clarification");
    expect(activityCategory("clarification")).toBe("other");
  });

  test("numbers multiple preparation sessions chronologically", () => {
    expect(activitySessionNumber(0, 3)).toBe("Session 3");
    expect(activitySessionNumber(1, 3)).toBe("Session 2");
    expect(activitySessionNumber(2, 3)).toBe("Session 1");
  });
});
