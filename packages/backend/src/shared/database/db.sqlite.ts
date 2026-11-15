import { Database, type SQLQueryBindings } from "bun:sqlite";
import { changed } from "../../local/changes";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { sql, type AnyColumn } from "drizzle-orm";
import * as schema from "./schema.sqlite";
import { upgradeLegacyDatabase } from "./legacy-migrations";
import { drizzleMigrations } from "./migration-files";
import {
  applyDrizzleMigrations,
  ensureImmutabilityTriggers,
  hasDrizzleMigrations,
  isFreshDatabase,
  stampDrizzleMigrations,
} from "./migration-runner";

export const DATABASE_VERSION = 10;
const LATEST_VERSION = DATABASE_VERSION;

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
  /**
   * Allocate the next display number inside the caller's BEGIN IMMEDIATE
   * transaction. MAX(number)+1 keeps numbers monotonic without a counter table;
   * deleted quizzes still count because number uniqueness includes them.
   */
  async function nextGenerationNumber(
    _tx: unknown,
    profileId: string,
    kind: "quiz" | "challenge",
  ): Promise<number> {
    const table = kind === "challenge" ? "challenges" : "quizzes";
    const column = kind === "challenge" ? "challenge_number" : "quiz_number";
    const row = sqlite
      .query(
        `SELECT COALESCE(MAX(${column}), 0) + 1 AS value FROM ${table} WHERE profile_id = ?`,
      )
      .get(profileId) as { value: number };
    return row.value;
  }

  async function migrateDatabase() {
    const version = (
      sqlite.query("PRAGMA user_version").get() as { user_version: number }
    ).user_version;
    if (version > LATEST_VERSION)
      throw new Error("This database needs a newer desktop application.");

    if (version === 0) {
      if (!hasDrizzleMigrations(sqlite) && !isFreshDatabase(sqlite))
        throw new Error(
          "The database has user_version 0 but already contains tables, so it cannot be initialized from Drizzle migrations.",
        );
      applyDrizzleMigrations(sqlite, drizzleMigrations, { fresh: true });
      sqlite.exec(`PRAGMA user_version = ${LATEST_VERSION};`);
    } else if (version < LATEST_VERSION) {
      if (hasDrizzleMigrations(sqlite))
        throw new Error(
          "This legacy database has a Drizzle migration journal but an older schema version.",
        );
      sqlite
        .transaction(() => {
          upgradeLegacyDatabase(sqlite, version);
          stampDrizzleMigrations(sqlite, drizzleMigrations);
          sqlite.exec(`PRAGMA user_version = ${LATEST_VERSION};`);
        })
        .immediate();
    } else if (!hasDrizzleMigrations(sqlite)) {
      // A database upgraded by an earlier build already has the current
      // schema. Record the Drizzle journal once instead of replaying SQL.
      sqlite
        .transaction(() => {
          stampDrizzleMigrations(sqlite, drizzleMigrations);
          sqlite.exec(`PRAGMA user_version = ${LATEST_VERSION};`);
        })
        .immediate();
    } else {
      applyDrizzleMigrations(sqlite, drizzleMigrations, { fresh: false });
      sqlite.exec(`PRAGMA user_version = ${LATEST_VERSION};`);
    }

    ensureImmutabilityTriggers(sqlite);

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
