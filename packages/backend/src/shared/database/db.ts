import type { AnyColumn } from "drizzle-orm";
import type { createPostgresDatabase } from "./db.pg";
import type { createSqliteDatabase } from "./db.sqlite";
import { selectSchema } from "./schema";
import { databaseUrl } from "../storage/paths";

export type DatabaseOptions =
  { dialect: "sqlite"; path: string } | { dialect: "postgres"; url: string };
type Postgres = ReturnType<typeof createPostgresDatabase>;
type Adapter = Postgres | ReturnType<typeof createSqliteDatabase>;
let adapter: Adapter | undefined;
let identity = "";
export async function initializeDatabase(options: DatabaseOptions) {
  const next = JSON.stringify(options);
  if (adapter) {
    if (identity !== next)
      throw new Error("This process already owns a different database.");
    return adapter;
  }
  if (options.dialect === "postgres" && process.env.GRILL_ME_DESKTOP === "1")
    throw new Error("PostgreSQL is disabled in local desktop mode.");
  if (options.dialect === "sqlite" && process.env.APP_ENV === "production")
    throw new Error("Local SQLite cannot run in production mode.");
  adapter =
    options.dialect === "sqlite"
      ? (await import("./db.sqlite")).createSqliteDatabase(options.path)
      : (await import("./db.pg")).createPostgresDatabase(options.url);
  identity = next;
  selectSchema(options.dialect);
  return adapter;
}
function current() {
  if (!adapter)
    throw new Error("Initialize the backend database before using services.");
  return adapter;
}
// The only dialect type boundary: the adapter supplies real dialect-specific
// tables and execution. Services use the shared select/insert/update surface.
export const db = new Proxy({} as Postgres["db"], {
  get(_target, key) {
    const value = Reflect.get(current().db, key);
    // Bun SQL clients are callable objects with methods such as unsafe/close.
    // Bind ORM methods only; binding the client would discard those properties.
    return key !== "$client" && typeof value === "function"
      ? value.bind(current().db)
      : value;
  },
});
export const first = async <T>(query: PromiseLike<T[]>) => (await query)[0];
export function lockRows<T>(
  query: T,
  mode: "update" | "no key update" = "update",
  skipLocked = false,
): T {
  return current().lockRows(query, mode, skipLocked);
}
export const databaseNow = () => current().databaseNow();
export const caseInsensitiveLike = (column: AnyColumn, pattern: string) =>
  current().caseInsensitiveLike(column, pattern);
export const nextGenerationNumber = (
  tx: unknown,
  profileId: string,
  kind: "quiz" | "challenge",
) => current().nextGenerationNumber(tx, profileId, kind);
export async function migrateDatabase() {
  if (!adapter)
    await initializeDatabase(
      process.env.GRILL_ME_SQLITE_PATH
        ? { dialect: "sqlite", path: process.env.GRILL_ME_SQLITE_PATH }
        : { dialect: "postgres", url: databaseUrl() },
    );
  await current().migrateDatabase();
}
export function sqliteDatabase() {
  const value = current();
  if (value.dialect !== "sqlite") throw new Error("Not a SQLite runtime.");
  return value;
}
export async function closeDatabase() {
  if (adapter) {
    await adapter.close();
    adapter = undefined;
    identity = "";
  }
}
