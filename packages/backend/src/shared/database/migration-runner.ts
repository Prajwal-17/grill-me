import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";

/**
 * The SQL files in `drizzle/` are the only schema source for fresh installs and
 * future upgrades. They are imported as text by the generated
 * `migration-files.ts` module so the compiled desktop backend carries them.
 */
export type DrizzleMigrationFile = {
  tag: string;
  when: number;
  sql: string;
  /** A historical baseline that must be stamped, not executed, on fresh installs. */
  historical: boolean;
};

const migrationsTable = "__drizzle_migrations";

function table(sqlite: Database, name: string) {
  return Boolean(
    sqlite
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name),
  );
}

export function hasDrizzleMigrations(sqlite: Database) {
  return table(sqlite, migrationsTable);
}

function ensureMigrationsTable(sqlite: Database) {
  // This matches drizzle-orm's sqlite migrator table, so the standard
  // `drizzle-kit` tooling can read the same journal.
  sqlite.exec(`CREATE TABLE IF NOT EXISTS "${migrationsTable}" (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at numeric
  )`);
}

function appliedAt(sqlite: Database) {
  const row = sqlite
    .query(
      `SELECT created_at FROM "${migrationsTable}" ORDER BY created_at DESC LIMIT 1`,
    )
    .get() as { created_at: number | string } | undefined;
  return row ? Number(row.created_at) : -1;
}

function record(sqlite: Database, migration: DrizzleMigrationFile) {
  const hash = createHash("sha256").update(migration.sql).digest("hex");
  sqlite
    .query(
      `INSERT INTO "${migrationsTable}" ("hash", "created_at") VALUES (?, ?)`,
    )
    .run(hash, migration.when);
}

/**
 * Apply every migration newer than the journal's latest entry. A historical
 * baseline is recorded without executing its SQL on a brand-new database, so
 * fresh installs get the current baseline only.
 */
export function applyDrizzleMigrations(
  sqlite: Database,
  migrations: DrizzleMigrationFile[],
  options: { fresh: boolean },
) {
  if (!migrations.length)
    throw new Error("No Drizzle migrations are available.");
  ensureMigrationsTable(sqlite);
  const latest = appliedAt(sqlite);
  for (const migration of migrations) {
    if (migration.when <= latest) continue;
    if (options.fresh && migration.historical) {
      sqlite.transaction(() => record(sqlite, migration))();
      continue;
    }
    sqlite.transaction(() => {
      for (const statement of migration.sql.split("--> statement-breakpoint")) {
        const sql = statement.trim();
        if (sql) sqlite.exec(sql);
      }
      record(sqlite, migration);
    })();
  }
}

/**
 * Mark an already-current database as managed by the Drizzle journal without
 * replaying SQL. `through` stops at the last migration the frozen legacy
 * upgrader already produced; anything newer still runs normally.
 */
export function stampDrizzleMigrations(
  sqlite: Database,
  migrations: DrizzleMigrationFile[],
  through?: string,
) {
  if (!migrations.length)
    throw new Error("No Drizzle migrations are available.");
  ensureMigrationsTable(sqlite);
  const latest = appliedAt(sqlite);
  const limit = through
    ? migrations.findIndex((migration) => migration.tag === through)
    : migrations.length - 1;
  if (limit < 0) throw new Error(`Unknown migration tag: ${through}`);
  for (const [index, migration] of migrations.entries())
    if (index <= limit && migration.when > latest) record(sqlite, migration);
}

/**
 * Trigger DDL is not representable in the Drizzle schema, so a later SQLite
 * table rebuild can drop it. Reapply the invariant with IF NOT EXISTS after any
 * migration run.
 */
export function ensureImmutabilityTriggers(sqlite: Database) {
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS challenges_immutable_number
      BEFORE UPDATE OF profile_id, challenge_number ON challenges
      WHEN NEW.profile_id != OLD.profile_id OR NEW.challenge_number != OLD.challenge_number
      BEGIN SELECT RAISE(ABORT, 'Generation numbers and profiles are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS quizzes_immutable_number
      BEFORE UPDATE OF profile_id, quiz_number ON quizzes
      WHEN NEW.profile_id != OLD.profile_id OR NEW.quiz_number != OLD.quiz_number
      BEGIN SELECT RAISE(ABORT, 'Generation numbers and profiles are immutable'); END;
  `);
}

export function isFreshDatabase(sqlite: Database) {
  return !sqlite
    .query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
    )
    .get();
}
