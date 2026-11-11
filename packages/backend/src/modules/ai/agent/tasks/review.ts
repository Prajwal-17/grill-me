import { z } from "zod";
import type { JudgeInput } from "../../model-gateway";
import {
  criteriaFor,
  reviewResultSchema,
  verificationPlanSchema,
} from "../../../reviews/review.schema";
import { judgePrompt, verificationPrompt } from "../../prompts/judge";
import { contextBlock } from "../messages";
import { withoutHistory } from "./context";
import type { StructuredTask } from "./types";

export function reviewTask(
  input: JudgeInput,
  snapshot: boolean,
): StructuredTask<unknown> {
  const prompt = judgePrompt(input);
  const challenge = withoutHistory(input.challenge);
  const submission = snapshot
    ? [
        contextBlock(
          "snapshot_instructions",
          "The saved submission files are available through list_submission_files, read_submission_file, and search_submission. Inspect the relevant files before deciding.",
          { untrusted: false },
        ),
      ]
    : [
        contextBlock("submission_text", input.content, { untrusted: true }),
        contextBlock(
          "submission_files",
          input.attachments.filter((attachment) => !attachment.data),
          { untrusted: true },
        ),
      ];
  return {
    operation: "review",
    instructions: prompt.instructions,
    context: [
      contextBlock("review_challenge", challenge, { untrusted: true }),
      contextBlock("criteria", criteriaFor(input.challenge), {
        untrusted: false,
      }),
      contextBlock("assistance", input.assistance, { untrusted: false }),
      contextBlock("verification_evidence", input.evidence, {
        untrusted: true,
      }),
      contextBlock("followup", input.followup, { untrusted: false }),
      contextBlock("previous_review", input.previousReview, {
        untrusted: true,
      }),
      contextBlock("review_correction", input.reviewCorrection, {
        untrusted: true,
      }),
      ...submission,
    ].join("\n\n"),
    userText: "Review the saved submission against the frozen criteria.",
    completion: {
      name: "complete_review",
      description:
        "Return the complete structured review. Every criterion must be assessed exactly once.",
      schema: z.toJSONSchema(reviewResultSchema),
      validate: (value) => reviewResultSchema.parse(value),
    },
    allowSnapshot: snapshot,
  };
}

export function verificationTask(input: JudgeInput): StructuredTask<unknown> {
  const prompt = verificationPrompt(input);
  return {
    operation: "verification",
    instructions: prompt.instructions,
    context: [
      contextBlock("verification_challenge", withoutHistory(input.challenge), {
        untrusted: true,
      }),
      contextBlock("criteria", criteriaFor(input.challenge), {
        untrusted: false,
      }),
      contextBlock(
        "submission_files",
        input.attachments.filter((attachment) => !attachment.data),
        { untrusted: true },
      ),
      contextBlock("submission_text", input.content, { untrusted: true }),
    ].join("\n\n"),
    userText: "Create the bounded verification plan.",
    completion: {
      name: "complete_verification",
      description:
        "Return a verification plan or an unsupported runtime with a reason.",
      schema: z.toJSONSchema(verificationPlanSchema),
      validate: (value) => verificationPlanSchema.parse(value),
    },
    allowSnapshot: true,
  };
}
