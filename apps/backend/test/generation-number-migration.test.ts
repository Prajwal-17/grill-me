import { expect, test } from "bun:test";
import { SQL } from "bun";
import { databaseUrl } from "../src/shared/storage/paths";

test("generation numbering migrates all quiz scopes without losing historical data", async () => {
  const client = new SQL(process.env.TEST_DATABASE_URL ?? databaseUrl());
  const schema = `number_migration_${crypto.randomUUID().replaceAll("-", "")}`;
  try {
    await client.begin(async (tx) => {
      await tx.unsafe(`CREATE SCHEMA "${schema}"`);
      await tx.unsafe(`SET LOCAL search_path TO "${schema}"`);
      const apply = async (file: string) => {
        const migration = await Bun.file(
          new URL(`../drizzle/${file}`, import.meta.url),
        ).text();
        for (const statement of migration.split("--> statement-breakpoint"))
          await tx.unsafe(statement.replaceAll('"public".', `"${schema}".`));
      };
      for (const file of [
        "0000_late_dust.sql",
        "0001_bitter_deadpool.sql",
        "0002_dazzling_spot.sql",
        "0003_smart_quiz_titles.sql",
        "0004_soft_delete_quizzes.sql",
        "0005_bored_zodiak.sql",
        "0006_challenge_archive.sql",
      ])
        await apply(file);

      await tx.unsafe(`
        INSERT INTO profiles (id,email,created_at,updated_at) VALUES
          ('owner','owner@example.test','2020-01-01','2020-01-01'),
          ('other','other@example.test','2020-01-01','2020-01-01');
        INSERT INTO challenges (id,profile_id,challenge_number,title,scope,difficulty,contextual_difficulty,duration_min_minutes,duration_max_minutes,implementation_milestones,problem_statement,expected_outcome,constraints,completion_criteria,status,created_at,archived_at)
        VALUES ('challenge-a','owner',1,'Historical task','focused','hard','hard',30,60,'["Frozen step"]','Historical statement','Historical outcome','["Frozen constraint"]','["Frozen criterion"]','completed','2020-01-01','2020-01-04');
        INSERT INTO challenges SELECT (jsonb_populate_record(NULL::challenges,
          to_jsonb(c) || '{"id":"challenge-b","challenge_number":3}')).* FROM challenges c;
        INSERT INTO challenges SELECT (jsonb_populate_record(NULL::challenges,
          to_jsonb(c) || '{"id":"other-challenge","profile_id":"other","challenge_number":1}')).* FROM challenges c WHERE id = 'challenge-a';
        INSERT INTO quizzes (id,profile_id,challenge_id,quiz_number,request_id,question_count,coverage,questions,context_snapshot,prompt_version,title,created_at,deleted_at) VALUES
          ('quiz-a','owner','challenge-a',1,'same-request',5,'mixed','[{"id":"q","correctOption":2,"explanation":"Saved explanation"}]','{"saved":true}','quiz-v1','Saved quiz title','2020-01-01',NULL),
          ('quiz-b','owner','challenge-b',1,'same-request',5,'mixed','[]','{}','quiz-v1','Deleted quiz','2020-01-03','2020-01-04'),
          ('other-quiz','other','other-challenge',1,'same-request',5,'mixed','[]','{}','quiz-v1','Other profile','2020-01-01',NULL);
        INSERT INTO quizzes (id,profile_id,quiz_number,request_id,question_count,coverage,questions,context_snapshot,prompt_version,topic,difficulty,title,created_at)
        VALUES ('standalone','owner',1,'same-request',5,'topic','[]','{}','quiz-v1','TypeScript','hard','Standalone title','2020-01-02');
        INSERT INTO quiz_attempts (id,quiz_id,attempt_number,status,answers,revision,score,created_at,updated_at,submitted_at)
        VALUES ('attempt','quiz-a',1,'submitted','{"q":2}',3,5,'2020-01-01','2020-01-02','2020-01-02');
        INSERT INTO messages (id,challenge_id,role,mode,content,created_at)
        VALUES ('message','challenge-a','user','generate','Original request','2020-01-01');
      `);
      const snapshot = async () => ({
        challenges: await tx.unsafe(
          "SELECT to_jsonb(c) AS record FROM challenges c ORDER BY id",
        ),
        quizzes: await tx.unsafe(
          "SELECT to_jsonb(q) - 'quiz_number' AS record FROM quizzes q ORDER BY id",
        ),
        attempts: await tx.unsafe(
          "SELECT to_jsonb(a) AS record FROM quiz_attempts a ORDER BY id",
        ),
        messages: await tx.unsafe(
          "SELECT to_jsonb(m) AS record FROM messages m ORDER BY id",
        ),
      });
      const before = await snapshot();
      await apply("0007_generation_numbers.sql");
      expect(await snapshot()).toEqual(before);
      expect(
        await tx.unsafe<{ id: string; quiz_number: number }[]>(
          "SELECT id,quiz_number FROM quizzes ORDER BY profile_id,quiz_number",
        ),
      ).toEqual([
        { id: "other-quiz", quiz_number: 1 },
        { id: "quiz-a", quiz_number: 1 },
        { id: "standalone", quiz_number: 2 },
        { id: "quiz-b", quiz_number: 3 },
      ]);

      // Raw inserts also receive numbers, even if a caller supplies an old one.
      const insertQuiz = () =>
        tx.unsafe(`INSERT INTO quizzes
        SELECT (jsonb_populate_record(NULL::quizzes, to_jsonb(q) || jsonb_build_object(
          'id','new-quiz','request_id',gen_random_uuid()::text,'quiz_number',1))).*
        FROM quizzes q WHERE id = 'standalone' RETURNING quiz_number`);
      const insertChallenge = () =>
        tx.unsafe(`INSERT INTO challenges
        SELECT (jsonb_populate_record(NULL::challenges, to_jsonb(c) ||
          '{"id":"new-challenge","challenge_number":1}')).*
        FROM challenges c WHERE id = 'challenge-a' RETURNING challenge_number`);
      expect((await insertQuiz())[0].quiz_number).toBe(4);
      expect((await insertChallenge())[0].challenge_number).toBe(4);
      await tx.unsafe(
        "DELETE FROM quizzes WHERE id = 'new-quiz'; DELETE FROM challenges WHERE id = 'new-challenge'",
      );
      expect((await insertQuiz())[0].quiz_number).toBe(5);
      expect((await insertChallenge())[0].challenge_number).toBe(5);
      // Restoring a soft-deleted quiz does not allocate another number.
      await tx.unsafe(
        "UPDATE quizzes SET deleted_at = NULL WHERE id = 'quiz-b'",
      );
      expect(
        (
          await tx.unsafe("SELECT quiz_number FROM quizzes WHERE id = 'quiz-b'")
        )[0].quiz_number,
      ).toBe(3);
      for (const statement of [
        "UPDATE quizzes SET quiz_number = 99 WHERE id = 'quiz-a'",
        "UPDATE challenges SET challenge_number = 99 WHERE id = 'challenge-a'",
        "UPDATE quizzes SET profile_id = 'other' WHERE id = 'quiz-a'",
        "UPDATE challenges SET profile_id = 'other' WHERE id = 'challenge-a'",
      ]) {
        await expect(
          tx.savepoint((nested) => nested.unsafe(statement)),
        ).rejects.toThrow("immutable");
      }
      await tx.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  } finally {
    await client.close();
  }
});
