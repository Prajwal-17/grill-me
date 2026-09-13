import { z } from "zod";
import type { Challenge } from "../challenges/challenge.schema";

const assessment = (max: number) =>
  z.object({
    score: z.number().int().min(0).max(max).nullable(),
    evidence: z.string().min(1),
  });
export const reviewResultSchema = z.object({
  verdict: z.enum(["accepted", "needs_revision", "needs_evidence"]),
  summary: z.string().min(1).max(1600),
  criteria: z.array(
    z.object({
      id: z.string(),
      status: z.enum(["met", "unmet", "unassessed"]),
      evidence: z.string().min(1),
    }),
  ),
  findings: z.array(
    z.object({
      criterionId: z.string(),
      location: z.string().nullable(),
      issue: z.string().min(1),
      evidence: z.string().min(1),
    }),
  ),
  optionalImprovements: z.array(z.string()),
  correctness: assessment(4),
  understanding: assessment(3),
  judgment: assessment(3),
  nextStep: z.string().nullable(),
  question: z.string().nullable(),
  verification: z.enum(["checks_run", "inspection_only", "incomplete"]),
});
export type ReviewResult = z.infer<typeof reviewResultSchema>;
export const reviewJsonSchema = z.toJSONSchema(reviewResultSchema);
export type VerificationEvidence = {
  status: "checks_run" | "inspection_only" | "incomplete";
  reason: string;
  checks: {
    criterionId: string;
    command: string;
    exitCode: number | null;
    output: string;
  }[];
};
export const verificationPlanSchema = z.object({
  runtime: z.enum(["python", "javascript", "typescript", "go", "unsupported"]),
  reason: z.string(),
  checks: z.array(
    z.object({
      criterionId: z.string(),
      filename: z.string(),
      content: z.string(),
    }),
  ),
});
export type VerificationPlan = z.infer<typeof verificationPlanSchema>;
export function criteriaFor(challenge: Challenge) {
  return challenge.completionCriteria.map((text, i) => ({
    id: `C${i + 1}`,
    text,
  }));
}
export function validateReview(
  value: unknown,
  challenge: Challenge,
  evidence: VerificationEvidence,
) {
  const result = reviewResultSchema.parse(value);
  const ids = criteriaFor(challenge).map((c) => c.id);
  if (
    result.criteria.length !== ids.length ||
    new Set(result.criteria.map((c) => c.id)).size !== ids.length ||
    result.criteria.some((c) => !ids.includes(c.id)) ||
    result.findings.some((f) => !ids.includes(f.criterionId))
  ) {
    throw new Error(
      "The review did not assess each original criterion exactly once.",
    );
  }
  if (
    result.verdict === "accepted" &&
    (result.findings.length || result.criteria.some((c) => c.status !== "met"))
  ) {
    throw new Error(
      "An accepted review cannot contain unmet criteria or required fixes.",
    );
  }
  if (result.verdict === "accepted" && result.correctness.score !== 4)
    throw new Error(
      "Accepted work must satisfy the correctness rubric completely.",
    );
  if (result.verdict === "needs_revision" && !result.findings.length) {
    throw new Error(
      "A revision request must identify a concrete requirement violation.",
    );
  }
  result.verification = evidence.status;
  const parts = [
    result.correctness.score,
    result.understanding.score,
    result.judgment.score,
  ];
  const score = parts.every((part): part is number => part !== null)
    ? parts.reduce((sum, part) => sum + part, 0)
    : null;
  return { result, score };
}
