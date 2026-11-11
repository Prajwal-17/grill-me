import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSqliteDatabase } from "@repo/backend/shared/database/db.sqlite";
import { backupBeforeMigration } from "@repo/backend/local/backup";

const schema = await readFile(
  new URL("../drizzle-sqlite/0000_desktop.sql", import.meta.url),
  "utf8",
);

function populate(path: string) {
  const db = new Database(path);
  try {
    db.exec(schema);
    db.exec(`
      ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('streaming','completed','failed','cancelled','interrupted'));
      ALTER TABLE messages ADD COLUMN error TEXT;
      ALTER TABLE messages ADD COLUMN reply_to TEXT;
      PRAGMA user_version = 2;
      INSERT INTO profiles(id,email,created_at,updated_at) VALUES
        ('owner-a','a@example.test',1000,1000),
        ('owner-b','b@example.test',2000,2000);
      INSERT INTO profile_preferences(profile_id,guided_preferences,about_me,created_at,updated_at)
        VALUES ('owner-a','{"experienceLevel":"mid"}','Keep me',1000,1000);
      INSERT INTO challenges(id,profile_id,challenge_number,title,scope,difficulty,contextual_difficulty,duration_min_minutes,duration_max_minutes,implementation_milestones,problem_statement,expected_outcome,constraints,completion_criteria,created_at)
        VALUES ('challenge-a','owner-a',1,'Saved challenge','focused','medium','medium',15,30,'[]','Build a grouping function.','A function.','[]','["Groups words."]',1000);
      INSERT INTO messages(id,challenge_id,role,mode,content,attachments,created_at,status,error,reply_to) VALUES
        ('msg-user','challenge-a','user','clarify','Question','[]',1001,'completed',NULL,NULL),
        ('msg-ok','challenge-a','assistant','clarify','Answer','[]',1002,'completed',NULL,'msg-user'),
        ('msg-failed','challenge-a','assistant','clarify','Partial','[]',1003,'failed','Provider failed','msg-user');
      INSERT INTO quizzes(id,profile_id,challenge_id,topic,title,difficulty,quiz_number,request_id,question_count,coverage,questions,context_snapshot,prompt_version,created_at)
        VALUES ('quiz-a','owner-a','challenge-a',NULL,'Saved quiz',NULL,1,'request-a',5,'mixed','[]','{}','quiz-v1',1000);
      INSERT INTO quiz_attempts(id,quiz_id,attempt_number,status,answers,revision,score,created_at,updated_at,submitted_at)
        VALUES ('attempt-a','quiz-a',1,'submitted','{"q1":1}',2,1,1000,1000,1001);
      INSERT INTO projects(id,profile_id,name,root,created_at) VALUES ('project-a','owner-a','Saved project','/tmp/saved',1000);
      INSERT INTO submissions(id,challenge_id,sequence,contract_version,content,attachments,project_id,snapshot_path,manifest,git_context,assistance,created_at)
        VALUES ('submission-a','challenge-a',1,2,'export const ok = true;','[]','project-a','/tmp/snapshot','[{"path":"answer.ts","sha256":"x","bytes":25}]',NULL,'{"hints":1,"guidance":false}',1000);
      INSERT INTO review_jobs(id,submission_id,judge,routing_reason,status,progress,response,score,error,followup,ai_log_id,provider_thread_id,provider_turn_id,prompt_version,created_at,completed_at)
        VALUES ('review-a','submission-a','omniroute','Fixture','completed','Review complete','{"verdict":"accepted"}',10,NULL,NULL,NULL,NULL,NULL,'practice-v3',1000,1001);
      INSERT INTO verification_runs(id,review_id,evidence,created_at) VALUES ('verification-a','review-a','{"status":"inspection_only","reason":"Fixture","checks":[]}',1001);
      INSERT INTO ai_logs(id,profile_id,challenge_id,operation,status,requested_model,actual_model,endpoint,provider_request_id,streamed,preview,started_at,completed_at,duration_ms,first_token_ms,input_tokens,output_tokens,total_tokens,cached_tokens,reasoning_tokens,cost_usd,request_body,response_body,response_text,stream_events,error)
        VALUES ('log-a','owner-a','challenge-a','review','success','fixture','fixture','http://fixture',NULL,0,'Preview',1000,1001,1,1,1,1,2,0,0,0.1,'{}','{}','text',NULL,NULL);
      INSERT INTO ai_log_events(log_id,recorded_at,payload) VALUES ('log-a',1001,'{"delta":"ok"}');
      INSERT INTO generation_counters(profile_id,kind,value) VALUES ('owner-a','challenge',1),('owner-a','quiz',1);
      INSERT INTO generation_jobs(id,profile_id,request_id,kind,challenge_id,request,status,phase,skip_preparation,created_at,updated_at)
        VALUES ('job-a','owner-a','request-a','challenge',NULL,'{"kind":"challenge"}','completed','completed',0,1000,1000);
    `);
  } finally {
    db.close();
  }
}

function indexNames(path: string) {
  const db = new Database(path, { readonly: true });
  try {
    return (
      db
        .query(
          "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map((row) => row.name);
  } finally {
    db.close();
  }
}

function withoutModelSelection(value: Record<string, unknown[]>) {
  for (const review of value.review_jobs as {
    model_selection?: string | null;
  }[]) {
    expect(review.model_selection).toBeNull();
    delete review.model_selection;
  }
  return value;
}

function snapshot(path: string) {
  const db = new Database(path, { readonly: true });
  try {
    const tables = [
      "profiles",
      "profile_preferences",
      "challenges",
      "messages",
      "quizzes",
      "quiz_attempts",
      "projects",
      "submissions",
      "review_jobs",
      "verification_runs",
      "ai_logs",
      "ai_log_events",
      "generation_counters",
      "generation_jobs",
    ];
    return Object.fromEntries(
      tables.map((table) => [
        table,
        db.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ]),
    );
  } finally {
    db.close();
  }
}

test("v2 practice databases upgrade to v3 without changing existing rows, relationships, or indexes", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-v2-upgrade-"));
  const path = join(root, "grill-me.sqlite");
  try {
    populate(path);
    const before = snapshot(path);
    const indexesBefore = indexNames(path);
    const database = createSqliteDatabase(path);
    await database.migrateDatabase();
    expect(database.sqlite.query("PRAGMA user_version").get()).toEqual({
      user_version: 3,
    });
    expect(database.sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(database.sqlite.query("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    const after = snapshot(path);
    expect(withoutModelSelection(after)).toEqual(before);
    expect(
      (
        database.sqlite.query("PRAGMA table_info(review_jobs)").all() as {
          name: string;
        }[]
      ).some((column) => column.name === "model_selection"),
    ).toBe(true);
    expect(
      database.sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('agent_runs','agent_run_events') ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: "agent_run_events" }, { name: "agent_runs" }]);
    await database.migrateDatabase();
    expect(withoutModelSelection(snapshot(path))).toEqual(before);
    database.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a failed v3 migration rolls back without changing v2 data", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-v3-rollback-"));
  const path = join(root, "rollback.sqlite");
  try {
    populate(path);
    const before = snapshot(path);
    const blocking = new Database(path);
    blocking.exec("CREATE TABLE agent_runs (id text PRIMARY KEY NOT NULL);");
    blocking.close();
    const database = createSqliteDatabase(path);
    await expect(database.migrateDatabase()).rejects.toThrow();
    expect(database.sqlite.query("PRAGMA user_version").get()).toEqual({
      user_version: 2,
    });
    expect(snapshot(path)).toEqual(before);
    expect(
      (
        database.sqlite.query("PRAGMA table_info(review_jobs)").all() as {
          name: string;
        }[]
      ).some((column) => column.name === "model_selection"),
    ).toBe(false);
    database.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fresh databases execute the full schema chain and reach version 3", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-fresh-v3-"));
  const path = join(root, "fresh.sqlite");
  try {
    const database = createSqliteDatabase(path);
    await database.migrateDatabase();
    expect(database.sqlite.query("PRAGMA user_version").get()).toEqual({
      user_version: 3,
    });
    expect(
      database.sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('messages','quizzes','agent_runs','agent_run_events') ORDER BY name",
        )
        .all(),
    ).toEqual([
      { name: "agent_run_events" },
      { name: "agent_runs" },
      { name: "messages" },
      { name: "quizzes" },
    ]);
    expect(
      (
        database.sqlite.query("PRAGMA table_info(review_jobs)").all() as {
          name: string;
        }[]
      ).some((column) => column.name === "model_selection"),
    ).toBe(true);
    await database.migrateDatabase();
    database.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("startup backups are verified, owner-only, and contain the pre-upgrade rows", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-backup-"));
  const practice = join(root, "grill-me.sqlite");
  const settings = join(root, "settings.sqlite");
  try {
    populate(practice);
    const settingsDb = new Database(settings);
    settingsDb.exec(
      "CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL);",
    );
    settingsDb
      .query("INSERT INTO settings(id,document) VALUES(1,?)")
      .run(JSON.stringify({ version: 1, providers: [] }));
    settingsDb.close();
    await chmod(settings, 0o600);
    const directory = await backupBeforeMigration(root, [practice, settings]);
    expect(directory).not.toBeNull();
    expect((await stat(directory!)).mode & 0o777).toBe(0o700);
    for (const file of ["grill-me.sqlite", "settings.sqlite"]) {
      const backup = join(directory!, file);
      expect((await stat(backup)).mode & 0o777).toBe(0o600);
      const db = new Database(backup, { readonly: true });
      try {
        expect(db.query("PRAGMA integrity_check").get()).toEqual({
          integrity_check: "ok",
        });
      } finally {
        db.close();
      }
    }
    const backup = new Database(join(directory!, "grill-me.sqlite"), {
      readonly: true,
    });
    try {
      expect(
        (backup.query("PRAGMA user_version").get() as { user_version: number })
          .user_version,
      ).toBe(2);
      expect(
        (
          backup.query("SELECT count(*) AS count FROM messages").get() as {
            count: number;
          }
        ).count,
      ).toBe(3);
    } finally {
      backup.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a backup failure stops startup before migration", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-backup-fail-"));
  const practice = join(root, "grill-me.sqlite");
  const notADirectory = join(root, "blocked");
  try {
    populate(practice);
    await writeFile(notADirectory, "not a directory");
    await expect(
      backupBeforeMigration(notADirectory, [practice]),
    ).rejects.toMatchObject({ code: "BACKUP_FAILED" });
    const db = new Database(practice, { readonly: true });
    try {
      expect(
        (db.query("PRAGMA user_version").get() as { user_version: number })
          .user_version,
      ).toBe(2);
    } finally {
      db.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
