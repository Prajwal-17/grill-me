import type { ReviewResult } from "@/shared/types/api";

export function reviewPresentation(
  result: ReviewResult,
  requirements: string[],
) {
  const readable = (text: string) =>
    text.replace(/\bC(\d+)\b/g, (_, number: string) => {
      const requirement = requirements[Number(number) - 1];
      return requirement ? `“${requirement}”` : "the requirement";
    });
  return {
    ...result,
    summary: readable(result.summary),
    question: result.question ? readable(result.question) : null,
    nextStep: result.nextStep ? readable(result.nextStep) : null,
    optionalImprovements: result.optionalImprovements.map(readable),
    criteria: result.criteria.map((criterion) => ({
      ...criterion,
      evidence: readable(criterion.evidence),
    })),
    findings: result.findings.map((finding) => ({
      ...finding,
      issue: readable(finding.issue),
      evidence: readable(finding.evidence),
    })),
    correctness: {
      ...result.correctness,
      evidence: readable(result.correctness.evidence),
    },
    understanding: {
      ...result.understanding,
      evidence: readable(result.understanding.evidence),
    },
    judgment: {
      ...result.judgment,
      evidence: readable(result.judgment.evidence),
    },
  };
}
