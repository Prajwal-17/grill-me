import { createApp } from "./app";
import { createOpenAIModel } from "./modules/ai/openai.model";
import { migrateDatabase } from "./shared/database/db";
import { logModel } from "./modules/logs/log.model";

migrateDatabase();
logModel.markInterrupted();

const app = createApp({
  llm: createOpenAIModel(),
  webOrigin: process.env.WEB_ORIGIN,
});

export default {
  port: Number(process.env.API_PORT ?? 3001),
  fetch: app.fetch,
};
