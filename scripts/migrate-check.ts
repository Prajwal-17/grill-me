import { Database } from "bun:sqlite";
import { mkdir, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  createSqliteDatabase,
  DATABASE_VERSION,
} from "../packages/backend/src/shared/database/db.sqlite";

const LATEST_VERSION = DATABASE_VERSION;

type Counts = Record<string, number>;

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let target: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]!;
    if (value === "--target") target = argv[++index];
    else if (value.startsWith("--target=")) target = value.slice(9);
    else positional.push(value);
  }
  if (!positional[0]) {
    console.error(
      "Usage: bun scripts/migrate-check.ts <source.sqlite> [--target <copy.sqlite>]",
    );
    process.exit(2);
  }
  return { source: resolve(positional[0]), target };
}

function readVersion(path: string) {
  const db = new Database(path, { readonly: true });
  try {
    return (db.query("PRAGMA user_version").get() as { user_version: number })
      .user_version;
  } finally {
    db.close();
  }
}

function tableNames(path: string) {
  const db = new Database(path, { readonly: true });
  try {
    return (
      db
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map((row) => row.name);
  } finally {
    db.close();
  }
}

function counts(path: string, tables: string[]): Counts {
  const db = new Database(path, { readonly: true });
  try {
    return Object.fromEntries(
      tables.map((table) => [
        table,
        Number(
          (
            db.query(`SELECT count(*) AS count FROM "${table}"`).get() as {
              count: number;
            }
          ).count,
        ),
      ]),
    );
  } finally {
    db.close();
  }
}

function query(path: string, statement: string) {
  const db = new Database(path, { readonly: true });
  try {
    return db.query(statement).all() as Record<string, unknown>[];
  } finally {
    db.close();
  }
}

async function copyDatabase(source: string, target: string) {
  if (resolve(source) === resolve(target))
    throw new Error("The migration-check target must differ from the source.");
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await rm(target, { force: true });
  const db = new Database(source, { readonly: true });
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    db.run("VACUUM INTO ?", [target]);
  } finally {
    db.close();
  }
}

async function main() {
  const { source, target: requestedTarget } = parseArgs(process.argv.slice(2));
  await stat(source);
  const target =
    requestedTarget ??
    join(
      "/tmp/opencode/grill-migration-check",
      `${basename(source, ".sqlite")}-${Date.now()}.sqlite`,
    );
  await copyDatabase(source, target);

  const beforeVersion = readVersion(source);
  const beforeTables = tableNames(source);
  const before = counts(source, beforeTables);
  const beforeChallenges = query(
    source,
    "SELECT profile_id, challenge_number FROM challenges ORDER BY profile_id, challenge_number",
  );
  const beforeQuizzes = query(
    source,
    "SELECT profile_id, quiz_number FROM quizzes ORDER BY profile_id, quiz_number",
  );

  const database = createSqliteDatabase(target);
  try {
    await database.migrateDatabase();
    const afterVersion = (
      database.sqlite.query("PRAGMA user_version").get() as {
        user_version: number;
      }
    ).user_version;
    const integrity = (
      database.sqlite.query("PRAGMA integrity_check").get() as {
        integrity_check: string;
      }
    ).integrity_check;
    const foreignKeys = database.sqlite.query("PRAGMA foreign_key_check").all();
    const afterTables = tableNames(target);
    const after = counts(target, afterTables);

    const renames: Record<string, string> = {
      projects: "projects_legacy",
      submissions: "submissions_legacy",
      review_jobs: "review_jobs_legacy",
      verification_runs: "verification_runs_legacy",
      ai_logs: "ai_logs_legacy",
      ai_log_events: "ai_log_events_legacy",
      generation_counters: "generation_counters_legacy",
      messages: "messages_legacy",
    };
    if (before.agent_runs !== undefined)
      renames.agent_runs = "agent_runs_legacy";
    if (before.agent_run_events !== undefined)
      renames.agent_run_events = "agent_run_events_legacy";

    const missing: string[] = [];
    for (const table of beforeTables) {
      const mapped = renames[table] ?? table;
      if (!afterTables.includes(mapped)) missing.push(`${table} -> ${mapped}`);
    }
    const problems: string[] = [];
    if (afterVersion !== LATEST_VERSION)
      problems.push(
        `expected user_version ${LATEST_VERSION}, got ${afterVersion}`,
      );
    if (integrity !== "ok") problems.push(`integrity_check: ${integrity}`);
    if (foreignKeys.length) problems.push("foreign_key_check returned rows");
    if (missing.length) problems.push(`missing tables: ${missing.join(", ")}`);

    const afterChallenges = query(
      target,
      "SELECT profile_id, challenge_number FROM challenges ORDER BY profile_id, challenge_number",
    );
    const afterQuizzes = query(
      target,
      "SELECT profile_id, quiz_number FROM quizzes ORDER BY profile_id, quiz_number",
    );
    if (JSON.stringify(beforeChallenges) !== JSON.stringify(afterChallenges))
      problems.push("challenge numbers changed");
    if (JSON.stringify(beforeQuizzes) !== JSON.stringify(afterQuizzes))
      problems.push("quiz numbers changed");
    for (const [name, number] of beforeChallenges.map((row) => [
      "challenge",
      Number(row.challenge_number),
    ]) as [string, number][])
      if (number < 1) problems.push(`invalid ${name} number ${number}`);
    for (const [name, number] of beforeQuizzes.map((row) => [
      "quiz",
      Number(row.quiz_number),
    ]) as [string, number][])
      if (number < 1) problems.push(`invalid ${name} number ${number}`);

    const storedPaths = [
      ...query(
        target,
        "SELECT workspace_path AS path FROM challenges WHERE workspace_path IS NOT NULL",
      ),
      ...query(target, "SELECT project_path AS path FROM project_preparations"),
      ...(afterTables.includes("submissions_legacy")
        ? query(target, "SELECT snapshot_path AS path FROM submissions_legacy")
        : []),
    ].map((row) => String(row.path));
    const missingPaths: string[] = [];
    for (const path of storedPaths) {
      try {
        await stat(path);
      } catch {
        missingPaths.push(path);
      }
    }
    if (missingPaths.length)
      problems.push(`missing stored paths: ${missingPaths.join(", ")}`);

    const triggers = query(
      target,
      "SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name",
    ).map((row) => row.name);
    for (const trigger of [
      "challenges_immutable_number",
      "quizzes_immutable_number",
    ])
      if (!triggers.includes(trigger))
        problems.push(`missing trigger ${trigger}`);

    const rowCounts = Object.entries(before)
      .map(([table, count]) => {
        const mapped = renames[table] ?? table;
        return {
          table,
          mapped,
          before: count,
          after: after[mapped] ?? "missing",
          same: after[mapped] === count,
        };
      })
      .filter((entry) => !entry.same);

    console.log(
      JSON.stringify(
        {
          source,
          target,
          beforeVersion,
          afterVersion,
          integrity,
          foreignKeys: foreignKeys.length,
          liveTables: afterTables.filter((table) => !table.endsWith("_legacy")),
          legacyTables: afterTables.filter((table) =>
            table.endsWith("_legacy"),
          ),
          rowCountChanges: rowCounts,
          challengeNumbers: afterChallenges.length,
          quizNumbers: afterQuizzes.length,
          storedPaths: storedPaths.length,
          missingPaths,
          triggers,
          paths: {
            sourceDirectory: dirname(source),
            copyDirectory: dirname(target),
            dataRootHint: dirname(source),
          },
          problems,
        },
        null,
        2,
      ),
    );
    if (problems.length) process.exitCode = 1;
  } finally {
    await database.close();
  }
}

await main();
