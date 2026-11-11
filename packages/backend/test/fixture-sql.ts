// Test-only helper for historical storage shapes. The application always uses
// the Drizzle models; raw SQL is limited to fixtures and assertions.
export async function fixtureSql(query: string, params: unknown[] = []) {
  const { sqliteDatabase } = await import("@repo/backend/shared/database/db");
  const { sqlite } = sqliteDatabase();
  const values: import("bun:sqlite").SQLQueryBindings[] = [];
  query = query
    .replace(/::jsonb/g, "")
    .replace(
      /now\(\) - interval '1 second'/g,
      "cast(unixepoch('subsec') * 1000 as integer) - 1000",
    )
    .replace(/\$(\d+)/g, (_, index: string) => {
      const value = params[Number(index) - 1];
      values.push(
        value && typeof value === "object"
          ? JSON.stringify(value)
          : (value as import("bun:sqlite").SQLQueryBindings),
      );
      return "?";
    });
  const rows = sqlite.query(query).all(...values) as Record<string, unknown>[];
  for (const row of rows)
    for (const name of ["guided_preferences", "context_snapshot"]) {
      if (typeof row[name] === "string") row[name] = JSON.parse(row[name]!);
    }
  return rows as Record<string, any>[];
}
