import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
process.env.DATABASE_URL = ":memory:";
const { db, migrateDatabase } = await import("../src/shared/database/db");
const { profiles, challenges } = await import("../src/shared/database/schema");
const { codexJudge } = await import("../src/modules/judges/codex");
const { toChallenge } =
  await import("../src/modules/challenges/challenge.utils");
const { validateReview } = await import("../src/modules/reviews/review.schema");
migrateDatabase();
const profileId = crypto.randomUUID();
db.insert(profiles)
  .values({ id: profileId, email: "judge-smoke@local.test" })
  .run();
const row = db
  .insert(challenges)
  .values({
    id: crypto.randomUUID(),
    profileId,
    title: "Sum signed integers",
    scope: "feature",
    difficulty: "easy",
    contextualDifficulty: "easy",
    estimatedDifficultyScore: 2,
    topic: "Python",
    difficultyReason: "Straightforward aggregation",
    implementationBoundary: "Implement summing; no deployment.",
    durationMinMinutes: 5,
    durationMaxMinutes: 10,
    implementationMilestones: [],
    problemStatement: "Implement a function that sums signed integer inputs.",
    expectedOutcome: "A function returning the sum, or zero for empty input.",
    constraints: [],
    completionCriteria: [
      "Returns the sum including negative values.",
      "Returns zero for empty input.",
    ],
  })
  .returning()
  .get();
const workspace = await mkdtemp(join(tmpdir(), "grill-live-judge-"));
try {
  await writeFile(
    join(workspace, "core.py"),
    "def total(values):\n    return sum(values)\n",
  );
  await writeFile(
    join(workspace, "service.py"),
    "from core import total\n\ndef summarize(values):\n    return total(values)\n",
  );
  const evidence = {
    status: "inspection_only" as const,
    reason: "Smoke test of file inspection; no execution claimed.",
    checks: [],
  };
  const challenge = toChallenge(row);
  const result = await codexJudge(
    {
      challenge,
      content:
        "The implementation delegates to Python sum, which handles negative integers and returns zero on an empty iterable. Inspect service.py and core.py.",
      attachments: [],
      assistance: { hints: 0, guidance: false },
      evidence,
    },
    workspace,
    (progress) => console.log(progress),
  );
  const checked = validateReview(result, challenge, evidence);
  console.log(
    JSON.stringify(
      {
        verdict: checked.result.verdict,
        score: checked.score,
        verification: checked.result.verification,
        findings: checked.result.findings,
        summary: checked.result.summary,
      },
      null,
      2,
    ),
  );
  if (checked.result.verdict !== "accepted") process.exitCode = 1;
} finally {
  await rm(workspace, { recursive: true, force: true });
}
