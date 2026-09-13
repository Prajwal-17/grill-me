import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
process.env.DATABASE_URL = ":memory:";
const { migrateDatabase } = await import("../src/shared/database/db");
const { createApp } = await import("../src/app");
const { createOpenAIModel } = await import("../src/modules/ai/openai.model");
migrateDatabase();
const app = createApp({ llm: createOpenAIModel() });
const profile = await app.request("/profiles/start", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "prompt-evaluation@local.test" }),
});
const {
  data: { id },
} = await profile.json();
const headers = { "Content-Type": "application/json", "X-Profile-Id": id };
const cases = process.argv.includes("--regressions")
  ? [
      {
        prompt:
          "I just got to know how to use Codex App Server; give me a challenge",
        scope: "focused",
        difficulty: "medium",
      },
      {
        prompt:
          "Create a TypeScript challenge to build a background job processing system. I know async programming, HTTP APIs, SQL, and basic queues.",
        scope: "system",
        difficulty: "grill",
      },
    ]
  : ["focused", "feature", "system"].flatMap((scope) =>
      ["easy", "medium", "hard", "grill"].map((difficulty) => ({
        prompt:
          "Practice Python collections with a useful implementation. I know functions, lists, dictionaries and file IO.",
        scope,
        difficulty,
      })),
    );
const results: unknown[] = [];
for (const input of cases) {
  const response = await app.request("/challenges/generate", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  const result = await response.json();
  results.push({ input, status: response.status, result });
  console.log(
    `${input.scope}/${input.difficulty}: ${response.ok ? "quality checks passed" : (result.error?.message ?? "failed")}`,
  );
  if (!response.ok) {
    process.exitCode = 1;
    break;
  }
}
const dir = resolve(".data/evaluations");
await mkdir(dir, { recursive: true });
const path = resolve(dir, `prompts-${Date.now()}.json`);
await writeFile(path, JSON.stringify(results, null, 2));
console.log(
  `Saved ${path}. Inspect semantic quality; automated assessment is not a guarantee.`,
);
