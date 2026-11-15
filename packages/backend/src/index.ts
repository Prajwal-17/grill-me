import {
  initializeDatabase,
  migrateDatabase,
  closeDatabase,
  type DatabaseOptions,
} from "./shared/database/db";
import type { ModelGateway } from "./modules/ai/model-gateway";
export { initializeDatabase, closeDatabase };
export type { DatabaseOptions, ModelGateway };
// The explicit factory owns startup; importing this package is side-effect free.
export async function createBackend(options: {
  database: DatabaseOptions;
  llm?: ModelGateway;
  workspaceRoot?: () => string;
  webOrigin?: string;
}) {
  await initializeDatabase(options.database);
  await migrateDatabase();
  const [{ createApp }, { harnessService }] = await Promise.all([
    import("./app"),
    import("./modules/harness/harness.service"),
  ]);
  if (!options.llm)
    throw new Error(
      "createBackend requires an embedded model gateway. Configure an API provider before starting the backend.",
    );
  await harnessService.recover();
  const app = createApp({
    llm: options.llm,
    workspaceRoot: options.workspaceRoot,
    webOrigin: options.webOrigin,
  });
  await app.projectPreparations.recover();
  return {
    app,
    start: () => app.generations.start(),
    stop: async () => {
      app.generations.stop();
      await app.projectPreparations.stop();
      await closeDatabase();
    },
  };
}
