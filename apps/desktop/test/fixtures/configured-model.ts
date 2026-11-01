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
let apiStatus = 200;
let apiCalls = 0;
let apiStall = false;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    apiCalls++;
    apiInput = JSON.stringify(await request.json());
    if (apiStall) await new Promise((resolve) => setTimeout(resolve, 2000));
    if (apiStatus !== 200)
      return Response.json(
        {
          error: {
            message: "private-upstream-secret",
            type: "fixture",
            code: apiStatus === 404 ? "model_not_found" : null,
          },
        },
        { status: apiStatus },
      );
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
    reasoningEffort: "xhigh",
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
  assert.deepEqual(JSON.parse(apiInput).reasoning, { effort: "xhigh" });
  for (const [status, code] of [
    [401, "PROVIDER_AUTH_REQUIRED"],
    [403, "PROVIDER_ACCESS_DENIED"],
    [429, "PROVIDER_RATE_LIMIT"],
    [400, "PROVIDER_CONFIGURATION_INVALID"],
    [404, "PROVIDER_MODEL_UNAVAILABLE"],
    [503, "PROVIDER_UNAVAILABLE"],
  ] as const) {
    apiStatus = status;
    const before = apiCalls;
    await assert.rejects(
      model.reviewWorkspace!(input, workspace, manifest),
      (error: unknown) => {
        const failure = error as { code: string; message: string };
        return (
          failure.code === code &&
          !failure.message.includes("private-upstream-secret")
        );
      },
    );
    assert.equal(
      apiCalls,
      before + 1,
      "Failures must not trigger hidden automatic retries",
    );
  }
  apiStatus = 200;
  apiStall = true;
  await settings.saveRuntime({
    ...(await settings.get()).runtime,
    judgeTimeoutMs: 1000,
  });
  await assert.rejects(model.reviewWorkspace!(input, workspace, manifest), {
    code: "PROVIDER_TIMEOUT",
  });
  apiStall = false;
  server.stop(true);
  await assert.rejects(model.reviewWorkspace!(input, workspace, manifest), {
    code: "PROVIDER_UNREACHABLE",
  });
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
