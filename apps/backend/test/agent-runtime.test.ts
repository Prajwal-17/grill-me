import { afterAll, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import {
  runStructured,
  runText,
} from "../../../packages/backend/src/modules/ai/agent/runtime";
import { createPiGateway } from "../../../packages/backend/src/modules/ai/agent/gateway";
import type {
  AgentConnection,
  ResolvedAgentModel,
} from "../../../packages/backend/src/modules/ai/agent/providers";
import type { CompletionSpec } from "../../../packages/backend/src/modules/ai/agent/tasks";
import { AppError } from "../../../packages/backend/src/shared/errors/app-error";
import { db } from "../../../packages/backend/src/shared/database/db";
import {
  agentRunEvents,
  agentRuns,
} from "../../../packages/backend/src/shared/database/schema";
import { agentRunStore } from "../../../packages/backend/src/modules/ai/agent/store";
import {
  challenges,
  profiles,
} from "../../../packages/backend/src/shared/database/schema";
import { eq } from "drizzle-orm";

const databasePath = process.env.GRILL_ME_SQLITE_PATH;
if (!databasePath)
  throw new Error("Set GRILL_ME_SQLITE_PATH for agent runtime tests.");
const { initializeDatabase, migrateDatabase } =
  await import("../../../packages/backend/src/shared/database/db");
await initializeDatabase({ dialect: "sqlite", path: databasePath });
await migrateDatabase();

const roots: string[] = [];
async function temp() {
  const root = await mkdtemp(join(tmpdir(), "grill-agent-test-"));
  roots.push(root);
  return root;
}
afterAll(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

function resolvedModel(reasoning = false): {
  resolved: ResolvedAgentModel;
  faux: ReturnType<typeof fauxProvider>;
} {
  const faux = fauxProvider({
    models: [{ id: "fixture", reasoning }],
  });
  const models = createModels();
  models.setProvider(faux.provider);
  const model = faux.getModel("fixture")!;
  return {
    faux,
    resolved: {
      connection: {
        id: "fixture-connection",
        name: "Fixture",
        preset: "custom",
        protocol: "openai-completions",
        endpoint: "http://fixture.invalid/v1",
      },
      model,
      models,
      streamFn: models.streamSimple.bind(models),
      providerModel: {
        id: model.id,
        name: model.id,
        capabilities: {
          tools: true,
          images: false,
          reasoning: false,
        },
      },
      thinkingLevel: "off",
      requestedReasoning: null,
    },
  };
}

const completeThing: CompletionSpec<{ value: string }> = {
  name: "complete_thing",
  description: "Complete the fixture task.",
  schema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  },
  validate: (value) => {
    if (
      !value ||
      typeof value !== "object" ||
      typeof (value as { value?: unknown }).value !== "string" ||
      !(value as { value: string }).value.trim()
    )
      throw new Error("The result needs a non-empty value.");
    return value as { value: string };
  },
};

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
    allowWebSearch: false,
    allowPublicPage: false,
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
    allowWebSearch: false,
    allowPublicPage: false,
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
      allowWebSearch: false,
      allowPublicPage: false,
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
      allowWebSearch: false,
      allowPublicPage: false,
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
      allowWebSearch: false,
      allowPublicPage: false,
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
    allowWebSearch: false,
    allowPublicPage: false,
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
    allowWebSearch: false,
    allowPublicPage: false,
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
      allowWebSearch: false,
      allowPublicPage: false,
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
    allowWebSearch: false,
    allowPublicPage: false,
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
      allowWebSearch: false,
      allowPublicPage: false,
      signal: controller.signal,
      onText(delta) {
        chunks.push(delta);
        controller.abort();
      },
    }),
  ).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
  expect(chunks.join("").length).toBeGreaterThan(0);
});

test("the Pi gateway implements every existing ModelGateway method with a fake provider", async () => {
  const { faux, resolved } = resolvedModel(true);
  const profileId = crypto.randomUUID();
  await db.insert(profiles).values({
    id: profileId,
    email: `agent-gateway-${profileId}@test.local`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const seen: (string | undefined)[] = [];
  const gateway = createPiGateway({
    async resolve(selection) {
      seen.push(selection?.model);
      return resolved;
    },
    async searchKey() {
      return undefined;
    },
  });
  const challenge = {
    id: crypto.randomUUID(),
    profileId,
    number: 1,
    title: "Fixture challenge",
    scope: "focused" as const,
    difficulty: "medium" as const,
    contextualDifficulty: "medium" as const,
    estimatedDifficultyScore: null,
    difficultyReason: "Fixture",
    topic: "TypeScript",
    implementationBoundary: "",
    contextSnapshot: {},
    promptVersion: "fixture",
    calibrationVersion: "fixture",
    contractVersion: 2,
    completionSource: null,
    durationEstimate: { minMinutes: 10, maxMinutes: 20 },
    implementationMilestones: [],
    problemStatement: "Build a deterministic grouping function.",
    expectedOutcome: "A function that returns grouped words.",
    constraints: [],
    starterCode: null,
    completionCriteria: ["Groups words by first letter."],
    hint: null,
    status: "active" as const,
    createdAt: new Date().toISOString(),
    completedAt: null,
    archivedAt: null,
  };
  await db.insert(challenges).values({
    id: challenge.id,
    profileId,
    number: 1,
    title: challenge.title,
    scope: "focused",
    difficulty: "medium",
    contextualDifficulty: "medium",
    durationMinMinutes: 10,
    durationMaxMinutes: 20,
    implementationMilestones: [],
    problemStatement: challenge.problemStatement,
    expectedOutcome: challenge.expectedOutcome,
    constraints: [],
    completionCriteria: challenge.completionCriteria,
    status: "active",
    createdAt: new Date(),
  });
  const learner = {
    profileId,
    preferences: {
      profileId: challenge.profileId,
      experienceLevel: "mid",
      languages: ["typescript"],
      stack: [],
      learningGoals: [],
      currentFocus: "testing",
      aboutMe: null,
      topicFamiliarity: [],
      knownConcepts: [],
      learningGoal: null,
      includeRecentChallenges: false,
      displayName: null,
      projects: [],
      updatedAt: new Date().toISOString(),
      developerContextUpdatedAt: null,
    },
    recentChallenges: [],
    recentEvidence: [],
  } as never;
  const build = {
    title: "Group words",
    estimatedDifficultyBand: "medium",
    difficultyReason: "Direct application.",
    topic: "TypeScript",
    implementationBoundary: "",
    durationEstimate: { minMinutes: 10, maxMinutes: 20 },
    implementationMilestones: [],
    problemStatement:
      "Build a function that groups words by their first letter.",
    expectedOutcome: "A function with deterministic output.",
    constraints: [],
    starterCode: null,
    completionCriteria: ["Groups repeated letters without dropping words."],
  };
  const quizQuestions = Array.from({ length: 5 }, (_, index) => ({
    question: `Question ${index + 1}: which behavior is required?`,
    options: ["A", "B", "C", "D"],
    correctOption: 0,
    explanation: "Only the first option matches the frozen behavior.",
  }));
  const review = {
    verdict: "accepted" as const,
    summary: "The implementation meets the requirement.",
    criteria: [{ id: "C1", status: "met" as const, evidence: "Groups words." }],
    findings: [],
    optionalImprovements: [],
    correctness: { score: 4, evidence: "Behavior is complete." },
    understanding: { score: 3, evidence: "Uses a clear invariant." },
    judgment: { score: 3, evidence: "Choices fit the task." },
    nextStep: null,
    question: null,
    verification: "inspection_only" as const,
  };
  const selection = {
    providerId: crypto.randomUUID(),
    model: "fixture-model",
    reasoningEffort: "high" as const,
  };
  const structured = (name: string, value: unknown) =>
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall(name, value as never)], {
        stopReason: "toolUse",
      }),
    ]);

  structured("complete_preparation", { question: null, options: [] });
  expect(
    await gateway.prepareBuild({
      prompt: "Practice TypeScript grouping",
      scope: "focused",
      difficulty: "medium",
      learner,
      selection,
    }),
  ).toEqual({ question: null, options: [] });

  structured("complete_challenge", {
    status: "ready",
    challenge: build,
    question: null,
    options: [],
  });
  expect(
    await gateway.generateBuild({
      prompt: "Practice TypeScript grouping",
      scope: "focused",
      difficulty: "medium",
      clarificationContext: null,
      clarificationHistory: [],
      learner,
      selection,
    }),
  ).toMatchObject({ status: "ready" });

  structured("complete_quiz", {
    title: "Grouping quiz",
    questions: quizQuestions,
  });
  expect(
    await gateway.generateQuiz!({
      challenge,
      coverage: "mixed",
      questionCount: 5,
      previousQuestions: [],
      selection,
    }),
  ).toMatchObject({ title: "Grouping quiz" });

  structured("complete_quiz_title", { title: "Grouping concepts" });
  expect(
    await gateway.generateQuizTitle!({
      profileId: challenge.profileId,
      challengeId: challenge.id,
      source: "Grouping",
      currentTitle: "Old title",
      questionCount: 5,
      difficulty: "medium",
      coverage: "mixed",
      questions: ["Question"],
      selection,
    }),
  ).toBe("Grouping concepts");

  structured("complete_prompt", { prompt: "Practice grouping words." });
  expect(
    await gateway.enhanceBuildPrompt!({
      profileId: challenge.profileId,
      prompt: "grouping",
      selection,
    }),
  ).toEqual({ prompt: "Practice grouping words." });

  structured("complete_prompt", { prompt: "Quiz me on grouping." });
  expect(
    await gateway.enhanceQuizPrompt!({
      profileId: challenge.profileId,
      prompt: "grouping",
      selection,
    }),
  ).toEqual({ prompt: "Quiz me on grouping." });

  structured("complete_resume", {
    displayName: null,
    background: [],
    languages: [],
    technologies: [],
    projects: [],
  });
  expect(
    await gateway.extractResume!({
      profileId: challenge.profileId,
      text: "A resume",
      selection,
    }),
  ).toMatchObject({ displayName: null });

  structured("complete_review", review);
  expect(
    await gateway.judge!({
      challenge,
      content: "export const ok = true;",
      attachments: [],
      evidence: { status: "inspection_only", reason: "Fixture", checks: [] },
      assistance: { hints: 0, guidance: false },
      selection,
    }),
  ).toMatchObject({ verdict: "accepted" });

  structured("complete_verification", {
    runtime: "unsupported",
    reason: "No reliable harness.",
    checks: [],
  });
  expect(
    await gateway.planVerification!({
      challenge,
      content: "export const ok = true;",
      attachments: [],
      evidence: { status: "inspection_only", reason: "Fixture", checks: [] },
      assistance: { hints: 0, guidance: false },
      selection,
    }),
  ).toMatchObject({ runtime: "unsupported" });

  faux.setResponses([fauxAssistantMessage("A focused hint.")]);
  const hint: string[] = [];
  for await (const delta of gateway.generateHint({
    challenge,
    messages: [],
    learner,
    selection,
  }))
    hint.push(delta);
  expect(hint.join("")).toBe("A focused hint.");

  faux.setResponses([fauxAssistantMessage("A useful discussion reply.")]);
  const reply: string[] = [];
  for await (const delta of gateway.respond({
    challenge,
    messages: [],
    content: "How should I approach this?",
    mode: "clarify",
    attachments: [],
    learner,
    selection,
  }))
    reply.push(delta);
  expect(reply.join("")).toBe("A useful discussion reply.");
  expect(seen).toEqual(Array(11).fill("fixture-model"));
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

test("custom API capabilities map declared reasoning levels and reject unsupported values", async () => {
  const { resolveAgentModel } =
    await import("../../../packages/backend/src/modules/ai/agent/providers");
  const connection: AgentConnection = {
    id: crypto.randomUUID(),
    name: "Custom fixture",
    kind: "openai" as const,
    preset: "custom" as const,
    protocol: "openai-completions" as const,
    capabilities: {
      tools: true,
      images: false,
      reasoning: true,
      reasoningEfforts: ["low", "high"],
    },
    enabled: true,
    endpoint: "http://127.0.0.1:1/v1",
    codexHome: "",
    binaryPath: "",
    model: "fixture-model",
  };
  const resolved = resolveAgentModel(connection, {
    reasoningEffort: "high",
  });
  expect(resolved.thinkingLevel).toBe("high");
  expect(resolved.providerModel.capabilities?.reasoningEfforts).toContain(
    "high",
  );
  expect(
    resolveAgentModel(connection, { reasoningEffort: "none" }).thinkingLevel,
  ).toBe("off");
  expect(() =>
    resolveAgentModel(connection, { reasoningEffort: "minimal" }),
  ).toThrow(AppError);
  const noTools = {
    ...connection,
    capabilities: { ...connection.capabilities, tools: false },
  };
  expect(resolveAgentModel(noTools).providerModel.capabilities?.tools).toBe(
    false,
  );
});

test("legacy CLI connections cannot resolve or run through the production gateway", async () => {
  const { resolveAgentModel } =
    await import("../../../packages/backend/src/modules/ai/agent/providers");
  expect(() =>
    resolveAgentModel({
      id: crypto.randomUUID(),
      name: "Codex fixture",
      kind: "codex",
      preset: "custom",
      protocol: "openai-responses",
      capabilities: { tools: true, images: false, reasoning: false },
      enabled: true,
      binaryPath: "/tmp/fixture-codex",
      codexHome: "",
      model: "auto",
    }),
  ).toThrow(AppError);
  expect(() =>
    resolveAgentModel({
      id: crypto.randomUUID(),
      name: "OpenCode Go",
      kind: "openai",
      preset: "opencode-go",
      protocol: "openai-responses",
      capabilities: { tools: true, images: false, reasoning: true },
      enabled: true,
      codexHome: "",
      binaryPath: "",
      model: "claude-haiku-5-5",
      reasoningEffort: "ultra",
    }),
  ).toThrow(AppError);
});
