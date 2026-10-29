import { createApp } from "@repo/backend/app";
import { createOpenAIModel } from "@repo/backend/modules/ai/openai.model";
import { logModel } from "@repo/backend/modules/logs/log.model";
import { createReviewService } from "@repo/backend/modules/reviews/review.service";
import { migrateDatabase } from "@repo/backend/shared/database/db";

await migrateDatabase();
await logModel.markInterrupted();
await createReviewService(createOpenAIModel()).recover();

const app = createApp({
  llm: createOpenAIModel(),
  webOrigin: process.env.WEB_ORIGIN,
});

const runtime = globalThis as typeof globalThis & {
  grillGenerationWorker?: typeof app.generations;
};
runtime.grillGenerationWorker?.stop();
runtime.grillGenerationWorker = app.generations;
app.generations.start();

export default {
  hostname: process.env.API_HOST ?? "localhost",
  port: Number(process.env.API_PORT ?? 17017),
  fetch: app.fetch,
};
