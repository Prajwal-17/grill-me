import { expect, test } from "bun:test";
import { SQL } from "bun";

test("standalone quiz migration preserves populated challenge quizzes and attempts", async () => {
  const client = new SQL(
    process.env.TEST_DATABASE_URL ??
      "postgresql://prajwal-17:prajwal2004@localhost:5432/grill-me-test",
  );
  const schema = `quiz_migration_${crypto.randomUUID().replaceAll("-", "")}`;
  try {
    await client.begin(async (tx) => {
      await tx.unsafe(`CREATE SCHEMA "${schema}"`);
      await tx.unsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.unsafe(`CREATE TABLE profiles (id text PRIMARY KEY);
        CREATE TABLE challenges (id text PRIMARY KEY, profile_id text NOT NULL REFERENCES profiles(id));
        INSERT INTO profiles VALUES ('owner'), ('other');
        INSERT INTO challenges VALUES ('challenge-a', 'owner'), ('challenge-b', 'owner'), ('challenge-c', 'other');`);
      for (const file of [
        "0001_bitter_deadpool.sql",
        "0002_dazzling_spot.sql",
      ]) {
        const migration = await Bun.file(
          new URL(`../../../packages/backend/drizzle/${file}`, import.meta.url),
        ).text();
        for (const statement of migration.split("--> statement-breakpoint")) {
          await tx.unsafe(statement.replaceAll('"public".', `"${schema}".`));
        }
        if (file === "0001_bitter_deadpool.sql") {
          await tx.unsafe(`INSERT INTO quizzes
            (id, challenge_id, quiz_number, request_id, question_count, coverage, questions, context_snapshot, prompt_version, created_at)
            SELECT id, id, 1, 'same-request', 5, 'mixed', '[{"id":"question","correctOption":2}]', '{"saved":true}', 'quiz-v1', now()
            FROM challenges;
            INSERT INTO quiz_attempts (id, quiz_id, attempt_number, status, answers, revision, score, created_at, updated_at, submitted_at)
            VALUES ('attempt', 'challenge-a', 1, 'submitted', '{"question":2}', 3, 5, now(), now(), now());`);
        }
      }
      const quizzes = await tx.unsafe(
        "SELECT id, profile_id, quiz_number, questions, context_snapshot FROM quizzes ORDER BY id",
      );
      expect(
        quizzes.map((quiz: { profile_id: string }) => quiz.profile_id),
      ).toEqual(["owner", "owner", "other"]);
      expect(quizzes[0]).toMatchObject({
        quiz_number: 1,
        questions: [{ id: "question", correctOption: 2 }],
        context_snapshot: { saved: true },
      });
      const attempts = await tx.unsafe(
        "SELECT answers, revision, score, status FROM quiz_attempts",
      );
      expect(attempts[0]).toEqual({
        answers: { question: 2 },
        revision: 3,
        score: 5,
        status: "submitted",
      });
      await tx.unsafe(`INSERT INTO quizzes
        (id, profile_id, quiz_number, request_id, question_count, topic, difficulty, coverage, questions, context_snapshot, prompt_version, created_at)
        SELECT id, id, 1, 'same-request', 5, 'SQL joins', 'medium', 'topic', '[]', '{}', 'quiz-v2', now() FROM profiles;`);
      expect(
        await tx.unsafe("SELECT id FROM quizzes WHERE challenge_id IS NULL"),
      ).toHaveLength(2);
      await tx.unsafe("DELETE FROM challenges WHERE id = 'challenge-a'");
      expect(await tx.unsafe("SELECT id FROM quiz_attempts")).toHaveLength(0);
      expect(
        await tx.unsafe("SELECT id FROM quizzes WHERE challenge_id IS NULL"),
      ).toHaveLength(2);
      await tx.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  } finally {
    await client.close();
  }
});
