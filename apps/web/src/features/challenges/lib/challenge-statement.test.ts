import { test } from "node:test";
import assert from "node:assert/strict";
import type { Challenge } from "@/shared/types/api";
import { statementBody, statementMarkdown } from "./challenge-statement";

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
  workspacePath: null,
  status: "active",
  archivedAt: null,
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
