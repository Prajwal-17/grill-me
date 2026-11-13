import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { runStructured, runText } from "@repo/backend/modules/ai/agent/runtime";
import { AppError } from "@repo/backend/shared/errors/app-error";
import { db } from "@repo/backend/shared/database/db";
import {
  agentRunEvents,
  agentRuns,
  challenges,
  profiles,
} from "@repo/backend/shared/database/schema";
import { agentRunStore } from "@repo/backend/modules/ai/agent/store";
import { eq } from "drizzle-orm";
import { completeThing, resolvedModel } from "./fixtures/agent-fixtures";

const roots: string[] = [];
async function temp() {
  const root = await mkdtemp(join(tmpdir(), "grill-agent-test-"));
  roots.push(root);
  return root;
}
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("the embedded Pi runtime completes a real multi-turn tool cycle and a validated completion once", async () => {
  const root = await temp();
  await writeFile(join(root, "answer.ts"), "export const answer = 42;");
  const { faux, resolved } = resolvedModel();
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("read_submission_file", { path: "answer.ts" })],
      {
        stopReason: "toolUse",
      },
    ),
    fauxAssistantMessage(
      [fauxToolCall("complete_thing", { value: "verified" })],
      {
        stopReason: "toolUse",
      },
    ),
    fauxAssistantMessage("This should not run."),
  ]);
  const result = await runStructured({
    resolved,
    instructions: "Use the snapshot tools and complete the task.",
    context: "<context>Fixture</context>",
    userText: "Complete the task.",
    completion: completeThing,
    allowSnapshot: true,
    workspace: root,
    manifest: [{ path: "answer.ts", bytes: 25, sha256: "fixture" }],
  });
  expect(result.value).toEqual({ value: "verified" });
  expect(result.turnCount).toBe(2);
  expect(result.toolCallCount).toBe(2);
  expect(
    result.messages.some(
      (message) =>
        message.role === "toolResult" &&
        message.toolName === "read_submission_file",
    ),
  ).toBe(true);
  expect(faux.state.callCount).toBe(2);
});

test("structured generation runs can write and read their temporary research workspace", async () => {
  const { faux, resolved } = resolvedModel();
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("write_file", { path: "notes.txt", content: "captured" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([fauxToolCall("read_file", { path: "notes.txt" })], {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage(
      [fauxToolCall("complete_thing", { value: "verified" })],
      { stopReason: "toolUse" },
    ),
  ]);
  const result = await runStructured({
    resolved,
    instructions: "Use the research tools and complete the task.",
    context: "<context>Fixture</context>",
    userText: "Use the supplied link.",
    completion: completeThing,
    allowSnapshot: false,
    allowResearch: true,
  });
  expect(result.value).toEqual({ value: "verified" });
  expect(result.toolCallCount).toBe(3);
  const readResult = result.messages.find(
    (message) =>
      message.role === "toolResult" && message.toolName === "read_file",
  );
  expect(JSON.stringify(readResult)).toContain("captured");
});

test("structured runs reject duplicate completion values and plain prose", async () => {
  const { faux, resolved } = resolvedModel();
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall("complete_thing", { value: "first" }, { id: "call-1" }),
        fauxToolCall("complete_thing", { value: "second" }, { id: "call-2" }),
      ],
      { stopReason: "toolUse" },
    ),
  ]);
  const result = await runStructured({
    resolved,
    instructions: "Complete once.",
    context: "Fixture",
    userText: "Complete.",
    completion: completeThing,
    allowSnapshot: false,
  });
  expect(result.value).toEqual({ value: "first" });

  faux.setResponses([fauxAssistantMessage("I would have completed it.")]);
  await expect(
    runStructured({
      resolved,
      instructions: "Complete once.",
      context: "Fixture",
      userText: "Complete.",
      completion: completeThing,
      allowSnapshot: false,
    }),
  ).rejects.toMatchObject({ code: "MODEL_OUTPUT_INVALID" });
});

test("structured runs bound output repair and tool calls, and stop on cancellation", async () => {
  const root = await temp();
  await writeFile(join(root, "answer.ts"), "export const answer = 42;");
  const { faux, resolved } = resolvedModel();
  faux.setResponses(
    Array.from({ length: 3 }, () =>
      fauxAssistantMessage([fauxToolCall("complete_thing", { value: "" })], {
        stopReason: "toolUse",
      }),
    ),
  );
  await expect(
    runStructured({
      resolved,
      instructions: "Complete.",
      context: "Fixture",
      userText: "Complete.",
      completion: completeThing,
      allowSnapshot: false,
    }),
  ).rejects.toMatchObject({ code: "MODEL_OUTPUT_INVALID" });

  const group = Array.from({ length: 9 }, (_, index) =>
    fauxToolCall("list_submission_files", {}, { id: `call-${index}` }),
  );
  faux.setResponses([
    fauxAssistantMessage(group, { stopReason: "toolUse" }),
    fauxAssistantMessage(group, { stopReason: "toolUse" }),
    fauxAssistantMessage(group, { stopReason: "toolUse" }),
  ]);
  await expect(
    runStructured({
      resolved,
      instructions: "Inspect.",
      context: "Fixture",
      userText: "Inspect.",
      completion: completeThing,
      allowSnapshot: true,
      workspace: root,
      manifest: [{ path: "answer.ts", bytes: 25, sha256: "fixture" }],
    }),
  ).rejects.toMatchObject({ code: "MODEL_LIMIT_EXCEEDED" });

  const controller = new AbortController();
  faux.setResponses([
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return fauxAssistantMessage("late");
    },
  ]);
  const pending = runStructured({
    resolved,
    instructions: "Wait.",
    context: "Fixture",
    userText: "Wait.",
    completion: completeThing,
    allowSnapshot: false,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 10);
  await expect(pending).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
});

test("current attachments remain native user content and are labelled as untrusted data", async () => {
  const { faux, resolved } = resolvedModel();
  let seen = "";
  faux.setResponses([
    (context) => {
      seen = JSON.stringify(context);
      return fauxAssistantMessage("Reviewed.");
    },
  ]);
  await runText({
    resolved,
    instructions: "Review the attachment.",
    userText: "Review this solution.",
    attachments: [{ filename: "answer.ts", text: "export const answer = 42;" }],
    onText() {},
  });
  expect(seen).toContain("untrusted_attachment filename");
  expect(seen).toContain("answer.ts");
  expect(seen).toContain("export const answer = 42;");
  expect(seen).toContain("Review this solution.");
});

test("image attachments use image blocks only when the selected model accepts them", async () => {
  const pixel =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=";
  const attachment = {
    filename: "pixel.png",
    text: "",
    mimeType: "image/png",
    data: pixel,
  };
  const disabled = resolvedModel();
  await expect(
    runText({
      resolved: disabled.resolved,
      instructions: "Inspect.",
      userText: "Inspect this image.",
      attachments: [attachment],
      onText() {},
    }),
  ).rejects.toMatchObject({ code: "MODEL_IMAGES_UNSUPPORTED" });

  const enabled = resolvedModel();
  enabled.resolved.providerModel.capabilities = {
    ...enabled.resolved.providerModel.capabilities!,
    images: true,
  };
  let seen = "";
  enabled.faux.setResponses([
    (context) => {
      seen = JSON.stringify(context);
      return fauxAssistantMessage("Seen.");
    },
  ]);
  await runText({
    resolved: enabled.resolved,
    instructions: "Inspect.",
    userText: "Inspect this image.",
    attachments: [attachment],
    onText() {},
  });
  expect(seen).toContain('"type":"image"');
  expect(seen).toContain("image/png");
});

test("text runs keep partial output when cancelled mid-stream", async () => {
  const { faux, resolved } = resolvedModel();
  const controller = new AbortController();
  faux.setResponses([
    fauxAssistantMessage(
      "A long response that streams in pieces so cancellation can retain earlier text. ".repeat(
        12,
      ),
    ),
  ]);
  const chunks: string[] = [];
  await expect(
    runText({
      resolved,
      instructions: "Reply with text.",
      userText: "Reply.",
      signal: controller.signal,
      onText(delta) {
        chunks.push(delta);
        controller.abort();
      },
    }),
  ).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
  expect(chunks.join("").length).toBeGreaterThan(0);
});

test("startup recovery marks unfinished runs interrupted without deleting their events", async () => {
  const profileId = crypto.randomUUID();
  await db.insert(profiles).values({
    id: profileId,
    email: `agent-recovery-${profileId}@test.local`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const runId = await agentRunStore.start({
    profileId,
    operation: "generation",
    providerId: "fixture-connection",
    providerName: "Fixture",
    providerPreset: "custom",
    model: "fixture-model",
  });
  await agentRunStore.event(runId, "turn_started", { turn: 1 });
  await agentRunStore.markInterrupted();
  const row = (
    await db.select().from(agentRuns).where(eq(agentRuns.id, runId))
  )[0]!;
  expect(row.status).toBe("interrupted");
  expect(row.errorCode).toBe("AGENT_INTERRUPTED");
  expect(
    (
      await db
        .select()
        .from(agentRunEvents)
        .where(eq(agentRunEvents.runId, runId))
    ).length,
  ).toBe(1);
});
