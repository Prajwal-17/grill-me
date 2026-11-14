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

function populateV3(path: string) {
  populate(path);
  const db = new Database(path);

  try {
    db.exec(`
      ALTER TABLE review_jobs ADD COLUMN model_selection TEXT;
      CREATE TABLE agent_runs (
        id text PRIMARY KEY NOT NULL,
        profile_id text NOT NULL,
        operation text NOT NULL,
        challenge_id text,
        resource_kind text,
        resource_id text,
        provider_id text NOT NULL,
        provider_name text NOT NULL,
        provider_preset text NOT NULL,
        model text NOT NULL,
        reasoning_effort text,
        status text DEFAULT 'running' NOT NULL,
        error_code text,
        error_message text,
        turn_count integer DEFAULT 0 NOT NULL,
        tool_call_count integer DEFAULT 0 NOT NULL,
        input_tokens integer,
        output_tokens integer,
        total_tokens integer,
        started_at integer NOT NULL,
        completed_at integer,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON UPDATE no action ON DELETE cascade,
        FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON UPDATE no action ON DELETE set null,
        CONSTRAINT agent_runs_status_check CHECK(status in ('running','completed','failed','cancelled','interrupted'))
      );
      CREATE INDEX agent_runs_profile_started_idx ON agent_runs (profile_id, started_at, id);
      CREATE INDEX agent_runs_status_started_idx ON agent_runs (status, started_at);
      CREATE TABLE agent_run_events (
        id integer PRIMARY KEY NOT NULL,
        run_id text NOT NULL,
        sequence integer NOT NULL,
        type text NOT NULL,
        payload text NOT NULL,
        created_at integer NOT NULL,
        FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON UPDATE no action ON DELETE cascade
      );
      CREATE UNIQUE INDEX agent_run_events_run_sequence_unique ON agent_run_events (run_id, sequence);
      UPDATE review_jobs SET model_selection='{"providerId":"fixture","model":"fixture-model"}' WHERE id='review-a';
      INSERT INTO agent_runs(id,profile_id,operation,challenge_id,resource_kind,resource_id,provider_id,provider_name,provider_preset,model,reasoning_effort,status,error_code,error_message,turn_count,tool_call_count,input_tokens,output_tokens,total_tokens,started_at,completed_at)
        VALUES ('run-a','owner-a','review','challenge-a','submission','submission-a','provider-a','Fixture Provider','fixture','fixture-model','medium','completed',NULL,NULL,2,3,10,20,30,1000,1001);
      INSERT INTO agent_run_events(id,run_id,sequence,type,payload,created_at)
        VALUES (1,'run-a',1,'status','{"status":"running"}',1000),(2,'run-a',2,'completed','{}',1001);
      PRAGMA user_version = 3;
    `);
  } finally {
    db.close();
  }
}

function populateV4(path: string) {
  populateV3(path);
  const db = new Database(path);
  try {
    db.exec(`
      ALTER TABLE challenges ADD COLUMN workspace_path TEXT;
      UPDATE challenges SET workspace_path='/saved/workspace/challenge-a' WHERE id='challenge-a';
      PRAGMA user_version = 4;
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

function withoutNewColumns(value: Record<string, unknown[]>) {
  for (const review of value.review_jobs as {
    model_selection?: string | null;
  }[]) {
    expect(review.model_selection).toBeNull();
    delete review.model_selection;
  }
  for (const challenge of value.challenges as {
    workspace_path?: string | null;
  }[]) {
    expect(challenge.workspace_path).toBeNull();
    delete challenge.workspace_path;
  }
  return value;
}

function rows(path: string, tables: string[]) {
  const db = new Database(path, { readonly: true });
  try {
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

function snapshot(path: string) {
  return rows(path, [
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
  ]);
}

function snapshotWithAgentRuns(path: string) {
  return rows(path, [
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
    "agent_runs",
    "agent_run_events",
  ]);
}

function withoutWorkspacePath(value: Record<string, unknown[]>) {
  for (const challenge of value.challenges as {
    workspace_path?: string | null;
  }[]) {
    expect(challenge.workspace_path).toBeNull();
    delete challenge.workspace_path;
  }
  return value;
}

test("v2 practice databases upgrade to v5 while preserving existing rows, relationships, and indexes", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-v2-upgrade-"));
  const path = join(root, "grill-me.sqlite");
  try {
    populate(path);
    const before = snapshot(path);
    const indexesBefore = indexNames(path);
    const database = createSqliteDatabase(path);
    await database.migrateDatabase();
    expect(database.sqlite.query("PRAGMA user_version").get()).toEqual({
      user_version: 5,
    });
    expect(database.sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(database.sqlite.query("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    expect(indexNames(path)).toEqual(expect.arrayContaining(indexesBefore));
    const after = snapshot(path);
    expect(withoutNewColumns(after)).toEqual(before);
    expect(
      (
        database.sqlite.query("PRAGMA table_info(review_jobs)").all() as {
          name: string;
        }[]
      ).some((column) => column.name === "model_selection"),
    ).toBe(true);
    expect(
      (
        database.sqlite.query("PRAGMA table_info(challenges)").all() as {
          name: string;
        }[]
      ).some((column) => column.name === "workspace_path"),
    ).toBe(true);
    expect(
      database.sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('agent_runs','agent_run_events') ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: "agent_run_events" }, { name: "agent_runs" }]);
    await database.migrateDatabase();
    expect(withoutNewColumns(snapshot(path))).toEqual(before);
    database.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v3 practice databases upgrade to v5 while preserving agent history and model selections", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-v3-upgrade-"));
  const path = join(root, "grill-me.sqlite");
  try {
    populateV3(path);
    const before = snapshotWithAgentRuns(path);
    const indexesBefore = indexNames(path);
    const database = createSqliteDatabase(path);
    await database.migrateDatabase();
    expect(database.sqlite.query("PRAGMA user_version").get()).toEqual({
      user_version: 5,
    });
    expect(database.sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(database.sqlite.query("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    expect(indexNames(path)).toEqual(expect.arrayContaining(indexesBefore));
    const after = snapshotWithAgentRuns(path);
    expect(withoutWorkspacePath(after)).toEqual(before);
    expect(
      (
        database.sqlite
          .query("SELECT model_selection FROM review_jobs WHERE id='review-a'")
          .get() as { model_selection: string }
      ).model_selection,
    ).toContain("fixture-model");
    expect(
      database.sqlite
        .query("SELECT count(*) AS count FROM agent_run_events")
        .get(),
    ).toEqual({ count: 2 });
    await database.migrateDatabase();
    expect(withoutWorkspacePath(snapshotWithAgentRuns(path))).toEqual(before);
    database.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("populated v4 databases add project preparation state without changing practice data", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-v4-to-v5-"));
  const path = join(root, "grill-me.sqlite");
  try {
    populateV4(path);
    const before = snapshotWithAgentRuns(path);
    const indexesBefore = indexNames(path);
    const database = createSqliteDatabase(path);
    await database.migrateDatabase();
    expect(database.sqlite.query("PRAGMA user_version").get()).toEqual({
      user_version: 5,
    });
    expect(database.sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(indexNames(path)).toEqual(expect.arrayContaining(indexesBefore));
    expect(snapshotWithAgentRuns(path)).toEqual(before);
    const challenge = database.sqlite
      .query("SELECT workspace_path FROM challenges WHERE id='challenge-a'")
      .get() as { workspace_path: string };
    expect(challenge.workspace_path).toBe("/saved/workspace/challenge-a");
    expect(
      database.sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='project_preparations'",
        )
        .all(),
    ).toEqual([{ name: "project_preparations" }]);
    expect(
      database.sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'project_preparations_%' ORDER BY name",
        )
        .all(),
    ).toEqual([
      { name: "project_preparations_active_unique" },
      { name: "project_preparations_challenge_attempt_unique" },
      { name: "project_preparations_challenge_updated_idx" },
    ]);
    await database.migrateDatabase();
    expect(snapshotWithAgentRuns(path)).toEqual(before);
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

test("fresh databases execute the full schema chain and reach version 5", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-fresh-v5-"));
  const path = join(root, "fresh.sqlite");
  try {
    const database = createSqliteDatabase(path);
    await database.migrateDatabase();
    expect(database.sqlite.query("PRAGMA user_version").get()).toEqual({
      user_version: 5,
    });
    expect(
      database.sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('messages','quizzes','agent_runs','agent_run_events','project_preparations') ORDER BY name",
        )
        .all(),
    ).toEqual([
      { name: "agent_run_events" },
      { name: "agent_runs" },
      { name: "messages" },
      { name: "project_preparations" },
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

test("v3 databases are backed up before the workspace column migration", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-v3-backup-"));
  const practice = join(root, "grill-me.sqlite");
  try {
    populateV3(practice);
    const directory = await backupBeforeMigration(root, [practice]);
    expect(directory).not.toBeNull();
    expect(directory).toContain("pre-v4");
    const backup = new Database(join(directory!, "grill-me.sqlite"), {
      readonly: true,
    });
    try {
      expect(
        (backup.query("PRAGMA user_version").get() as { user_version: number })
          .user_version,
      ).toBe(3);
      expect(
        backup.query("SELECT count(*) AS count FROM agent_runs").get(),
      ).toEqual({ count: 1 });
      expect(
        (
          backup
            .query(
              "SELECT model_selection FROM review_jobs WHERE id='review-a'",
            )
            .get() as { model_selection: string }
        ).model_selection,
      ).toContain("fixture-model");
      expect(
        (
          backup.query("PRAGMA table_info(challenges)").all() as {
            name: string;
          }[]
        ).some((column) => column.name === "workspace_path"),
      ).toBe(false);
    } finally {
      backup.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v4 databases do not create another startup backup", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-v4-no-backup-"));
  const practice = join(root, "grill-me.sqlite");
  try {
    const database = createSqliteDatabase(practice);
    await database.migrateDatabase();
    database.close();
    await expect(backupBeforeMigration(root, [practice])).resolves.toBeNull();
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
