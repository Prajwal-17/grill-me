// Run in a child process: configuredModel owns an installation-scoped model resolver.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSettingsService } from "../../../../packages/backend/src/local/settings";
import { createCliProviders } from "../../../../packages/backend/src/local/providers";
import { configuredModel } from "../../../../packages/backend/src/local/model";
import { sessionSecretStore } from "../../../../packages/backend/src/local/secrets";
import { challengeSchema } from "../../../../packages/backend/src/modules/challenges/challenge.schema";
import type { JudgeInput } from "../../../../packages/backend/src/modules/ai/model-gateway";

const root = process.env.GRILL_ME_HOME!;
const settings = createSettingsService(root, { keyring: sessionSecretStore() });
const cli = createCliProviders(root);
let apiInput = "";
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    apiInput = JSON.stringify(await request.json());
    return Response.json({
      status: "completed",
      output_text: "{}",
      output: [],
    });
  },
});
try {
  const workspace = join(root, "submission");
  await mkdir(workspace);
  await writeFile(join(workspace, "answer.ts"), "export const answer = 42;");
  const manifest = [{ path: "answer.ts", bytes: 25, sha256: "fixture" }];
  const input: JudgeInput = {
    challenge: challengeSchema.parse({
      id: crypto.randomUUID(),
      profileId: crypto.randomUUID(),
      number: 1,
      title: "Review snapshot routing",
      scope: "focused",
      difficulty: "easy",
      contextualDifficulty: "easy",
      problemStatement: "Inspect the supplied answer implementation.",
      expectedOutcome: "A correct answer constant.",
      constraints: [],
      starterCode: null,
      completionCriteria: ["Export the answer."],
      durationEstimate: { minMinutes: 1, maxMinutes: 2 },
      implementationMilestones: [],
      hint: null,
      status: "active",
      createdAt: new Date().toISOString(),
      completedAt: null,
    }),
    content: "Review the saved snapshot",
    attachments: [],
    evidence: { status: "inspection_only", reason: "Fixture", checks: [] },
    assistance: { hints: 0, guidance: false },
  };
  const apiId = crypto.randomUUID();
  await settings.saveProvider({
    id: apiId,
    name: "API fixture",
    kind: "openai",
    endpoint: `http://127.0.0.1:${server.port}/v1`,
    model: "fixture",
    storage: "session",
    binaryPath: "",
  });
  const model = configuredModel(settings, cli);
  // Deliberately invalid review output still must reach the provider with all source files.
  await assert.rejects(model.reviewWorkspace!(input, workspace, manifest), {
    code: "MODEL_OUTPUT_INVALID",
  });
  assert.ok(
    apiInput.includes("answer.ts") &&
      apiInput.includes("export const answer = 42;"),
  );
  const cliId = crypto.randomUUID();
  await settings.saveProvider({
    id: cliId,
    name: "CLI fixture",
    kind: "codex",
    model: "fixture",
    binaryPath: "",
    storage: "session",
  });
  await settings.activateProvider(cliId);
  let passedWorkspace: string | undefined;
  cli.transport = () => ({
    async *run(request) {
      passedWorkspace = request.workspace;
      yield "{}";
    },
  });
  await assert.rejects(model.reviewWorkspace!(input, workspace, manifest), {
    code: "MODEL_OUTPUT_INVALID",
  });
  assert.equal(passedWorkspace, workspace);
  console.log("Snapshot routing passed");
} finally {
  server.stop(true);
  settings.close();
  await cli.close();
}
