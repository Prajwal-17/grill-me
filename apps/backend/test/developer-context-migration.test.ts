import { expect, test } from "bun:test";
import { SQL } from "bun";
import { databaseUrl } from "../src/shared/storage/paths";

test("additive context migration leaves historical records and unknown timestamps unchanged", async () => {
  const client = new SQL(process.env.TEST_DATABASE_URL ?? databaseUrl());
  const schema = `context_migration_${crypto.randomUUID().replaceAll("-", "")}`;
  try {
    await client.begin(async (tx) => {
      await tx.unsafe(`CREATE SCHEMA "${schema}"`);
      await tx.unsafe(`SET LOCAL search_path TO "${schema}"`);
      for (const file of [
        "0000_late_dust.sql",
        "0001_bitter_deadpool.sql",
        "0002_dazzling_spot.sql",
        "0003_smart_quiz_titles.sql",
        "0004_soft_delete_quizzes.sql",
      ]) {
        const migration = await Bun.file(
          new URL(`../drizzle/${file}`, import.meta.url),
        ).text();
        for (const statement of migration.split("--> statement-breakpoint"))
          await tx.unsafe(statement.replaceAll('"public".', `"${schema}".`));
      }
      await tx.unsafe(`INSERT INTO profiles (id,email,created_at,updated_at) VALUES ('legacy','legacy@example.test','2020-01-01','2020-01-02');
        INSERT INTO profile_preferences (profile_id,guided_preferences,about_me,created_at,updated_at) VALUES ('legacy','{"languages":["typescript"]}','Existing background','2020-01-01','2020-01-02');
        INSERT INTO challenges (id,profile_id,challenge_number,title,scope,difficulty,contextual_difficulty,estimated_difficulty_score,difficulty_reason,duration_min_minutes,duration_max_minutes,implementation_milestones,problem_statement,expected_outcome,constraints,completion_criteria,context_snapshot,contract_version,status,created_at)
        VALUES ('historical','legacy',1,'Historical','focused','hard','hard',8,'Legacy estimate',30,60,'["Frozen step"]','Historical statement','Historical outcome','["Frozen constraint"]','["Frozen criterion"]','{"technicalContext":{"experienceLevel":"Junior"}}',1,'completed','2020-01-02');`);
      const before = await tx.unsafe(
        "SELECT row_to_json(challenges) AS challenge FROM challenges",
      );
      const migration = await Bun.file(
        new URL("../drizzle/0005_bored_zodiak.sql", import.meta.url),
      ).text();
      await tx.unsafe(migration);
      expect(
        await tx.unsafe(
          "SELECT row_to_json(challenges) AS challenge FROM challenges",
        ),
      ).toEqual(before);
      const preferences = await tx.unsafe(
        "SELECT guided_preferences,about_me,updated_at,developer_context_updated_at FROM profile_preferences",
      );
      expect(preferences[0]).toMatchObject({
        guided_preferences: { languages: ["typescript"] },
        about_me: "Existing background",
        developer_context_updated_at: null,
      });
      expect(new Date(preferences[0].updated_at).toISOString()).toBe(
        "2020-01-02T00:00:00.000Z",
      );
      await tx.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  } finally {
    await client.close();
  }
});
