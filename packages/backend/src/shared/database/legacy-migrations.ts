import type { Database } from "bun:sqlite";

/**
 * Frozen compatibility path for databases created before Drizzle migrations
 * were adopted. Fresh installs apply `drizzle/` migrations directly; this file
 * upgrades an existing v1-v9 database to the v10 schema once, then stamps the
 * Drizzle journal so future upgrades use generated SQL only.
 *
 * Do not add new schema changes here. Add a drizzle-kit migration instead.
 */
const LEGACY_RENAMES = [
  ["projects", "projects_legacy"],
  ["submissions", "submissions_legacy"],
  ["review_jobs", "review_jobs_legacy"],
  ["verification_runs", "verification_runs_legacy"],
  ["ai_logs", "ai_logs_legacy"],
  ["ai_log_events", "ai_log_events_legacy"],
  ["agent_runs", "agent_runs_legacy"],
  ["agent_run_events", "agent_run_events_legacy"],
  ["generation_counters", "generation_counters_legacy"],
] as const;

const HARNESS_SCHEMA = `
CREATE TABLE harness_threads (
  id text PRIMARY KEY NOT NULL,
  profile_id text NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  status text DEFAULT 'queued' NOT NULL,
  challenge_id text,
  parent_thread_id text,
  transport text NOT NULL,
  connection_id text,
  model text NOT NULL,
  reasoning_effort text,
  runtime_mode text DEFAULT 'approval-required' NOT NULL,
  native_thread_id text,
  error_code text,
  error_message text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL,
  completed_at integer,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (parent_thread_id) REFERENCES harness_threads(id) ON UPDATE no action ON DELETE set null,
  CONSTRAINT harness_threads_status_check CHECK(status in ('queued','running','waiting','completed','failed','cancelled','interrupted')),
  CONSTRAINT harness_threads_transport_check CHECK(transport in ('api','codex_cli','opencode_cli')),
  CONSTRAINT harness_threads_runtime_mode_check CHECK(runtime_mode in ('approval-required','auto-accept-edits','auto','full-access'))
);
CREATE INDEX harness_threads_profile_updated_idx ON harness_threads (profile_id, updated_at);
CREATE INDEX harness_threads_challenge_updated_idx ON harness_threads (challenge_id, updated_at);
CREATE INDEX harness_threads_status_created_idx ON harness_threads (status, created_at);
CREATE TABLE harness_turns (
  id text PRIMARY KEY NOT NULL,
  thread_id text NOT NULL,
  ordinal integer NOT NULL,
  status text DEFAULT 'queued' NOT NULL,
  input_text text NOT NULL,
  transport text NOT NULL,
  connection_id text,
  model text NOT NULL,
  reasoning_effort text,
  runtime_mode text NOT NULL,
  native_turn_id text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  error_code text,
  error_message text,
  requested_at integer NOT NULL,
  started_at integer,
  completed_at integer,
  FOREIGN KEY (thread_id) REFERENCES harness_threads(id) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT harness_turns_ordinal_positive CHECK(ordinal > 0),
  CONSTRAINT harness_turns_status_check CHECK(status in ('queued','running','waiting','completed','failed','cancelled','interrupted')),
  CONSTRAINT harness_turns_runtime_mode_check CHECK(runtime_mode in ('approval-required','auto-accept-edits','auto','full-access'))
);
CREATE UNIQUE INDEX harness_turns_thread_ordinal_unique ON harness_turns (thread_id, ordinal);
CREATE TABLE harness_turn_attempts (
  id text PRIMARY KEY NOT NULL,
  turn_id text NOT NULL,
  ordinal integer NOT NULL,
  status text DEFAULT 'running' NOT NULL,
  native_thread_id text,
  native_turn_id text,
  error_code text,
  error_message text,
  started_at integer NOT NULL,
  completed_at integer,
  FOREIGN KEY (turn_id) REFERENCES harness_turns(id) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT harness_turn_attempts_ordinal_positive CHECK(ordinal > 0),
  CONSTRAINT harness_turn_attempts_status_check CHECK(status in ('queued','running','waiting','completed','failed','cancelled','interrupted'))
);
CREATE UNIQUE INDEX harness_turn_attempts_turn_ordinal_unique ON harness_turn_attempts (turn_id, ordinal);
CREATE TABLE harness_items (
  id text PRIMARY KEY NOT NULL,
  thread_id text NOT NULL,
  turn_id text,
  attempt_id text,
  parent_item_id text,
  ordinal integer NOT NULL,
  type text NOT NULL,
  status text NOT NULL,
  title text,
  text text,
  payload_json text DEFAULT '{}' NOT NULL,
  started_at integer,
  completed_at integer,
  created_at integer NOT NULL,
  updated_at integer NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES harness_threads(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (turn_id) REFERENCES harness_turns(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (attempt_id) REFERENCES harness_turn_attempts(id) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (parent_item_id) REFERENCES harness_items(id) ON UPDATE no action ON DELETE set null,
  CONSTRAINT harness_items_type_check CHECK(type in ('user_message','assistant_message','reasoning','command_execution','file_change','file_read','file_search','web_search','tool_call','user_input_request','approval_request','system_notice','error')),
  CONSTRAINT harness_items_status_check CHECK(status in ('pending','running','completed','cancelled','failed')),
  CONSTRAINT harness_items_ordinal_positive CHECK(ordinal > 0)
);
CREATE UNIQUE INDEX harness_items_thread_ordinal_unique ON harness_items (thread_id, ordinal);
CREATE INDEX harness_items_turn_ordinal_idx ON harness_items (turn_id, ordinal);
CREATE INDEX harness_items_thread_type_updated_idx ON harness_items (thread_id, type, updated_at);
CREATE TABLE harness_attachments (
  id text PRIMARY KEY NOT NULL,
  thread_id text NOT NULL,
  turn_id text,
  item_id text,
  direction text NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  mime text,
  bytes integer,
  sha256 text,
  path text,
  url text,
  created_at integer NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES harness_threads(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (turn_id) REFERENCES harness_turns(id) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (item_id) REFERENCES harness_items(id) ON UPDATE no action ON DELETE set null,
  CONSTRAINT harness_attachments_direction_check CHECK(direction in ('input','output')),
  CONSTRAINT harness_attachments_kind_check CHECK(kind in ('image','file','url','diff','report','snapshot'))
);
CREATE INDEX harness_attachments_thread_created_idx ON harness_attachments (thread_id, created_at);
ALTER TABLE generation_jobs ADD COLUMN harness_thread_id text REFERENCES harness_threads(id) ON UPDATE no action ON DELETE set null;
`;

function migrateV8(sqlite: Database) {
  const counters = sqlite
    .query("SELECT profile_id, kind, value FROM generation_counters")
    .all() as { profile_id: string; kind: string; value: number }[];
  for (const counter of counters) {
    if (counter.kind !== "challenge" && counter.kind !== "quiz")
      throw new Error("Legacy generation counter has an unknown kind.");
    const table = counter.kind === "challenge" ? "challenges" : "quizzes";
    const column =
      counter.kind === "challenge" ? "challenge_number" : "quiz_number";
    const row = sqlite
      .query(
        `SELECT COALESCE(MAX(${column}), 0) AS value FROM ${table} WHERE profile_id = ?`,
      )
      .get(counter.profile_id) as { value: number };
    if (row.value !== counter.value)
      throw new Error(
        `Legacy generation counter mismatch for ${counter.kind} (${counter.value} != ${row.value}).`,
      );
  }
  for (const [table, column] of [
    ["challenges", "challenge_number"],
    ["quizzes", "quiz_number"],
  ] as const) {
    const invalid = sqlite
      .query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} < 1`)
      .get() as { count: number };
    if (invalid.count)
      throw new Error("Legacy practice data contains an invalid number.");
    const duplicates = sqlite
      .query(
        `SELECT COUNT(*) AS count FROM (SELECT profile_id, ${column} FROM ${table} GROUP BY profile_id, ${column} HAVING COUNT(*) > 1)`,
      )
      .get() as { count: number };
    if (duplicates.count)
      throw new Error("Legacy practice data contains duplicate numbers.");
  }
  // Some platform builds default `legacy_alter_table` to ON, which makes the
  // rename fail on table-qualified CHECK constraints. Modern behavior rewrites
  // those references, so force it for the archive renames only.
  archiveLegacyTables(sqlite);
  for (const [table, column] of [
    ["challenges", "challenge_number"],
    ["quizzes", "quiz_number"],
  ]) {
    sqlite.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_immutable_number BEFORE UPDATE OF profile_id, ${column} ON ${table}
        WHEN NEW.profile_id != OLD.profile_id OR NEW.${column} != OLD.${column}
        BEGIN SELECT RAISE(ABORT, 'Generation numbers and profiles are immutable'); END;`);
  }
}

/**
 * Archive retired tables under their `*_legacy` names. Some platform builds
 * default `legacy_alter_table` to ON, which makes the rename fail on
 * table-qualified CHECK constraints, so force modern rename semantics.
 */
export function archiveLegacyTables(sqlite: Database) {
  const previousAlterTable = (
    sqlite.query("PRAGMA legacy_alter_table").get() as {
      legacy_alter_table: number;
    }
  ).legacy_alter_table;
  try {
    sqlite.exec("PRAGMA legacy_alter_table = OFF;");
    for (const [from, to] of LEGACY_RENAMES)
      sqlite.exec(`ALTER TABLE ${from} RENAME TO ${to};`);
  } finally {
    sqlite.exec(
      `PRAGMA legacy_alter_table = ${previousAlterTable ? "ON" : "OFF"};`,
    );
  }
}

function migrateV10(sqlite: Database) {
  const exists = (name: string) =>
    Boolean(
      sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get(name),
    );
  if (exists("messages") && !exists("messages_legacy"))
    sqlite.exec("ALTER TABLE messages RENAME TO messages_legacy;");
}

export function upgradeLegacyDatabase(sqlite: Database, version: number) {
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
  if (version < 8) migrateV8(sqlite);
  if (version < 9) sqlite.exec(HARNESS_SCHEMA);
  if (version < 10) migrateV10(sqlite);
}
