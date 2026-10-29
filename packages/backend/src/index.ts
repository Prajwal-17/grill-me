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
    { createOpenAIModel },
    { logModel },
    { createReviewService },
  ] = await Promise.all([
    import("./app"),
    import("./modules/ai/openai.model"),
    import("./modules/logs/log.model"),
    import("./modules/reviews/review.service"),
  ]);
  const llm = options.llm ?? createOpenAIModel();
  await logModel.markInterrupted();
  await (
    await import("./modules/messages/message.model")
  ).messageModel.recover();
  await createReviewService(llm).recover();
  const app = createApp({
    llm,
    webOrigin: options.webOrigin,
    providerStatus: options.providerStatus,
    providerModels: options.providerModels,
  });
  return {
    app,
    start: () => app.generations.start(),
    stop: async () => {
      app.generations.stop();
      await closeDatabase();
    },
  };
}
