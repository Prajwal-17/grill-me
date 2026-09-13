import type { BuildDifficulty } from "../../challenges/challenge.schema";
const policies: Record<BuildDifficulty, string> = {
  easy: "EASY: Direct application of recently learned concepts. Explicit behavior, known prerequisites, ordinary cases, no hidden trick or unrelated engineering pressure. Target estimated difficulty 1–3/10.",
  medium:
    "MEDIUM: Combine familiar ideas with one meaningful complication and a few relevant edge cases. Limited design choice. Target estimated difficulty 4–6/10.",
  hard: "HARD: Interacting constraints or a non-obvious tradeoff requiring deliberate design and verification. Introduce concurrency or performance only when relevant to the topic. Target 7–8/10.",
  grill:
    "GRILL: Demanding reasoning, competing constraints, and adversarial cases within the chosen scope and prerequisites. Adapt to topic familiarity; do not impose unrelated expert prerequisites on a beginner. Target 9–10/10.",
};
export const difficultyPolicy = (difficulty: BuildDifficulty) =>
  policies[difficulty];
