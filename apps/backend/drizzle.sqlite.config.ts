import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "../../packages/backend/src/shared/database/schema.sqlite.ts",
  out: "../../packages/backend/drizzle-sqlite",
  dialect: "sqlite",
});
