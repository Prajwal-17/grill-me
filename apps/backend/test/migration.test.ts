import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("additive migration preserves legacy work and can run again safely", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-migration-"));
  const sqlite = new Database(":memory:");
  const current = resolve(import.meta.dir, "../drizzle");
  try {
    const journal = await Bun.file(join(current, "meta/_journal.json")).json();
    await mkdir(join(root, "meta"));
    await writeFile(
      join(root, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }),
    );
    await copyFile(
      join(current, journal.entries[0].tag + ".sql"),
      join(root, journal.entries[0].tag + ".sql"),
    );
    const database = drizzle(sqlite);
    migrate(database, { migrationsFolder: root });
    sqlite.run(
      "INSERT INTO profiles (id,email,created_at,updated_at) VALUES ('legacy-owner','legacy@local.test',1,1)",
    );
    sqlite.run(`INSERT INTO challenges (id,profile_id,title,scope,difficulty,contextual_difficulty,duration_min_minutes,duration_max_minutes,implementation_milestones,problem_statement,expected_outcome,constraints,completion_criteria,status,created_at,completed_at)
      VALUES ('legacy','legacy-owner','Original title','focused','easy','easy',5,10,'[]','Original task','Original outcome','[]','["Original criterion"]','completed',1,2)`);
    sqlite.run(`INSERT INTO challenges (id,profile_id,title,scope,difficulty,contextual_difficulty,duration_min_minutes,duration_max_minutes,implementation_milestones,problem_statement,expected_outcome,constraints,completion_criteria,status,created_at,completed_at)
      VALUES ('legacy-2','legacy-owner','Second title','focused','easy','easy',5,10,'[]','Second task','Second outcome','[]','["Second criterion"]','completed',3,4)`);
    sqlite.run(
      "INSERT INTO messages (id,challenge_id,role,mode,content,created_at) VALUES ('feedback','legacy','assistant','review','Original prose feedback',2)",
    );
    migrate(database, { migrationsFolder: current });
    migrate(database, { migrationsFolder: current });
    expect(
      sqlite
        .query(
          "SELECT title,problem_statement,status,completion_source,estimated_difficulty_score,context_snapshot,challenge_number FROM challenges WHERE id='legacy'",
        )
        .get(),
    ).toEqual({
      title: "Original title",
      problem_statement: "Original task",
      status: "completed",
      completion_source: "legacy",
      estimated_difficulty_score: null,
      context_snapshot: null,
      challenge_number: 1,
    });
    expect(
      sqlite
        .query("SELECT challenge_number FROM challenges WHERE id='legacy-2'")
        .get(),
    ).toEqual({ challenge_number: 2 });
    expect(
      sqlite.query("SELECT content FROM messages WHERE id='feedback'").get(),
    ).toEqual({ content: "Original prose feedback" });
    expect(
      sqlite.query("SELECT count(*) AS total FROM review_jobs").get(),
    ).toEqual({ total: 0 });
  } finally {
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  }
});
