import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "../../packages/backend/src/shared/storage/paths";

export default defineConfig({
  schema: "../../packages/backend/src/shared/database/schema.pg.ts",
  out: "../../packages/backend/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl(),
  },
});
