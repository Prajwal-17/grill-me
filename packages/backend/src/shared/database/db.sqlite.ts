import { Database, type SQLQueryBindings } from "bun:sqlite";
import { changed } from "../../local/changes";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { sql, type AnyColumn } from "drizzle-orm";
import * as schema from "./schema.sqlite";
import initialSchema from "../../../drizzle-sqlite/0000_desktop.sql" with { type: "text" };

export function createSqliteDatabase(path: string) {
  if (!isAbsolute(path)) throw new Error("SQLite requires an absolute path.");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const sqlite = new Database(path, { create: true, strict: true });
  sqlite.exec(
    "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
  );

  // Serialize *all* database work, including reads, around asynchronous write
  // transactions. A concurrent request must never join another request's transaction.
  const owner = new AsyncLocalStorage<{
    active: boolean;
    tables: Set<string>;
  }>();
  let tail: Promise<unknown> = Promise.resolve();
  function exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work);
    tail = result.catch(() => {});
    return result;
  }
  const sqliteDb = drizzle(
    async (query, params, method) => {
      const execute = async () => {
        const statement = sqlite.query(query);
        const bindings = params as SQLQueryBindings[];
        const write = /^(?:insert into|update|delete from)\s+"?(\w+)/i.exec(
          query.trim(),
        );
        const notify = () => {
          if (!write) return;
          const context = owner.getStore();
          if (context?.active) context.tables.add(write[1]!);
          else changed(write[1]);
        };
        if (method === "run") {
          statement.run(...bindings);
          notify();
          return { rows: [] };
        }
        const rows = statement.values(...bindings);
        notify();
        return { rows: method === "get" ? (rows[0] ?? []) : rows };
      };
      return owner.getStore()?.active ? execute() : exclusive(execute);
    },
    { schema },
  );
  const nativeTransaction = sqliteDb.transaction.bind(sqliteDb);
  const transaction: typeof sqliteDb.transaction = (work, options) =>
    exclusive(() => {
      const context = { active: true, tables: new Set<string>() };
      return owner.run(context, async () => {
        try {
          const result = await nativeTransaction(work, {
            ...options,
            behavior: "immediate",
          });
          for (const table of context.tables) changed(table);
          return result;
        } finally {
          context.active = false;
        }
      });
    });
  sqliteDb.transaction = transaction;

  function lockRows<T>(query: T, _mode?: string, _skipLocked?: boolean): T {
    // BEGIN IMMEDIATE already holds SQLite's write lock for the whole transaction.
    return query;
  }
  const databaseNow = () => sql`cast(unixepoch('subsec') * 1000 as integer)`;
  const caseInsensitiveLike = (column: AnyColumn, pattern: string) =>
    sql`lower(${column}) like ${pattern.toLowerCase()}`;
  async function nextGenerationNumber(
    tx: unknown,
    profileId: string,
    kind: "quiz" | "challenge",
  ): Promise<number> {
    const [counter] = await (
      tx as Parameters<Parameters<typeof sqliteDb.transaction>[0]>[0]
    )
      .insert(schema.generationCounters)
      .values({ profileId, kind, value: 1 })
      .onConflictDoUpdate({
        target: [
          schema.generationCounters.profileId,
          schema.generationCounters.kind,
        ],
        set: { value: sql`${schema.generationCounters.value} + 1` },
      })
      .returning({ value: schema.generationCounters.value });
    return counter!.value;
  }

  async function migrateDatabase() {
    const version = (
      sqlite.query("PRAGMA user_version").get() as { user_version: number }
    ).user_version;
    if (version > 7)
      throw new Error("This database needs a newer desktop application.");
    if (version === 7) return;
    sqlite
      .transaction(() => {
        if (version === 0) {
          sqlite.exec(initialSchema);
          for (const [table, column] of [
            ["challenges", "challenge_number"],
            ["quizzes", "quiz_number"],
          ]) {
            sqlite.exec(`CREATE TRIGGER ${table}_immutable_number BEFORE UPDATE OF profile_id, ${column} ON ${table}
        WHEN NEW.profile_id != OLD.profile_id OR NEW.${column} != OLD.${column}
        BEGIN SELECT RAISE(ABORT, 'Generation numbers and profiles are immutable'); END;`);
          }
        }
        if (version < 2)
          sqlite.exec(
            "ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('streaming','completed','failed','cancelled','interrupted')); ALTER TABLE messages ADD COLUMN error TEXT; ALTER TABLE messages ADD COLUMN reply_to TEXT;",
          );
        if (version < 3)
          sqlite.exec(`ALTER TABLE review_jobs ADD COLUMN model_selection TEXT;
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
CREATE UNIQUE INDEX agent_run_events_run_sequence_unique ON agent_run_events (run_id, sequence);`);
        if (version < 4)
          sqlite.exec("ALTER TABLE challenges ADD COLUMN workspace_path TEXT;");
        if (version < 5)
          sqlite.exec(`CREATE TABLE project_preparations (
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
CREATE INDEX project_preparations_challenge_updated_idx ON project_preparations (challenge_id, updated_at);`);
        if (version < 6)
          sqlite.exec(`CREATE TABLE project_command_requests (
  id text PRIMARY KEY NOT NULL,
  profile_id text NOT NULL,
  challenge_id text NOT NULL,
  preparation_id text NOT NULL,
  attempt integer NOT NULL,
  specification_hash text NOT NULL,
  run_token text NOT NULL,
  purpose text NOT NULL,
  check_id text,
  command text NOT NULL,
  cwd text DEFAULT '.' NOT NULL,
  install integer DEFAULT false NOT NULL,
  network integer DEFAULT false NOT NULL,
  timeout_ms integer NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  authorization text,
  result text,
  decided_at integer,
  started_at integer,
  completed_at integer,
  created_at integer NOT NULL,
  updated_at integer NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (preparation_id) REFERENCES project_preparations(id) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT project_command_requests_attempt_positive CHECK(attempt > 0),
  CONSTRAINT project_command_requests_timeout_positive CHECK(timeout_ms > 0),
  CONSTRAINT project_command_requests_purpose_check CHECK(purpose in ('setup', 'check', 'run', 'inspect')),
  CONSTRAINT project_command_requests_status_check CHECK(status in ('pending', 'approved', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled', 'rejected', 'interrupted')),
  CONSTRAINT project_command_requests_authorization_check CHECK(authorization is null or authorization in ('individual', 'attempt'))
);
CREATE INDEX project_command_requests_preparation_created_idx ON project_command_requests (preparation_id, created_at);
CREATE INDEX project_command_requests_preparation_status_idx ON project_command_requests (preparation_id, status);
CREATE UNIQUE INDEX project_command_requests_running_unique ON project_command_requests (preparation_id, command, cwd) WHERE status = 'running';
CREATE TABLE project_command_authorizations (
  id text PRIMARY KEY NOT NULL,
  profile_id text NOT NULL,
  challenge_id text NOT NULL,
  preparation_id text NOT NULL,
  attempt integer NOT NULL,
  specification_hash text NOT NULL,
  run_token text NOT NULL,
  install integer DEFAULT false NOT NULL,
  network integer DEFAULT false NOT NULL,
  created_at integer NOT NULL,
  updated_at integer NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (preparation_id) REFERENCES project_preparations(id) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT project_command_authorizations_attempt_positive CHECK(attempt > 0)
);
CREATE UNIQUE INDEX project_command_authorizations_preparation_unique ON project_command_authorizations (preparation_id);`);
        if (version < 7)
          sqlite.exec(
            `ALTER TABLE project_preparations ADD COLUMN mode text NOT NULL DEFAULT 'start' CHECK(mode IN ('start', 'retry', 'resume', 'fresh'));`,
          );
        sqlite.exec("PRAGMA user_version = 7;");
      })
      .immediate();
    const violations = sqlite.query("PRAGMA foreign_key_check").all();
    if (violations.length)
      throw new Error("SQLite foreign-key validation failed.");
  }

  function local<T>(work: (database: Database) => T): Promise<T> {
    return owner.getStore()?.active
      ? Promise.resolve(work(sqlite))
      : exclusive(async () => work(sqlite));
  }
  return {
    dialect: "sqlite" as const,
    db: sqliteDb,
    sqlite,
    migrateDatabase,
    lockRows,
    databaseNow,
    caseInsensitiveLike,
    nextGenerationNumber,
    local,
    close: () => sqlite.close(),
  };
}
