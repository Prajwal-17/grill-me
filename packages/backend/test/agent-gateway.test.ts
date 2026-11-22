import { expect, test } from "bun:test";
import {
  fauxAssistantMessage,
  fauxToolCall,
  getCurrentTools,
} from "@earendil-works/pi-ai";
import { createPiGateway } from "@repo/backend/modules/ai/agent/gateway";
import { db } from "@repo/backend/shared/database/db";
import { challenges, profiles } from "@repo/backend/shared/database/schema";
import { resolvedModel } from "./fixtures/agent-fixtures";

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
    durationEstimate: { minMinutes: 10, maxMinutes: 20 },
    implementationMilestones: [],
    problemStatement: "Build a deterministic grouping function.",
    expectedOutcome: "A function that returns grouped words.",
    completionCriteria: ["Groups words by first letter."],
    hint: null,
    workspacePath: null,
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
    completionCriteria: ["Groups repeated letters without dropping words."],
  };
  const quizQuestions = Array.from({ length: 5 }, (_, index) => ({
    question: `Question ${index + 1}: which behavior is required?`,
    options: ["A", "B", "C", "D"],
    correctOption: 0,
    explanation: "Only the first option matches the frozen behavior.",
  }));
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

  faux.setResponses([
    (context) => {
      expect(
        getCurrentTools(context.messages).map((tool) => tool.name),
      ).toEqual(["complete_preparation"]);
      return fauxAssistantMessage(
        [fauxToolCall("complete_preparation", { question: null, options: [] })],
        { stopReason: "toolUse" },
      );
    },
  ]);
  expect(
    await gateway.prepareBuild({
      prompt: "Practice TypeScript grouping",
      scope: "focused",
      difficulty: "medium",
      learner,
      selection,
    }),
  ).toEqual({ question: null, options: [] });

  // Reproduce the transcript: the model keeps calling research tools even
  // after they disappear. Those calls must not get echoed into finalization.
  const result = {
    status: "ready",
    challenge: build,
    question: null,
    options: [],
  };
  const checkFinalContext = (
    messages: Parameters<typeof getCurrentTools>[0],
  ) => {
    expect(getCurrentTools(messages).map((tool) => tool.name)).toEqual([
      "complete_challenge",
    ]);
    expect(messages.some((message) => message.role === "toolResult")).toBe(
      false,
    );
    expect(JSON.stringify(messages)).toContain(
      "The research workspace is empty.",
    );
  };
  faux.setResponses([
    ...Array.from({ length: 8 }, () =>
      fauxAssistantMessage([fauxToolCall("ls", {})], { stopReason: "toolUse" }),
    ),
    (context) => {
      checkFinalContext(context.messages);
      return fauxAssistantMessage(
        [fauxToolCall("read", { path: "pi-readme.md" })],
        {
          stopReason: "toolUse",
        },
      );
    },
    (context) => {
      checkFinalContext(context.messages);
      return fauxAssistantMessage(
        JSON.stringify({ ...result, challenge: null }),
      );
    },
    (context) => {
      checkFinalContext(context.messages);
      return fauxAssistantMessage(JSON.stringify(result));
    },
  ]);
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

  async function consume(stream: AsyncIterable<string>) {
    for await (const _delta of stream) {
      /* Retired operations must reject. */
    }
  }
  await expect(
    consume(
      gateway.generateHint({ challenge, messages: [], learner, selection }),
    ),
  ).rejects.toMatchObject({ code: "FEATURE_REMOVED", status: 410 });
  await expect(
    consume(
      gateway.respond({
        challenge,
        messages: [],
        content: "Question",
        mode: "clarify",
        attachments: [],
        learner,
        selection,
      }),
    ),
  ).rejects.toMatchObject({ code: "FEATURE_REMOVED", status: 410 });
  expect(seen).toEqual(Array(7).fill("fixture-model"));
});
