import { createReviewService } from "./modules/reviews/review.service";
import { createApp } from "./app";
import { createOpenAIModel } from "./modules/ai/openai.model";
import { migrateDatabase } from "./shared/database/db";
import { logModel } from "./modules/logs/log.model";

migrateDatabase();
logModel.markInterrupted();
createReviewService(createOpenAIModel()).recover();

const app = createApp({
  llm: createOpenAIModel(),
  webOrigin: process.env.WEB_ORIGIN,
});

export default {
  hostname: process.env.API_HOST ?? "127.0.0.1",
  port: Number(process.env.API_PORT ?? 3001),
  fetch: app.fetch,
};
