import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backendEnvironment } from "../src/config";

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

test("desktop configuration cannot inherit production storage paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-config-"));
  try {
    const env = backendEnvironment({
      dataRoot: root,
      token: "test-token",
      port: 0,
      rendererRoot: "/renderer",
      workspaceDefaultRoot: join(root, "chosen-workspaces"),
      settings: {
        GRILL_ME_HOME: "/production",
        CODEX_MODEL: "fixture",
        PROJECTS_ROOT: "/retired/default",
      },
      inherited: {
        APP_ENV: "production",
        NODE_ENV: "production",
        SNAPSHOT_ROOT: "/production/submissions",
        CODEX_HOME: "/user/custom-codex",
        PROJECTS_ROOT: "/retired/inherited",
        PATH: "/usr/bin",
      },
    });
    expect(env).toMatchObject({
      APP_ENV: "development",
      NODE_ENV: "development",
      GRILL_ME_HOME: root,
      GRILL_ME_SQLITE_PATH: join(root, "grill-me.sqlite"),
      GRILL_ME_WORKSPACE_DEFAULT: join(root, "chosen-workspaces"),
      CODEX_MODEL: "fixture",
    });
    expect(env.PATH.split(":")[0]).toBe("/usr/bin");
    expect(env).not.toHaveProperty("SNAPSHOT_ROOT");
    expect(env).toHaveProperty("CODEX_HOME", "/user/custom-codex");
    expect(env).not.toHaveProperty("PROJECTS_ROOT");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("window settings persist startup mode and zoom while rejecting invalid values", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-window-settings-"));
  try {
    const { windowSettingsStore } = await import("../src/window-settings");
    const first = windowSettingsStore(root);
    expect(first.get()).toEqual({ startup: "maximized", zoom: 1 });
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

test("legacy fullscreen settings migrate to maximized without losing zoom", async () => {
  const root = await mkdtemp(join(tmpdir(), "grill-legacy-window-"));
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(root, "desktop-settings.json"),
      JSON.stringify({ startup: "fullscreen", zoom: 1.3 }),
    );
    const { windowSettingsStore } = await import("../src/window-settings");
    expect(windowSettingsStore(root).get()).toEqual({
      startup: "maximized",
      zoom: 1.3,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("SQLite v1 upgrades retain existing conversations and initialize completed status", async () => {
  const { Database } = await import("bun:sqlite");
  const { createSqliteDatabase } =
    await import("@repo/backend/shared/database/db.sqlite");
  const { readFile } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "grill-v1-upgrade-"));
  const path = join(root, "legacy.sqlite");
  try {
    const legacy = new Database(path);
    legacy.exec(
      await readFile(
        new URL(
          "../../../packages/backend/drizzle-sqlite/0000_desktop.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    legacy.exec("PRAGMA user_version=1");
    legacy
      .query(
        "INSERT INTO profiles(id,email,created_at,updated_at) VALUES('legacy-owner','legacy@example.test',1,1)",
      )
      .run();
    legacy
      .query(
        "INSERT INTO challenges(id,profile_id,challenge_number,title,scope,difficulty,contextual_difficulty,duration_min_minutes,duration_max_minutes,implementation_milestones,problem_statement,expected_outcome,constraints,completion_criteria,created_at) VALUES('legacy-challenge','legacy-owner',1,'Legacy','focused','medium','medium',1,2,'[]','Task','Result','[]','[]',1)",
      )
      .run();
    legacy
      .query(
        "INSERT INTO messages(id,challenge_id,role,mode,content,attachments,created_at) VALUES('legacy-message','legacy-challenge','assistant','clarify','Saved before upgrade','[]',2)",
      )
      .run();
    legacy.close();
    const upgraded = createSqliteDatabase(path);
    await upgraded.migrateDatabase();
    expect(upgraded.sqlite.query("PRAGMA user_version").get()).toEqual({
      user_version: 6,
    });
    expect(
      upgraded.sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('agent_runs','agent_run_events','project_preparations') ORDER BY name",
        )
        .all(),
    ).toEqual([
      { name: "agent_run_events" },
      { name: "agent_runs" },
      { name: "project_preparations" },
    ]);
    expect(
      (
        upgraded.sqlite.query("PRAGMA table_info(review_jobs)").all() as {
          name: string;
        }[]
      ).some((column) => column.name === "model_selection"),
    ).toBe(true);
    expect(
      upgraded.sqlite
        .query("SELECT content,status FROM messages WHERE id='legacy-message'")
        .get(),
    ).toEqual({ content: "Saved before upgrade", status: "completed" });
    const columns = upgraded.sqlite
      .query("PRAGMA table_info(messages)")
      .all() as { name: string; dflt_value: string | null }[];
    expect(columns.find((c) => c.name === "status")?.dflt_value).toBe(
      "'completed'",
    );
    expect(
      (
        upgraded.sqlite.query("PRAGMA table_info(challenges)").all() as {
          name: string;
        }[]
      ).some((column) => column.name === "workspace_path"),
    ).toBe(true);
    await upgraded.migrateDatabase();
    upgraded.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
