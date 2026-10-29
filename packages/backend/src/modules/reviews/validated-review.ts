import type { JudgeInput } from "../ai/model-gateway";
import { validateReview } from "./review.schema";

// Retry inconsistent assessments with feedback, without retrying provider failures
// or weakening the acceptance rules. Both judge routes use this boundary.
export async function validatedReview(
  input: JudgeInput,
  judge: (input: JudgeInput) => Promise<unknown>,
  correcting: () => void | Promise<unknown>,
) {
  for (let attempt = 0; ; attempt++) {
    input.signal?.throwIfAborted();
    const raw = await judge(input);
    input.signal?.throwIfAborted();
    try {
      return validateReview(raw, input.challenge, input.evidence);
    } catch (error) {
      if (attempt >= 2) throw error;
      input.reviewCorrection = {
        error: error instanceof Error ? error.message : "Invalid review output",
        rejectedReview: raw,
      };
      await correcting();
    }
  }
}
