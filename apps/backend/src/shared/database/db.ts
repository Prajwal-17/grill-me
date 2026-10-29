import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";
import { databaseUrl } from "../storage/paths";
import { ilike, sql, type AnyColumn } from "drizzle-orm";

if (process.env.GRILL_ME_DESKTOP === "1") {
  throw new Error(
    "PostgreSQL is disabled in the desktop runtime. Use the SQLite build entry point.",
  );
}

// Desktop builds replace this module and schema.ts with their SQLite versions.
export function lockRows<T>(
  query: T,
  mode: "update" | "no key update" = "update",
  skipLocked = false,
): T {
  return (query as T & { for: (mode: string, options: object) => T }).for(
    mode,
    {
      skipLocked,
    },
  );
}

export const databaseNow = () => sql`now()`;
export const caseInsensitiveLike = (column: AnyColumn, pattern: string) =>
  ilike(column, pattern);

// PostgreSQL retains its existing numbering triggers.
export async function nextGenerationNumber(
  _tx: unknown,
  _profileId: string,
  _kind: "quiz" | "challenge",
): Promise<number | undefined> {
  return undefined;
}

// Bun --hot reevaluates this module without exiting the process. Reuse its SQL
// client so every source edit does not leave another connection pool behind.
const runtime = globalThis as typeof globalThis & {
  grillDatabaseClients?: Map<string, SQL>;
};
const clients = (runtime.grillDatabaseClients ??= new Map<string, SQL>());
const url = databaseUrl();
const client = clients.get(url) ?? new SQL(url);
clients.set(url, client);
export const db = drizzle(client, { schema });

export async function first<T>(query: PromiseLike<T[]>) {
  return (await query)[0];
}

export async function migrateDatabase() {
  await migrate(db, {
    migrationsFolder: resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../drizzle",
    ),
  });
}
