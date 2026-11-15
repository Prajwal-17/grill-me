import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db, migrateDatabase } from "@repo/backend/shared/database/db";
import {
  challenges,
  harnessItems,
  harnessThreads,
  harnessTurns,
  profiles,
} from "@repo/backend/shared/database/schema";
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
    constraints: [],
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
    await run.recorder.event({
      type: "tool_started",
      toolCallId: "call-1",
      toolName: "list_project_files",
      args: { path: "." },
    });
    await run.recorder.event({
      type: "tool_finished",
      toolCallId: "call-1",
      toolName: "list_project_files",
      isError: false,
      result: { output: "src/app.ts" },
    });
    await run.recorder.event({
      type: "message_completed",
      reasoning: "The project has one file.",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Done." }],
      },
    });
    await run.recorder.finish({ status: "completed" });
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

  test("interrupts unfinished rows when the schema is opened again", async () => {
    const { profileId, challengeId } = await fixture();
    const created = await thread(profileId, challengeId);
    await harnessService.begin({
      threadId: created.id,
      inputText: "Start",
    });
    await db
      .update(harnessThreads)
      .set({ status: "running" })
      .where(eq(harnessThreads.id, created.id));
    await db
      .update(harnessTurns)
      .set({ status: "running" })
      .where(eq(harnessTurns.threadId, created.id));
    await db
      .update(harnessItems)
      .set({ status: "running" })
      .where(eq(harnessItems.threadId, created.id));
    await harnessService.recover();
    expect(
      (
        await db
          .select({ status: harnessThreads.status })
          .from(harnessThreads)
          .where(eq(harnessThreads.id, created.id))
      )[0]!.status,
    ).toBe("interrupted");
  });
});
