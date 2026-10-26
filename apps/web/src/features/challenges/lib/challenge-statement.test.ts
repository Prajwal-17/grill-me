import { test } from "node:test";
import assert from "node:assert/strict";
import type { Challenge } from "@/shared/types/api";
import { statementBody, statementMarkdown } from "./challenge-statement";
import { reviewPresentation } from "../../chat/lib/review-presentation";

const challenge: Challenge = {
  id: "fixture",
  profileId: "owner",
  number: 1,
  title: "Group words",
  scope: "focused",
  difficulty: "medium",
  contextualDifficulty: "medium",
  estimatedDifficultyScore: null,
  difficultyReason: "Grouping with one edge case.",
  topic: "Maps",
  implementationBoundary: "",
  contextSnapshot: null,
  promptVersion: "practice-v3.0",
  calibrationVersion: "difficulty-bands-v1",
  contractVersion: 2,
  completionSource: null,
  durationEstimate: { minMinutes: 20, maxMinutes: 30 },
  implementationMilestones: [],
  problemStatement: "Group supplied words by their first letter.",
  expectedOutcome: "Submit the source function.",
  constraints: [],
  starterCode: null,
  completionCriteria: [
    "Preserve every word.",
    "Empty input returns an empty object.",
  ],
  hint: null,
  status: "active",
  createdAt: "2026-01-01T00:00:00Z",
  completedAt: null,
};
test("new assignments use readable bullets and band labels in copied Markdown", () => {
  const text = statementMarkdown(challenge);
  assert.match(text, /Difficulty: Medium/);
  assert.match(text, /- Preserve every word\./);
  assert.doesNotMatch(text, /\bC[12]\b/);
  assert.doesNotMatch(text, /Implementation boundary|Starter code/);
});
test("legacy frozen constraints, milestones and numeric metadata stay accessible", () => {
  const old = {
    ...challenge,
    contractVersion: 1,
    promptVersion: "practice-v2.3",
    estimatedDifficultyScore: 7,
    constraints: ["No packages."],
    implementationMilestones: ["Frozen milestone"],
  };
  assert.match(statementBody(old), /No packages\./);
  assert.match(statementBody(old), /Frozen milestone/);
  assert.match(statementMarkdown(old), /Difficulty: 7\/10/);
});
test("review presentation replaces criterion labels while keeping internal mapping IDs", () => {
  const review = {
    verdict: "accepted" as const,
    summary: "C1 and C2 are met.",
    criteria: [
      { id: "C1", status: "met" as const, evidence: "C1 is covered." },
    ],
    findings: [],
    optionalImprovements: [],
    correctness: { score: 4, evidence: "C1 is correct." },
    understanding: { score: null, evidence: "Not assessed." },
    judgment: { score: null, evidence: "Not assessed." },
    question: null,
    nextStep: null,
    verification: "inspection_only" as const,
  };
  const result = reviewPresentation(review, challenge.completionCriteria);
  assert.doesNotMatch(result.summary, /\bC[12]\b/);
  assert.match(result.summary, /Preserve every word\./);
  assert.equal(result.criteria[0]?.id, "C1");
  assert.equal(review.summary, "C1 and C2 are met.");
});
