import type { JudgeInput } from "../model-gateway";
import { criteriaFor } from "../../reviews/review.schema";
import { CORE_INSTRUCTIONS } from "./core";
export const JUDGE_INSTRUCTIONS = `${CORE_INSTRUCTIONS}
Assess every supplied criterion exactly once. Accepted means all mandatory requirements have evidence and there are no required fixes. needs_revision requires a concrete violation; needs_evidence means an essential assessment is unresolved.
Cite the criterion, file location when available, and a failing case or concrete reason for each finding. Separate optional improvements. Return one useful next step or one focused question without replacement code.
Use the rubric: correctness 0=no required behavior, 1=major gaps, 2=partial, 3=mostly met, 4=fully met; understanding 0=incorrect, 1=partial, 2=accurate, 3=accurate with relevant boundaries; judgment 0=choices contradict constraints, 1=partly appropriate, 2=appropriate, 3=well-justified tradeoffs relevant to this task. Use null for unassessed dimensions, with a short explanation. Assess the implementation and observable design choices directly from submitted code. Do not demand prose, an explanation, or an oral defense. For the understanding dimension, assess the reasoning demonstrated in the implementation: its algorithm, invariants, and handling of relevant boundaries. This is evidence about the submitted work, not proof of personal mastery. Use null only when the supplied code cannot support an assessment; missing prose alone is not missing evidence. Ask questions only to resolve an actual ambiguity in required behavior or missing code.
Do not penalize hints, retries, time, code length, or test authorship. A failing generated check is a defect only if its expectation follows from the original criterion; otherwise identify the check limitation. Return only the review schema.`;
export function judgePrompt(input: JudgeInput) {
  const context = { ...input.challenge.contextSnapshot };
  delete context.recentBuilds;
  delete context.recentEvidence;
  return {
    instructions: JUDGE_INSTRUCTIONS,
    input: JSON.stringify({
      challenge: { ...input.challenge, contextSnapshot: context },
      criteria: criteriaFor(input.challenge),
      submission: input.content,
      files: input.attachments,
      verificationEvidence: input.evidence,
      assistance: input.assistance,
      followup: input.followup ?? null,
      previousReview: input.previousReview ?? null,
    }),
  };
}
export function verificationPrompt(input: JudgeInput) {
  const context = { ...input.challenge.contextSnapshot };
  delete context.recentBuilds;
  delete context.recentEvidence;
  return {
    instructions: `${CORE_INSTRUCTIONS}
Create a small independent executable verification harness for the submission, using only stated criteria. Never change or repair submitted source. Tests are tool artifacts, not hints or solutions. Use standard libraries, no installation or network. Source is mounted read-only at /submission; checks run under /checks. Return unsupported with a reason when a reliable harness cannot be written. Each check must map to one supplied criterion ID and use a safe basename. Use Python unittest, Node assertions, Bun tests for TypeScript, or Go tests in a scratch copy. Tests must fail with nonzero exit codes on violated expectations.`,
    input: JSON.stringify({
      challenge: { ...input.challenge, contextSnapshot: context },
      criteria: criteriaFor(input.challenge),
      files: input.attachments,
      submission: input.content,
    }),
  };
}
