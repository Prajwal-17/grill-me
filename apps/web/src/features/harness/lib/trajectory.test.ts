import { describe, expect, test } from "bun:test";
import type {
  HarnessItem,
  HarnessThreadDetail,
  HarnessTurnAttempt,
} from "@repo/backend/shared/contracts";
import {
  filterTrajectoryTurns,
  formatTrajectoryDuration,
  formatTrajectorySize,
  formatTrajectoryValue,
  parseTrajectoryJson,
  projectTrajectory,
  trajectoryToolOutput,
} from "./trajectory";

const at = (seconds: number) =>
  new Date(Date.UTC(2026, 10, 18, 10, 0, seconds)).toISOString();

function item(
  overrides: Partial<HarnessItem> & Pick<HarnessItem, "ordinal" | "type">,
): HarnessItem {
  const time = at(overrides.ordinal);
  return {
    id: `item-${overrides.ordinal}`,
    threadId: "thread-1",
    turnId: "turn-1",
    attemptId: "attempt-1",
    parentItemId: null,
    status: "completed",
    title: null,
    text: null,
    payload: {},
    startedAt: time,
    completedAt: time,
    createdAt: time,
    updatedAt: time,
    ...overrides,
  };
}

function attempt(ordinal: number): HarnessTurnAttempt {
  return {
    id: "attempt-1",
    turnId: "turn-1",
    ordinal,
    status: "completed",
    nativeThreadId: null,
    nativeTurnId: null,
    errorCode: null,
    errorMessage: null,
    startedAt: at(0),
    completedAt: at(20),
  };
}

function detail(items: HarnessItem[]): HarnessThreadDetail {
  return {
    thread: {
      id: "thread-1",
      profileId: "profile-1",
      kind: "review",
      title: "Review #1 Fixture",
      status: "completed",
      challengeId: "challenge-1",
      parentThreadId: null,
      transport: "api",
      connectionId: null,
      model: "fixture-model",
      reasoningEffort: null,
      runtimeMode: "approval-required",
      nativeThreadId: null,
      errorCode: null,
      errorMessage: null,
      createdAt: at(0),
      updatedAt: at(20),
      completedAt: at(20),
    },
    turns: [
      {
        id: "turn-1",
        threadId: "thread-1",
        ordinal: 1,
        status: "completed",
        inputText: "Review this attempt.",
        transport: "api",
        connectionId: null,
        model: "fixture-model",
        reasoningEffort: null,
        runtimeMode: "approval-required",
        nativeTurnId: null,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        errorCode: null,
        errorMessage: null,
        requestedAt: at(0),
        startedAt: at(0),
        completedAt: at(20),
        attempts: [attempt(1)],
        items,
      },
    ],
    attachments: [],
  };
}

const items = [
  item({
    ordinal: 1,
    type: "user_message",
    text: "Review this attempt.",
  }),
  item({
    ordinal: 2,
    type: "system_notice",
    title: "System prompt and tools",
    text: "Run configuration.",
    payload: {
      kind: "prompt_snapshot",
      systemPrompt: "You review one attempt.",
      userText: "Review this attempt.",
      tools: [{ name: "read_workspace_file", description: "Read a file." }],
    },
  }),
  item({
    ordinal: 3,
    type: "system_notice",
    title: "Run context",
    text: "Run context captured.",
    payload: { kind: "run_context", context: "<context>criteria</context>" },
  }),
  item({
    ordinal: 4,
    type: "reasoning",
    text: "The workspace has one file.",
    payload: { model: "fixture-model", durationMs: 500 },
    completedAt: at(1),
  }),
  item({
    ordinal: 5,
    type: "assistant_message",
    text: "Reading the file.",
    payload: {
      model: "fixture-model",
      usage: {
        input: 100,
        output: 25,
        totalTokens: 125,
        cacheRead: 10,
        cacheWrite: 0,
      },
    },
  }),
  item({
    ordinal: 6,
    type: "file_read",
    title: "read_workspace_file",
    payload: {
      input: { path: "src/app.ts" },
      output: "1 | export const answer = 42;",
      durationMs: 12,
    },
    completedAt: at(2),
  }),
  item({
    ordinal: 7,
    type: "tool_call",
    title: "complete_review",
    payload: {
      kind: "completion",
      input: { criteria: [{ status: "pass" }] },
      output: "Result accepted.",
      durationMs: 3,
    },
    completedAt: at(3),
  }),
  item({
    ordinal: 8,
    type: "error",
    text: "Provider exited.",
  }),
];

describe("trajectory projection", () => {
  test("classifies every record and keeps tool facts", () => {
    const model = projectTrajectory(detail(items));
    expect(model.rows.map((row) => row.kind)).toEqual([
      "system",
      "context",
      "user",
      "reasoning",
      "assistant",
      "tool",
      "result",
      "error",
    ]);
    expect(model.rows.map((row) => row.tag)).toEqual([
      "SYSTEM",
      "CONTEXT",
      "USER",
      "THINKING",
      "ASSISTANT",
      "TOOL",
      "RESULT",
      "ERROR",
    ]);
    const read = model.rows.find((row) => row.kind === "tool")!;
    expect(read.summary).toContain("read_workspace_file");
    expect(read.summary).toContain("src/app.ts");
    expect(read.preview).toContain("export const answer = 42");
    expect(read.tool?.durationMs).toBe(12);
    const result = model.rows.find((row) => row.kind === "result")!;
    expect(result.isCompletion).toBe(true);
    expect(result.summary).toContain("complete_review");
    expect(model.stats.toolCalls).toBe(2);
    expect(model.stats.fileReads).toBe(1);
    expect(model.stats.commands).toBe(0);
    expect(model.stats.tokens).toMatchObject({ input: 100, output: 25 });
  });

  test("captures the run setup: prompt, tools, and context", () => {
    const model = projectTrajectory(detail(items));
    expect(model.setup).toMatchObject({
      systemItemId: "item-2",
      systemPrompt: "You review one attempt.",
      userText: "Review this attempt.",
      tools: [{ name: "read_workspace_file" }],
      contextItemId: "item-3",
      context: "<context>criteria</context>",
      truncated: false,
    });
    expect(
      projectTrajectory(
        detail([item({ ordinal: 1, type: "user_message", text: "Review." })]),
      ).setup,
    ).toBeNull();
  });

  test("normalizes stored tool result shapes", () => {
    expect(
      trajectoryToolOutput({
        output: { content: [{ type: "text", text: "from content" }] },
      }),
    ).toBe("from content");
    expect(
      trajectoryToolOutput({
        output: JSON.stringify({
          result: { output: "command text", exitCode: 0 },
        }),
      }),
    ).toBe("command text");
    expect(
      trajectoryToolOutput({
        details: { output: "detail text" },
        output: "content text",
      }),
    ).toBe("detail text");
    expect(
      trajectoryToolOutput({
        details: JSON.stringify({
          command: "bun test",
          result: { status: "failed", exitCode: 1, output: "test text" },
        }),
      }),
    ).toBe("test text");
  });

  test("recovers records that storage truncated mid-JSON", () => {
    const record = JSON.stringify({
      purpose: "check",
      command: "bun test",
      result: { status: "failed", exitCode: 1, output: "bun test failed\n" },
    });
    const cut = record.indexOf('"output":"') + '"output":"'.length + 6;
    const truncated = record.slice(0, cut);
    expect(() => JSON.parse(truncated)).toThrow();
    expect(trajectoryToolOutput({ details: truncated })).toBe("bun te");
    const recovered = formatTrajectoryValue(truncated);
    expect(recovered).toContain('"purpose": "check"');
    expect(parseTrajectoryJson("plain text")).toBeNull();
  });

  test("filters by search and hides optional record kinds", () => {
    const model = projectTrajectory(detail(items));
    const search = filterTrajectoryTurns(model.turns, {
      query: "answer = 42",
      showReasoning: true,
      showContext: true,
    });
    expect(search.matchCount).toBe(1);
    expect(search.turns[0]!.rows[0]!.tool?.name).toBe("read_workspace_file");
    const withoutOptional = filterTrajectoryTurns(model.turns, {
      query: "",
      showReasoning: false,
      showContext: false,
    });
    expect(
      withoutOptional.turns[0]!.rows.some((row) => row.kind === "reasoning"),
    ).toBe(false);
    expect(
      withoutOptional.turns[0]!.rows.some(
        (row) => row.kind === "system" || row.kind === "context",
      ),
    ).toBe(false);
  });

  test("formats compact durations and sizes", () => {
    expect(formatTrajectoryDuration(null)).toBe("—");
    expect(formatTrajectoryDuration(240)).toBe("240ms");
    expect(formatTrajectoryDuration(4_200)).toBe("4.2s");
    expect(formatTrajectoryDuration(65_000)).toBe("1m 5s");
    expect(formatTrajectorySize(900)).toBe("900 B");
    expect(formatTrajectorySize(2_048)).toBe("2.0 KB");
  });
});
