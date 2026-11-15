import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSqliteDatabase } from "@repo/backend/shared/database/db.sqlite";
import { backupBeforeMigration } from "@repo/backend/local/backup";

const schema = await readFile(
  new URL("../drizzle/0000_desktop.sql", import.meta.url),
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

function populateV5(path: string) {
  populateV4(path);
  const db = new Database(path);
  try {
    db.exec(`
      CREATE TABLE project_preparations (
        id text PRIMARY KEY NOT NULL,
        profile_id text NOT NULL,
        challenge_id text NOT NULL,
        attempt integer NOT NULL,
        project_directory text NOT NULL,
        project_path text NOT NULL,
        specification text NOT NULL,
        status text DEFAULT 'not_started' NOT NULL,
        run_token text,
        activity text DEFAULT '[]' NOT NULL,
        report text,
        error text,
        requested_model text,
        started_at integer,
        completed_at integer,
        created_at integer NOT NULL,
        updated_at integer NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON UPDATE no action ON DELETE cascade,
        FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON UPDATE no action ON DELETE cascade,
        CONSTRAINT project_preparations_attempt_positive CHECK(attempt > 0),
        CONSTRAINT project_preparations_status_check CHECK(status in ('not_started','running','ready','failed','cancelled','interrupted'))
      );
      CREATE UNIQUE INDEX project_preparations_challenge_attempt_unique ON project_preparations (challenge_id, attempt);
      CREATE UNIQUE INDEX project_preparations_active_unique ON project_preparations (challenge_id) WHERE status in ('not_started', 'running');
      CREATE INDEX project_preparations_challenge_updated_idx ON project_preparations (challenge_id, updated_at);
      INSERT INTO project_preparations(id,profile_id,challenge_id,attempt,project_directory,project_path,specification,status,run_token,activity,report,error,requested_model,started_at,completed_at,created_at,updated_at)
        VALUES ('prep-a','owner-a','challenge-a',1,'project','/saved/workspace/challenge-a/project','{"version":1}','ready',NULL,'[{"type":"completed","at":"2026-01-01T00:00:00.000Z"}]','{"summary":"Saved preparation","files":[],"todos":[],"setup":[],"run":[],"checks":[],"results":[],"problems":[]}',NULL,'fixture-model',1000,1001,1000,1001);
      PRAGMA user_version = 5;
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

function rows(path: string, names: string[]) {
  const db = new Database(path, { readonly: true });
  try {
    return Object.fromEntries(
      names.map((table) => [
        table,
        db.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ]),
    );
  } finally {
    db.close();
  }
}

function tables(path: string) {
  const db = new Database(path, { readonly: true });
  try {
    return (
      db
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map((row) => row.name);
  } finally {
    db.close();
  }
}

function pragma(path: string, statement: string) {
  const db = new Database(path, { readonly: true });
  try {
    return db.query(statement).all();
  } finally {
    db.close();
  }
}

const legacyTables = [
  "projects_legacy",
  "submissions_legacy",
  "review_jobs_legacy",
  "verification_runs_legacy",
  "ai_logs_legacy",
  "ai_log_events_legacy",
  "agent_runs_legacy",
  "agent_run_events_legacy",
  "generation_counters_legacy",
  "messages_legacy",
];

const liveTables = [
  "challenges",
  "generation_jobs",
  "harness_attachments",
  "harness_items",
  "harness_threads",
  "harness_turn_attempts",
  "harness_turns",
  "profile_preferences",
  "profiles",
  "project_command_authorizations",
  "project_command_requests",
  "project_preparations",
  "quiz_attempts",
  "quizzes",
];

test("v2 practice databases upgrade to the latest schema and preserve every retired row", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-v2-upgrade-"));
  const path = join(root, "grill-me.sqlite");
  try {
    populate(path);
    const before = rows(path, [
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
    const database = createSqliteDatabase(path);
    await database.migrateDatabase();
    expect(database.sqlite.query("PRAGMA user_version").get()).toEqual({
      user_version: 12,
    });
    expect(database.sqlite.query("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    expect(database.sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(
      database.sqlite
        .query("SELECT count(*) AS count FROM __drizzle_migrations")
        .get(),
    ).toEqual({ count: 5 });
    const names = tables(path);
    for (const name of [...liveTables, ...legacyTables])
      expect(names).toContain(name);
    expect(names).not.toContain("projects");
    expect(names).not.toContain("messages");
    expect(names).not.toContain("generation_counters");
    expect(
      database.sqlite
        .query("SELECT * FROM messages_legacy ORDER BY rowid")
        .all(),
    ).toEqual(before.messages!);
    expect(
      database.sqlite
        .query("SELECT * FROM projects_legacy ORDER BY rowid")
        .all(),
    ).toEqual(before.projects!);
    expect(
      database.sqlite
        .query("SELECT * FROM submissions_legacy ORDER BY rowid")
        .all(),
    ).toEqual(before.submissions!);
    expect(
      database.sqlite
        .query("SELECT id, status FROM review_jobs_legacy ORDER BY rowid")
        .all(),
    ).toEqual(
      before.review_jobs!.map((row: any) => ({
        id: row.id,
        status: row.status,
      })),
    );
    expect(
      database.sqlite
        .query("SELECT * FROM verification_runs_legacy ORDER BY rowid")
        .all(),
    ).toEqual(before.verification_runs!);
    expect(
      database.sqlite
        .query("SELECT * FROM ai_logs_legacy ORDER BY rowid")
        .all(),
    ).toEqual(before.ai_logs!);
    expect(
      database.sqlite
        .query("SELECT * FROM ai_log_events_legacy ORDER BY rowid")
        .all(),
    ).toEqual(before.ai_log_events!);
    expect(
      database.sqlite
        .query("SELECT * FROM generation_counters_legacy ORDER BY rowid")
        .all(),
    ).toEqual(before.generation_counters!);
    expect(
      database.sqlite
        .query("SELECT challenge_number FROM challenges ORDER BY rowid")
        .all(),
    ).toEqual(
      before.challenges!.map((row: any) => ({
        challenge_number: row.challenge_number,
      })),
    );
    expect(
      database.sqlite
        .query("SELECT quiz_number FROM quizzes ORDER BY rowid")
        .all(),
    ).toEqual(
      before.quizzes!.map((row: any) => ({ quiz_number: row.quiz_number })),
    );
    expect(
      database.sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('challenges_immutable_number','quizzes_immutable_number') ORDER BY name",
        )
        .all(),
    ).toEqual([
      { name: "challenges_immutable_number" },
      { name: "quizzes_immutable_number" },
    ]);
    await database.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retired challenge fields fold into the brief before their columns are dropped", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-fold-"));
  const path = join(root, "grill-me.sqlite");
  try {
    populate(path);
    const raw = new Database(path);
    raw.exec(`
      UPDATE challenges
      SET constraints = '["Use no packages.","Keep it synchronous."]',
          starter_code = 'export function group() { return {}; }',
          calibration_version = 'generator-estimate-v1',
          context_snapshot = NULL
      WHERE id = 'challenge-a';
    `);
    raw.close();
    const database = createSqliteDatabase(path);
    await database.migrateDatabase();
    const stored = database.sqlite
      .query(
        "SELECT problem_statement AS statement, context_snapshot AS snapshot FROM challenges WHERE id = 'challenge-a'",
      )
      .get() as { statement: string; snapshot: string };
    expect(stored.statement).toContain("Build a grouping function.");
    expect(stored.statement).toContain("**Constraints**");
    expect(stored.statement).toContain("- Use no packages.");
    expect(stored.statement).toContain("- Keep it synchronous.");
    expect(stored.statement).toContain("**Starter code**");
    expect(stored.statement).toContain(
      "export function group() { return {}; }",
    );
    expect(JSON.parse(stored.snapshot)).toMatchObject({
      calibrationVersion: "generator-estimate-v1",
      contractVersion: 1,
    });
    const columns = (
      database.sqlite.query("PRAGMA table_info(challenges)").all() as {
        name: string;
      }[]
    ).map((column) => column.name);
    expect(columns).not.toContain("constraints");
    expect(columns).not.toContain("starter_code");
    expect(columns).not.toContain("completion_source");
    expect(columns).not.toContain("calibration_version");
    expect(columns).not.toContain("contract_version");
    await database.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v5 databases receive command and harness tables without rewriting practice data", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-v5-upgrade-"));
  const path = join(root, "grill-me.sqlite");
  try {
    populateV5(path);
    const before = rows(path, ["project_preparations"]);
    const database = createSqliteDatabase(path);
    await database.migrateDatabase();
    expect(
      database.sqlite
        .query("SELECT * FROM project_preparations ORDER BY rowid")
        .all(),
    ).toEqual([
      {
        ...(before.project_preparations![0] as Record<string, unknown>),
        mode: "start",
      },
    ]);
    expect(
      database.sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE name = 'project_command_requests'",
        )
        .get(),
    ).toBeTruthy();
    await database.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fresh databases create only live tables", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-fresh-"));
  const path = join(root, "grill-me.sqlite");
  try {
    const database = createSqliteDatabase(path);
    await database.migrateDatabase();
    expect(database.sqlite.query("PRAGMA user_version").get()).toEqual({
      user_version: 12,
    });
    const names = tables(path);
    for (const name of liveTables) expect(names).toContain(name);
    for (const name of legacyTables) expect(names).not.toContain(name);
    expect(names).not.toContain("ai_logs");
    expect(names).not.toContain("generation_counters");
    expect(names).not.toContain("review_jobs");
    expect(
      database.sqlite
        .query("SELECT count(*) AS count FROM __drizzle_migrations")
        .get(),
    ).toEqual({ count: 5 });
    expect(database.sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    await database.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a current database without a Drizzle journal is stamped without rewriting rows", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-drizzle-stamp-"));
  const path = join(root, "grill-me.sqlite");
  try {
    const first = createSqliteDatabase(path);
    await first.migrateDatabase();
    first.sqlite
      .query(
        "INSERT INTO profiles (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run("stamped-profile", "stamped@test.local", 1000, 1000);
    const before = rows(path, ["profiles", "challenges", "harness_threads"]);
    const schema = (database: typeof first) =>
      database.sqlite
        .query(
          "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name",
        )
        .all();
    const schemaBefore = schema(first);
    await first.close();

    const raw = new Database(path);
    raw.exec("DROP TABLE __drizzle_migrations");
    raw.close();

    const reopened = createSqliteDatabase(path);
    await reopened.migrateDatabase();
    expect(
      reopened.sqlite
        .query("SELECT count(*) AS count FROM __drizzle_migrations")
        .get(),
    ).toEqual({ count: 5 });
    expect(rows(path, ["profiles", "challenges", "harness_threads"])).toEqual(
      before,
    );
    expect(schema(reopened)).toEqual(schemaBefore);
    await reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a legacy counter mismatch aborts the migration and rolls back", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-counter-mismatch-"));
  const path = join(root, "grill-me.sqlite");
  try {
    populate(path);
    const db = new Database(path);
    db.exec(
      "UPDATE generation_counters SET value = 2 WHERE kind = 'challenge'",
    );
    db.close();
    const database = createSqliteDatabase(path);
    await expect(database.migrateDatabase()).rejects.toThrow(
      "Legacy generation counter mismatch",
    );
    expect(database.sqlite.query("PRAGMA user_version").get()).toEqual({
      user_version: 2,
    });
    expect(tables(path)).toContain("generation_counters");
    expect(tables(path)).not.toContain("generation_counters_legacy");
    await database.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("startup backups are verified, owner-only, and contain the pre-upgrade rows", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-backup-"));
  const path = join(root, "grill-me.sqlite");
  try {
    populateV3(path);
    const before = rows(path, ["profiles", "challenges", "messages"]);
    const directory = await backupBeforeMigration(root, [path]);
    expect(directory).toBeTruthy();
    const backup = join(directory!, "grill-me.sqlite");
    expect((await stat(backup)).mode & 0o777).toBe(0o600);
    expect(rows(backup, ["profiles", "challenges", "messages"])).toEqual(
      before,
    );
    expect(pragma(backup, "PRAGMA integrity_check")).toEqual([
      { integrity_check: "ok" },
    ]);
    expect(pragma(backup, "PRAGMA user_version")).toEqual([
      { user_version: 3 },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a backup failure stops startup before migration", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-backup-fail-"));
  const path = join(root, "grill-me.sqlite");
  try {
    await writeFile(path, "not a database");
    await expect(backupBeforeMigration(root, [path])).rejects.toMatchObject({
      code: "BACKUP_FAILED",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
