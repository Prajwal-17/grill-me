import type { BuildDifficulty } from "../../challenges/challenge.schema";
const policies: Record<BuildDifficulty, string> = {
  easy: "EASY: Direct application of recently learned concepts. Explicit behavior, known prerequisites, ordinary cases, no hidden trick or unrelated engineering pressure.",
  medium:
    "MEDIUM: Combine familiar ideas with one meaningful complication and a few relevant edge cases. Limited design choice.",
  hard: "HARD: Interacting constraints or a non-obvious tradeoff requiring deliberate design and verification. Introduce concurrency or performance only when relevant to the topic.",
  grill:
    "GRILL: Demanding reasoning, competing constraints, and adversarial cases within the chosen scope and prerequisites. Adapt to topic familiarity; do not impose unrelated expert prerequisites on a beginner.",
};
export const difficultyPolicy = (difficulty: BuildDifficulty) =>
  policies[difficulty];
