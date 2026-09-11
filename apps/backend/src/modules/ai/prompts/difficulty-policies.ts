import type { BuildDifficulty } from "../../challenges/challenge.schema";

const DIFFICULTY_POLICIES: Record<BuildDifficulty, string> = {
  easy: `EASY DIFFICULTY
Supply explicit contracts and limit failure cases. Reduce ambiguity and engineering pressure without replacing implementation work with explanation.`,
  medium: `MEDIUM DIFFICULTY
Require integration decisions, error handling, and non-trivial edge cases. Leave meaningful choices for the builder to make.`,
  hard: `HARD DIFFICULTY
Introduce relevant constraints involving concurrency, resources, failures, performance, security, or operability. Make trade-offs observable without expanding the statement merely to sound harder.`,
};

export function difficultyPolicy(difficulty: BuildDifficulty) {
  return DIFFICULTY_POLICIES[difficulty];
}
