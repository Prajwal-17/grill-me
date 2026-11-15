import type { ChallengeReview } from "@repo/backend/shared/contracts";
import { AppError } from "../../shared/errors/app-error";
import { reviewWorkspaceInventory } from "../ai/agent/tools/review";
import { requireChallenge, toChallenge } from "../challenges/challenge.utils";
import type { ChallengeModel } from "../challenges/challenge.model";
import { harnessService } from "../harness/harness.service";
import type { HarnessRunRequest } from "../harness/types";
import type { ReviewModel } from "./review.model";
import { deriveReviewVerdict } from "./review.schema";
import type { ChallengeReviewRow } from "./review.model";

function toReview(row: ChallengeReviewRow): ChallengeReview {
  return {
    id: row.id,
    profileId: row.profileId,
    challengeId: row.challengeId,
    verdict: row.verdict,
    criteriaMet: row.criteriaMet,
    criteriaTotal: row.criteriaTotal,
    result: row.result,
    model: row.model,
    threadId: row.threadId,
    createdAt: row.createdAt.toISOString(),
  };
}

export type ReviewServiceDependencies = {
  challenges: Pick<ChallengeModel, "findOwned">;
  reviews: ReviewModel;
  llm: {
    reviewChallenge?: (input: {
      profileId: string;
      challengeId: string;
      challenge: ReturnType<typeof toChallenge>;
      workspacePath: string;
      harness?: HarnessRunRequest;
    }) => Promise<ChallengeReview["result"]>;
  };
};

export function createReviewService({
  challenges,
  reviews,
  llm,
}: ReviewServiceDependencies) {
  async function owned(id: string, profileId: string) {
    return requireChallenge(await challenges.findOwned(id, profileId));
  }

  return {
    async list(challengeId: string, profileId: string) {
      await owned(challengeId, profileId);
      const rows = await reviews.list(profileId, challengeId);
      return rows.map(toReview);
    },

    async create(challengeId: string, profileId: string) {
      const row = await owned(challengeId, profileId);
      if (!row.workspacePath)
        throw new AppError(
          "REVIEW_WORKSPACE_MISSING",
          "Create the challenge workspace before requesting a review.",
          409,
        );
      if (!llm.reviewChallenge)
        throw new AppError(
          "REVIEW_UNAVAILABLE",
          "Reviews are unavailable with the configured provider.",
          503,
          true,
        );
      const inventory = await reviewWorkspaceInventory(row.workspacePath);
      if (!inventory.files.length)
        throw new AppError(
          "REVIEW_WORKSPACE_EMPTY",
          "Add your implementation files to the challenge workspace before requesting a review.",
          409,
        );

      const challenge = toChallenge(row);
      const thread = await harnessService.createThread({
        profileId,
        kind: "review",
        title: `Review #${challenge.number} ${challenge.title}`.slice(0, 500),
        challengeId: row.id,
        transport: "api",
        model: process.env.LLM_MODEL ?? "auto",
      });
      const turn = await harnessService.appendTurn(thread.id, {
        inputText: "Review this attempt against the completion criteria.",
      });
      const result = await llm.reviewChallenge({
        profileId,
        challengeId: row.id,
        challenge,
        workspacePath: row.workspacePath,
        harness: {
          threadId: thread.id,
          turnId: turn.id,
          inputText: turn.inputText,
        },
      });
      const criteriaMet = result.criteria.filter(
        (criterion) => criterion.status === "pass",
      ).length;
      const created = await reviews.create({
        profileId,
        challengeId: row.id,
        verdict: deriveReviewVerdict(result.criteria),
        criteriaMet,
        criteriaTotal: result.criteria.length,
        result,
        model: process.env.LLM_MODEL ?? "auto",
        threadId: turn.threadId,
      });
      return toReview(created);
    },
  };
}

export type ReviewService = ReturnType<typeof createReviewService>;
