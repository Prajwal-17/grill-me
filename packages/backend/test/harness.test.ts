import { describe, expect, test } from "bun:test";
import { db, migrateDatabase } from "@repo/backend/shared/database/db";
import {
  challenges,
  profiles,
  harnessItems,
} from "@repo/backend/shared/database/schema";
import { eq } from "drizzle-orm";
import {
  harnessService,
  setHarnessPermissionModeProvider,
} from "@repo/backend/modules/harness/harness.service";

await migrateDatabase();
setHarnessPermissionModeProvider(() => "auto-accept-edits");

async function fixture() {
  const profileId = crypto.randomUUID();
  const challengeId = crypto.randomUUID();
  await db.insert(profiles).values({
    id: profileId,
    email: `harness-${profileId}@test.local`,
  });
  await db.insert(challenges).values({
    id: challengeId,
    profileId,
    number: 1,
    title: "Harness fixture",
    scope: "focused",
    difficulty: "medium",
    contextualDifficulty: "medium",
    durationMinMinutes: 10,
    durationMaxMinutes: 20,
    implementationMilestones: [],
    problemStatement: "Exercise the harness transcript.",
    expectedOutcome: "A stored thread.",
    completionCriteria: ["Turn rows exist."],
  });
  return { profileId, challengeId };
}

function thread(profileId: string, challengeId: string) {
  return harnessService.createThread({
    profileId,
    challengeId,
    kind: "chat",
    title: "Fixture thread",
    model: "fixture-model",
  });
}

describe("harness transcripts", () => {
  test("allocates turn, attempt, and item ordinals without gaps under concurrency", async () => {
    const { profileId, challengeId } = await fixture();
    const created = await thread(profileId, challengeId);
    const turns = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        harnessService.appendTurn(created.id, {
          inputText: `Input ${index + 1}`,
        }),
      ),
    );
    expect(turns.map((turn) => turn.ordinal).sort()).toEqual([1, 2, 3, 4]);
    const run = await harnessService.begin({
      threadId: created.id,
      turnId: turns[0]!.id,
      inputText: "Input 1",
    });
    const items = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        run.recorder.append({
          type: "system_notice",
          text: `Item ${index + 1}`,
        }),
      ),
    );
    expect(items.map((item) => item.ordinal).sort((a, b) => a - b)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    await run.recorder.finish({ status: "completed" });
    const detail = await harnessService.detail(created.id, profileId);
    expect(detail.thread.status).toBe("completed");
    expect(detail.turns[0]!.attempts).toHaveLength(1);
    expect(detail.turns[0]!.items[0]!.type).toBe("user_message");
  });

  test("records tool events as typed items with results", async () => {
    const { profileId, challengeId } = await fixture();
    const created = await thread(profileId, challengeId);
    const run = await harnessService.begin({
      threadId: created.id,
      inputText: "List files",
    });
    const started = run.recorder.event({
      type: "tool_started",
      toolCallId: "call-1",
      toolName: "list_project_files",
      args: { path: "." },
    });
    const finished = run.recorder.event({
      type: "tool_finished",
      toolCallId: "call-1",
      toolName: "list_project_files",
      isError: false,
      result: { output: "src/app.ts" },
    });
    const message = run.recorder.event({
      type: "message_completed",
      reasoning: "The project has one file.",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Done." }],
      },
    });
    await run.recorder.finish({ status: "completed" });
    await Promise.all([started, finished, message]);
    const stored = await db
      .select()
      .from(harnessItems)
      .where(eq(harnessItems.turnId, run.turn.id));
    expect(
      stored.find((item) => item.title === "list_project_files")?.status,
    ).toBe("completed");
    const detail = await harnessService.detail(created.id, profileId);
    const items = detail.turns[0]!.items;
    expect(items.map((item) => item.type)).toEqual([
      "user_message",
      "file_search",
      "reasoning",
      "assistant_message",
    ]);
    expect(items[1]!.payload).toMatchObject({
      callId: "call-1",
      output: "src/app.ts",
    });
    expect(items[2]!.text).toContain("one file");
  });

  test("settles old stale tool rows when reading a completed turn", async () => {
    const { profileId, challengeId } = await fixture();
    const created = await thread(profileId, challengeId);
    const run = await harnessService.begin({
      threadId: created.id,
      inputText: "Review the current files",
      model: "deepseek-v4.1-flash",
    });
    await run.recorder.append({
      type: "tool_call",
      title: "complete_review",
      status: "running",
    });
    await run.recorder.append({
      type: "file_read",
      title: "read_workspace_file",
      status: "running",
    });
    await run.recorder.finish({ status: "completed" });
    const detail = await harnessService.detail(created.id, profileId);
    expect(detail.thread.model).toBe("deepseek-v4.1-flash");
    expect(detail.turns[0]!.model).toBe("deepseek-v4.1-flash");
    expect(
      detail.turns[0]!.items.find((item) => item.title === "complete_review")
        ?.status,
    ).toBe("completed");
    expect(
      detail.turns[0]!.items.find(
        (item) => item.title === "read_workspace_file",
      )?.status,
    ).toBe("cancelled");
  });

  test("stops a run, resolves approvals, and supports retry", async () => {
    const { profileId, challengeId } = await fixture();
    const created = await thread(profileId, challengeId);
    const run = await harnessService.begin({
      threadId: created.id,
      inputText: "Write a file",
    });
    const approval = harnessService.request({
      threadId: created.id,
      turnId: run.turn.id,
      type: "approval_request",
      kind: "write_workspace",
      prompt: "Write src/app.ts in this project.",
    });
    void approval.catch(() => {});
    await Bun.sleep(20);
    const detail = await harnessService.detail(created.id, profileId);
    const pending = detail.turns[0]!.items.find(
      (item) => item.type === "approval_request",
    )!;
    expect(pending.status).toBe("pending");
    expect(detail.thread.status).toBe("waiting");
    await harnessService.resolveRequest(
      created.id,
      profileId,
      (pending.payload as { requestId: string }).requestId,
      { decision: "allow" },
    );
    await expect(approval).resolves.toMatchObject({ decision: "allow" });
    await run.recorder.finish({
      status: "failed",
      error: { code: "PROVIDER_EXITED", message: "Provider exited." },
    });
    const retried = await harnessService.retry(created.id, profileId);
    expect(retried.ordinal).toBe(2);
    await harnessService.stop(created.id, profileId);
    const stopped = await harnessService.detail(created.id, profileId);
    expect(stopped.thread.status).toBe("cancelled");
  });

  test("scopes thread reads by profile and recovers interrupted rows", async () => {
    const { profileId, challengeId } = await fixture();
    const other = await fixture();
    const created = await thread(profileId, challengeId);
    const run = await harnessService.begin({
      threadId: created.id,
      inputText: "Start",
    });
    await expect(
      harnessService.detail(created.id, other.profileId),
    ).rejects.toMatchObject({ code: "HARNESS_NOT_FOUND" });
    await harnessService.recover();
    const recovered = await harnessService.detail(created.id, profileId);
    expect(recovered.thread.status).toBe("interrupted");
    expect(recovered.turns[0]!.status).toBe("interrupted");
    expect(recovered.turns[0]!.attempts[0]!.status).toBe("interrupted");
    expect(run.thread.id).toBe(created.id);
  });

  test("captures the run configuration and assistant message facts", async () => {
    const { profileId, challengeId } = await fixture();
    const created = await thread(profileId, challengeId);
    const run = await harnessService.begin({
      threadId: created.id,
      inputText: "Inspect the workspace",
    });
    const startedAt = Date.now() - 250;
    await run.recorder.event({
      type: "prompt_captured",
      at: startedAt,
      systemPrompt: "You are the review agent.",
      userText: "Inspect the workspace in detail.",
      context: '<context name="challenge">Fixture</context>',
      tools: [
        {
          name: "read_workspace_file",
          label: "Read workspace file",
          description: "Read a file.",
          parameters: {
            type: "object",
            properties: { path: { type: "string" } },
          },
        },
      ],
    });
    await run.recorder.event({ type: "message_started", at: startedAt });
    await run.recorder.event({
      type: "message_completed",
      reasoning: "The workspace has one file.",
      message: {
        role: "assistant",
        model: "fixture-model",
        provider: "fixture-provider",
        stopReason: "toolUse",
        usage: {
          input: 120,
          output: 30,
          totalTokens: 150,
          cacheRead: 10,
          cacheWrite: 0,
        },
        content: [
          { type: "text", text: "Reading the file." },
          {
            type: "toolCall",
            id: "call-1",
            name: "read_workspace_file",
            arguments: { path: "src/app.ts" },
          },
        ],
        timestamp: startedAt,
        durationMs: 250,
      },
    });
    await run.recorder.finish({ status: "completed" });
    const detail = await harnessService.detail(created.id, profileId);
    const items = detail.turns[0]!.items;
    expect(items[0]).toMatchObject({
      type: "user_message",
      text: "Inspect the workspace in detail.",
    });
    const prompt = items.find(
      (item) =>
        item.type === "system_notice" &&
        (item.payload as { kind?: string }).kind === "prompt_snapshot",
    )!;
    const context = items.find(
      (item) =>
        item.type === "system_notice" &&
        (item.payload as { kind?: string }).kind === "run_context",
    )!;
    expect(prompt.payload).toMatchObject({
      kind: "prompt_snapshot",
      systemPrompt: "You are the review agent.",
      userText: "Inspect the workspace in detail.",
    });
    expect(
      (prompt.payload as { tools: { name: string }[] }).tools.map(
        (tool) => tool.name,
      ),
    ).toEqual(["read_workspace_file"]);
    expect(context.payload).toMatchObject({
      kind: "run_context",
      context: '<context name="challenge">Fixture</context>',
    });
    const assistant = items.find((item) => item.type === "assistant_message")!;
    expect(assistant.text).toBe("Reading the file.");
    expect(assistant.payload).toMatchObject({
      model: "fixture-model",
      provider: "fixture-provider",
      stopReason: "toolUse",
      usage: { input: 120, output: 30, totalTokens: 150 },
    });
    expect(assistant.startedAt).not.toBeNull();
    expect(assistant.completedAt).not.toBeNull();
    expect(
      Date.parse(assistant.completedAt!) - Date.parse(assistant.startedAt!),
    ).toBe(250);
    const reasoning = items.find((item) => item.type === "reasoning")!;
    expect(reasoning.payload).toMatchObject({
      model: "fixture-model",
      stopReason: "toolUse",
      durationMs: 250,
    });
  });

  test("trims detail payloads and serves the complete record on demand", async () => {
    const { profileId, challengeId } = await fixture();
    const other = await fixture();
    const created = await thread(profileId, challengeId);
    const run = await harnessService.begin({
      threadId: created.id,
      inputText: "Read a large file",
    });
    const large = "x".repeat(20_000);
    await run.recorder.event({
      type: "tool_started",
      toolCallId: "call-large",
      toolName: "read_workspace_file",
      args: { path: "src/large.ts" },
    });
    await run.recorder.event({
      type: "tool_finished",
      toolCallId: "call-large",
      toolName: "read_workspace_file",
      isError: false,
      durationMs: 12,
      result: { output: large },
    });
    await run.recorder.finish({ status: "completed" });
    const detail = await harnessService.detail(created.id, profileId);
    const item = detail.turns[0]!.items.find(
      (entry) => entry.title === "read_workspace_file",
    )!;
    expect((item.payload.output as string).length).toBe(8_000);
    const full = await harnessService.item(created.id, item.id, profileId);
    expect((full.payload.output as string).length).toBe(20_000);
    await expect(
      harnessService.item(created.id, item.id, other.profileId),
    ).rejects.toMatchObject({ code: "HARNESS_NOT_FOUND" });
    const otherThread = await thread(profileId, challengeId);
    await expect(
      harnessService.item(otherThread.id, item.id, profileId),
    ).rejects.toMatchObject({ code: "HARNESS_ITEM_NOT_FOUND" });
  });

  test("reads the permission mode when a queued turn starts", async () => {
    const { profileId, challengeId } = await fixture();
    setHarnessPermissionModeProvider(() => "approval-required");
    const created = await harnessService.createThread({
      profileId,
      challengeId,
      kind: "chat",
      title: "Permission snapshot",
      model: "fixture-model",
      runtimeMode: "approval-required",
    });
    const queued = await harnessService.appendTurn(created.id, {
      inputText: "Start later",
    });
    setHarnessPermissionModeProvider(() => "auto");
    const run = await harnessService.begin({
      threadId: created.id,
      turnId: queued.id,
      inputText: queued.inputText,
    });
    expect(run.turn.runtimeMode).toBe("auto");
    await run.recorder.finish({ status: "completed" });
    setHarnessPermissionModeProvider(() => "auto-accept-edits");
    const detail = await harnessService.detail(created.id, profileId);
    expect(detail.turns[0]!.runtimeMode).toBe("auto");
  });
});
