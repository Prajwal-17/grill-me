import { initializeDatabase } from "@repo/backend/shared/database/db";
if (!process.env.GRILL_ME_SQLITE_PATH)
  throw new Error("Missing isolated SQLite path.");
await initializeDatabase({
  dialect: "sqlite",
  path: process.env.GRILL_ME_SQLITE_PATH,
});
