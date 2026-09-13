import { afterAll, describe, expect, test } from "bun:test";
import type {
  BuildModelInput,
  LearnerContext,
  ModelGateway,
} from "../src/modules/ai/model-gateway";
import type {
  Challenge,
  GeneratedBuildContent,
  ChallengePreparation,
} from "../src/modules/challenges/challenge.schema";
import type {
  ChatMessage,
  MessageAttachment,
} from "../src/modules/messages/message.schema";
import { AppError } from "../src/shared/errors/app-error";
import OpenAI from "openai";
import type { LogRow } from "../src/modules/logs/log.model";
import { generationPrompt } from "../src/modules/ai/prompts";

process.env.DATABASE_URL = ":memory:";
const testRoot = "/tmp/grill-me-tests-" + crypto.randomUUID();
process.env.SNAPSHOT_ROOT = testRoot + "/snapshots";
process.env.UPLOAD_ROOT = testRoot + "/uploads";
afterAll(async () => {
  const { rm } = await import("node:fs/promises");
  await rm(testRoot, { recursive: true, force: true });
});

const { createApp } = await import("../src/app");
const { migrateDatabase } = await import("../src/shared/database/db");
migrateDatabase();
const { createOpenAIModel } = await import("../src/modules/ai/openai.model");
const { logModel } = await import("../src/modules/logs/log.model");
const { startAiLog } = await import("../src/modules/logs/ai-log-recorder");

const generated: GeneratedBuildContent = {
  title: "Group words by first letter",
  contextualDifficulty: "medium",
  estimatedDifficultyScore: 5,
  difficultyReason: "Direct application of known syntax.",
  topic: "TypeScript",
  implementationBoundary: "",
  durationEstimate: { minMinutes: 35, maxMinutes: 50 },
  implementationMilestones: [],
  problemStatement: "Build a function that groups words by their first letter.",
  expectedOutcome: "A function with deterministic, observable return values.",
  constraints: ["Do not use external packages."],
  starterCode: null,
  completionCriteria: [
    "Returns an empty object for empty input.",
    "Groups repeated first letters without dropping words.",
  ],
};

class FakeModel implements ModelGateway {
  preparation: ChallengePreparation = { question: null, options: [] };
  final = generated;
  generationError: Error | null = null;
  prepareInputs: Omit<BuildModelInput, "clarificationContext">[] = [];
  generationInputs: BuildModelInput[] = [];
  responseInputs: {
    challenge: Challenge;
    messages: ChatMessage[];
    content: string;
    mode: "clarify" | "review";
    attachments: MessageAttachment[];
    learner: LearnerContext;
  }[] = [];

  async prepareBuild(input: Omit<BuildModelInput, "clarificationContext">) {
    this.prepareInputs.push(input);
    return this.preparation;
  }

  async generateBuild(input: BuildModelInput) {
    this.generationInputs.push(input);
    if (this.generationError) throw this.generationError;
    return {
      ...this.final,
      contextualDifficulty: input.difficulty,
      estimatedDifficultyScore: { easy: 2, medium: 5, hard: 8, grill: 10 }[
        input.difficulty
      ],
    };
  }

  async *respond(input: (typeof this.responseInputs)[number]) {
    this.responseInputs.push(input);
    yield "Useful review";
  }

  async *generateHint(_input: {
    challenge: Challenge;
    messages: ChatMessage[];
    learner: LearnerContext;
  }) {
    yield "One focused hint";
  }
}

type TestApp = ReturnType<typeof createApp>;

async function json<T>(response: Response) {
  return (await response.json()) as T;
}

async function startProfile(app: TestApp, email: string) {
  const response = await app.request("/profiles/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  expect(response.status).toBe(200);
  return (await json<{ data: { id: string; email: string } }>(response)).data;
}

function request(
  app: TestApp,
  path: string,
  profileId: string,
  body?: unknown,
) {
  return app.request(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Profile-Id": profileId,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function createChallenge(
  app: TestApp,
  profileId: string,
  input: Record<string, unknown> = {},
) {
  const response = await request(app, "/challenges/generate", profileId, {
    prompt: "Build string grouping in TypeScript",
    scope: "focused",
    difficulty: "medium",
    clarificationContext: null,
    ...input,
  });
  expect(response.status).toBe(201);
  return (await json<{ data: Challenge }>(response)).data;
}

describe("profile preferences", () => {
  test("keeps technical context isolated and omits generation settings", async () => {
    const app = createApp({ llm: new FakeModel() });
    const first = await startProfile(
      app,
      `first-${crypto.randomUUID()}@test.dev`,
    );
    const second = await startProfile(
      app,
      `second-${crypto.randomUUID()}@test.dev`,
    );

    const defaultsResponse = await request(
      app,
      "/profiles/preferences",
      first.id,
    );
    const defaults = (
      await json<{ data: Record<string, unknown> }>(defaultsResponse)
    ).data;
    expect(defaults).toMatchObject({ aboutMe: null });
    expect(defaults).not.toHaveProperty("preferredDuration");
    expect(defaults).not.toHaveProperty("difficulty");

    const savedResponse = await request(
      app,
      "/profiles/preferences",
      first.id,
      {
        experienceLevel: "senior",
        languages: ["typescript"],
        stack: ["react"],
        learningGoals: ["system-design"],
        currentFocus: "testing",
        aboutMe: "I prefer concrete examples.",
      },
    );
    expect(savedResponse.status).toBe(200);

    const firstPreferences = await request(
      app,
      "/profiles/preferences",
      first.id,
    );
    const secondPreferences = await request(
      app,
      "/profiles/preferences",
      second.id,
    );
    expect(
      (await json<{ data: { aboutMe: string | null } }>(firstPreferences)).data,
    ).toMatchObject({ aboutMe: "I prefer concrete examples." });
    expect(
      (await json<{ data: { aboutMe: string | null } }>(secondPreferences))
        .data,
    ).toMatchObject({ aboutMe: null });
  });
});

describe("build quality pipeline", () => {
  test("supports both clarification paths and passes personal context", async () => {
    const model = new FakeModel();
    const app = createApp({ llm: model });
    const profile = await startProfile(
      app,
      `prepare-${crypto.randomUUID()}@test.dev`,
    );
    await request(app, "/profiles/preferences", profile.id, {
      experienceLevel: "beginner",
      languages: ["python"],
      learningGoals: [],
      aboutMe: "I learn from examples.",
    });

    model.preparation = {
      question: "Which runtime should the task target?",
      options: ["Node.js", "Bun"],
    };
    const needsAnswer = await request(app, "/challenges/prepare", profile.id, {
      prompt: "Give me an async build",
      scope: "feature",
      difficulty: "medium",
    });
    expect(
      (await json<{ data: ChallengePreparation }>(needsAnswer)).data,
    ).toEqual(model.preparation);

    model.preparation = { question: null, options: [] };
    const ready = await request(app, "/challenges/prepare", profile.id, {
      prompt: "Give me a Python list build",
      scope: "focused",
      difficulty: "grill",
    });
    expect(
      (await json<{ data: ChallengePreparation }>(ready)).data.question,
    ).toBeNull();
    expect(model.prepareInputs.at(-1)?.difficulty).toBe("grill");
    expect(model.prepareInputs.at(-1)?.learner.preferences).toMatchObject({
      languages: ["python"],
      aboutMe: "I learn from examples.",
    });
  });

  test("saves the generated challenge and sends recent work only when enabled", async () => {
    const model = new FakeModel();
    const app = createApp({ llm: model });
    const profile = await startProfile(
      app,
      `revise-${crypto.randomUUID()}@test.dev`,
    );

    const challenge = await createChallenge(app, profile.id, {
      clarificationContext: {
        question: "Which runtime should the task target?",
        answer: "Use your best judgment.",
      },
    });
    expect(challenge.title).toBe(generated.title);
    expect(challenge.completionCriteria).toEqual(generated.completionCriteria);
    expect(challenge.scope).toBe("focused");
    expect(challenge.difficulty).toBe("medium");
    expect(challenge.contextualDifficulty).toBe("medium");
    expect(challenge.number).toBe(1);
    expect(challenge.durationEstimate).toEqual(generated.durationEstimate);
    expect(challenge.implementationMilestones).toEqual([]);
    expect(model.generationInputs).toHaveLength(1);

    for (const difficulty of ["easy", "medium", "hard", "grill"] as const) {
      const attemptedOverride = {
        ...generated,
        difficulty: "easy",
        scope: "system",
      };
      model.final = attemptedOverride;
      const build = await createChallenge(app, profile.id, { difficulty });
      expect(build.difficulty).toBe(difficulty);
      expect(build.contextualDifficulty).toBe(difficulty);
      expect(build.scope).toBe("focused");
      const policy = generationPrompt(model.generationInputs.at(-1)!);
      expect(JSON.parse(policy.input).selectedDifficulty).toBe(difficulty);
      expect(policy.instructions).toContain(
        "difficulty from 1 to 10 for this learner",
      );
      expect(policy.instructions).toContain(
        "implementation time for this learner",
      );
      expect(policy.instructions).toContain(
        "Do not require learner-authored tests",
      );
      if (difficulty === "grill")
        expect(policy.instructions).toContain(
          "within the chosen scope and prerequisites",
        );
    }
    model.final = {
      ...generated,
      durationEstimate: { minMinutes: 240, maxMinutes: 480 },
      implementationMilestones: [],
    };
    for (const scope of ["feature", "system"] as const) {
      const build = await createChallenge(app, profile.id, {
        scope,
        difficulty: "grill",
      });
      const persisted = await request(
        app,
        `/challenges/${build.id}`,
        profile.id,
      );
      expect((await json<{ data: Challenge }>(persisted)).data).toMatchObject({
        scope,
        difficulty: "grill",
        durationEstimate: { minMinutes: 240, maxMinutes: 480 },
        implementationMilestones: model.final.implementationMilestones,
      });
    }
    model.final = generated;

    await createChallenge(app, profile.id, {
      prompt: "An independent request",
    });
    expect(model.generationInputs.at(-1)?.learner.recentChallenges).toEqual([]);
    expect(
      JSON.parse(generationPrompt(model.generationInputs.at(-1)!).input),
    ).not.toHaveProperty("recentBuilds");
    await request(app, "/profiles/preferences", profile.id, {
      includeRecentChallenges: true,
    });
    await createChallenge(app, profile.id, { prompt: "A different request" });
    expect(
      model.generationInputs.at(-1)?.learner.recentChallenges[0]?.title,
    ).toBe(generated.title);
  });

  test("assigns stable challenge numbers per profile", async () => {
    const app = createApp({ llm: new FakeModel() });
    const firstProfile = await startProfile(
      app,
      `number-a-${crypto.randomUUID()}@test.dev`,
    );
    const secondProfile = await startProfile(
      app,
      `number-b-${crypto.randomUUID()}@test.dev`,
    );

    const first = await createChallenge(app, firstProfile.id);
    const second = await createChallenge(app, firstProfile.id);
    const otherUser = await createChallenge(app, secondProfile.id);

    expect([first.number, second.number]).toEqual([1, 2]);
    expect(otherUser.number).toBe(1);

    const persisted = await request(
      app,
      `/challenges/${second.id}`,
      firstProfile.id,
    );
    expect((await json<{ data: Challenge }>(persisted)).data.number).toBe(2);
  });

  test("saves nothing when the generation fails", async () => {
    const model = new FakeModel();
    model.generationError = new AppError(
      "MODEL_UNAVAILABLE",
      "The model service is unavailable. Try again.",
      503,
      true,
    );
    const app = createApp({ llm: model });
    const profile = await startProfile(
      app,
      `failure-${crypto.randomUUID()}@test.dev`,
    );

    const before = await request(app, "/challenges/active", profile.id);
    expect((await json<{ data: Challenge[] }>(before)).data).toHaveLength(0);

    const failed = await request(app, "/challenges/generate", profile.id, {
      prompt: "Build with maps and sets",
      scope: "focused",
      difficulty: "hard",
      clarificationContext: null,
    });
    expect(failed.status).toBe(503);

    model.generationError = null;
    for (const output of [
      { ...generated, durationEstimate: { minMinutes: 0, maxMinutes: 30 } },
      { ...generated, durationEstimate: { minMinutes: 40, maxMinutes: 30 } },
      { ...generated, durationEstimate: { minMinutes: 2.5, maxMinutes: 30 } },
      { ...generated, problemStatement: "x".repeat(1601) },
      {
        ...generated,
        implementationMilestones: ["Not allowed for focused builds"],
      },
    ]) {
      model.final = output;
      const invalid = await request(app, "/challenges/generate", profile.id, {
        prompt: "Build grouping",
        scope: "focused",
        difficulty: "grill",
      });
      expect(invalid.status).toBe(502);
      expect(
        (await json<{ error: { retryable: boolean } }>(invalid)).error
          .retryable,
      ).toBe(true);
    }
    model.final = generated;
    const missingMilestones = await request(
      app,
      "/challenges/generate",
      profile.id,
      {
        prompt: "Build a pipeline",
        scope: "system",
        difficulty: "hard",
      },
    );
    expect(missingMilestones.status).toBe(201);
    const invalidDifficulty = await request(
      app,
      "/challenges/generate",
      profile.id,
      {
        prompt: "Build grouping",
        scope: "focused",
        difficulty: "balanced",
      },
    );
    expect(invalidDifficulty.status).toBe(400);

    const after = await request(app, "/challenges/active", profile.id);
    expect((await json<{ data: Challenge[] }>(after)).data).toHaveLength(1);
  });
});

describe("solution attachments", () => {
  test("accepts attachment-only reviews and preserves default empty history", async () => {
    const model = new FakeModel();
    const app = createApp({ llm: model });
    const profile = await startProfile(
      app,
      `files-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, profile.id);

    const initial = await request(
      app,
      `/challenges/${challenge.id}/messages`,
      profile.id,
    );
    const initialMessages = (await json<{ data: ChatMessage[] }>(initial)).data;
    expect(
      initialMessages.every((message) => message.attachments.length === 0),
    ).toBe(true);

    const review = await request(
      app,
      `/challenges/${challenge.id}/messages`,
      profile.id,
      {
        mode: "review",
        attachments: [
          { filename: "solution.ts", text: "export const ok = true;" },
        ],
      },
    );
    expect(review.status).toBe(200);
    expect(await review.text()).toContain("Useful review");
    expect(model.responseInputs[0]?.attachments[0]?.filename).toBe(
      "solution.ts",
    );

    const stored = await request(
      app,
      `/challenges/${challenge.id}/messages`,
      profile.id,
    );
    const messages = (await json<{ data: ChatMessage[] }>(stored)).data;
    expect(
      messages.find((message) => message.attachments.length)?.attachments,
    ).toEqual([{ filename: "solution.ts", text: "export const ok = true;" }]);
  });

  test("accepts uncapped file counts and sizes while validating type and ownership", async () => {
    const model = new FakeModel();
    const app = createApp({ llm: model });
    const owner = await startProfile(
      app,
      `owner-${crypto.randomUUID()}@test.dev`,
    );
    const other = await startProfile(
      app,
      `other-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const path = `/challenges/${challenge.id}/messages`;

    const tooMany = await request(app, path, owner.id, {
      mode: "review",
      attachments: Array.from({ length: 6 }, (_, index) => ({
        filename: `${index}.txt`,
        text: "x",
      })),
    });
    expect(tooMany.status).toBe(200);

    const wrongType = await request(app, path, owner.id, {
      mode: "review",
      attachments: [{ filename: "answer.pdf", text: "not really a pdf" }],
    });
    expect(wrongType.status).toBe(400);

    const wrongMode = await request(app, path, owner.id, {
      mode: "clarify",
      attachments: [{ filename: "answer.txt", text: "plain text" }],
    });
    expect(wrongMode.status).toBe(400);

    const tooLarge = await request(app, path, owner.id, {
      mode: "review",
      attachments: [
        { filename: "answer.txt", text: "x".repeat(100 * 1024 + 1) },
      ],
    });
    expect(tooLarge.status).toBe(200);

    const notOwned = await request(app, path, other.id, {
      mode: "review",
      content: "Review this",
    });
    expect(notOwned.status).toBe(200);
    expect(await notOwned.text()).toContain("CHALLENGE_NOT_FOUND");
  });
});

function loggedModel(
  respond: (body: Record<string, unknown>) => Response | Promise<Response>,
) {
  return createOpenAIModel({
    client: new OpenAI({
      apiKey: "test-log-secret",
      baseURL: "https://model.test/v1?api_key=test-log-secret",
      maxRetries: 0,
      fetch: async (input, init) =>
        respond(
          (await new Request(input, init).json()) as Record<string, unknown>,
        ),
    }),
  });
}
function modelResponse(text: string, extra: Record<string, unknown> = {}) {
  return {
    id: "resp-test",
    object: "response",
    status: "completed",
    model: "provider/actual-model",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 25,
      total_tokens: 125,
      input_tokens_details: { cached_tokens: 20 },
      output_tokens_details: { reasoning_tokens: 5 },
      cost: 0.0025,
    },
    ...extra,
  };
}
function eventResponse(events: Record<string, unknown>[]) {
  return new Response(
    events
      .map(
        (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      )
      .join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

function claudeResponse(text: string) {
  return {
    id: "msg-claude",
    type: "message",
    role: "assistant",
    model: "claude-test",
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: { input_tokens: 100, output_tokens: 25 },
  };
}
async function profileLogs(app: TestApp, id: string, query = "") {
  const response = await request(app, `/logs${query}`, id);
  expect(response.status).toBe(200);
  return (
    await json<{
      data: {
        items: LogRow[];
        total: number;
        page: number;
        totalPages: number;
      };
    }>(response)
  ).data;
}

describe("single-pass challenge generation", () => {
  test("System Easy generates once without a checker or difficulty-band rejection", async () => {
    const model = new FakeModel();
    const generate = model.generateBuild.bind(model);
    model.generateBuild = async (input) => ({
      ...(await generate(input)),
      estimatedDifficultyScore: 4,
    });
    const app = createApp({ llm: model });
    const owner = await startProfile(
      app,
      `single-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id, {
      prompt:
        "Give me a small complete backend system to design and implement. Keep infrastructure simple, but make me think about APIs, database schema, modules, and testing.",
      scope: "system",
      difficulty: "easy",
    });
    expect(model.generationInputs).toHaveLength(1);
    expect(challenge.difficulty).toBe("easy");
    expect(challenge.estimatedDifficultyScore).toBe(4);
    expect(generationPrompt(model.generationInputs[0]!).instructions).toContain(
      "Easy systems use one service",
    );
  });
  test("a valid response above the suggested word budget is saved without regeneration", async () => {
    const model = new FakeModel();
    model.final = {
      ...generated,
      problemStatement: "ordinary behavior ".repeat(170),
    };
    const app = createApp({ llm: model });
    const owner = await startProfile(
      app,
      `brief-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id, {
      scope: "system",
      difficulty: "easy",
    });
    expect(challenge.problemStatement).toBe(model.final.problemStatement);
    expect(model.generationInputs).toHaveLength(1);
  });
});

describe("AI request logs", () => {
  test("durable protocol events survive unfinished runs and redact credentials", async () => {
    const app = createApp({ llm: new FakeModel() });
    const owner = await startProfile(
      app,
      `durable-${crypto.randomUUID()}@test.dev`,
    );
    const log = startAiLog(
      { profileId: owner.id, operation: "review", preview: "partial" },
      { model: "test", stream: true },
      "codex://local/app-server",
      "secret-value",
      true,
    );
    log.event({
      direction: "sent",
      message: {
        id: 1,
        method: "initialize",
        params: { api_key: "secret-value" },
      },
    });
    log.event({
      direction: "received",
      message: { id: 1, result: { text: "partial secret-value" } },
    });
    const before = logModel.findOwned(log.id!, owner.id)!;
    expect(before.status).toBe("running");
    expect(before.streamEvents).toHaveLength(2);
    expect(JSON.stringify(before)).not.toContain("secret-value");
    logModel.markInterrupted();
    const after = logModel.findOwned(log.id!, owner.id)!;
    expect(after.status).toBe("cancelled");
    expect(after.streamEvents).toEqual(before.streamEvents);
  });

  test("records full structured payloads, returned model, usage and redacts credentials", async () => {
    const app = createApp({
      llm: loggedModel(() =>
        Response.json(
          modelResponse(JSON.stringify(generated), {
            debug: { api_key: "hidden-key", note: "test-log-secret" },
          }),
        ),
      ),
    });
    const owner = await startProfile(
      app,
      `logs-${crypto.randomUUID()}@test.dev`,
    );
    await createChallenge(app, owner.id, { difficulty: "medium" });
    const list = await profileLogs(app, owner.id);
    expect(list.total).toBe(1);
    const generationLog = list.items[0]!;
    expect(generationLog).toMatchObject({
      status: "success",
      operation: "generation",
      actualModel: "provider/actual-model",
      totalTokens: 125,
      cachedTokens: 20,
      reasoningTokens: 5,
      costUsd: 0.0025,
      endpoint: "https://model.test/v1",
    });
    expect(list.items[0]).not.toHaveProperty("requestBody");
    expect(list.items[0]).not.toHaveProperty("responseBody");
    expect(list.items[0]).not.toHaveProperty("responseText");
    const response = await request(app, `/logs/${generationLog.id}`, owner.id);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const log = (await json<{ data: LogRow }>(response)).data;
    expect(log.responseText).toBe(JSON.stringify(generated));
    expect(log.requestBody.instructions).toContain(
      "senior engineer helping a developer",
    );
    expect(log.requestBody.instructions).toContain("MEDIUM:");
    expect(JSON.parse(String(log.requestBody.input)).selectedDifficulty).toBe(
      "medium",
    );
    expect(log.requestBody.input).toContain(
      "Build string grouping in TypeScript",
    );
    expect(log.responseBody?.debug).toEqual({
      api_key: "[REDACTED]",
      note: "[REDACTED]",
    });
    expect(JSON.stringify(log)).not.toContain("test-log-secret");
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
    expect(log.firstTokenMs).toBeNull();
    expect(log.completedAt).not.toBeNull();
  });

  test("accepts Claude-style structured and streaming text shapes", async () => {
    const app = createApp({
      llm: loggedModel(() =>
        Response.json(claudeResponse(JSON.stringify(generated))),
      ),
    });
    const owner = await startProfile(
      app,
      `claude-shape-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const preferences = (
      await json<{ data: LearnerContext["preferences"] }>(
        await request(app, "/profiles/preferences", owner.id),
      )
    ).data;
    expect(challenge.title).toBe(generated.title);

    const streaming = loggedModel(() =>
      eventResponse([
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Claude hint" },
        },
        { type: "message_stop" },
      ]),
    );
    let hint = "";
    for await (const delta of streaming.generateHint({
      challenge,
      messages: [],
      learner: {
        profileId: owner.id,
        preferences,
        recentChallenges: [],
      },
    }))
      hint += delta;
    expect(hint).toBe("Claude hint");
  });

  test("logs malformed output and provider errors without saving failed builds", async () => {
    let calls = 0;
    const app = createApp({
      llm: loggedModel(() => {
        calls++;
        return calls === 1
          ? Response.json(modelResponse("not JSON"))
          : Response.json(
              {
                error: {
                  code: "rate_limit",
                  message: "Capacity exceeded: test-log-secret",
                },
              },
              { status: 429, headers: { "x-request-id": "http-error-id" } },
            );
      }),
    });
    const owner = await startProfile(
      app,
      `log-errors-${crypto.randomUUID()}@test.dev`,
    );
    for (let i = 0; i < 2; i++) {
      const response = await request(app, "/challenges/generate", owner.id, {
        prompt: "Build a function",
        scope: "focused",
        difficulty: "medium",
      });
      expect(response.status).toBeGreaterThanOrEqual(500);
    }
    expect(calls).toBe(2);
    const list = await profileLogs(app, owner.id, "?status=error");
    expect(list.total).toBe(2);
    const logs = list.items.map((row) => logModel.findOwned(row.id, owner.id)!);
    expect(
      logs.some(
        (row) =>
          row.responseText === "not JSON" &&
          row.error?.code === "MODEL_OUTPUT_INVALID",
      ),
    ).toBe(true);
    const rate = logs.find((row) => row.error?.status === 429)!;
    expect(rate.error?.providerError).toMatchObject({
      code: "rate_limit",
      message: "Capacity exceeded: [REDACTED]",
    });
    expect(rate.providerRequestId).toBe("http-error-id");
    expect(
      (
        await json<{ data: unknown[] }>(
          await request(app, "/challenges/active", owner.id),
        )
      ).data,
    ).toHaveLength(0);
  });

  test("retains full stream events, partial failures, cancellation and all conversation operations", async () => {
    let mode: "success" | "failed" | "incomplete" = "success";
    const llm = loggedModel(() =>
      eventResponse([
        {
          type: "response.created",
          response: {
            id: "resp-stream",
            model: "provider/stream-model",
            status: "in_progress",
          },
        },
        { type: "response.output_text.delta", delta: "First part. " },
        ...(mode === "failed"
          ? [
              {
                type: "error",
                code: "provider_failure",
                message: "Stream broke",
              },
            ]
          : mode === "incomplete"
            ? []
            : [
                { type: "response.output_text.delta", delta: "Second part." },
                {
                  type: "response.completed",
                  response: modelResponse("First part. Second part."),
                },
              ]),
      ]),
    );
    const fake = new FakeModel();
    const app = createApp({ llm: fake });
    const owner = await startProfile(
      app,
      `stream-logs-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const learner: LearnerContext = {
      profileId: owner.id,
      preferences: fake.generationInputs[0]!.learner.preferences,
      recentChallenges: [],
    };
    for (const operation of ["review", "clarify", "hint"] as const) {
      const stream =
        operation === "hint"
          ? llm.generateHint({ challenge, messages: [], learner })
          : llm.respond({
              challenge,
              messages: [],
              learner,
              content: "My solution",
              mode: operation,
              attachments: [
                { filename: "answer.ts", text: "const answer = 42;" },
              ],
            });
      let text = "";
      for await (const delta of stream) text += delta;
      expect(text).toBe("First part. Second part.");
    }
    mode = "failed";
    let partial = "";
    try {
      for await (const delta of llm.generateHint({
        challenge,
        messages: [],
        learner,
      }))
        partial += delta;
    } catch {
      /* expected provider failure */
    }
    expect(partial).toBe("First part. ");
    mode = "incomplete";
    try {
      for await (const _delta of llm.generateHint({
        challenge,
        messages: [],
        learner,
      })) {
        /* consume */
      }
    } catch {
      /* expected incomplete response */
    }
    mode = "success";
    const iterator = llm
      .generateHint({ challenge, messages: [], learner })
      [Symbol.asyncIterator]();
    await iterator.next();
    await iterator.return?.();
    const rows = (await profileLogs(app, owner.id)).items.map((row) =>
      logModel.findOwned(row.id, owner.id)!,
    );
    expect(rows).toHaveLength(6);
    expect(rows.filter((row) => row.status === "success")).toHaveLength(3);
    expect(
      rows.find((row) => row.operation === "review")?.requestBody.input,
    ).toContain("const answer = 42;");
    const success = rows.find((row) => row.status === "success")!;
    expect(success.streamEvents).toHaveLength(4);
    expect(success.responseText).toBe("First part. Second part.");
    expect(success.firstTokenMs).toBeGreaterThanOrEqual(0);
    expect(success.totalTokens).toBe(125);
    expect(
      rows.find((row) => row.error?.code === "MODEL_STREAM_FAILED")
        ?.responseText,
    ).toBe("First part. ");
    expect(
      rows.find((row) => row.error?.code === "MODEL_STREAM_INCOMPLETE")?.status,
    ).toBe("error");
    expect(rows.find((row) => row.status === "cancelled")?.responseText).toBe(
      "First part. ",
    );
  });

  test("paginates and filters on the server, isolates profiles, and preserves unfinished requests", async () => {
    const app = createApp({ llm: new FakeModel() });
    const owner = await startProfile(
      app,
      `paged-logs-${crypto.randomUUID()}@test.dev`,
    );
    const other = await startProfile(
      app,
      `other-logs-${crypto.randomUUID()}@test.dev`,
    );
    for (let i = 0; i < 31; i++)
      logModel.start({
        id: crypto.randomUUID(),
        profileId: owner.id,
        operation: i % 2 ? "hint" : "generation",
        status: i % 2 ? "error" : "success",
        requestedModel: "test-model",
        endpoint: "https://model.test/v1",
        streamed: false,
        preview: `Request number ${i}`,
        requestBody: { input: "full request" },
        responseText: "full response",
        startedAt: new Date(1000 + i),
      });
    const first = await profileLogs(app, owner.id);
    const second = await profileLogs(app, owner.id, "?page=2");
    expect(first.items).toHaveLength(25);
    expect(second.items).toHaveLength(6);
    expect(first.totalPages).toBe(2);
    expect(
      new Set([...first.items, ...second.items].map((row) => row.id)).size,
    ).toBe(31);
    expect(first.items[0]?.preview).toBe("Request number 30");
    expect((await profileLogs(app, owner.id, "?page=999")).page).toBe(2);
    expect(
      (await profileLogs(app, owner.id, "?status=error&operation=hint")).total,
    ).toBe(15);
    expect(
      (await profileLogs(app, owner.id, "?search=number%2028")).total,
    ).toBe(1);
    expect((await profileLogs(app, other.id)).total).toBe(0);
    expect(
      (await request(app, `/logs/${first.items[0]!.id}`, other.id)).status,
    ).toBe(404);
    expect((await app.request("/logs")).status).toBe(401);
    for (const query of [
      "page=0",
      "page=oops",
      "status=unknown",
      "operation=unknown",
    ])
      expect((await request(app, `/logs?${query}`, owner.id)).status).toBe(400);
    const recorder = startAiLog(
      {
        profileId: owner.id,
        operation: "preparation",
        preview: "Pending request",
      },
      { model: "test-model" },
      "https://model.test/v1",
    );
    expect((await profileLogs(app, owner.id, "?status=running")).total).toBe(1);
    logModel.markInterrupted();
    expect((await profileLogs(app, owner.id, "?status=running")).total).toBe(0);
    const cancelled = (await profileLogs(app, owner.id, "?status=cancelled"))
      .items[0]!;
    expect(logModel.findOwned(cancelled.id, owner.id)?.error?.code).toBe(
      "PROCESS_INTERRUPTED",
    );
    recorder.finish("cancelled");
  });
});

describe("structured practice reviews", () => {
  async function fixture() {
    const model = new FakeModel();
    const app = createApp({ llm: model });
    const owner = await startProfile(
      app,
      `practice-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    return { model, app, owner, challenge };
  }
  function result(challenge: Challenge) {
    return {
      verdict: "accepted" as const,
      summary: "The required behavior is supported by source inspection.",
      criteria: challenge.completionCriteria.map((_, i) => ({
        id: `C${i + 1}`,
        status: "met" as const,
        evidence: "The implementation handles this case.",
      })),
      findings: [],
      optionalImprovements: [],
      correctness: {
        score: 4,
        evidence: "Both required behaviors are implemented.",
      },
      understanding: {
        score: 3,
        evidence: "The learner explains grouping and empty inputs.",
      },
      judgment: { score: 2, evidence: "Simple structures suit the task." },
      nextStep: null,
      question: null,
      verification: "inspection_only" as const,
    };
  }
  const inspection = async () => ({
    status: "inspection_only" as const,
    reason: "Inspection fixture, no execution claimed.",
    checks: [],
  });
  test("serves read-only files from owned submission snapshots", async () => {
    const { app, owner, challenge } = await fixture();
    const submitted = await request(
      app,
      `/challenges/${challenge.id}/submissions`,
      owner.id,
      {
        content: "Review the attached source.",
        attachments: [
          {
            filename: "answer.ts",
            text: "export const group = (words: string[]) => words;\n",
          },
        ],
      },
    );
    expect(submitted.status).toBe(202);
    const submission = (
      await json<{ data: { submission: { id: string } } }>(submitted)
    ).data.submission;
    const file = await request(
      app,
      `/submissions/${submission.id}/files?path=answer.ts`,
      owner.id,
    );
    expect(file.status).toBe(200);
    expect(
      (
        await json<{
          data: {
            path: string;
            bytes: number;
            content: string | null;
            binary: boolean;
            tooLarge: boolean;
          };
        }>(file)
      ).data,
    ).toEqual({
      path: "answer.ts",
      content: "export const group = (words: string[]) => words;\n",
      binary: false,
      tooLarge: false,
      bytes: 49,
    });
    expect(
      (
        await request(
          app,
          `/submissions/${submission.id}/files?path=missing.ts`,
          owner.id,
        )
      ).status,
    ).toBe(404);
    const other = await startProfile(
      app,
      `files-other-${crypto.randomUUID()}@test.dev`,
    );
    expect(
      (
        await request(
          app,
          `/submissions/${submission.id}/files?path=answer.ts`,
          other.id,
        )
      ).status,
    ).toBe(404);
  });
  async function finished(
    service: ReturnType<
      typeof import("../src/modules/reviews/review.service").createReviewService
    >,
    id: string,
    owner: string,
  ) {
    for (let i = 0; i < 100; i++) {
      const row = service.get(id, owner);
      if (!["queued", "running"].includes(row.status)) return row;
      await Bun.sleep(10);
    }
    throw new Error("Review fixture timed out");
  }
  test("saved-for-later work stays separate, preserves its contract and can resume", async () => {
    const { app, owner, challenge } = await fixture();
    const saved = await request(
      app,
      `/challenges/${challenge.id}/status`,
      owner.id,
      { status: "saved" },
    );
    expect(saved.status).toBe(200);
    const value = (await json<{ data: Challenge }>(saved)).data;
    expect(value.status).toBe("saved");
    expect(value.completedAt).toBeNull();
    expect(value.contextSnapshot).toEqual(challenge.contextSnapshot);
    expect(value.completionCriteria).toEqual(challenge.completionCriteria);
    const listed = (
      await json<{ data: Challenge[] }>(
        await request(app, "/challenges/saved", owner.id),
      )
    ).data;
    expect(listed.map((c) => c.id)).toEqual([challenge.id]);
    expect(
      (
        await json<{ data: Challenge[] }>(
          await request(app, "/challenges/active", owner.id),
        )
      ).data,
    ).toHaveLength(0);
    expect(
      (
        await json<{ data: Challenge[] }>(
          await request(app, "/challenges/history", owner.id),
        )
      ).data,
    ).toHaveLength(0);
    const other = await startProfile(
      app,
      `later-other-${crypto.randomUUID()}@test.dev`,
    );
    expect(
      (
        await json<{ data: Challenge[] }>(
          await request(app, "/challenges/saved", other.id),
        )
      ).data,
    ).toHaveLength(0);
    const blocked = await request(
      app,
      `/challenges/${challenge.id}/submissions`,
      owner.id,
      { content: "", attachments: [{ filename: "code.py", text: "pass" }] },
    );
    expect(blocked.status).toBe(409);
    await request(app, `/challenges/${challenge.id}/status`, owner.id, {
      status: "active",
    });
    expect(
      (
        await json<{ data: Challenge[] }>(
          await request(app, "/challenges/saved", owner.id),
        )
      ).data,
    ).toHaveLength(0);
    expect(
      (
        await json<{ data: Challenge[] }>(
          await request(app, "/challenges/active", owner.id),
        )
      ).data[0]?.id,
    ).toBe(challenge.id);
  });
  test("saves original context and numeric difficulty separately from review scores", async () => {
    const { app, owner, challenge } = await fixture();
    expect(challenge.estimatedDifficultyScore).toBe(5);
    expect(challenge.contextSnapshot?.selectedDifficulty).toBe("medium");
    const before = JSON.stringify(challenge.contextSnapshot);
    await request(app, "/profiles/preferences", owner.id, {
      aboutMe: "Different future context",
    });
    const saved = await request(app, `/challenges/${challenge.id}`, owner.id);
    expect(
      JSON.stringify(
        (await json<{ data: Challenge }>(saved)).data.contextSnapshot,
      ),
    ).toBe(before);
    const complete = await request(
      app,
      `/challenges/${challenge.id}/complete`,
      owner.id,
      {},
    );
    expect(complete.status).toBe(200);
    expect((await json<{ data: Challenge }>(complete)).data).toMatchObject({
      status: "completed",
      completionSource: "user",
    });
    const resumed = await request(
      app,
      `/challenges/${challenge.id}/status`,
      owner.id,
      { status: "active" },
    );
    expect((await json<{ data: Challenge }>(resumed)).data).toMatchObject({
      status: "active",
      completionSource: null,
      completedAt: null,
    });
    const paused = await request(
      app,
      `/challenges/${challenge.id}/status`,
      owner.id,
      { status: "paused" },
    );
    expect((await json<{ data: Challenge }>(paused)).data.status).toBe(
      "paused",
    );
  });
  test("requires exactly the original criteria, keeps missing scores null, and rejects false acceptance", async () => {
    const { challenge } = await fixture();
    const { validateReview } =
      await import("../src/modules/reviews/review.schema");
    const base = result(challenge);
    expect(validateReview(base, challenge, await inspection()).score).toBe(9);
    expect(
      validateReview(
        {
          ...base,
          understanding: { score: null, evidence: "Not yet explained" },
        },
        challenge,
        await inspection(),
      ).score,
    ).toBeNull();
    expect(() =>
      validateReview({ ...base, criteria: base.criteria.slice(1) }, challenge, {
        status: "inspection_only",
        reason: "",
        checks: [],
      }),
    ).toThrow();
    expect(() =>
      validateReview(
        {
          ...base,
          findings: [
            {
              criterionId: "C1",
              location: "answer.py:2",
              issue: "Incorrect empty behavior",
              evidence: "Returns null",
            },
          ],
        },
        challenge,
        { status: "inspection_only", reason: "", checks: [] },
      ),
    ).toThrow();
    expect(() =>
      validateReview(
        {
          ...base,
          criteria: [
            { ...base.criteria[0]!, status: "unmet" },
            base.criteria[1],
          ],
        },
        challenge,
        { status: "inspection_only", reason: "", checks: [] },
      ),
    ).toThrow();
  });
  test("Codex model preferences persist and reach new review runs", async () => {
    const { app, model, owner } = await fixture();
    const challenge = await createChallenge(app, owner.id, {
      scope: "feature",
    });
    const initial = await request(app, "/profiles/preferences", owner.id);
    expect(
      (await json<{ data: { codexModel: string } }>(initial)).data.codexModel,
    ).toBe("gpt-5.6-sol");
    await request(app, "/profiles/preferences", owner.id, {
      codexModel: "gpt-5.6-terra",
    });
    const reloaded = await request(app, "/profiles/preferences", owner.id);
    expect(
      (await json<{ data: { codexModel: string } }>(reloaded)).data.codexModel,
    ).toBe("gpt-5.6-terra");
    const { createReviewService } =
      await import("../src/modules/reviews/review.service");
    let selected: string | undefined;
    const service = createReviewService(
      model,
      async (input) => {
        selected = input.codexModel;
        return result(challenge);
      },
      inspection,
    );
    const started = await service.submit(challenge.id, owner.id, {
      content: "",
      attachments: [
        {
          filename: "answer.py",
          text:
            "# source comment\n".repeat(3000) + "def group(words): return {}",
        },
      ],
      uploadIds: [],
      projectId: null,
      subdirectory: "",
      baseRevision: "",
    });
    // A large source file uses incremental Codex inspection.
    if (started.review.judge === "codex") {
      await finished(service, started.review.id, owner.id);
      expect(selected).toBe("gpt-5.6-terra");
    } else throw new Error("Fixture must route through Codex.");
  });
  test("ephemeral Codex reviews durably log both wire directions including failed tool calls", async () => {
    const { owner, challenge } = await fixture();
    const { mkdtemp, writeFile, chmod, rm } = await import("node:fs/promises");
    const root = await mkdtemp("/tmp/grill-wire-");
    const binary = root + "/fake-codex";
    const response = result(challenge);
    await writeFile(root + "/answer.py", "def group(words): return {}\n");
    await writeFile(
      binary,
      `#!/usr/bin/env bun
import { createInterface } from "node:readline";
const send = value => process.stdout.write(JSON.stringify(value) + "\\n");
createInterface({input: process.stdin}).on("line", line => {
 const r = JSON.parse(line);
 if (r.method === "initialize") send({id:r.id,result:{}});
 if (r.method === "config/read") send({id:r.id,result:{config:{}}});
 if (r.method === "thread/start") {
  if (!r.params.ephemeral) return send({id:r.id,error:{message:"Must be ephemeral"}});
  send({id:r.id,result:{thread:{id:"ephemeral-fixture"},model:r.params.model}});
 }
 if (r.method === "turn/start") {
  send({id:r.id,result:{turn:{id:"turn-fixture"}}});
  send({id:900,method:"item/tool/call",params:{tool:"grill_read_file",arguments:{path:"missing.py"}}});
 }
 if(r.id===900 && r.result) send({id:901,method:"item/tool/call",params:{tool:"grill_read_file",arguments:{path:"answer.py"}}});
 if(r.id===901 && r.result) {
  send({method:"item/completed",params:{threadId:"ephemeral-fixture",item:{type:"agentMessage",text:${JSON.stringify(JSON.stringify(response))}}}});
  send({method:"turn/completed",params:{threadId:"ephemeral-fixture",turn:{status:"completed"}}});
 }
});
`,
    );
    await chmod(binary, 0o700);
    const previous = process.env.CODEX_BIN;
    process.env.CODEX_BIN = binary;
    try {
      const { codexJudge } = await import("../src/modules/judges/codex");
      let logId = "";
      await codexJudge(
        {
          challenge,
          codexModel: "gpt-5.6-terra",
          content: "",
          attachments: [],
          evidence: await inspection(),
          assistance: { hints: 0, guidance: false },
        },
        root,
        (_progress, ids) => {
          if (ids?.logId) logId = ids.logId;
        },
      );
      const log = logModel.findOwned(logId, owner.id)!;
      expect(log.requestBody.threadStart).toMatchObject({
        ephemeral: true,
        model: "gpt-5.6-terra",
      });
      expect(log.status).toBe("success");
      expect(log.responseText).toContain(response.summary);
      const wire = log.streamEvents as {
        direction?: string;
        message?: {
          id?: number;
          method?: string;
          result?: { success?: boolean };
        };
      }[];
      expect(
        wire.some(
          (e) => e.direction === "sent" && e.message?.method === "initialize",
        ),
      ).toBe(true);
      expect(
        wire.some((e) => e.direction === "received" && e.message?.id === 1),
      ).toBe(true);
      expect(
        wire.some(
          (e) =>
            e.direction === "sent" &&
            e.message?.id === 900 &&
            e.message.result?.success === false,
        ),
      ).toBe(true);
      expect(
        wire.some(
          (e) =>
            e.direction === "sent" &&
            e.message?.id === 901 &&
            e.message.result?.success === true,
        ),
      ).toBe(true);
      expect(
        wire.some(
          (e) =>
            e.direction === "received" &&
            e.message?.method === "turn/completed",
        ),
      ).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.CODEX_BIN;
      else process.env.CODEX_BIN = previous;
      await rm(root, { recursive: true, force: true });
    }
  });
  test("persists accepted reviews without marking the challenge complete", async () => {
    const { model, app, owner, challenge } = await fixture();
    const { createReviewService } =
      await import("../src/modules/reviews/review.service");
    const service = createReviewService(
      {
        ...model,
        prepareBuild: model.prepareBuild.bind(model),
        generateBuild: model.generateBuild.bind(model),
        respond: model.respond.bind(model),
        generateHint: model.generateHint.bind(model),
        judge: async () => result(challenge),
      },
      undefined,
      inspection,
    );
    const started = await service.submit(challenge.id, owner.id, {
      content:
        "I group words by their initial character; empty input leaves the accumulator empty.",
      attachments: [
        {
          filename: "answer.py",
          text: "def group(words):\n    result = {}\n    for word in words:\n        result.setdefault(word[0], []).append(word)\n    return result\n",
        },
      ],
      projectId: null,
      subdirectory: "",
      baseRevision: "",
      uploadIds: [],
    });
    expect(service.list(challenge.id, owner.id)).toHaveLength(1);
    const review = await finished(service, started.review.id, owner.id);
    expect(review.status).toBe("completed");
    expect(review.score).toBe(9);
    const persisted = (
      await json<{ data: Challenge }>(
        await request(app, `/challenges/${challenge.id}`, owner.id),
      )
    ).data;
    expect(persisted.status).toBe("active");
    expect(persisted.completionSource).toBeNull();
  });
  test("failed reviews retain the submission and can retry without duplicating attempts", async () => {
    const { model, owner, challenge } = await fixture();
    const { createReviewService } =
      await import("../src/modules/reviews/review.service");
    const gateway = Object.assign(model, {
      judge: async () => {
        throw new Error("Provider unavailable");
      },
    });
    const service = createReviewService(gateway, undefined, inspection);
    const started = await service.submit(challenge.id, owner.id, {
      content: "def group(words): return {}",
      attachments: [],
      projectId: null,
      subdirectory: "",
      baseRevision: "",
      uploadIds: [],
    });
    expect((await finished(service, started.review.id, owner.id)).status).toBe(
      "failed",
    );
    const retried = service.retry(started.review.id, owner.id, null);
    expect(retried.submissionId).toBe(started.submission.id);
    expect(service.list(challenge.id, owner.id)).toHaveLength(1);
    await finished(service, retried.id, owner.id);
  });
  test("stale acceptance cannot finish a newer submission", async () => {
    const { model, app, owner, challenge } = await fixture();
    const { createReviewService } =
      await import("../src/modules/reviews/review.service");
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const gateway = Object.assign(model, {
      judge: async () => {
        if (++calls === 1) {
          await waiting;
          return result(challenge);
        }
        throw new Error("Second attempt needs its own review");
      },
    });
    const service = createReviewService(gateway, undefined, inspection);
    const input = {
      content: "Implementation",
      attachments: [],
      projectId: null,
      subdirectory: "",
      baseRevision: "",
      uploadIds: [],
    };
    const first = await service.submit(challenge.id, owner.id, input);
    const second = await service.submit(challenge.id, owner.id, input);
    release();
    await finished(service, first.review.id, owner.id);
    await finished(service, second.review.id, owner.id);
    expect(
      (
        await json<{ data: Challenge }>(
          await request(app, `/challenges/${challenge.id}`, owner.id),
        )
      ).data.status,
    ).toBe("active");
  });
  test("snapshots preserve large source files and ignore escaping symlinks without changing the original", async () => {
    const { mkdtemp, writeFile, readFile, symlink, rm } =
      await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { captureSubmission } =
      await import("../src/modules/projects/snapshot");
    const source = await mkdtemp(join(tmpdir(), "grill-snapshot-test-"));
    let snapshot = "";
    try {
      const content = "# source\n".repeat(250000);
      for (let i = 0; i < 8; i++)
        await writeFile(
          join(source, `source${i}.py`),
          i ? "value = 1" : content,
        );
      await writeFile(join(source, ".env"), "SECRET=excluded");
      await symlink("/etc/passwd", join(source, "outside.py"));
      const saved = await captureSubmission({
        id: crypto.randomUUID(),
        root: source,
        content: "",
        attachments: [],
      });
      snapshot = saved.snapshotPath;
      expect(saved.manifest).toHaveLength(8);
      expect(saved.manifest.find((f) => f.path === "source0.py")?.bytes).toBe(
        Buffer.byteLength(content),
      );
      await writeFile(join(source, "source0.py"), "changed afterward");
      expect(await readFile(join(snapshot, "source0.py"), "utf8")).toBe(
        content,
      );
      expect(await readFile(join(source, "source0.py"), "utf8")).toBe(
        "changed afterward",
      );
    } finally {
      await rm(source, { recursive: true, force: true });
      if (snapshot) await rm(snapshot, { recursive: true, force: true });
    }
  });
  test("chunk uploads have no file-size or count cap and are isolated by profile", async () => {
    const { beginUpload, appendUpload, uploadInfo } =
      await import("../src/modules/projects/uploads");
    const owner = crypto.randomUUID();
    const other = crypto.randomUUID();
    const upload = await beginUpload(owner, "large.py");
    const chunk = Buffer.alloc(256 * 1024, 65);
    let offset = 0;
    for (let i = 0; i < 9; i++) {
      const saved = await appendUpload(
        owner,
        upload.id,
        offset,
        chunk.toString("base64"),
        i === 8,
      );
      offset = saved.offset;
    }
    expect((await uploadInfo(owner, upload.id)).offset).toBe(chunk.length * 9);
    expect((await uploadInfo(owner, upload.id)).sealed).toBe(true);
    await expect(uploadInfo(other, upload.id)).rejects.toThrow(
      "Upload not found",
    );
  });
  test("routing uses context capacity without rejecting large projects", async () => {
    const { routeJudge } =
      await import("../src/modules/reviews/review.service");
    expect(
      routeJudge({
        scope: "focused",
        project: false,
        bytes: 500,
        contentBytes: 200,
      }).judge,
    ).toBe("omniroute");
    expect(
      routeJudge({
        scope: "focused",
        project: false,
        bytes: 900000000,
        contentBytes: 0,
      }).judge,
    ).toBe("codex");
    expect(
      routeJudge({
        scope: "system",
        project: true,
        bytes: 2000,
        contentBytes: 0,
      }).judge,
    ).toBe("codex");
  });
});
