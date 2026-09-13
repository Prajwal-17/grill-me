import { defineConfig } from "drizzle-kit";
import { databasePath } from "./src/shared/storage/paths";

const databaseFile = databasePath();

export default defineConfig({
  schema: "./src/shared/database/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: databaseFile.startsWith("file:")
      ? databaseFile
      : `file:${databaseFile}`,
  },
});
