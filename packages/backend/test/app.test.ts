import { afterAll, describe, expect, test } from "bun:test";
import type {
  BuildModelInput,
  LearnerContext,
  ModelGateway,
  QuizModelInput,
  QuizTitleModelInput,
} from "@repo/backend/modules/ai/model-gateway";
import type {
  Challenge,
  GeneratedBuildContent,
  ChallengePreparation,
  BuildGenerationResult,
} from "@repo/backend/modules/challenges/challenge.schema";
import type {
  ChatMessage,
  MessageAttachment,
} from "@repo/backend/modules/messages/message.schema";
import { AppError } from "@repo/backend/shared/errors/app-error";
import type { ChallengeWorkspace } from "@repo/backend/shared/contracts";
import { challengeWorkspacePath } from "@repo/backend/modules/challenges/workspace";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generationPrompt } from "@repo/backend/modules/ai/prompts/index";
import type { GeneratedQuiz } from "@repo/backend/modules/quizzes/quiz.schema";
import type { QuizService } from "@repo/backend/modules/quizzes/quiz.service";
import { fixtureSql } from "./fixture-sql";

const testRoot = await realpath(
  await mkdtemp(join(tmpdir(), "grill-me-tests-")),
);
process.env.SNAPSHOT_ROOT = testRoot + "/snapshots";
process.env.UPLOAD_ROOT = testRoot + "/uploads";
process.env.WORKSPACES_ROOT = testRoot + "/workspaces";
afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

const { createApp } = await import("@repo/backend/app");
const { migrateDatabase } = await import("@repo/backend/shared/database/db");
await migrateDatabase();
for (const table of [
  "project_command_authorizations",
  "project_command_requests",
  "project_preparations",
  "generation_jobs",
  "quiz_attempts",
  "quizzes",
  "harness_attachments",
  "harness_items",
  "harness_turn_attempts",
  "harness_turns",
  "harness_threads",
  "challenges",
  "profile_preferences",
  "profiles",
])
  await fixtureSql(`DELETE FROM ${table}`);

const generated: GeneratedBuildContent = {
  title: "Group words by first letter",
  estimatedDifficultyBand: "medium",
  difficultyReason: "Direct application of known syntax.",
  topic: "TypeScript",
  implementationBoundary: "",
  durationEstimate: { minMinutes: 35, maxMinutes: 50 },
  implementationMilestones: [],
  problemStatement: "Build a function that groups words by their first letter.",
  expectedOutcome: "A function with deterministic, observable return values.",
  completionCriteria: [
    "Returns an empty object for empty input.",
    "Groups repeated first letters without dropping words.",
  ],
};

const readyResult = (
  challenge: GeneratedBuildContent,
): BuildGenerationResult => ({
  status: "ready",
  challenge,
  question: null,
  options: [],
});

class FakeModel implements ModelGateway {
  quizInputs: QuizModelInput[] = [];
  quizTitleInputs: QuizTitleModelInput[] = [];
  quizOutput: GeneratedQuiz | null = null;
  async generateQuiz(input: QuizModelInput): Promise<GeneratedQuiz> {
    this.quizInputs.push(input);
    return (
      this.quizOutput ?? {
        title: "Implementation requirements",
        questions: Array.from({ length: input.questionCount }, (_, index) => ({
          question: `Question ${index + 1}: Which approach correctly meets this challenge's requirements?`,
          options: [
            "Preserve every input item.",
            "Drop repeated input items.",
            "Return only the final item.",
            "Ignore the input entirely.",
          ],
          correctOption: index % 4,
          explanation:
            "The correct choice follows the stated behavior and preserves the required result.",
        })),
      }
    );
  }
  async generateQuizTitle(input: QuizTitleModelInput) {
    this.quizTitleInputs.push(input);
    return "Regenerated quiz title";
  }
  preparation: ChallengePreparation = { question: null, options: [] };
  final = generated;
  generationError: Error | null = null;
  prepareInputs: Omit<BuildModelInput, "clarificationContext">[] = [];
  generationInputs: BuildModelInput[] = [];
  generationResults: BuildGenerationResult[] = [];
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

  async generateBuild(input: BuildModelInput): Promise<BuildGenerationResult> {
    this.generationInputs.push(
      structuredClone({ ...input, signal: undefined }),
    );
    if (this.generationError) throw this.generationError;
    return (
      this.generationResults.shift() ??
      readyResult({ ...this.final, estimatedDifficultyBand: input.difficulty })
    );
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

describe("challenge quizzes", () => {
  type Detail = Awaited<ReturnType<QuizService["detail"]>>;
  type Quiz = Detail["quiz"];
  type Attempt = Detail["attempts"][number];

  async function setup() {
    const model = new FakeModel();
    const app = createApp({ llm: model });
    const owner = await startProfile(
      app,
      `quiz-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const path = `/challenges/${challenge.id}/quizzes`;
    const make = async (
      count: 5 | 10 | 15 = 5,
      requestId = crypto.randomUUID(),
    ) => {
      const response = await request(app, path + "/generate", owner.id, {
        requestId,
        questionCount: count,
        coverage: "mixed",
      });
      expect(response.status).toBe(201);
      return (await json<{ data: Quiz }>(response)).data;
    };
    return { model, app, owner, challenge, path, make };
  }

  test("presets create separate generations with frozen context and no exposed answer keys", async () => {
    const state = await setup();
    for (const count of [5, 10, 15] as const) {
      const quiz = await state.make(count);
      expect(quiz.questions).toHaveLength(count);
      expect(quiz.questions[0]).not.toHaveProperty("correctOption");
      expect(quiz.questions[0]).not.toHaveProperty("explanation");
    }
    const list = await json<{ data: Quiz[] }>(
      await request(state.app, state.path, state.owner.id),
    );
    expect(list.data.map((quiz) => quiz.number)).toEqual([3, 2, 1]);
    expect(state.model.quizInputs[1]!.previousQuestions).toHaveLength(5);
    expect(state.model.quizInputs[0]!.challenge!.problemStatement).toBe(
      state.challenge.problemStatement,
    );
    expect(list.data[0]).not.toHaveProperty("questions");
  });

  test("generation retry and concurrent requests return one quiz", async () => {
    const state = await setup();
    const requestId = crypto.randomUUID();
    const [first, second] = await Promise.all([
      state.make(5, requestId),
      state.make(5, requestId),
    ]);
    expect(first.id).toBe(second.id);
    expect((await state.make(5, requestId)).id).toBe(first.id);
    expect(state.model.quizInputs).toHaveLength(1);
    const [third, fourth] = await Promise.all([state.make(), state.make()]);
    expect(new Set([third.number, fourth.number]).size).toBe(2);
  });

  test("rejects invalid count, duplicate choices, duplicate questions, and wrong count without saving", async () => {
    const state = await setup();
    expect(
      (
        await request(state.app, state.path + "/generate", state.owner.id, {
          requestId: crypto.randomUUID(),
          questionCount: 31,
        })
      ).status,
    ).toBe(400);
    const valid = await state.model.generateQuiz({
      challenge: state.challenge,
      questionCount: 5,
      coverage: "mixed",
      previousQuestions: [],
    });
    for (const invalid of [
      { questions: valid.questions.slice(0, 4) },
      {
        questions: valid.questions.map((q) => ({
          ...q,
          question: valid.questions[0]!.question,
        })),
      },
      {
        questions: valid.questions.map((q) => ({
          ...q,
          options: ["Same choice", "same choice", "Other", "Fourth"],
        })),
      },
      { questions: valid.questions.map((q) => ({ ...q, correctOption: 4 })) },
    ]) {
      state.model.quizOutput = invalid;
      const response = await request(
        state.app,
        state.path + "/generate",
        state.owner.id,
        { requestId: crypto.randomUUID(), questionCount: 5 },
      );
      expect(response.status).toBe(502);
    }
    expect(
      (
        await json<{ data: Quiz[] }>(
          await request(state.app, state.path, state.owner.id),
        )
      ).data,
    ).toHaveLength(0);
  });

  test("saves and resumes answers, grades on the server, and preserves retake history", async () => {
    const state = await setup();
    const quiz = await state.make();
    const path = `${state.path}/${quiz.id}`;
    const begin = () =>
      request(state.app, path + "/attempts", state.owner.id, {});
    const started = (await json<{ data: Attempt }>(await begin())).data;
    expect((await json<{ data: Attempt }>(await begin())).data.id).toBe(
      started.id,
    );
    expect(started.results).toBeNull();
    const attemptPath = `${path}/attempts/${started.id}`;
    const answers = Object.fromEntries(
      quiz.questions.map((q, index) => [q.id, index === 1 ? 0 : index % 4]),
    );
    const partial = { [quiz.questions[0]!.id]: 0 };
    const saved = (
      await json<{ data: Attempt }>(
        await request(state.app, attemptPath + "/answers", state.owner.id, {
          revision: 0,
          answers: partial,
        }),
      )
    ).data;
    expect(saved.revision).toBe(1);
    const detail = (
      await json<{ data: Detail }>(
        await request(state.app, path, state.owner.id),
      )
    ).data;
    expect(detail.attempts[0]!.answers).toEqual(partial);
    expect(detail.attempts[0]!.results).toBeNull();
    expect(
      (
        await request(state.app, attemptPath + "/submit", state.owner.id, {
          revision: 1,
          answers: partial,
        })
      ).status,
    ).toBe(400);
    const submitted = (
      await json<{ data: Attempt }>(
        await request(state.app, attemptPath + "/submit", state.owner.id, {
          revision: 1,
          answers,
        }),
      )
    ).data;
    expect(submitted.score).toBe(4);
    expect(submitted.results).toHaveLength(5);
    expect(submitted.results![1]!.correctOption).toBe(1);
    expect(
      (
        await request(state.app, attemptPath + "/answers", state.owner.id, {
          revision: submitted.revision,
          answers: partial,
        })
      ).status,
    ).toBe(409);
    const repeated = (
      await json<{ data: Attempt }>(
        await request(state.app, attemptPath + "/submit", state.owner.id, {
          revision: 1,
          answers: partial,
        }),
      )
    ).data;
    expect(repeated.score).toBe(4);
    expect(repeated.revision).toBe(submitted.revision);
    const retake = (await json<{ data: Attempt }>(await begin())).data;
    expect(retake.number).toBe(2);
    expect(retake.answers).toEqual({});
    expect(
      (
        await json<{ data: Detail }>(
          await request(state.app, path, state.owner.id),
        )
      ).data.attempts,
    ).toHaveLength(2);
    expect(
      (
        await json<{ data: Challenge }>(
          await request(
            state.app,
            `/challenges/${state.challenge.id}`,
            state.owner.id,
          ),
        )
      ).data.status,
    ).toBe("active");
  });

  test("concurrent saves detect conflicts and reject answers or attempts from another quiz", async () => {
    const state = await setup();
    const [quiz, otherQuiz] = await Promise.all([state.make(), state.make()]);
    const path = `${state.path}/${quiz.id}`;
    const [a, b] = await Promise.all([
      request(state.app, path + "/attempts", state.owner.id, {}),
      request(state.app, path + "/attempts", state.owner.id, {}),
    ]);
    const attempt = (await json<{ data: Attempt }>(a)).data;
    expect((await json<{ data: Attempt }>(b)).data.id).toBe(attempt.id);
    const attemptPath = `${path}/attempts/${attempt.id}/answers`;
    const saves = await Promise.all(
      [0, 1].map((option) =>
        request(state.app, attemptPath, state.owner.id, {
          revision: 0,
          answers: { [quiz.questions[0]!.id]: option },
        }),
      ),
    );
    expect(saves.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(
      (
        await request(state.app, attemptPath, state.owner.id, {
          revision: 1,
          answers: { [otherQuiz.questions[0]!.id]: 0 },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(state.app, attemptPath, state.owner.id, {
          revision: 1,
          answers: { [quiz.questions[0]!.id]: 5 },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          state.app,
          `${state.path}/${otherQuiz.id}/attempts/${attempt.id}/answers`,
          state.owner.id,
          { revision: 1, answers: {} },
        )
      ).status,
    ).toBe(404);
  });

  test("quizzes remain usable on completed challenges and all operations require ownership", async () => {
    const state = await setup();
    await request(
      state.app,
      `/challenges/${state.challenge.id}/complete`,
      state.owner.id,
      {},
    );
    const quiz = await state.make();
    const path = `${state.path}/${quiz.id}`;
    const attempt = (
      await json<{ data: Attempt }>(
        await request(state.app, path + "/attempts", state.owner.id, {}),
      )
    ).data;
    const other = await startProfile(
      state.app,
      `other-quiz-${crypto.randomUUID()}@test.dev`,
    );
    for (const [url, body] of [
      [state.path, undefined],
      [path, undefined],
      [
        state.path + "/generate",
        { requestId: crypto.randomUUID(), questionCount: 5 },
      ],
      [path + "/attempts", {}],
      [`${path}/attempts/${attempt.id}/answers`, { revision: 0, answers: {} }],
      [`${path}/attempts/${attempt.id}/submit`, { revision: 0, answers: {} }],
    ] as const)
      expect((await request(state.app, url, other.id, body)).status).toBe(404);
    expect((await state.app.request(state.path)).status).toBe(401);
  });
});

describe("standalone quizzes", () => {
  type Detail = Awaited<ReturnType<QuizService["detail"]>>;
  type Quiz = Detail["quiz"];
  type Attempt = Detail["attempts"][number];

  async function setup() {
    const model = new FakeModel();
    const app = createApp({ llm: model });
    const owner = await startProfile(
      app,
      `standalone-${crypto.randomUUID()}@test.dev`,
    );
    const input = {
      requestId: crypto.randomUUID(),
      topic: "TypeScript generics",
      difficulty: "hard",
      questionCount: 5,
    };
    const make = async (settings = input) => {
      const response = await request(
        app,
        "/quizzes/generate",
        owner.id,
        settings,
      );
      expect(response.status).toBe(201);
      return (await json<{ data: Quiz }>(response)).data;
    };
    return { model, app, owner, input, make };
  }

  test("generates without a challenge, freezes learner context, and separates scopes", async () => {
    const state = await setup();
    const preferences = await request(
      state.app,
      "/profiles/preferences",
      state.owner.id,
      {
        aboutMe: "I work with TypeScript daily.",
        knownConcepts: ["Mapped types"],
      },
    );
    expect(preferences.status).toBe(200);
    for (const questionCount of [5, 10, 15]) {
      const quiz = await state.make({
        ...state.input,
        questionCount,
        requestId: crypto.randomUUID(),
      });
      expect(quiz.challengeId).toBeNull();
      expect(quiz.topic).toBe(state.input.topic);
      expect(quiz.difficulty).toBe("hard");
      expect(quiz.coverage).toBe("topic");
      expect(quiz.questions).toHaveLength(questionCount);
      expect(quiz.questions[0]).not.toHaveProperty("correctOption");
      expect(quiz.questions[0]).not.toHaveProperty("explanation");
    }
    expect(state.model.quizInputs[0]!.challenge).toBeNull();
    const context = state.model.quizInputs[0]!;
    if (context.challenge !== null)
      throw new Error("Expected standalone context");
    expect(context.preferences.aboutMe).toBe("I work with TypeScript daily.");
    expect(state.model.quizInputs[1]!.previousQuestions).toHaveLength(5);
    const challenge = await createChallenge(state.app, state.owner.id);
    const challengePath = `/challenges/${challenge.id}/quizzes`;
    const challengeQuiz = (
      await json<{ data: Quiz }>(
        await request(state.app, challengePath + "/generate", state.owner.id, {
          requestId: state.input.requestId,
          questionCount: 5,
          coverage: "mixed",
        }),
      )
    ).data;
    expect(challengeQuiz.number).toBe(4);
    const list = (
      await json<{ data: Quiz[] }>(
        await request(state.app, "/quizzes", state.owner.id),
      )
    ).data;
    expect(list.map((quiz) => quiz.number)).toEqual([3, 2, 1]);
    expect(list[0]).not.toHaveProperty("questions");
    expect(
      (
        await json<{ data: Quiz[] }>(
          await request(state.app, challengePath, state.owner.id),
        )
      ).data,
    ).toHaveLength(1);
    expect(
      (await request(state.app, `/quizzes/${challengeQuiz.id}`, state.owner.id))
        .status,
    ).toBe(404);
    expect(
      (
        await request(
          state.app,
          `${challengePath}/${list[0]!.id}`,
          state.owner.id,
        )
      ).status,
    ).toBe(404);
    await state.make({ ...state.input, topic: "SQL joins" });
    expect(state.model.quizInputs.at(-1)!.previousQuestions).toEqual([]);
  });

  test("accepts three-question and thirty-question quizzes", async () => {
    const state = await setup();
    for (const questionCount of [3, 30]) {
      const quiz = await state.make({
        ...state.input,
        questionCount,
        requestId: crypto.randomUUID(),
      });
      expect(quiz.questions).toHaveLength(questionCount);
    }
  });

  test("regenerates a title with the selected model", async () => {
    const state = await setup();
    const quiz = await state.make();
    const selection = {
      providerId: crypto.randomUUID(),
      model: "claude-test",
      reasoningEffort: "low" as const,
    };
    const response = await request(
      state.app,
      `/quizzes/${quiz.id}/title/regenerate`,
      state.owner.id,
      { selection },
    );
    expect(response.status).toBe(200);
    expect((await json<{ data: { title: string } }>(response)).data.title).toBe(
      "Regenerated quiz title",
    );
    expect(state.model.quizTitleInputs.at(-1)?.selection).toEqual(selection);
  });

  test("accepts one-word topics and detailed multiline quiz prompts without truncating their context", async () => {
    const state = await setup();
    const detailed =
      "Compare JavaScript closures and async behavior.\nUse short code-reading examples, include common mistakes, and avoid DOM trivia.\n" +
      "Focus on reasoning about captured variables and execution order. ".repeat(
        8,
      );
    for (const prompt of ["C", "JavaScript", detailed]) {
      const response = await request(
        state.app,
        "/quizzes/generate",
        state.owner.id,
        {
          requestId: crypto.randomUUID(),
          questionCount: 5,
          difficulty: "hard",
          prompt: `  ${prompt}  `,
        },
      );
      expect(response.status).toBe(201);
      const quiz = (await json<{ data: Quiz }>(response)).data;
      expect(quiz.prompt).toBe(prompt.trim());
      const modelInput = state.model.quizInputs.at(-1)!;
      expect(modelInput).toMatchObject({
        challenge: null,
        prompt: prompt.trim(),
        questionCount: 5,
        difficulty: "hard",
      });
      const stored = await fixtureSql(
        "SELECT context_snapshot FROM quizzes WHERE id = $1",
        [quiz.id],
      );
      const snapshot =
        typeof stored[0]!.context_snapshot === "string"
          ? JSON.parse(stored[0]!.context_snapshot)
          : stored[0]!.context_snapshot;
      expect(snapshot.currentRequest).toBe(prompt.trim());
    }
    expect(detailed.length).toBeGreaterThan(200);
    const list = (
      await json<{ data: Quiz[] }>(
        await request(state.app, "/quizzes", state.owner.id),
      )
    ).data;
    expect(list).toHaveLength(3);
    expect(list[0]!.prompt).toBe(detailed.trim());
  });

  test("rejects missing, empty, oversized, and non-text prompts before calling the model", async () => {
    const state = await setup();
    for (const prompt of [undefined, null, "", "   ", "a".repeat(4001), 42]) {
      const response = await request(
        state.app,
        "/quizzes/generate",
        state.owner.id,
        {
          requestId: crypto.randomUUID(),
          questionCount: 5,
          prompt,
        },
      );
      expect(response.status).toBe(400);
    }
    expect(state.model.quizInputs).toHaveLength(0);
  });

  test("deduplicates retries and numbers concurrent generations per profile", async () => {
    const state = await setup();
    const [first, second] = await Promise.all([state.make(), state.make()]);
    expect(first.id).toBe(second.id);
    const restarted = createApp({ llm: state.model });
    const retry = await json<{ data: Quiz }>(
      await request(
        restarted,
        "/quizzes/generate",
        state.owner.id,
        state.input,
      ),
    );
    expect(retry.data.id).toBe(first.id);
    expect(state.model.quizInputs).toHaveLength(1);
    const next = await Promise.all([
      state.make({ ...state.input, requestId: crypto.randomUUID() }),
      state.make({ ...state.input, requestId: crypto.randomUUID() }),
    ]);
    expect(next.map((quiz) => quiz.number).sort()).toEqual([2, 3]);
  });

  test("numbers concurrent standalone and challenge quizzes across app instances", async () => {
    const state = await setup();
    const otherApp = createApp({ llm: state.model });
    const builds = await Promise.all([
      createChallenge(state.app, state.owner.id),
      createChallenge(otherApp, state.owner.id),
      createChallenge(state.app, state.owner.id),
    ]);
    expect(builds.map((build) => build.number).sort()).toEqual([1, 2, 3]);
    const quizzes = await Promise.all([
      state.make(),
      ...builds.map(async (build, index) => {
        const response = await request(
          index % 2 ? state.app : otherApp,
          `/challenges/${build.id}/quizzes/generate`,
          state.owner.id,
          {
            requestId: state.input.requestId,
            questionCount: 5,
            coverage: "mixed",
          },
        );
        expect(response.status).toBe(201);
        return (await json<{ data: Quiz }>(response)).data;
      }),
    ]);
    expect(quizzes.map((quiz) => quiz.number).sort()).toEqual([1, 2, 3, 4]);
    const other = await startProfile(
      state.app,
      `${crypto.randomUUID()}@test.dev`,
    );
    const first = await request(
      state.app,
      "/quizzes/generate",
      other.id,
      state.input,
    );
    expect((await json<{ data: Quiz }>(first)).data.number).toBe(1);
  });

  test("resumes drafts, rejects conflicts and incomplete submissions, and preserves scored retakes", async () => {
    const state = await setup();
    const quiz = await state.make();
    const path = `/quizzes/${quiz.id}`;
    const begin = async () =>
      (
        await json<{ data: Attempt }>(
          await request(state.app, path + "/attempts", state.owner.id, {}),
        )
      ).data;
    const attempt = await begin();
    expect((await begin()).id).toBe(attempt.id);
    const answers = { [quiz.questions[0]!.id]: 0 };
    const saved = (
      await json<{ data: Attempt }>(
        await request(
          state.app,
          `${path}/attempts/${attempt.id}/answers`,
          state.owner.id,
          { revision: 0, answers },
        ),
      )
    ).data;
    expect(saved.results).toBeNull();
    const restarted = createApp({ llm: state.model });
    expect(
      (
        await json<{ data: Detail }>(
          await request(restarted, path, state.owner.id),
        )
      ).data.attempts[0]!.answers,
    ).toEqual(answers);
    const submitPath = `${path}/attempts/${attempt.id}/submit`;
    expect(
      (
        await request(state.app, submitPath, state.owner.id, {
          revision: 0,
          answers,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(state.app, submitPath, state.owner.id, {
          revision: saved.revision,
          answers,
        })
      ).status,
    ).toBe(400);
    const allAnswers = Object.fromEntries(
      quiz.questions.map((question, index) => [question.id, index % 4]),
    );
    const submitted = (
      await json<{ data: Attempt }>(
        await request(state.app, submitPath, state.owner.id, {
          revision: saved.revision,
          answers: allAnswers,
        }),
      )
    ).data;
    expect(submitted.score).toBe(5);
    expect(submitted.results).toHaveLength(5);
    expect(submitted.results![0]!.explanation.length).toBeGreaterThan(10);
    expect(
      (
        await request(
          state.app,
          `${path}/attempts/${attempt.id}/answers`,
          state.owner.id,
          { revision: submitted.revision, answers },
        )
      ).status,
    ).toBe(409);
    const retake = await begin();
    expect(retake.number).toBe(2);
    expect(retake.answers).toEqual({});
    expect(
      (
        await json<{ data: Detail }>(
          await request(state.app, path, state.owner.id),
        )
      ).data.attempts,
    ).toHaveLength(2);
    const otherQuiz = await state.make({
      ...state.input,
      requestId: crypto.randomUUID(),
    });
    expect(
      (
        await request(
          state.app,
          `/quizzes/${otherQuiz.id}/attempts/${retake.id}/answers`,
          state.owner.id,
          { revision: 0, answers: {} },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          state.app,
          `${path}/attempts/${retake.id}/answers`,
          state.owner.id,
          { revision: 0, answers: { [crypto.randomUUID()]: 1 } },
        )
      ).status,
    ).toBe(400);
  });

  test("requires a real profile and prevents access through every other profile's endpoint", async () => {
    const state = await setup();
    const quiz = await state.make();
    const path = `/quizzes/${quiz.id}`;
    const attempt = (
      await json<{ data: Attempt }>(
        await request(state.app, path + "/attempts", state.owner.id, {}),
      )
    ).data;
    const other = await startProfile(
      state.app,
      `other-standalone-${crypto.randomUUID()}@test.dev`,
    );
    expect(
      (
        await json<{ data: Quiz[] }>(
          await request(state.app, "/quizzes", other.id),
        )
      ).data,
    ).toEqual([]);
    for (const [url, body] of [
      [path, undefined],
      [path + "/attempts", {}],
      [`${path}/attempts/${attempt.id}/answers`, { revision: 0, answers: {} }],
      [`${path}/attempts/${attempt.id}/submit`, { revision: 0, answers: {} }],
    ] as const) {
      expect((await request(state.app, url, other.id, body)).status).toBe(404);
      expect(
        (
          await state.app.request(
            url,
            body ? { method: "POST", body: JSON.stringify(body) } : {},
          )
        ).status,
      ).toBe(401);
    }
    expect((await state.app.request("/quizzes")).status).toBe(401);
    expect(
      (
        await request(
          state.app,
          "/quizzes/generate",
          crypto.randomUUID(),
          state.input,
        )
      ).status,
    ).toBe(401);
    const otherQuiz = (
      await json<{ data: Quiz }>(
        await request(state.app, "/quizzes/generate", other.id, state.input),
      )
    ).data;
    expect(otherQuiz.number).toBe(1);
    expect(otherQuiz.id).not.toBe(quiz.id);
  });

  test("validates settings and model output without saving failed generations", async () => {
    const state = await setup();
    for (const overrides of [
      { topic: "   " },
      { topic: "a".repeat(201) },
      { difficulty: "expert" },
      { questionCount: 31 },
      { topic: null },
    ]) {
      expect(
        (
          await request(state.app, "/quizzes/generate", state.owner.id, {
            ...state.input,
            ...overrides,
          })
        ).status,
      ).toBe(400);
    }
    expect(state.model.quizInputs).toHaveLength(0);
    state.model.quizOutput = { questions: [] };
    expect(
      (
        await request(
          state.app,
          "/quizzes/generate",
          state.owner.id,
          state.input,
        )
      ).status,
    ).toBe(502);
    expect(
      (
        await json<{ data: Quiz[] }>(
          await request(state.app, "/quizzes", state.owner.id),
        )
      ).data,
    ).toEqual([]);
    state.model.quizOutput = null;
    const quiz = await state.make({ ...state.input, topic: " Go " });
    expect(quiz.number).toBe(1);
    expect(quiz.topic).toBe("Go");
  });
});

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

describe("challenge workspaces", () => {
  test("creates a scoped workspace on generation and never replaces user files", async () => {
    const model = new FakeModel();
    model.final = {
      ...generated,
      topic: "TypeScript",
    };
    const app = createApp({ llm: model });
    const profile = await startProfile(
      app,
      `workspace-${crypto.randomUUID()}@test.dev`,
    );
    const build = await createChallenge(app, profile.id);
    expect(build.workspacePath).toContain(
      `/profiles/${profile.id}/0001-group-words-by-first-letter-`,
    );
    const workspacePath = build.workspacePath!;

    const response = await request(
      app,
      `/challenges/${build.id}/workspace`,
      profile.id,
    );
    expect(response.status).toBe(200);
    const workspace = (await json<{ data: ChallengeWorkspace }>(response)).data;
    expect(workspace.path).toBe(workspacePath);
    expect(workspace.initialized).toBe(false);
    expect(workspace.starterFile).toBeNull();

    await writeFile(join(workspace.path, "README.md"), "My notes\n");
    await writeFile(join(workspace.path, "solution.ts"), "My implementation\n");
    const again = await request(
      app,
      `/challenges/${build.id}/workspace`,
      profile.id,
    );
    const preserved = (await json<{ data: ChallengeWorkspace }>(again)).data;
    expect(preserved.initialized).toBe(false);
    expect(await readFile(join(workspace.path, "README.md"), "utf8")).toBe(
      "My notes\n",
    );
    expect(await readFile(join(workspace.path, "solution.ts"), "utf8")).toBe(
      "My implementation\n",
    );

    const other = await startProfile(
      app,
      `workspace-other-${crypto.randomUUID()}@test.dev`,
    );
    const forbidden = await request(
      app,
      `/challenges/${build.id}/workspace`,
      other.id,
    );
    expect(forbidden.status).toBe(404);
  });

  test("creates and persists a workspace for a challenge without a recorded path", async () => {
    const root = join(testRoot, `lazy-root-${crypto.randomUUID()}`);
    const model = new FakeModel();
    model.final = {
      ...generated,
    };
    const app = createApp({ llm: model, workspaceRoot: () => root });
    const profile = await startProfile(
      app,
      `workspace-lazy-${crypto.randomUUID()}@test.dev`,
    );
    const build = await createChallenge(app, profile.id);
    const path = challengeWorkspacePath(root, build);
    await rm(build.workspacePath!, { recursive: true, force: true });
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "solution.ts"), "my own starter\n");
    await fixtureSql("UPDATE challenges SET workspace_path=NULL WHERE id=$1", [
      build.id,
    ]);

    const response = await request(
      app,
      `/challenges/${build.id}/workspace`,
      profile.id,
    );
    expect(response.status).toBe(200);
    const workspace = (await json<{ data: ChallengeWorkspace }>(response)).data;
    expect(workspace).toMatchObject({
      path,
      initialized: true,
      starterFile: null,
    });
    expect(await readFile(join(path, "solution.ts"), "utf8")).toBe(
      "my own starter\n",
    );
    const detail = await json<{ data: Challenge }>(
      await request(app, `/challenges/${build.id}`, profile.id),
    );
    expect(detail.data.workspacePath).toBe(path);

    const restarted = createApp({ llm: model, workspaceRoot: () => root });
    const again = await json<{ data: ChallengeWorkspace }>(
      await request(restarted, `/challenges/${build.id}/workspace`, profile.id),
    );
    expect(again.data).toMatchObject({ path, initialized: false });
  });

  test("keeps a challenge usable when workspace creation fails and recovers later", async () => {
    const blocked = join(testRoot, `blocked-root-${crypto.randomUUID()}`);
    await writeFile(blocked, "not a folder");
    let root = blocked;
    const app = createApp({ llm: new FakeModel(), workspaceRoot: () => root });
    const profile = await startProfile(
      app,
      `workspace-failure-${crypto.randomUUID()}@test.dev`,
    );
    const build = await createChallenge(app, profile.id);
    expect(build.workspacePath).toBeNull();

    const failed = await request(
      app,
      `/challenges/${build.id}/workspace`,
      profile.id,
    );
    expect(failed.status).toBe(503);
    expect(await json<{ error: { code: string } }>(failed)).toMatchObject({
      error: { code: "WORKSPACE_ROOT_UNAVAILABLE" },
    });
    expect(
      (
        await json<{ data: Challenge }>(
          await request(app, `/challenges/${build.id}`, profile.id),
        )
      ).data.id,
    ).toBe(build.id);

    root = join(testRoot, `recovered-root-${crypto.randomUUID()}`);
    const recovered = await json<{ data: ChallengeWorkspace }>(
      await request(app, `/challenges/${build.id}/workspace`, profile.id),
    );
    expect(recovered.data.path).toBe(challengeWorkspacePath(root, build));
    expect(
      (
        await json<{ data: Challenge }>(
          await request(app, `/challenges/${build.id}`, profile.id),
        )
      ).data.workspacePath,
    ).toBe(recovered.data.path);
  });

  test("coalesces concurrent workspace preparation", async () => {
    const root = join(testRoot, `concurrent-root-${crypto.randomUUID()}`);
    const app = createApp({
      llm: new FakeModel(),
      workspaceRoot: () => root,
    });
    const profile = await startProfile(
      app,
      `workspace-concurrent-${crypto.randomUUID()}@test.dev`,
    );
    const build = await createChallenge(app, profile.id);
    const path = challengeWorkspacePath(root, build);
    await rm(build.workspacePath!, { recursive: true, force: true });
    await fixtureSql("UPDATE challenges SET workspace_path=NULL WHERE id=$1", [
      build.id,
    ]);

    const [first, second] = await Promise.all([
      request(app, `/challenges/${build.id}/workspace`, profile.id),
      request(app, `/challenges/${build.id}/workspace`, profile.id),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await json<{ data: ChallengeWorkspace }>(first)).data.path).toBe(
      path,
    );
    expect((await json<{ data: ChallengeWorkspace }>(second)).data.path).toBe(
      path,
    );
    const later = await json<{ data: ChallengeWorkspace }>(
      await request(app, `/challenges/${build.id}/workspace`, profile.id),
    );
    expect(later.data.initialized).toBe(false);
  });

  test("relinks a copied workspace root after the old root disappears", async () => {
    const firstRoot = join(testRoot, `copy-first-${crypto.randomUUID()}`);
    const secondRoot = join(testRoot, `copy-second-${crypto.randomUUID()}`);
    let root = firstRoot;
    const app = createApp({ llm: new FakeModel(), workspaceRoot: () => root });
    const profile = await startProfile(
      app,
      `workspace-copy-${crypto.randomUUID()}@test.dev`,
    );
    const build = await createChallenge(app, profile.id);
    await writeFile(join(build.workspacePath!, "answer.ts"), "my answer\n");

    await cp(firstRoot, secondRoot, { recursive: true });
    await rm(firstRoot, { recursive: true, force: true });
    root = secondRoot;
    const response = await json<{ data: ChallengeWorkspace }>(
      await request(app, `/challenges/${build.id}/workspace`, profile.id),
    );
    expect(response.data.path).toBe(challengeWorkspacePath(secondRoot, build));
    expect(await readFile(join(response.data.path, "answer.ts"), "utf8")).toBe(
      "my answer\n",
    );
    const detail = await json<{ data: Challenge }>(
      await request(app, `/challenges/${build.id}`, profile.id),
    );
    expect(detail.data.workspacePath).toBe(response.data.path);
  });

  test("explicit relinking keeps files in the recorded folder", async () => {
    const firstRoot = join(testRoot, `relink-first-${crypto.randomUUID()}`);
    const secondRoot = join(testRoot, `relink-second-${crypto.randomUUID()}`);
    let root = firstRoot;
    const app = createApp({ llm: new FakeModel(), workspaceRoot: () => root });
    const profile = await startProfile(
      app,
      `workspace-relink-${crypto.randomUUID()}@test.dev`,
    );
    const build = await createChallenge(app, profile.id);
    const recorded = build.workspacePath!;
    await writeFile(join(recorded, "notes.txt"), "keep me\n");

    root = secondRoot;
    const response = await request(
      app,
      `/challenges/${build.id}/workspace/relink`,
      profile.id,
      {},
    );
    expect(response.status).toBe(200);
    const workspace = (await json<{ data: ChallengeWorkspace }>(response)).data;
    expect(workspace.path).toBe(challengeWorkspacePath(secondRoot, build));
    expect(await readFile(join(recorded, "notes.txt"), "utf8")).toBe(
      "keep me\n",
    );
    const detail = await json<{ data: Challenge }>(
      await request(app, `/challenges/${build.id}`, profile.id),
    );
    expect(detail.data.workspacePath).toBe(workspace.path);
  });

  test("reports the recorded folder when it is not a directory", async () => {
    const root = join(testRoot, `recorded-root-${crypto.randomUUID()}`);
    const app = createApp({ llm: new FakeModel(), workspaceRoot: () => root });
    const profile = await startProfile(
      app,
      `workspace-recorded-${crypto.randomUUID()}@test.dev`,
    );
    const build = await createChallenge(app, profile.id);
    const recorded = build.workspacePath!;
    await rm(recorded, { recursive: true, force: true });
    await writeFile(recorded, "not a folder");

    const response = await request(
      app,
      `/challenges/${build.id}/workspace`,
      profile.id,
    );
    expect(response.status).toBe(503);
    expect(
      await json<{
        error: { code: string; details: { path: string } };
      }>(response),
    ).toMatchObject({
      error: {
        code: "WORKSPACE_UNAVAILABLE",
        details: { path: recorded },
      },
    });
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

  test("saves the generated challenge without history enrichment", async () => {
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
      model.final = generated;
      const build = await createChallenge(app, profile.id, { difficulty });
      expect(build.difficulty).toBe(difficulty);
      expect(build.contextualDifficulty).toBe(difficulty);
      expect(build.scope).toBe("focused");
      const policy = generationPrompt(model.generationInputs.at(-1)!);
      expect(JSON.parse(policy.input).selectedDifficulty).toBe(difficulty);
      expect(policy.instructions).toContain(
        "Never generate numeric difficulty",
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
    expect(model.generationInputs.at(-1)?.learner.recentChallenges).toEqual([]);
    const active = await request(app, "/challenges/active", profile.id);
    expect(
      (await json<{ data: Challenge[] }>(active)).data.length,
    ).toBeGreaterThan(0);
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

  test("reads stored challenges that exceed the current brief limits", async () => {
    const app = createApp({ llm: new FakeModel() });
    const profile = await startProfile(
      app,
      `stored-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, profile.id);
    const longStatement = "Stored brief paragraph. ".repeat(400);
    await fixtureSql(
      "UPDATE challenges SET problem_statement = $1 WHERE id = $2",
      [longStatement, challenge.id],
    );

    const active = await request(app, "/challenges/active", profile.id);
    expect(active.status).toBe(200);
    const stored = (await json<{ data: Challenge[] }>(active)).data.find(
      (item) => item.id === challenge.id,
    );
    expect(stored?.problemStatement).toBe(longStatement);
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

describe("home prompt enhancement", () => {});

describe("challenge archives", () => {
  test("archive and restore preserve lifecycle state, contracts, messages and quizzes", async () => {
    const app = createApp({ llm: new FakeModel() });
    const owner = await startProfile(
      app,
      `archive-${crypto.randomUUID()}@test.dev`,
    );
    const other = await startProfile(
      app,
      `archive-other-${crypto.randomUUID()}@test.dev`,
    );
    for (const status of ["active", "paused", "completed"] as const) {
      const challenge = await createChallenge(app, owner.id);
      const path = `/challenges/${challenge.id}`;
      if (status === "completed")
        await request(app, path + "/complete", owner.id, {});
      else if (status === "paused")
        await request(app, path + "/status", owner.id, { status });
      const before = (
        await json<{ data: Challenge }>(await request(app, path, owner.id))
      ).data;
      const messages = await (
        await request(app, path + "/messages", owner.id)
      ).json();
      const quiz = await request(app, path + "/quizzes/generate", owner.id, {
        requestId: crypto.randomUUID(),
        questionCount: 5,
        coverage: "mixed",
      });
      expect(quiz.status).toBe(201);
      const quizzesBefore = await (
        await request(app, path + "/quizzes", owner.id)
      ).json();
      expect((await request(app, path + "/archive", other.id, {})).status).toBe(
        404,
      );
      const archived = await request(app, path + "/archive", owner.id, {});
      expect(archived.status).toBe(200);
      const value = (
        await json<{ data: Challenge & { archivedAt: string } }>(archived)
      ).data;
      expect(value.archivedAt).not.toBeNull();
      const unarchived: Challenge = { ...value, archivedAt: null };
      expect(unarchived).toEqual(before);
      expect(
        (
          await json<{ data: Challenge[] }>(
            await request(app, "/challenges/archived", owner.id),
          )
        ).data.map((c) => c.id),
      ).toContain(challenge.id);
      expect(
        (
          await json<{ data: Challenge[] }>(
            await request(app, "/challenges/active", owner.id),
          )
        ).data.map((c) => c.id),
      ).not.toContain(challenge.id);
      expect(
        (
          await json<{ data: Challenge[] }>(
            await request(app, "/challenges/history", owner.id),
          )
        ).data.map((c) => c.id),
      ).not.toContain(challenge.id);
      const again = (
        await json<{ data: Challenge & { archivedAt: string } }>(
          await request(app, path + "/archive", owner.id, {}),
        )
      ).data;
      expect(again.archivedAt).toBe(value.archivedAt);
      expect(
        await (await request(app, path + "/messages", owner.id)).json(),
      ).toEqual(messages);
      expect(
        await (await request(app, path + "/quizzes", owner.id)).json(),
      ).toEqual(quizzesBefore);
      for (const endpoint of ["complete", "status"]) {
        expect(
          (
            await request(app, path + "/" + endpoint, owner.id, {
              status: "active",
              content: "pass",
              attachments: [],
            })
          ).status,
        ).toBe(409);
      }
      expect((await request(app, path + "/restore", other.id, {})).status).toBe(
        404,
      );
      const restored = await request(app, path + "/restore", owner.id, {});
      expect((await json<{ data: Challenge }>(restored)).data).toEqual(before);
    }
    expect(
      (
        await json<{ data: Challenge[] }>(
          await request(app, "/challenges/archived", other.id),
        )
      ).data,
    ).toHaveLength(0);
    expect((await app.request("/challenges/archived")).status).toBe(401);
    const legacy = await createChallenge(app, owner.id);
    await request(app, `/challenges/${legacy.id}/status`, owner.id, {
      status: "saved",
    });
    expect(
      (
        await json<{ data: Challenge[] }>(
          await request(app, "/challenges/archived", owner.id),
        )
      ).data.map((c) => c.id),
    ).toContain(legacy.id);
    const restored = await request(
      app,
      `/challenges/${legacy.id}/restore`,
      owner.id,
      {},
    );
    expect((await json<{ data: Challenge }>(restored)).data).toMatchObject({
      status: "active",
      archivedAt: null,
    });
  });
});

describe("bounded challenge generation", () => {
  test("System Easy generates once with a matching band", async () => {
    const model = new FakeModel();
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
    expect(challenge.estimatedDifficultyScore).toBeNull();
    expect(generationPrompt(model.generationInputs[0]!).instructions).toContain(
      "Easy systems use one service",
    );
  });
  test("a valid long response is saved without regeneration", async () => {
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

describe("developer profile and frozen context", () => {
  test("partial and legacy writes preserve developer data; timestamps reflect meaningful changes only", async () => {
    const app = createApp({ llm: new FakeModel() });
    const owner = await startProfile(
      app,
      `context-${crypto.randomUUID()}@test.dev`,
    );
    const preferences = async (input?: unknown) =>
      (
        await json<{ data: LearnerContext["preferences"] }>(
          await request(app, "/profiles/preferences", owner.id, input),
        )
      ).data;
    expect((await preferences()).developerContextUpdatedAt).toBeNull();
    const saved = await preferences({
      displayName: "Alex",
      projects: [
        {
          name: "Cache",
          technologies: ["node", "Node.js", "Astro"],
          contribution: "Implemented expiry.",
        },
      ],
      languages: ["TS", "TypeScript", "Clojure", "clojure"],
      stack: ["Postgres", "Astro", "astro"],
      aboutMe: "I build APIs.",
      knownConcepts: ["HTTP"],
      topicFamiliarity: [{ topic: "Go channels", familiarity: "new" }],
    });
    expect(saved.languages).toEqual(["typescript", "Clojure"]);
    expect(saved.stack).toEqual(["postgresql", "Astro"]);
    expect(saved.projects[0]?.technologies).toEqual(["nodejs", "Astro"]);
    expect(saved.developerContextUpdatedAt).not.toBeNull();
    expect(new Date(saved.developerContextUpdatedAt!).toISOString()).toBe(
      saved.developerContextUpdatedAt!,
    );
    const unchanged = await preferences(saved);
    expect(unchanged.developerContextUpdatedAt).toBe(
      saved.developerContextUpdatedAt,
    );
    const modelOnly = await preferences({
      codexModel: "fixture-model",
      developerContextUpdatedAt: "2099-01-01T00:00:00Z",
    });
    expect(modelOnly.developerContextUpdatedAt).toBe(
      saved.developerContextUpdatedAt,
    );
    expect(modelOnly).toMatchObject({
      displayName: "Alex",
      projects: saved.projects,
      languages: saved.languages,
      aboutMe: saved.aboutMe,
    });
    expect(
      (await preferences({ includeRecentChallenges: true }))
        .developerContextUpdatedAt,
    ).toBe(saved.developerContextUpdatedAt);
    const olderClient = await preferences({
      experienceLevel: "junior",
      languages: ["typescript"],
      aboutMe: "Changed background",
    });
    expect(olderClient.displayName).toBe("Alex");
    expect(olderClient.projects).toEqual(saved.projects);
    expect(olderClient.developerContextUpdatedAt).not.toBe(
      saved.developerContextUpdatedAt,
    );
    const cleared = await preferences({
      displayName: null,
      projects: [],
      languages: [],
      stack: [],
      aboutMe: null,
    });
    expect(cleared).toMatchObject({
      displayName: null,
      projects: [],
      languages: [],
      stack: [],
      aboutMe: null,
    });
    expect(cleared.developerContextUpdatedAt).not.toBe(
      olderClient.developerContextUpdatedAt,
    );
    expect(
      (
        await request(app, "/profiles/preferences", owner.id, {
          projects: Array.from({ length: 11 }, () => saved.projects[0]),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app, "/profiles/preferences", owner.id, {
          displayName: "x".repeat(121),
        })
      ).status,
    ).toBe(400);
  });

  test("legacy unknown timestamps stay null and read defaults do not rewrite stored preferences", async () => {
    const app = createApp({ llm: new FakeModel() });
    const owner = await startProfile(
      app,
      `legacy-context-${crypto.randomUUID()}@test.dev`,
    );
    const old = {
      experienceLevel: "junior",
      languages: ["typescript"],
      stack: ["react"],
      learningGoals: [],
      currentFocus: null,
    };
    await fixtureSql(
      "UPDATE profile_preferences SET guided_preferences=$1::jsonb, developer_context_updated_at=NULL WHERE profile_id=$2",
      [old, owner.id],
    );
    const response = (
      await json<{ data: LearnerContext["preferences"] }>(
        await request(app, "/profiles/preferences", owner.id),
      )
    ).data;
    expect(response).toMatchObject({
      displayName: null,
      projects: [],
      developerContextUpdatedAt: null,
    });
    const row = await fixtureSql(
      "SELECT guided_preferences FROM profile_preferences WHERE profile_id=$1",
      [owner.id],
    );
    expect(row[0]!.guided_preferences).toEqual(old);
    const unchanged = (
      await json<{ data: LearnerContext["preferences"] }>(
        await request(app, "/profiles/preferences", owner.id, {
          codexModel: "fixture-model",
        }),
      )
    ).data;
    expect(unchanged.developerContextUpdatedAt).toBeNull();
  });

  test("one projection selects at most three related projects, strips identity, and stays frozen", async () => {
    const model = new FakeModel();
    const app = createApp({ llm: model });
    const owner = await startProfile(
      app,
      `projection-${crypto.randomUUID()}@test.dev`,
    );
    await request(app, "/profiles/preferences", owner.id, {
      displayName: "Alex Rivera",
      aboutMe:
        "Alex Rivera builds APIs. alex@example.com +1 555 123 4567 https://example.com",
      languages: ["python"],
      projects: [
        {
          name: "Unrelated",
          technologies: ["Python"],
          contribution: "Rendered images.",
        },
        ...["First", "Second", "Third", "Fourth"].map((name) => ({
          name,
          technologies: ["golang"],
          contribution: "Coordinated Go channels.",
        })),
      ],
      topicFamiliarity: [
        { topic: "Go channels", familiarity: "new" },
        { topic: "React rendering", familiarity: "comfortable" },
      ],
    });
    const input = {
      prompt: "Practice golang channels",
      scope: "focused",
      difficulty: "easy",
      familiarity: "practiced",
      emphasis: "Shutdown",
    };
    await request(app, "/challenges/prepare", owner.id, input);
    const challenge = await createChallenge(app, owner.id, input);
    const { requestPromptContext } =
      await import("@repo/backend/modules/ai/prompts/core");
    const preparation = JSON.parse(
      requestPromptContext(model.prepareInputs[0]!),
    );
    const generation = JSON.parse(
      requestPromptContext(model.generationInputs[0]!),
    );
    expect(preparation.developerContext).toEqual(generation.developerContext);
    expect(generation.familiarity).toBe("practiced");
    expect(
      generation.developerContext.projects.map(
        (project: { name: string }) => project.name,
      ),
    ).toEqual(["First", "Second", "Third"]);
    expect(generation.developerContext.topicFamiliarity).toEqual([
      { topic: "Go channels", familiarity: "new" },
    ]);
    for (const secret of [
      owner.id,
      owner.email,
      "Alex Rivera",
      "alex@example.com",
      "555 123",
      "https://example.com",
    ])
      expect(JSON.stringify(generation)).not.toContain(secret);
    expect(generation).not.toHaveProperty("recentBuilds");
    expect(generation.developerContext.updatedAt).toMatch(/Z$/);
    expect(challenge.contextSnapshot?.developerContext).toEqual(
      generation.developerContext,
    );
    const frozen = JSON.stringify(challenge.contextSnapshot);
    await request(app, "/profiles/preferences", owner.id, {
      aboutMe: "New background",
      projects: [],
    });
    const stored = (
      await json<{ data: Challenge }>(
        await request(app, `/challenges/${challenge.id}`, owner.id),
      )
    ).data;
    expect(JSON.stringify(stored.contextSnapshot)).toBe(frozen);
    const future = await createChallenge(app, owner.id, {
      prompt: "Rust iterators",
    });
    expect(
      (future.contextSnapshot?.developerContext as { projects: unknown[] })
        .projects,
    ).toEqual([]);
  });

  test("historical numeric estimates, legacy requirements and old snapshot shapes remain readable", async () => {
    const app = createApp({ llm: new FakeModel() });
    const owner = await startProfile(
      app,
      `historic-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id);
    const snapshot = {
      technicalContext: { experienceLevel: "Junior" },
      selectedDifficulty: "medium",
    };
    await fixtureSql(
      "UPDATE challenges SET estimated_difficulty_score=7, implementation_milestones=$1::jsonb, context_snapshot=$2::jsonb, prompt_version='practice-v2.3' WHERE id=$3",
      [["Legacy milestone"], snapshot, challenge.id],
    );
    const stored = (
      await json<{ data: Challenge }>(
        await request(app, `/challenges/${challenge.id}`, owner.id),
      )
    ).data;
    expect(stored.estimatedDifficultyScore).toBe(7);
    expect(stored.contextSnapshot).toEqual(snapshot);
  });
});

describe("band calibration and essential clarification", () => {
  test("one mismatch receives reasoning feedback and a second matching result saves with null numeric difficulty", async () => {
    const model = new FakeModel();
    model.generationResults = [
      readyResult({ ...generated, estimatedDifficultyBand: "hard" }),
      readyResult({
        ...generated,
        problemStatement:
          "Group words by their first letter with straightforward behavior.",
        estimatedDifficultyBand: "easy",
      }),
    ];
    const app = createApp({ llm: model });
    const owner = await startProfile(
      app,
      `corrective-${crypto.randomUUID()}@test.dev`,
    );
    const challenge = await createChallenge(app, owner.id, {
      difficulty: "easy",
    });
    expect(model.generationInputs).toHaveLength(2);
    expect(model.generationInputs[0]?.calibrationFeedback).toBeUndefined();
    expect(model.generationInputs[1]?.calibrationFeedback).toMatchObject({
      selectedDifficulty: "easy",
      estimatedBand: "hard",
    });
    expect(generationPrompt(model.generationInputs[1]!).instructions).toContain(
      "Relabeling the previous task alone is invalid",
    );
    expect(challenge.estimatedDifficultyScore).toBeNull();
    expect(challenge.contextualDifficulty).toBe("easy");
    expect(challenge.contextSnapshot).toMatchObject({
      contractVersion: 2,
      calibrationVersion: "difficulty-bands-v1",
    });
    const { buildJsonSchema } = await import("./fixtures/output-contract");
    expect(JSON.stringify(buildJsonSchema("system"))).not.toContain(
      "estimatedDifficultyScore",
    );
  });

  test("exactly two mismatches return a retryable error without saving a challenge or messages", async () => {
    const model = new FakeModel();
    model.generationResults = [
      readyResult({ ...generated, estimatedDifficultyBand: "hard" }),
      readyResult({ ...generated, estimatedDifficultyBand: "medium" }),
    ];
    const app = createApp({ llm: model });
    const owner = await startProfile(
      app,
      `mismatch-${crypto.randomUUID()}@test.dev`,
    );
    const response = await request(app, "/challenges/generate", owner.id, {
      prompt: "TypeScript grouping",
      scope: "focused",
      difficulty: "easy",
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: { code: "MODEL_DIFFICULTY_MISMATCH", retryable: true },
    });
    expect(model.generationInputs).toHaveLength(2);
    expect(
      (
        await json<{ data: Challenge[] }>(
          await request(app, "/challenges/active", owner.id),
        )
      ).data,
    ).toEqual([]);
    expect(
      await fixtureSql("SELECT id FROM challenges WHERE profile_id=$1", [
        owner.id,
      ]),
    ).toHaveLength(0);
  });

  test("generation independently asks essential questions and receives ordered answers on each bounded attempt", async () => {
    const model = new FakeModel();
    const app = createApp({ llm: model });
    const owner = await startProfile(
      app,
      `clarify-${crypto.randomUUID()}@test.dev`,
    );
    const first = {
      status: "needs_clarification" as const,
      challenge: null,
      question: "What is the external API contract?",
      options: [],
    };
    model.generationResults = [
      first,
      {
        ...first,
        question: "Which conflicting behavior takes priority?",
        options: ["Preserve order", "Process immediately"],
      },
    ];
    const input = {
      prompt: "Integrate this private tool",
      scope: "focused",
      difficulty: "medium",
    };
    const blocked = await request(app, "/challenges/generate", owner.id, input);
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({
      error: {
        code: "CHALLENGE_NEEDS_CLARIFICATION",
        details: { question: first.question, options: [] },
      },
    });
    const bypass = await request(app, "/challenges/generate", owner.id, input);
    expect(bypass.status).toBe(409);
    expect(model.generationInputs).toHaveLength(1);
    const answer = {
      question: first.question,
      answer: "Use the supplied function signature.",
    };
    const next = await request(app, "/challenges/generate", owner.id, {
      ...input,
      clarificationContext: answer,
    });
    expect(next.status).toBe(409);
    const second = {
      question: "Which conflicting behavior takes priority?",
      answer: "Preserve order",
    };
    const complete = await request(app, "/challenges/generate", owner.id, {
      ...input,
      clarificationHistory: [answer, second],
    });
    expect(complete.status).toBe(201);
    expect(model.generationInputs.at(-1)?.clarificationHistory).toEqual([
      answer,
      second,
    ]);
    expect(model.generationInputs).toHaveLength(3);
  });

  test("a valid preparation question cannot be bypassed; free-text questions need no options", async () => {
    const model = new FakeModel();
    model.preparation = {
      question: "Provide the private API signature?",
      options: [],
    };
    const app = createApp({ llm: model });
    const owner = await startProfile(
      app,
      `prepared-${crypto.randomUUID()}@test.dev`,
    );
    const input = {
      prompt: "Use my private SDK",
      scope: "focused",
      difficulty: "medium",
    };
    expect(
      (await request(app, "/challenges/prepare", owner.id, input)).status,
    ).toBe(200);
    expect(
      (await request(app, "/challenges/generate", owner.id, input)).status,
    ).toBe(409);
    expect(model.generationInputs).toHaveLength(0);
    expect(
      (
        await request(app, "/challenges/generate", owner.id, {
          ...input,
          clarificationContext: {
            question: model.preparation.question,
            answer: "fetchItem(id: string): Promise<Item>",
          },
        })
      ).status,
    ).toBe(201);
  });
});

describe("resume preview route", () => {});

describe("resume extraction failure policy", () => {});

describe("clarification assignment regression", () => {
  test("rejects assignments in question fields without saving, retrying, or blocking a subsequent valid creation", async () => {
    const model = new FakeModel();
    const app = createApp({ llm: model });
    const owner = await startProfile(
      app,
      `clarification-assignment-${crypto.randomUUID()}@test.dev`,
    );
    const input = {
      prompt:
        "I just learned Python closures. Give me a small exercise to practice them.",
      scope: "focused",
      difficulty: "easy",
    };
    const question =
      "Implement a Python function make_multiplier(factor) that returns a closure multiplying its input by factor.";
    model.preparation = { question, options: [] };
    const invalidPreparation = await request(
      app,
      "/challenges/prepare",
      owner.id,
      input,
    );
    expect(invalidPreparation.status).toBe(502);
    expect(await invalidPreparation.json()).toMatchObject({
      error: { code: "MODEL_OUTPUT_INVALID" },
    });
    expect(model.prepareInputs).toHaveLength(1);
    expect(model.generationInputs).toHaveLength(0);
    model.preparation = { question: null, options: [] };
    const prepared = await request(app, "/challenges/prepare", owner.id, input);
    expect(prepared.status).toBe(200);
    expect(await prepared.json()).toEqual({
      data: { question: null, options: [] },
    });
    model.generationResults = [
      { status: "needs_clarification", challenge: null, question, options: [] },
    ];
    const invalidGeneration = await request(
      app,
      "/challenges/generate",
      owner.id,
      input,
    );
    expect(invalidGeneration.status).toBe(502);
    expect(model.generationInputs).toHaveLength(1);
    expect(
      (
        await json<{ data: Challenge[] }>(
          await request(app, "/challenges/active", owner.id),
        )
      ).data,
    ).toHaveLength(0);
    const created = await request(app, "/challenges/generate", owner.id, input);
    expect(created.status).toBe(201);
    expect(model.generationInputs).toHaveLength(2);
    expect(model.generationInputs.at(-1)?.clarificationHistory).toEqual([]);
  });
});

describe("browser CORS configuration", () => {
  test("allows configured loopback origins and profile preflights only", async () => {
    const app = createApp({
      llm: new FakeModel(),
      webOrigin: "http://localhost:8028, http://127.0.0.1:8028",
    });
    for (const origin of ["http://localhost:8028", "http://127.0.0.1:8028"]) {
      const response = await app.request("/profiles/start", {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type,x-profile-id",
        },
      });
      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
        "X-Profile-Id",
      );
    }
    for (const origin of [
      "https://untrusted.example",
      "http://localhost:17018",
    ]) {
      const response = await app.request("/health", {
        headers: { Origin: origin },
      });
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });
});

describe("background generations", () => {
  type Job =
    import("@repo/backend/modules/generations/generation.service").PublicGenerationJob;
  async function setup() {
    const model = new FakeModel();
    const app = createApp({ llm: model });
    const owner = await startProfile(
      app,
      `jobs-${crypto.randomUUID()}@test.dev`,
    );
    const input = {
      kind: "challenge",
      requestId: crypto.randomUUID(),
      input: {
        prompt: "Build string grouping in TypeScript",
        scope: "focused",
        difficulty: "medium",
        clarificationContext: null,
        clarificationHistory: [],
      },
    };
    const enqueue = async (value: unknown = input) => {
      const response = await request(app, "/generation-jobs", owner.id, value);
      expect(response.status).toBe(202);
      return (await json<{ data: Job }>(response)).data;
    };
    const detail = async (id: string, target = app) =>
      (
        await json<{ data: Job }>(
          await request(target, `/generation-jobs/${id}`, owner.id),
        )
      ).data;
    return { model, app, owner, input, enqueue, detail };
  }

  test("acknowledges immediately, survives a new app instance, and claims a generation only once", async () => {
    const state = await setup();
    const job = await state.enqueue();
    expect(job.status).toBe("queued");
    expect(state.model.generationInputs).toHaveLength(0);
    expect((await state.enqueue()).id).toBe(job.id);
    const restarted = createApp({ llm: state.model });
    let release!: () => void;
    let began!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const generate = state.model.generateBuild.bind(state.model);
    state.model.generateBuild = async (input) => {
      began();
      await gate;
      return generate(input);
    };
    const running = restarted.generations.processNext();
    await started;
    expect((await state.detail(job.id)).status).toBe("running");
    expect((await request(state.app, "/health", state.owner.id)).status).toBe(
      200,
    );
    expect(await state.app.generations.processNext()).toBe(false);
    release();
    expect(await running).toBe(true);
    const completed = await state.detail(job.id);
    expect(completed).toMatchObject({
      status: "completed",
      resultId: job.id,
      resultNumber: 1,
    });
    expect(state.model.generationInputs).toHaveLength(1);
    expect(
      await fixtureSql("SELECT id FROM challenges WHERE id = $1", [job.id]),
    ).toHaveLength(1);
    const acknowledged = await request(
      state.app,
      `/generation-jobs/${job.id}/acknowledge`,
      state.owner.id,
      { status: completed.status, updatedAt: completed.updatedAt },
    );
    expect(acknowledged.status).toBe(200);
    expect((await state.detail(job.id)).notifiedAt).not.toBeNull();
    expect((await state.enqueue()).id).toBe(job.id);
    expect(await restarted.generations.processNext()).toBe(false);
  });

  test("the background worker drains queued jobs with bounded concurrency", async () => {
    const state = await setup();
    let release!: () => void;
    let began!: () => void;
    let calls = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const original = state.model.generateBuild.bind(state.model);
    state.model.generateBuild = async (input) => {
      if (++calls === 2) began();
      await gate;
      return original(input);
    };
    state.app.generations.start();
    try {
      const jobs = await Promise.all(
        Array.from({ length: 3 }, () =>
          state.enqueue({ ...state.input, requestId: crypto.randomUUID() }),
        ),
      );
      await started;
      const current = await Promise.all(
        jobs.map((job) => state.detail(job.id)),
      );
      expect(current.filter((job) => job.status === "running")).toHaveLength(2);
      expect(current.filter((job) => job.status === "queued")).toHaveLength(1);
      release();
      let completed = 0;
      for (let attempt = 0; attempt < 100 && completed !== 3; attempt++) {
        completed = (
          await Promise.all(jobs.map((job) => state.detail(job.id)))
        ).filter((job) => job.status === "completed").length;
        if (completed !== 3)
          await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(completed).toBe(3);
      expect(calls).toBe(3);
    } finally {
      release();
      state.app.generations.stop();
    }
  });

  test("queues standalone and challenge quizzes and saves their completed job atomically", async () => {
    const state = await setup();
    const challenge = await createChallenge(state.app, state.owner.id);
    for (const input of [
      {
        kind: "quiz",
        input: {
          requestId: crypto.randomUUID(),
          prompt: "SQL indexes",
          difficulty: "hard",
          questionCount: 5,
        },
      },
      {
        kind: "challenge_quiz",
        challengeId: challenge.id,
        input: {
          requestId: crypto.randomUUID(),
          questionCount: 5,
          coverage: "mixed",
        },
      },
    ]) {
      const job = await state.enqueue(input);
      await state.app.generations.processNext();
      const completed = await state.detail(job.id);
      expect(completed.status).toBe("completed");
      expect(completed.resultId).toBe(job.id);
      expect(completed).not.toHaveProperty("questions");
      const path =
        input.kind === "quiz"
          ? `/quizzes/${job.id}`
          : `/challenges/${challenge.id}/quizzes/${job.id}`;
      const detail = await json<{
        data: { quiz: { id: string; questions: unknown[]; number: number } };
      }>(await request(state.app, path, state.owner.id));
      expect(detail.data.quiz.questions).toHaveLength(5);
      expect(detail.data.quiz.number).toBe(input.kind === "quiz" ? 1 : 2);
    }
  });

  test("persists essential clarification across app restarts and rejects stale answers or bypasses", async () => {
    const state = await setup();
    state.model.preparation = {
      question: "Which input format must be supported?",
      options: ["JSON", "CSV"],
    };
    const job = await state.enqueue();
    await state.app.generations.processNext();
    const waiting = await state.detail(job.id);
    expect(waiting.status).toBe("needs_input");
    expect(state.model.generationInputs).toHaveLength(0);
    const restarted = createApp({ llm: state.model });
    expect(
      (
        await request(
          restarted,
          `/generation-jobs/${job.id}/retry`,
          state.owner.id,
          { skipPreparation: true },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          restarted,
          `/generation-jobs/${job.id}/answer`,
          state.owner.id,
          { question: "An outdated question?", answer: "JSON" },
        )
      ).status,
    ).toBe(409);
    const response = await request(
      restarted,
      `/generation-jobs/${job.id}/answer`,
      state.owner.id,
      { question: waiting.clarification!.question, answer: "JSON" },
    );
    expect(response.status).toBe(202);
    await restarted.generations.processNext();
    const completed = await state.detail(job.id);
    expect(completed.status).toBe("completed");
    expect(state.model.generationInputs[0]!.clarificationHistory).toEqual([
      { question: waiting.clarification!.question, answer: "JSON" },
    ]);
    // A delayed receipt for the question must not acknowledge the new completion.
    await request(
      restarted,
      `/generation-jobs/${job.id}/acknowledge`,
      state.owner.id,
      { status: waiting.status, updatedAt: waiting.updatedAt },
    );
    expect((await state.detail(job.id)).notifiedAt).toBeNull();
  });

  test("keeps failures retryable without automatically repeating model calls", async () => {
    const state = await setup();
    state.model.generationError = new AppError(
      "MODEL_UNAVAILABLE",
      "Provider is unavailable.",
      503,
      true,
    );
    const job = await state.enqueue();
    await state.app.generations.processNext();
    expect(await state.detail(job.id)).toMatchObject({
      status: "failed",
      error: { retryable: true },
    });
    expect(await state.app.generations.processNext()).toBe(false);
    expect(state.model.generationInputs).toHaveLength(1);
    state.model.generationError = null;
    const retry = await request(
      state.app,
      `/generation-jobs/${job.id}/retry`,
      state.owner.id,
      {},
    );
    expect(retry.status).toBe(202);
    await state.app.generations.processNext();
    expect(await state.detail(job.id)).toMatchObject({
      status: "completed",
      resultNumber: 1,
    });
    expect(state.model.generationInputs).toHaveLength(2);
  });

  test("links the generation transcript to the challenge it created", async () => {
    const state = await setup();
    const job = await state.enqueue();
    await state.app.generations.processNext();
    const completed = await state.detail(job.id);
    expect(completed.status).toBe("completed");
    expect(completed.resultId).toBeTruthy();
    const threadId = job.harnessThreadId!;
    const threads = (
      await json<{
        data: { id: string; kind: string; challengeId: string | null }[];
      }>(
        await request(
          state.app,
          `/harness?challengeId=${completed.resultId}`,
          state.owner.id,
        ),
      )
    ).data;
    const generation = threads.find(
      (thread) => thread.kind === "challenge_generation",
    );
    expect(generation?.id).toBe(threadId);
    expect(generation?.challengeId).toBe(completed.resultId);
  });

  test("reattaches generation transcripts created before the challenge link", async () => {
    const state = await setup();
    const job = await state.enqueue();
    await state.app.generations.processNext();
    const completed = await state.detail(job.id);
    // Simulate a transcript stored before generation threads carried the
    // challenge id. The update only fills an unset link.
    expect(completed.resultId).toBeTruthy();
    const threadId = job.harnessThreadId!;
    await fixtureSql(
      "UPDATE harness_threads SET challenge_id = NULL WHERE id = $1",
      [threadId],
    );
    await state.app.generations.linkLegacyThreads();
    const threads = (
      await json<{
        data: { id: string; challengeId: string | null }[];
      }>(
        await request(
          state.app,
          `/harness?challengeId=${completed.resultId}`,
          state.owner.id,
        ),
      )
    ).data;
    expect(threads.map((thread) => thread.id)).toContain(threadId);
  });

  test("running generation cancellation releases the worker and fences late results", async () => {
    const state = await setup();
    let release!: () => void;
    let began!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const generate = state.model.generateBuild.bind(state.model);
    state.model.generateBuild = async (input) => {
      began();
      await gate;
      return generate(input);
    };
    const job = await state.enqueue();
    const running = state.app.generations.processNext();
    await started;
    const response = await request(
      state.app,
      `/generation-jobs/${job.id}/cancel`,
      state.owner.id,
      {},
    );
    expect(response.status).toBe(200);
    await running;
    expect(state.model.generationInputs).toHaveLength(0);
    expect((await state.detail(job.id)).status).toBe("cancelled");
    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      await fixtureSql("SELECT id FROM challenges WHERE id = $1", [job.id]),
    ).toHaveLength(0);
    expect((await state.detail(job.id)).status).toBe("cancelled");
  });

  test("expired workers cannot save late results, and queued jobs can be cancelled", async () => {
    const state = await setup();
    let release!: () => void;
    let began!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const generate = state.model.generateBuild.bind(state.model);
    state.model.generateBuild = async (input) => {
      began();
      await gate;
      return generate(input);
    };
    const job = await state.enqueue();
    const running = state.app.generations.processNext();
    await started;
    await fixtureSql(
      "UPDATE generation_jobs SET lease_until = now() - interval '1 second' WHERE id = $1",
      [job.id],
    );
    await state.app.generations.recover();
    release();
    await running;
    expect(await state.detail(job.id)).toMatchObject({
      status: "failed",
      error: { code: "GENERATION_INTERRUPTED" },
    });
    expect(
      await fixtureSql("SELECT id FROM challenges WHERE id = $1", [job.id]),
    ).toHaveLength(0);
    const queued = await state.enqueue({
      ...state.input,
      requestId: crypto.randomUUID(),
    });
    expect(
      (
        await request(
          state.app,
          `/generation-jobs/${queued.id}/cancel`,
          state.owner.id,
          {},
        )
      ).status,
    ).toBe(200);
    expect((await state.detail(queued.id)).status).toBe("cancelled");
    expect(await state.app.generations.processNext()).toBe(false);
  });

  test("a quiz retry cannot attach to an expired worker's in-flight generation", async () => {
    const state = await setup();
    let release!: () => void;
    let began!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const original = state.model.generateQuiz.bind(state.model);
    let calls = 0;
    state.model.generateQuiz = async (input) => {
      if (calls++ === 0) {
        began();
        await gate;
      }
      return original(input);
    };
    const job = await state.enqueue({
      kind: "quiz",
      input: {
        requestId: crypto.randomUUID(),
        questionCount: 5,
        prompt: "SQL indexes",
        difficulty: "hard",
      },
    });
    const oldRun = state.app.generations.processNext();
    await started;
    await fixtureSql(
      "UPDATE generation_jobs SET lease_until = now() - interval '1 second' WHERE id = $1",
      [job.id],
    );
    await state.app.generations.recover();
    await request(
      state.app,
      `/generation-jobs/${job.id}/retry`,
      state.owner.id,
      {},
    );
    await state.app.generations.processNext();
    expect(await state.detail(job.id)).toMatchObject({
      status: "completed",
      resultNumber: 1,
    });
    release();
    await oldRun;
    expect((await state.detail(job.id)).status).toBe("completed");
    expect(calls).toBe(2);
    expect(
      await fixtureSql("SELECT id FROM quizzes WHERE id = $1", [job.id]),
    ).toHaveLength(1);
  });

  test("isolates every job endpoint by profile and validates requests before generation", async () => {
    const state = await setup();
    const other = await startProfile(
      state.app,
      `${crypto.randomUUID()}@test.dev`,
    );
    const job = await state.enqueue();
    for (const path of ["", "/retry", "/cancel", "/answer", "/acknowledge"]) {
      const body =
        path === "/answer"
          ? { question: "Which input format?", answer: "JSON" }
          : path === "/acknowledge"
            ? { status: "failed", updatedAt: new Date().toISOString() }
            : {};
      const response = await request(
        state.app,
        `/generation-jobs/${job.id}${path}`,
        other.id,
        path ? body : undefined,
      );
      expect(response.status).toBe(404);
    }
    expect(
      (
        await json<{ data: Job[] }>(
          await request(state.app, "/generation-jobs", other.id),
        )
      ).data,
    ).toEqual([]);
    const response = await request(
      state.app,
      "/generation-jobs",
      state.owner.id,
      {
        kind: "quiz",
        input: {
          requestId: crypto.randomUUID(),
          questionCount: 99,
          prompt: "SQL",
        },
      },
    );
    expect(response.status).toBe(400);
    const challenge = await createChallenge(state.app, other.id);
    expect(
      (
        await request(state.app, "/generation-jobs", state.owner.id, {
          kind: "challenge_quiz",
          challengeId: challenge.id,
          input: { requestId: crypto.randomUUID(), questionCount: 5 },
        })
      ).status,
    ).toBe(404);
    expect(state.model.quizInputs).toHaveLength(0);
    await request(
      state.app,
      `/generation-jobs/${job.id}/cancel`,
      state.owner.id,
      {},
    );
  });
});

describe("generation attachment extraction", () => {
  const fixture = (name: string) =>
    Bun.file(new URL(`./fixtures/${name}`, import.meta.url));

  async function setup() {
    const app = createApp({ llm: new FakeModel() });
    const owner = await startProfile(
      app,
      `attach-${crypto.randomUUID()}@test.dev`,
    );
    return { app, owner };
  }

  function upload(app: TestApp, profileId: string, file: File) {
    const body = new FormData();
    body.append("file", file);
    return app.request("/generation-jobs/attachments", {
      method: "POST",
      body,
      headers: { "X-Profile-Id": profileId },
    });
  }

  test("extracts PDF documents into bounded attachment text", async () => {
    const { app, owner } = await setup();
    const response = await upload(
      app,
      owner.id,
      new File([await fixture("resume.pdf").arrayBuffer()], "spec.pdf", {
        type: "application/pdf",
      }),
    );
    expect(response.status).toBe(200);
    const data = (
      await json<{ data: { filename: string; text: string } }>(response)
    ).data;
    expect(data.filename).toBe("spec.pdf");
    expect(data.text).toContain("Alex Rivera");
  });

  test("reads plain text inline and rejects binary content", async () => {
    const { app, owner } = await setup();
    const text = await upload(
      app,
      owner.id,
      new File(["const answer = 42;\n"], "notes.ts"),
    );
    expect(text.status).toBe(200);
    expect((await json<{ data: { text: string } }>(text)).data.text).toBe(
      "const answer = 42;",
    );
    const binary = await upload(
      app,
      owner.id,
      new File([new Uint8Array([0x00, 0x01, 0x02])], "blob.bin"),
    );
    expect(binary.status).toBe(415);
    expect(await json(binary)).toMatchObject({
      error: { code: "GENERATION_ATTACHMENT_BINARY" },
    });
  });

  test("rejects oversized uploads, multiple files, and missing profiles", async () => {
    const { app, owner } = await setup();
    const large = await upload(
      app,
      owner.id,
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.bin"),
    );
    expect(large.status).toBe(413);
    const body = new FormData();
    body.append("file", new File(["a"], "one.txt"));
    body.append("file", new File(["b"], "two.txt"));
    const multiple = await app.request("/generation-jobs/attachments", {
      method: "POST",
      body,
      headers: { "X-Profile-Id": owner.id },
    });
    expect(multiple.status).toBe(400);
    const anonymous = await upload(app, "", new File(["a"], "one.txt"));
    expect(anonymous.status).toBe(401);
  });
});
