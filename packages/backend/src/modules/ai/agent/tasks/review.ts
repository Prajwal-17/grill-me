import { z } from "zod";
import type { ChallengeReviewResult } from "@repo/backend/shared/contracts";
import { challengeReviewResultSchema } from "@repo/backend/shared/contracts";
import type { ReviewModelInput } from "../../model-gateway";
import { REVIEW_INSTRUCTIONS } from "../../prompts/review";
import { validateReviewResult } from "../../../reviews/review.schema";
import { contextBlock } from "../messages";
import type { StructuredTask } from "./types";

export function reviewTask(
  input: Omit<ReviewModelInput, "selection" | "signal" | "harness"> & {
    inventory: { path: string; bytes: number }[];
    truncated: boolean;
  },
): StructuredTask<ChallengeReviewResult> {
  const { challenge } = input;
  return {
    operation: "review",
    instructions: REVIEW_INSTRUCTIONS,
    context: [
      contextBlock(
        "challenge",
        {
          number: challenge.number,
          title: challenge.title,
          scope: challenge.scope,
          difficulty: challenge.contextualDifficulty,
          problemStatement: challenge.problemStatement,
          expectedOutcome: challenge.expectedOutcome,
          implementationBoundary: challenge.implementationBoundary,
          implementationMilestones: challenge.implementationMilestones,
          completionCriteria: challenge.completionCriteria,
          durationEstimate: challenge.durationEstimate,
        },
        { untrusted: true },
      ),
      contextBlock(
        "workspace_inventory",
        {
          note: "Saved before this review started. Read files for the current content. Dependency output, VCS data, and Grill Me metadata are hidden.",
          files: input.inventory,
          truncatedAtLimit: input.truncated,
        },
        { untrusted: false },
      ),
    ].join("\n\n"),
    userText:
      "Review this attempt against every completion criterion and return one complete_review call.",
    completion: {
      name: "complete_review",
      description:
        "Return the complete review: one result per completion criterion in order, at most three strengths, at most three problems with fixes, and one next step. This call ends the review.",
      schema: z.toJSONSchema(challengeReviewResultSchema),
      validate: (value: unknown) =>
        validateReviewResult(
          value,
          challenge.completionCriteria,
          input.inventory.map((file) => file.path),
        ),
    },
    allowSnapshot: false,
    allowResearch: false,
    limits: {
      maxTurns: 8,
      maxToolCalls: 16,
      maxTextChars: 24_000,
    },
  };
}
