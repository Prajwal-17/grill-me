import { describe, expect, test } from "bun:test";
import type { HarnessThreadSummary } from "@repo/backend/shared/contracts";
import {
  activityCategory,
  activitySessionNumber,
  groupActivityThreads,
  setupMessageText,
} from "./activity";
import { createActivityScroller } from "./activity-scroll";
import { activityWorkingLabel } from "./status";

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
  test("shows actual activity phases and never marks a finished run as thinking", () => {
    expect(activityWorkingLabel("queued", [])).toBe("Starting…");
    expect(activityWorkingLabel("waiting", [])).toBe(
      "Waiting for your response…",
    );
    expect(activityWorkingLabel("running", [])).toBe("Thinking…");
    expect(
      activityWorkingLabel("running", [
        { type: "tool_call", status: "running" },
      ]),
    ).toBe("Working…");
    expect(
      activityWorkingLabel("running", [
        { type: "tool_call", status: "completed" },
      ]),
    ).toBe("Thinking…");
    for (const status of [
      "completed",
      "failed",
      "cancelled",
      "interrupted",
    ] as const)
      expect(activityWorkingLabel(status, [])).toBeNull();
  });
  test("keeps preparation and reviews while hiding retired help history", () => {
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
    ]);
    expect(groups[0]!.threads.map((entry) => entry.id)).toEqual([
      "prep-2",
      "prep-1",
    ]);
    expect(groups[1]!.threads).toHaveLength(1);
  });

  test("does not hide unsupported thread kinds", () => {
    const groups = groupActivityThreads([
      thread("clarification", "2026-11-16T10:00:00.000Z"),
    ]);
    expect(groups.map((group) => group.key)).toEqual([
      "preparation",
      "reviews",
      "other",
    ]);
    expect(groups.at(-1)?.threads[0]?.kind).toBe("clarification");
    expect(activityCategory("clarification")).toBe("other");
  });

  test("keeps numbered reviews separate from other activity", () => {
    expect(activitySessionNumber(0, 3)).toBe("Session 3");
    expect(activitySessionNumber(1, 3)).toBe("Session 2");
    expect(activitySessionNumber(2, 3)).toBe("Session 1");
    expect(activitySessionNumber(0, 3, "review")).toBe("Review 3");
    expect(activitySessionNumber(2, 3, "review")).toBe("Review 1");
  });

  test("reads historical preparation markers as ordinary chat messages", () => {
    expect(
      setupMessageText(
        "Attempt 1 · Initial preparation · Prepare Rate limiter",
      ),
    ).toBe("Set up the codebase for Rate limiter.");
    expect(
      setupMessageText(
        "Attempt 2 · Resumed from attempt 1 · Prepare Rate limiter",
      ),
    ).toBe("Continue setting up the codebase.");
    expect(
      setupMessageText(
        "Attempt 3 · Retry after attempt 2 · Prepare Rate limiter",
      ),
    ).toBe("Retry the codebase setup.");
    expect(
      setupMessageText(
        "Attempt 4 · Fresh project folder after attempt 3 · Prepare Rate limiter",
      ),
    ).toBe("Set up the codebase in a new folder.");
    expect(setupMessageText("Please preserve my changed server file.")).toBe(
      "Please preserve my changed server file.",
    );
    expect(setupMessageText(null)).toBeNull();
  });
});

function scrollingFixture(reduce = false) {
  const pane = { scrollTop: 0, scrollHeight: 1000, clientHeight: 100 };
  const frames = new Map<number, (time: number) => void>();
  let next = 0;
  const scroller = createActivityScroller({
    pane: () => pane,
    request: (frame) => {
      frames.set(++next, frame);
      return next;
    },
    cancel: (id) => {
      frames.delete(id);
    },
    reducedMotion: () => reduce,
  });
  function tick(time: number) {
    const pending = [...frames.values()];
    frames.clear();
    for (const frame of pending) frame(time);
  }
  return { pane, frames, scroller, tick };
}

describe("activity scroll motion", () => {
  test("animates toward new content without jumping or restarting on each resize", () => {
    const { pane, frames, scroller, tick } = scrollingFixture();
    scroller.follow();
    expect(pane.scrollTop).toBe(0);
    tick(0);
    tick(120);
    expect(pane.scrollTop).toBeGreaterThan(0);
    expect(pane.scrollTop).toBeLessThan(900);
    pane.scrollHeight = 1500;
    scroller.follow();
    expect(frames.size).toBe(1);
    tick(240);
    expect(pane.scrollTop).toBe(1400);
    expect(scroller.animating).toBe(false);
  });

  test("stops immediately when the reader takes control", () => {
    const { pane, frames, scroller, tick } = scrollingFixture();
    scroller.follow();
    tick(0);
    tick(80);
    scroller.cancel();
    pane.scrollTop = 25;
    tick(240);
    expect(pane.scrollTop).toBe(25);
    expect(frames.size).toBe(0);
    expect(scroller.animating).toBe(false);
  });

  test("places loaded history without an animation and honors reduced motion", () => {
    const { pane, frames, scroller } = scrollingFixture(true);
    scroller.align("end");
    expect(pane.scrollTop).toBe(900);
    scroller.align("start");
    expect(pane.scrollTop).toBe(0);
    pane.scrollHeight = 1300;
    scroller.follow();
    expect(pane.scrollTop).toBe(1200);
    expect(frames.size).toBe(0);
  });
});
