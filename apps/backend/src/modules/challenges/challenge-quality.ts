import { z } from "zod";
import {
  generatedBuildSchemaForScope,
  type GeneratedBuildContent,
  type BuildScope,
  type BuildDifficulty,
} from "./challenge.schema";

export const buildAssessmentSchema = z.object({
  relevant: z.boolean(),
  scopeMatches: z.boolean(),
  prerequisitesMatch: z.boolean(),
  estimatedDifficultyScore: z.number().int().min(1).max(10),
  difficultyReason: z.string().trim().min(1).max(400),
  issues: z.array(z.string().trim().min(1).max(300)).max(6),
});
export type BuildAssessment = z.infer<typeof buildAssessmentSchema>;
export function briefWordBudget(
  scope: BuildScope,
  difficulty: BuildDifficulty,
) {
  return scope === "focused"
    ? difficulty === "easy"
      ? 120
      : 200
    : scope === "feature"
      ? 220
      : 300;
}
export function briefIssues(
  build: GeneratedBuildContent,
  scope: BuildScope,
  difficulty: BuildDifficulty,
) {
  const parsed = generatedBuildSchemaForScope(scope).safeParse(build);
  const issues = parsed.success
    ? []
    : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  const text = [
    build.title,
    build.problemStatement,
    ...build.completionCriteria,
    ...build.constraints,
    build.implementationBoundary,
    build.expectedOutcome,
  ].join(" ");
  const words = text.trim().split(/\s+/u).length;
  const budget = briefWordBudget(scope, difficulty);
  if (words > budget)
    issues.push(
      `Complete brief is ${words} words; maximum is ${budget}. Simplify scope and remove repetition; do not move requirements into other fields.`,
    );
  if (build.implementationMilestones.length)
    issues.push("Omit implementation milestones and solution steps.");
  return issues;
}
