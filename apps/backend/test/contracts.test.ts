import { expect, test } from "bun:test";
import {
  buildGenerationResultSchema,
  challengePreparationSchema,
  challengeSchema,
  generatedBuildSchemaForScope,
} from "../../../packages/backend/src/modules/challenges/challenge.schema";
import {
  validateReview,
  type ReviewResult,
} from "../../../packages/backend/src/modules/reviews/review.schema";
import {
  verificationPrompt,
  judgePrompt,
} from "../../../packages/backend/src/modules/ai/prompts/judge";
import {
  quizPrompt,
  QUIZ_PROMPT_VERSION,
} from "../../../packages/backend/src/modules/ai/prompts/generate-quiz";
import { profilePreferencesSchema } from "../../../packages/backend/src/modules/profiles/profile.schema";
import type { JudgeInput } from "../../../packages/backend/src/modules/ai/model-gateway";
import { validatedReview } from "../../../packages/backend/src/modules/reviews/validated-review";

const build = {
  title: "Group words",
  estimatedDifficultyBand: "easy",
  difficultyReason: "Direct grouping with explicit behavior.",
  topic: "Maps",
  implementationBoundary: "",
  problemStatement: "Group each supplied word by its first letter.",
  expectedOutcome: "Submit the source function.",
  constraints: [],
  starterCode: null,
  completionCriteria: [
    "Groups every word by initial.",
    "Returns an empty map for empty input.",
  ],
  durationEstimate: { minMinutes: 10, maxMinutes: 20 },
  implementationMilestones: [],
};
const challenge = challengeSchema.parse({
  ...build,
  contextualDifficulty: "easy",
  scope: "focused",
  difficulty: "easy",
  id: crypto.randomUUID(),
  profileId: crypto.randomUUID(),
  number: 1,
  hint: null,
  status: "active",
  createdAt: "2026-01-01T00:00:00Z",
  completedAt: null,
});
const evidence = {
  status: "incomplete" as const,
  reason:
    "The execution environment could not start. This is not a source defect.",
  checks: [],
};

test("standalone quizzes preserve the full request and project relevant developer context without identity", () => {
  const request =
    "I just learned Python closures. Compare captured state and ordinary function arguments; exclude decorators.";
  const preferences = profilePreferencesSchema.parse({
    profileId: crypto.randomUUID(),
    updatedAt: "2026-10-01T00:00:00Z",
    developerContextUpdatedAt: "2026-09-01T00:00:00Z",
    displayName: "Private Learner",
    aboutMe: "Private Learner builds tools; contact learner@example.test",
    topicFamiliarity: [
      { topic: "Python closures", familiarity: "new" },
      { topic: "Go channels", familiarity: "comfortable" },
    ],
    projects: [
      {
        name: "Python scripts",
        technologies: ["Python"],
        contribution: "Used closures in Python.",
      },
      {
        name: "Unrelated dashboard",
        technologies: ["React"],
        contribution: "Styled forms.",
      },
    ],
  });
  for (const difficulty of ["easy", "medium", "hard", "grill"] as const) {
    const prompt = quizPrompt({
      challenge: null,
      profileId: preferences.profileId,
      prompt: request,
      difficulty,
      preferences,
      coverage: "topic",
      questionCount: 5,
      previousQuestions: ["Which state is captured?"],
    });
    const input = JSON.parse(prompt.input);
    expect(input).toMatchObject({
      currentRequest: request,
      selectedDifficulty: difficulty,
      questionCount: 5,
      promptVersion: QUIZ_PROMPT_VERSION,
    });
    expect(input.previousQuestions).toEqual(["Which state is captured?"]);
    expect(input.developerContext.updatedAt).toBe(
      preferences.developerContextUpdatedAt,
    );
    expect(input.developerContext.topicFamiliarity).toEqual([
      { topic: "Python closures", familiarity: "new" },
    ]);
    expect(
      input.developerContext.projects.map((p: { name: string }) => p.name),
    ).toEqual(["Python scripts"]);
    expect(prompt.input).not.toContain("Private Learner");
    expect(prompt.input).not.toContain("learner@example.test");
    expect(prompt.input).not.toContain(preferences.profileId);
  }
});

test("challenge quizzes use the frozen contract and selected coverage without unrelated snapshots", () => {
  const developerContext = {
    updatedAt: "2025-01-01T00:00:00Z",
    knownConcepts: ["Maps"],
  };
  for (const coverage of ["challenge", "related", "mixed"] as const) {
    const prompt = quizPrompt({
      challenge: {
        ...challenge,
        contextSnapshot: { developerContext, privateMetadata: "do not send" },
      },
      coverage,
      questionCount: 10,
      previousQuestions: [],
    });
    const input = JSON.parse(prompt.input);
    expect(input.developerContext).toEqual(developerContext);
    expect(input.coverage).toBe(coverage);
    expect(input.selectedDifficulty).toBe(challenge.difficulty);
    expect(input.challenge.completionCriteria).toEqual(
      challenge.completionCriteria,
    );
    expect(input.challenge.problemStatement).toBe(challenge.problemStatement);
    expect(prompt.input).not.toContain("do not send");
    expect(input).not.toHaveProperty("currentRequest");
  }
  const legacy = quizPrompt({
    challenge: { ...challenge, contextSnapshot: null },
    coverage: "mixed",
    questionCount: 5,
    previousQuestions: [],
  });
  expect(JSON.parse(legacy.input).developerContext).toBeNull();
});
function accepted(): ReviewResult {
  return {
    verdict: "accepted",
    summary: "Both requirements are supported by the source.",
    criteria: ["C1", "C2"].map((id) => ({
      id,
      status: "met",
      evidence: "The implementation explicitly covers this behavior.",
    })),
    findings: [],
    optionalImprovements: [],
    correctness: { score: 4, evidence: "All required behaviors met." },
    understanding: {
      score: 3,
      evidence: "The grouping invariant is visible in code.",
    },
    judgment: { score: 2, evidence: "A map suits the task." },
    question: null,
    nextStep: null,
    verification: "inspection_only",
  };
}

test("generation branches enforce relationships and empty legacy requirement arrays", () => {
  const schema = buildGenerationResultSchema("focused");
  expect(
    schema.safeParse({
      status: "ready",
      challenge: build,
      question: null,
      options: [],
    }).success,
  ).toBe(true);
  expect(
    schema.safeParse({
      status: "needs_clarification",
      challenge: null,
      question: "What is the external contract?",
      options: [],
    }).success,
  ).toBe(true);
  for (const patch of [
    { status: "ready", challenge: null },
    { question: "What is the contract?" },
    { options: ["One"] },
    { status: "needs_clarification" },
  ])
    expect(
      schema.safeParse({
        status: "ready",
        challenge: build,
        question: null,
        options: [],
        ...patch,
      }).success,
    ).toBe(false);
  for (const options of [
    ["One"],
    ["Same", "same"],
    ["One", "Two", "Three", "Four"],
  ])
    expect(
      challengePreparationSchema.safeParse({
        question: "Which behavior should apply?",
        options,
      }).success,
    ).toBe(false);
  for (const scope of ["focused", "feature", "system"] as const) {
    expect(generatedBuildSchemaForScope(scope).safeParse(build).success).toBe(
      true,
    );
    for (const patch of [
      { constraints: ["Additional hidden requirement"] },
      { implementationMilestones: ["Use a map"] },
      { estimatedDifficultyScore: 5 },
      { contextualDifficulty: "easy" },
    ])
      expect(
        generatedBuildSchemaForScope(scope).safeParse({ ...build, ...patch })
          .success,
      ).toBe(false);
  }
});

test("acceptance rejects outstanding questions, next steps, findings and unmet criteria", () => {
  for (const patch of [
    { question: "Can you explain your approach?" },
    { nextStep: "Add a required check." },
    {
      criteria: accepted().criteria.map((criterion) => ({
        ...criterion,
        status: "unmet",
      })),
    },
  ])
    expect(() =>
      validateReview({ ...accepted(), ...patch }, challenge, evidence),
    ).toThrow();
  expect(validateReview(accepted(), challenge, evidence)).toMatchObject({
    score: 9,
    result: { verification: "incomplete", verdict: "accepted" },
  });
});

test("revision requires mapped unmet criteria; uncertainty stays unscored and needs evidence", () => {
  const revision = {
    ...accepted(),
    verdict: "needs_revision" as const,
    criteria: accepted().criteria.map((criterion, index) => ({
      ...criterion,
      status: index ? ("met" as const) : ("unmet" as const),
    })),
    findings: [
      {
        criterionId: "C1",
        location: "answer.ts:3",
        issue: "A word is dropped.",
        evidence: "The second word overwrites the first.",
      },
    ],
    correctness: { score: 3, evidence: "One required behavior has a gap." },
    understanding: {
      score: null,
      evidence: "Insufficient source to assess this dimension.",
    },
  };
  expect(validateReview(revision, challenge, evidence).score).toBeNull();
  expect(() =>
    validateReview({ ...revision, findings: [] }, challenge, evidence),
  ).toThrow();
  expect(() =>
    validateReview(
      {
        ...revision,
        findings: [{ ...revision.findings[0], criterionId: "C2" }],
      },
      challenge,
      evidence,
    ),
  ).toThrow();
  const uncertain = {
    ...accepted(),
    verdict: "needs_evidence" as const,
    criteria: accepted().criteria.map((criterion) => ({
      ...criterion,
      status: "unassessed" as const,
    })),
    correctness: { score: null, evidence: "Required source was omitted." },
  };
  expect(validateReview(uncertain, challenge, evidence).score).toBeNull();
  expect(() =>
    validateReview(
      { ...uncertain, verdict: "needs_revision" },
      challenge,
      evidence,
    ),
  ).toThrow();
  expect(() =>
    validateReview(
      { ...accepted(), verdict: "needs_evidence" },
      challenge,
      evidence,
    ),
  ).toThrow();
  const input = {
    challenge,
    content: "implementation",
    attachments: [],
    evidence,
    assistance: { hints: 2, guidance: false },
  };
  expect(verificationPrompt(input).instructions).toContain(
    "Never change or repair submitted source",
  );
  expect(verificationPrompt(input).instructions).toContain(
    "invalid test expectations",
  );
  expect(judgePrompt(input).instructions).toContain(
    "Environment failures and missing execution are not source defects",
  );
});

test("review correction supplies missing finding IDs and preserves supported revision findings", async () => {
  const invalid: ReviewResult = {
    ...accepted(),
    verdict: "needs_revision",
    criteria: accepted().criteria.map((criterion) => ({
      ...criterion,
      status: "unmet",
    })),
    findings: [
      {
        criterionId: "C1",
        location: "answer.ts:3",
        issue: "Words are dropped.",
        evidence: "Only one word is retained.",
      },
    ],
    correctness: { score: 2, evidence: "Both required behaviors have gaps." },
    nextStep: "Handle all words and empty input.",
  };
  const input: JudgeInput = {
    challenge,
    content: "source",
    attachments: [],
    evidence,
    assistance: { hints: 0, guidance: false },
  };
  let calls = 0;
  let corrections = 0;
  const reviewed = await validatedReview(
    input,
    async (request) => {
      calls++;
      if (calls === 1) return invalid;
      expect(request.reviewCorrection?.error).toContain(
        "Missing criterion IDs: C2",
      );
      const prompt = JSON.parse(judgePrompt(request).input);
      expect(prompt.reviewCorrection.rejectedReview).toEqual(invalid);
      expect(prompt.submission).toBe("source");
      return {
        ...invalid,
        findings: [
          ...invalid.findings,
          {
            criterionId: "C2",
            location: "answer.ts:1",
            issue: "Empty input throws.",
            evidence: "The function accesses words[0] unconditionally.",
          },
        ],
      };
    },
    () => {
      corrections++;
    },
  );
  expect(calls).toBe(2);
  expect(corrections).toBe(1);
  expect(reviewed.result.verdict).toBe("needs_revision");
  expect(reviewed.result.findings).toHaveLength(2);
  expect(reviewed.result.verification).toBe("incomplete");
  expect(reviewed.score).toBe(7);
});

test("review correction is bounded and never retries provider errors or cancellation", async () => {
  const input = (): JudgeInput => ({
    challenge,
    content: "source",
    attachments: [],
    evidence,
    assistance: { hints: 0, guidance: false },
  });
  let calls = 0;
  await expect(
    validatedReview(
      input(),
      async () => {
        calls++;
        return {
          ...accepted(),
          verdict: "needs_revision",
          criteria: accepted().criteria.map((criterion) => ({
            ...criterion,
            status: "unmet",
          })),
        };
      },
      () => {},
    ),
  ).rejects.toThrow("Missing criterion IDs: C1, C2");
  expect(calls).toBe(3);
  calls = 0;
  await expect(
    validatedReview(
      input(),
      async () => {
        calls++;
        throw new Error("Provider unavailable");
      },
      () => {},
    ),
  ).rejects.toThrow("Provider unavailable");
  expect(calls).toBe(1);
  const controller = new AbortController();
  calls = 0;
  await expect(
    validatedReview(
      { ...input(), signal: controller.signal },
      async () => {
        calls++;
        controller.abort(new Error("Review cancelled"));
        return accepted();
      },
      () => {},
    ),
  ).rejects.toThrow("Review cancelled");
  expect(calls).toBe(1);
});

test("valid reviews finish without a correction request", async () => {
  let calls = 0;
  const reviewed = await validatedReview(
    {
      challenge,
      content: "source",
      attachments: [],
      evidence,
      assistance: { hints: 0, guidance: false },
    },
    async () => {
      calls++;
      return accepted();
    },
    () => {
      throw new Error("Unexpected correction");
    },
  );
  expect(calls).toBe(1);
  expect(reviewed.result.verdict).toBe("accepted");
});

test("project matching respects short custom technologies and distinguishes C from C#", async () => {
  const { EMPTY_GUIDED } = await import("@repo/preferences");
  const { projectDeveloperContext } =
    await import("../../../packages/backend/src/modules/profiles/developer-context");
  const preferences = {
    ...EMPTY_GUIDED,
    profileId: crypto.randomUUID(),
    aboutMe: null,
    updatedAt: "2026-01-01T00:00:00Z",
    developerContextUpdatedAt: null,
    projects: [
      {
        name: "Stats",
        technologies: ["R"],
        contribution: "Processed observations.",
      },
      {
        name: "Managed",
        technologies: ["C#"],
        contribution: "Processed events.",
      },
    ],
  };
  expect(
    projectDeveloperContext(preferences, "Practice R").projects.map(
      (project) => project.name,
    ),
  ).toEqual(["Stats"]);
  expect(projectDeveloperContext(preferences, "Practice C").projects).toEqual(
    [],
  );
  expect(
    projectDeveloperContext(preferences, "Practice csharp").projects.map(
      (project) => project.name,
    ),
  ).toEqual(["Managed"]);
});

test("coding assignments cannot be presented as essential clarification", () => {
  for (const question of [
    "Implement a Python function make_multiplier(factor) that returns a closure multiplying its input by factor.",
    "Please write a Python closure for this task.",
    "Can you implement make_multiplier(factor)?",
    "**Build a function that returns another function.**",
  ]) {
    expect(
      challengePreparationSchema.safeParse({ question, options: [] }).success,
    ).toBe(false);
    expect(
      buildGenerationResultSchema("focused").safeParse({
        status: "needs_clarification",
        challenge: null,
        question,
        options: [],
      }).success,
    ).toBe(false);
  }
  for (const question of [
    "What is the private SDK's required function signature?",
    "Share the required external API contract.",
  ]) {
    expect(
      challengePreparationSchema.safeParse({ question, options: [] }).success,
    ).toBe(true);
    expect(
      buildGenerationResultSchema("focused").safeParse({
        status: "needs_clarification",
        challenge: null,
        question,
        options: [],
      }).success,
    ).toBe(true);
  }
});

test("preparation checks missing requirements without inheriting assignment-writing instructions", async () => {
  const { preparationPrompt } =
    await import("../../../packages/backend/src/modules/ai/prompts/prepare-build");
  const { profilePreferencesSchema } =
    await import("../../../packages/backend/src/modules/profiles/profile.schema");
  const profileId = crypto.randomUUID();
  const prompt = preparationPrompt({
    prompt:
      "I just learned Python closures. Give me a small exercise to practice them.",
    scope: "focused",
    difficulty: "easy",
    learner: {
      profileId,
      preferences: profilePreferencesSchema.parse({
        profileId,
        updatedAt: "2026-01-01T00:00:00Z",
      }),
      recentChallenges: [],
    },
  });
  expect(prompt.instructions).not.toContain("assign a bounded task");
  expect(prompt.instructions).toContain(
    "Do not generate or assign a challenge in this stage",
  );
  expect(prompt.instructions).toContain("needs no clarification");
});
