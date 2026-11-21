import { test } from "node:test";
import assert from "node:assert/strict";
import type { Challenge } from "@/shared/types/api";
import { challengePrompt } from "./challenge-prompt";

const challenge = (
  contextSnapshot: Challenge["contextSnapshot"],
): Challenge => ({
  id: "fixture",
  profileId: "owner",
  number: 1,
  title: "Group words",
  scope: "focused",
  difficulty: "medium",
  contextualDifficulty: "medium",
  estimatedDifficultyScore: null,
  difficultyReason: null,
  topic: null,
  implementationBoundary: null,
  contextSnapshot,
  promptVersion: null,
  durationEstimate: { minMinutes: 20, maxMinutes: 30 },
  implementationMilestones: [],
  problemStatement: "Group supplied words by their first letter.",
  expectedOutcome: "Submit the source function.",
  completionCriteria: ["Preserve every word."],
  hint: null,
  workspacePath: null,
  status: "active",
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  completedAt: null,
});

test("reads the original request from the context snapshot", () => {
  assert.equal(
    challengePrompt(
      challenge({ currentRequest: "  Build a TTL memoize lib  " }),
    ),
    "Build a TTL memoize lib",
  );
});

test("returns null without a stored request instead of showing generated text", () => {
  assert.equal(challengePrompt(challenge(null)), null);
  assert.equal(challengePrompt(challenge({})), null);
  assert.equal(
    challengePrompt(challenge({ currentRequest: "   " })),
    null,
    "a blank snapshot entry must not fall back to the problem statement",
  );
  assert.equal(
    challengePrompt(challenge({ currentRequest: 42 as unknown as string })),
    null,
  );
});
