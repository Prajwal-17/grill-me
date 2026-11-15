import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/shared/database/schema.sqlite.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
