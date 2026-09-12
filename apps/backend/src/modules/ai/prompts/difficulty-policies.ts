import type { BuildDifficulty } from "../../challenges/challenge.schema";

const DIFFICULTY_POLICIES: Record<BuildDifficulty, string> = {
  easy: `EASY DIFFICULTY
Supply explicit contracts and limit failure cases. Reduce ambiguity and engineering pressure without replacing implementation work with explanation.`,
  medium: `MEDIUM DIFFICULTY
Require integration decisions, error handling, and non-trivial edge cases. Leave meaningful choices for the builder to make.`,
  hard: `HARD DIFFICULTY
Introduce relevant constraints involving concurrency, resources, failures, performance, security, or operability. Make trade-offs observable without expanding the statement merely to sound harder.`,
  grill: `GRILL DIFFICULTY — MAXIMUM
This is the highest difficulty, strictly harder than Hard. Demand expert-level implementation within the selected scope, even when the learner is a beginner; adapt clarity, not difficulty.
Combine at least two relevant sources of engineering pressure that interact: concurrency, strict resource bounds, partial failures, adversarial inputs, performance, or recovery. Choose pressures that fit the requested technology; never bolt on an unrelated distributed system.
Specify precise invariants and feasible, measurable limits. Require observable behavior under the combined failure cases, deterministic adversarial tests, and an explicit trade-off justified by the implementation. A happy-path-only solution must not pass the completion criteria.
Keep contracts unambiguous and all constraints mutually achievable. Do not increase the chosen scope, statement-length limits, or milestone limits. Make the work harder through interacting constraints, not extra features, obscure trivia, withheld requirements, or solution leakage.`,
};

export function difficultyPolicy(difficulty: BuildDifficulty) {
  return DIFFICULTY_POLICIES[difficulty];
}
