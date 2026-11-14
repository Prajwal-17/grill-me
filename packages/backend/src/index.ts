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
  providerStatus?: () => Promise<{
    configured: boolean;
    online: boolean;
    message: string;
  }>;
  providerModels?: () => Promise<{
    models: { id: string; label: string }[];
    defaultModel: string;
  }>;
}) {
  await initializeDatabase(options.database);
  await migrateDatabase();
  const [
    { createApp },
    { logModel },
    { createReviewService },
    { agentRunStore },
  ] = await Promise.all([
    import("./app"),
    import("./modules/logs/log.model"),
    import("./modules/reviews/review.service"),
    import("./modules/ai/agent/store"),
  ]);
  if (!options.llm)
    throw new Error(
      "createBackend requires an embedded model gateway. Configure an API provider before starting the backend.",
    );
  const llm = options.llm;
  await agentRunStore.markInterrupted();
  await logModel.markInterrupted();
  await (
    await import("./modules/messages/message.model")
  ).messageModel.recover();
  await createReviewService(llm).recover();
  const app = createApp({
    llm,
    workspaceRoot: options.workspaceRoot,
    webOrigin: options.webOrigin,
    providerStatus: options.providerStatus,
    providerModels: options.providerModels,
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
