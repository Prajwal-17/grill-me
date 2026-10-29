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
    if (version > 1)
      throw new Error("This database needs a newer desktop application.");
    if (version === 1) return;
    sqlite
      .transaction(() => {
        sqlite.exec(initialSchema);
        for (const [table, column] of [
          ["challenges", "challenge_number"],
          ["quizzes", "quiz_number"],
        ]) {
          sqlite.exec(`CREATE TRIGGER ${table}_immutable_number BEFORE UPDATE OF profile_id, ${column} ON ${table}
        WHEN NEW.profile_id != OLD.profile_id OR NEW.${column} != OLD.${column}
        BEGIN SELECT RAISE(ABORT, 'Generation numbers and profiles are immutable'); END;`);
        }
        sqlite.exec("PRAGMA user_version = 1");
      })
      .immediate();
    const violations = sqlite.query("PRAGMA foreign_key_check").all();
    if (violations.length)
      throw new Error("SQLite foreign-key validation failed.");
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
    close: () => sqlite.close(),
  };
}
