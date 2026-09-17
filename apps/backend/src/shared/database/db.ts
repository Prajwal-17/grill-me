import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";
import { databaseUrl } from "../storage/paths";

export const db = drizzle(databaseUrl(), { schema });

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
