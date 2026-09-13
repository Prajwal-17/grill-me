import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
process.env.DATABASE_URL = ":memory:";
const { migrateDatabase, db } = await import("../src/shared/database/db");
const { profiles } = await import("../src/shared/database/schema");
const { createOpenAIModel } = await import("../src/modules/ai/openai.model");
const { profilePreferencesSchema } =
  await import("../src/modules/profiles/profile.schema");
const { DIFFICULTY_BANDS } =
  await import("../src/modules/ai/prompts/difficulty-policies");
migrateDatabase();
const id = crypto.randomUUID();
db.insert(profiles).values({ id, email: "prompt-evaluation@local.test" }).run();
const llm = createOpenAIModel();
const learner = {
  profileId: id,
  preferences: profilePreferencesSchema.parse({
    profileId: id,
    updatedAt: new Date().toISOString(),
    languages: ["python"],
    topicFamiliarity: [
      { topic: "Python collections", familiarity: "practiced" },
    ],
    knownConcepts: ["Functions", "Lists", "Dictionaries", "File IO"],
    learningGoal: "Build correct implementations independently",
  }),
  recentChallenges: [],
};
const results: unknown[] = [];
for (const scope of ["focused", "feature", "system"] as const) {
  for (const difficulty of ["easy", "medium", "hard", "grill"] as const) {
    try {
      const challenge = await llm.generateBuild({
        prompt: "Practice Python collections with a useful implementation.",
        scope,
        difficulty,
        clarificationContext: null,
        learner,
      });
      const words = [
        challenge.problemStatement,
        challenge.expectedOutcome,
        ...challenge.constraints,
        ...challenge.completionCriteria,
        challenge.implementationBoundary,
      ]
        .join(" ")
        .split(/\s+/).length;
      const [min, max] = DIFFICULTY_BANDS[difficulty];
      const calibrated =
        challenge.estimatedDifficultyScore >= min &&
        challenge.estimatedDifficultyScore <= max;
      results.push({ scope, difficulty, words, calibrated, challenge });
      console.log(
        `${scope}/${difficulty}: ${challenge.estimatedDifficultyScore}/10, ${words} words, ${calibrated ? "band matches" : "CALIBRATION MISMATCH"}`,
      );
      if (!calibrated) process.exitCode = 1;
    } catch (error) {
      results.push({
        scope,
        difficulty,
        error: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
      console.error(`${scope}/${difficulty}: generation unavailable`);
      break;
    }
  }
  if (process.exitCode) break;
}
const dir = resolve(".data/evaluations");
await mkdir(dir, { recursive: true });
const path = resolve(dir, `prompts-${Date.now()}.json`);
await writeFile(path, JSON.stringify(results, null, 2));
console.log(
  `Review semantic difficulty, feasibility, scope, and solution leakage in ${path}. Numeric bands alone are not a quality verdict.`,
);
