import { describe, expect, test } from "bun:test";
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

process.env.DATABASE_URL = ":memory:";

const { createApp } = await import("../src/app");
const { migrateDatabase } = await import("../src/shared/database/db");
migrateDatabase();

const generated: GeneratedBuildContent = {
  title: "Group words by first letter",
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
    return this.final;
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
      difficulty: "easy",
    });
    expect(
      (await json<{ data: ChallengePreparation }>(ready)).data.question,
    ).toBeNull();
    expect(model.prepareInputs.at(-1)?.learner.preferences).toMatchObject({
      languages: ["python"],
      aboutMe: "I learn from examples.",
    });
  });

  test("saves the generated challenge and includes recent challenges", async () => {
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
    expect(challenge.type).toBe("implementation");
    expect(challenge.difficulty).toBe("medium");
    expect(challenge.durationEstimate).toEqual(generated.durationEstimate);
    expect(challenge.implementationMilestones).toEqual([]);
    expect(model.generationInputs).toHaveLength(1);

    for (const difficulty of ["easy", "medium", "hard"] as const) {
      const attemptedOverride = {
        ...generated,
        difficulty: "easy",
        scope: "system",
      };
      model.final = attemptedOverride;
      const build = await createChallenge(app, profile.id, { difficulty });
      expect(build.difficulty).toBe(difficulty);
      expect(build.scope).toBe("focused");
    }
    model.final = {
      ...generated,
      durationEstimate: { minMinutes: 240, maxMinutes: 480 },
      implementationMilestones: [
        "Implement ingestion.",
        "Implement retries.",
        "Verify failure recovery.",
      ],
    };
    const system = await createChallenge(app, profile.id, {
      scope: "system",
      difficulty: "hard",
    });
    const persisted = await request(
      app,
      `/challenges/${system.id}`,
      profile.id,
    );
    expect((await json<{ data: Challenge }>(persisted)).data).toMatchObject({
      scope: "system",
      difficulty: "hard",
      durationEstimate: { minMinutes: 240, maxMinutes: 480 },
      implementationMilestones: model.final.implementationMilestones,
    });
    model.final = generated;

    await createChallenge(app, profile.id, { prompt: "A different request" });
    expect(
      model.generationInputs.at(-1)?.learner.recentChallenges[0]?.title,
    ).toBe(generated.title);
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
        difficulty: "medium",
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
    expect(missingMilestones.status).toBe(502);
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
    expect((await json<{ data: Challenge[] }>(after)).data).toHaveLength(0);
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

  test("enforces file count, type, byte limits, and challenge ownership", async () => {
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
    expect(tooMany.status).toBe(400);

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
    expect(tooLarge.status).toBe(400);

    const notOwned = await request(app, path, other.id, {
      mode: "review",
      content: "Review this",
    });
    expect(notOwned.status).toBe(200);
    expect(await notOwned.text()).toContain("CHALLENGE_NOT_FOUND");
  });
});
