import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.pg";
import { ilike, sql, type AnyColumn } from "drizzle-orm";

function lockRows<T>(
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

const databaseNow = () => sql`now()`;
const caseInsensitiveLike = (column: AnyColumn, pattern: string) =>
  ilike(column, pattern);

// PostgreSQL retains its existing numbering triggers.
async function nextGenerationNumber(
  _tx: unknown,
  _profileId: string,
  _kind: "quiz" | "challenge",
): Promise<number | undefined> {
  return undefined;
}

export function createPostgresDatabase(url: string) {
  const client = new SQL(url);
  const db = drizzle(client, { schema });
  async function migrateDatabase() {
    await migrate(db, {
      migrationsFolder: resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../../drizzle",
      ),
    });
  }
  return {
    dialect: "postgres" as const,
    db,
    migrateDatabase,
    lockRows,
    databaseNow,
    caseInsensitiveLike,
    nextGenerationNumber,
    close: () => client.close(),
  };
}
