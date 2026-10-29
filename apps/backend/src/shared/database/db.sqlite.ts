import { Database, type SQLQueryBindings } from "bun:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { sql, type AnyColumn } from "drizzle-orm";
import * as schema from "./schema.sqlite";
import initialSchema from "../../../drizzle-sqlite/0000_desktop.sql" with { type: "text" };

const path = process.env.GRILL_ME_SQLITE_PATH;
if (!path || !isAbsolute(path) || process.env.APP_ENV === "production") {
  throw new Error(
    "Desktop SQLite requires an absolute GRILL_ME_SQLITE_PATH and a non-production environment.",
  );
}
mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
export const sqlite = new Database(path, { create: true, strict: true });
sqlite.exec(
  "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
);

// Serialize *all* database work, including reads, around asynchronous write
// transactions. A concurrent request must never join another request's transaction.
const owner = new AsyncLocalStorage<{ active: boolean }>();
let tail: Promise<unknown> = Promise.resolve();
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const result = tail.then(work);
  tail = result.catch(() => {});
  return result;
}
export const sqliteDb = drizzle(
  async (query, params, method) => {
    const execute = async () => {
      const statement = sqlite.query(query);
      const bindings = params as SQLQueryBindings[];
      if (method === "run") {
        statement.run(...bindings);
        return { rows: [] };
      }
      const rows = statement.values(...bindings);
      return { rows: method === "get" ? (rows[0] ?? []) : rows };
    };
    return owner.getStore()?.active ? execute() : exclusive(execute);
  },
  { schema },
);
const nativeTransaction = sqliteDb.transaction.bind(sqliteDb);
const transaction: typeof sqliteDb.transaction = (work, options) =>
  exclusive(() => {
    const context = { active: true };
    return owner.run(context, async () => {
      try {
        return await nativeTransaction(work, {
          ...options,
          behavior: "immediate",
        });
      } finally {
        context.active = false;
      }
    });
  });
sqliteDb.transaction = transaction;

// Shared services use the PostgreSQL module's public query types. The desktop
// build substitutes the entire schema too, so the actual dialect, column mappers,
// queries and transactions here are SQLite. Dialect-specific operations are
// explicit helpers below; no PostgreSQL connection is constructed in this build.
export const db = sqliteDb as unknown as typeof import("./db").db;
export async function first<T>(query: PromiseLike<T[]>) {
  return (await query)[0];
}
export function lockRows<T>(
  query: T,
  _mode?: string,
  _skipLocked?: boolean,
): T {
  // BEGIN IMMEDIATE already holds SQLite's write lock for the whole transaction.
  return query;
}
export const databaseNow = () =>
  sql`cast(unixepoch('subsec') * 1000 as integer)`;
export const caseInsensitiveLike = (column: AnyColumn, pattern: string) =>
  sql`lower(${column}) like ${pattern.toLowerCase()}`;
export async function nextGenerationNumber(
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

export async function migrateDatabase() {
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
