import { expect, test } from "bun:test";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
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
