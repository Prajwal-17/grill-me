import { Database } from "bun:sqlite";
import { chmod, mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { AppError } from "../shared/errors/app-error";

function version(path: string) {
  const db = new Database(path, { readonly: true });
  try {
    return (db.query("PRAGMA user_version").get() as { user_version: number })
      .user_version;
  } finally {
    db.close();
  }
}

function verifyBackup(path: string, expectedVersion: number) {
  const db = new Database(path, { readonly: true });
  try {
    const integrity = db.query("PRAGMA integrity_check").get() as {
      integrity_check: string;
    };
    if (integrity.integrity_check !== "ok")
      throw new Error("The SQLite backup failed its integrity check.");
    const actual = (
      db.query("PRAGMA user_version").get() as { user_version: number }
    ).user_version;
    if (actual !== expectedVersion)
      throw new Error("The SQLite backup has an unexpected schema version.");
  } finally {
    db.close();
  }
}

/**
 * Create verified, owner-only copies before the practice database upgrades.
 * VACUUM INTO produces a consistent snapshot from a live WAL database instead of
 * copying the main file alone. Any failure aborts startup before migration.
 */
export async function backupBeforeMigration(
  root: string,
  files: string[],
): Promise<string | null> {
  const practice = files[0]!;
  try {
    await stat(practice);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let practiceVersion: number;
  try {
    practiceVersion = version(practice);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new AppError(
      "BACKUP_FAILED",
      "The practice database could not be read before its upgrade. Startup was stopped so no data is changed.",
      500,
      false,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
  if (practiceVersion >= 4) return null;
  const directory = join(
    root,
    "backups",
    `${new Date().toISOString().replace(/[:.]/g, "-")}-pre-v4`,
  );
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    for (const source of files) {
      let exists = true;
      try {
        await stat(source);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") exists = false;
        else throw error;
      }
      if (!exists) continue;
      const sourceVersion = version(source);
      const destination = join(directory, source.split("/").at(-1)!);
      const db = new Database(source, { strict: true });
      try {
        db.exec("PRAGMA busy_timeout = 5000");
        db.run("VACUUM INTO ?", [destination]);
      } finally {
        db.close();
      }
      await chmod(destination, 0o600);
      verifyBackup(destination, sourceVersion);
    }
    return directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw new AppError(
      "BACKUP_FAILED",
      "A verified backup of the local databases could not be created. Startup was stopped before migration so no practice data is changed.",
      500,
      false,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}
