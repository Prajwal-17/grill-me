import type {
  BuildModelInput,
  JudgeInput,
  LearnerContext,
} from "../../model-gateway";
import { projectDeveloperContext } from "../../../profiles/developer-context";
import { contextBlock } from "../messages";

export function withoutHistory<
  T extends { contextSnapshot?: Record<string, unknown> | null },
>(challenge: T) {
  const snapshot = { ...(challenge.contextSnapshot ?? {}) };
  delete snapshot.recentBuilds;
  delete snapshot.recentEvidence;
  return { ...challenge, contextSnapshot: snapshot };
}

export function technicalContext(learner: LearnerContext, request: string) {
  return projectDeveloperContext(
    { ...learner.preferences, includeRecentChallenges: false },
    request,
  );
}

export function buildOptions(
  input: Omit<BuildModelInput, "clarificationContext">,
) {
  return {
    selectedScope: input.scope,
    selectedDifficulty: input.difficulty,
    timeBudgetMinutes: input.timeBudgetMinutes ?? null,
    familiarity: input.familiarity ?? null,
    emphasis: input.emphasis ?? null,
  };
}

export function conversationContext(input: {
  challenge: JudgeInput["challenge"];
  learner: LearnerContext;
}) {
  return contextBlock(
    "challenge",
    {
      ...withoutHistory(input.challenge),
      developerContext:
        input.challenge.contextSnapshot?.developerContext ?? null,
    },
    { untrusted: true },
  );
}
