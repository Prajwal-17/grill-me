// Legacy fixtures intentionally exercise historical storage shapes. Keep their
// raw SQL compatibility here, outside application/database code.
export async function fixtureSql(query: string, params: unknown[] = []) {
  if (!process.env.GRILL_ME_SQLITE_PATH) {
    const { db } = await import("../src/shared/database/db");
    return db.$client.unsafe(query, params as never[]);
  }
  const { sqlite } = await import("../src/shared/database/db.sqlite");
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
      if (typeof row[name] === "string") row[name] = JSON.parse(row[name]);
    }
  return rows as Record<string, any>[];
}
