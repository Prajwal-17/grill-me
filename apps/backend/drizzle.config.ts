import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./src/shared/storage/paths";

export default defineConfig({
  schema: "./src/shared/database/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl(),
  },
});
