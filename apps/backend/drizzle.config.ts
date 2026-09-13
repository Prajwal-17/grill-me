import { defineConfig } from "drizzle-kit";

const databasePath = process.env.DATABASE_URL ?? "./.data/grill-me.sqlite";

export default defineConfig({
  schema: "./src/shared/database/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: databasePath.startsWith("file:")
      ? databasePath
      : `file:${databasePath}`,
  },
});
