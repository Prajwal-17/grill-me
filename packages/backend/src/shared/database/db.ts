import type { AnyColumn } from "drizzle-orm";
import { createSqliteDatabase } from "./db.sqlite";

export type DatabaseOptions = { dialect: "sqlite"; path: string };
type Adapter = ReturnType<typeof createSqliteDatabase>;
let adapter: Adapter | undefined;
let identity = "";
export async function initializeDatabase(options: DatabaseOptions) {
  const next = JSON.stringify(options);
  if (adapter) {
    if (identity !== next)
      throw new Error("This process already owns a different database.");
    return adapter;
  }
  if (
    process.env.APP_ENV === "production" &&
    (process.env.GRILL_ME_DESKTOP !== "1" ||
      process.env.GRILL_DESKTOP_CHANNEL !== "production")
  )
    throw new Error("Local SQLite cannot run in production mode.");
  adapter = createSqliteDatabase(options.path);
  identity = next;
  return adapter;
}
function current() {
  if (!adapter)
    throw new Error("Initialize the backend database before using services.");
  return adapter;
}
// SQLite is the only supported runtime. Services use the shared drizzle
// select/insert/update surface over its proxy adapter.
export const db = new Proxy({} as Adapter["db"], {
  get(_target, key) {
    const value = Reflect.get(current().db, key);
    return typeof value === "function" ? value.bind(current().db) : value;
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
  if (!adapter) {
    const path = process.env.GRILL_ME_SQLITE_PATH;
    if (!path)
      throw new Error("Set GRILL_ME_SQLITE_PATH before migrating SQLite.");
    await initializeDatabase({ dialect: "sqlite", path });
  }
  await current().migrateDatabase();
}
export function sqliteDatabase() {
  return current();
}
export async function closeDatabase() {
  if (adapter) {
    await adapter.close();
    adapter = undefined;
    identity = "";
  }
}
