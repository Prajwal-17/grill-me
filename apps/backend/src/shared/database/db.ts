import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";
import { databaseUrl } from "../storage/paths";

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
