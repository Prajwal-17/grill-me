import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backendEnvironment } from "../src/config";

// Ordinary PostgreSQL runs can discover this file without opening SQLite.
describe.skipIf(!process.env.GRILL_ME_SQLITE_PATH)(
  "desktop SQLite isolation",
  () => {
    test("an outside read waits for an async transaction and sees the rollback", async () => {
      const { sqliteDatabase, migrateDatabase } =
        await import("@repo/backend/shared/database/db");
      const { db } = sqliteDatabase();
      const { profiles } =
        await import("../../../packages/backend/src/shared/database/schema.sqlite");
      await migrateDatabase();
      const id = crypto.randomUUID();
      const email = `atomic-${id}@test.local`;
      await db.insert(profiles).values({ id, email });
      let release!: () => void;
      let entered!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const transaction = db.transaction(async (tx) => {
        await tx
          .update(profiles)
          .set({ email: `uncommitted-${email}` })
          .where(eq(profiles.id, id));
        entered();
        await gate;
        throw new Error("rollback fixture");
      });
      await started;
      let finished = false;
      const outside = db
        .select()
        .from(profiles)
        .where(eq(profiles.id, id))
        .then((rows) => {
          finished = true;
          return rows;
        });
      await Promise.resolve();
      expect(finished).toBe(false);
      release();
      await expect(transaction).rejects.toThrow("rollback fixture");
      expect((await outside)[0]?.email).toBe(email);
    });

    test("number counters survive deletions and roll back with failed writes", async () => {
      const { sqliteDatabase, nextGenerationNumber } =
        await import("@repo/backend/shared/database/db");
      const { db } = sqliteDatabase();
      const { profiles, generationCounters } =
        await import("../../../packages/backend/src/shared/database/schema.sqlite");
      const id = crypto.randomUUID();
      await db.insert(profiles).values({ id, email: `${id}@test.local` });
      expect(
        await db.transaction((tx) => nextGenerationNumber(tx, id, "quiz")),
      ).toBe(1);
      await expect(
        db.transaction(async (tx) => {
          await nextGenerationNumber(tx, id, "quiz");
          throw new Error("failed insert");
        }),
      ).rejects.toThrow("failed insert");
      expect(
        await db.transaction((tx) => nextGenerationNumber(tx, id, "quiz")),
      ).toBe(2);
      expect(
        await db.transaction((tx) => nextGenerationNumber(tx, id, "challenge")),
      ).toBe(1);
      await db.delete(profiles).where(eq(profiles.id, id));
      expect(
        await db
          .select()
          .from(generationCounters)
          .where(eq(generationCounters.profileId, id)),
      ).toEqual([]);
    });

    test("migrations are repeatable and preserve the database", async () => {
      const { sqliteDatabase, migrateDatabase } =
        await import("@repo/backend/shared/database/db");
      const { sqlite } = sqliteDatabase();
      const before = sqlite
        .query("SELECT count(*) as count FROM profiles")
        .get();
      await migrateDatabase();
      expect(
        sqlite.query("SELECT count(*) as count FROM profiles").get(),
      ).toEqual(before);
      expect(sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(sqlite.query("PRAGMA integrity_check").get()).toEqual({
        integrity_check: "ok",
      });
    });
  },
);

test("desktop configuration cannot inherit production database or storage paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-config-"));
  try {
    const env = backendEnvironment({
      dataRoot: root,
      token: "test-token",
      port: 0,
      rendererRoot: "/renderer",
      settings: {
        DATABASE_URL: "postgresql://forbidden",
        GRILL_ME_HOME: "/production",
        CODEX_MODEL: "fixture",
      },
      inherited: {
        APP_ENV: "production",
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://forbidden",
        SNAPSHOT_ROOT: "/production/submissions",
        CODEX_HOME: "/production/codex",
        PATH: "/usr/bin",
      },
    });
    expect(env).toMatchObject({
      APP_ENV: "development",
      NODE_ENV: "development",
      GRILL_ME_HOME: root,
      GRILL_ME_SQLITE_PATH: join(root, "grill-me.sqlite"),
      CODEX_MODEL: "fixture",
      PATH: "/usr/bin",
    });
    expect(env).not.toHaveProperty("DATABASE_URL");
    expect(env).not.toHaveProperty("SNAPSHOT_ROOT");
    expect(env).not.toHaveProperty("CODEX_HOME");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("window settings persist startup mode and zoom while rejecting invalid values", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-window-settings-"));
  try {
    const { windowSettingsStore } = await import("../src/window-settings");
    const first = windowSettingsStore(root);
    expect(first.get()).toEqual({ startup: "fullscreen", zoom: 1 });
    first.set({ startup: "maximized", zoom: 1.2 });
    expect(windowSettingsStore(root).get()).toEqual({
      startup: "maximized",
      zoom: 1.2,
    });
    expect(() => first.set({ zoom: 3 })).toThrow();
    expect(first.get().zoom).toBe(1.2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
