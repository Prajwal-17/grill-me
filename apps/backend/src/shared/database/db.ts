import { eq } from "drizzle-orm";
import { migrateLegacyPreferences } from "@repo/preferences";
import { Database as BunDatabase } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

const filename = process.env.DATABASE_URL ?? "./.data/grill-me.sqlite";

if (filename !== ":memory:") {
  mkdirSync(dirname(resolve(filename)), { recursive: true });
}

const sqlite = new BunDatabase(filename, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle({ client: sqlite, schema });

export function migrateDatabase() {
  migrate(db, {
    migrationsFolder: resolve(import.meta.dir, "../../../drizzle"),
  });
  db.transaction((tx) => {
    for (const row of tx.select().from(schema.profilePreferences).all()) {
      if (row.guidedPreferences === null)
        tx.update(schema.profilePreferences)
          .set({ guidedPreferences: migrateLegacyPreferences(row) })
          .where(eq(schema.profilePreferences.profileId, row.profileId))
          .run();
    }
  });
}
