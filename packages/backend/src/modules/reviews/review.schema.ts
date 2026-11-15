import { AppError } from "../../shared/errors/app-error";
import {
  challengeReviewResultSchema,
  type ChallengeReviewResult,
  type ChallengeReviewVerdict,
  type ReviewCriterion,
} from "@repo/backend/shared/contracts";

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The verdict is derived from the judged criteria, not supplied by the model, so
 * a review can never claim success while listing failed criteria.
 */
export function deriveReviewVerdict(
  criteria: ReviewCriterion[],
): ChallengeReviewVerdict {
  if (criteria.every((entry) => entry.status === "pass")) return "meets";
  if (criteria.every((entry) => entry.status === "fail"))
    return "does_not_meet";
  return "partly_meets";
}

/**
 * Validate the model's result against the challenge's own checklist. Criteria
 * must appear once each, in the original order, so the stored score is a real
 * count instead of free-form prose.
 */
export function validateReviewResult(
  value: unknown,
  expected: string[],
  knownPaths?: Iterable<string>,
): ChallengeReviewResult {
  const parsed = challengeReviewResultSchema.safeParse(value);
  if (!parsed.success)
    throw new AppError(
      "REVIEW_OUTPUT_INVALID",
      "The review result did not match the required shape.",
      502,
      true,
    );
  const result = parsed.data;
  if (result.criteria.length !== expected.length)
    throw new AppError(
      "REVIEW_OUTPUT_INVALID",
      `Return exactly ${expected.length} criteria results, one per challenge criterion, in order.`,
      502,
      true,
    );
  const paths = knownPaths ? new Set(knownPaths) : null;
  const criteria = result.criteria.map((entry, index) => {
    const criterion = expected[index]!;
    if (normalize(entry.criterion) !== normalize(criterion))
      throw new AppError(
        "REVIEW_OUTPUT_INVALID",
        `Criterion ${index + 1} must be copied exactly as "${criterion}".`,
        502,
        true,
      );
    if (entry.path && paths && !paths.has(entry.path))
      throw new AppError(
        "REVIEW_OUTPUT_INVALID",
        `"${entry.path}" is not a file in the workspace inventory. Cite a listed file or use null.`,
        502,
        true,
      );
    return { ...entry, criterion };
  });
  return { ...result, criteria };
}
