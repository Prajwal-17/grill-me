import { createModels, fauxProvider } from "@earendil-works/pi-ai";
import type { ResolvedAgentModel } from "@repo/backend/modules/ai/agent/providers";
import type { CompletionSpec } from "@repo/backend/modules/ai/agent/tasks/index";
import {
  initializeDatabase,
  migrateDatabase,
} from "@repo/backend/shared/database/db";

const databasePath = process.env.GRILL_ME_SQLITE_PATH;
if (!databasePath)
  throw new Error("Set GRILL_ME_SQLITE_PATH for agent runtime tests.");
await initializeDatabase({ dialect: "sqlite", path: databasePath });
await migrateDatabase();

export function resolvedModel(
  reasoning = false,
  modelId = "fixture",
): {
  resolved: ResolvedAgentModel;
  faux: ReturnType<typeof fauxProvider>;
} {
  const faux = fauxProvider({ models: [{ id: modelId, reasoning }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const model = faux.getModel(modelId)!;
  return {
    faux,
    resolved: {
      connection: {
        id: "fixture-connection",
        name: "Fixture",
        preset: "custom",
        protocol: "openai-completions",
      },
      model,
      models,
      streamFn: models.streamSimple.bind(models),
      providerModel: {
        id: model.id,
        name: model.id,
        capabilities: { tools: true, images: false, reasoning: false },
      },
      thinkingLevel: "off",
      requestedReasoning: null,
    },
  };
}

export const completeThing: CompletionSpec<{ value: string }> = {
  name: "complete_thing",
  description: "Complete the fixture task.",
  schema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  },
  validate: (value) => {
    if (
      !value ||
      typeof value !== "object" ||
      typeof (value as { value?: unknown }).value !== "string" ||
      !(value as { value: string }).value.trim()
    )
      throw new Error("The result needs a non-empty value.");
    return value as { value: string };
  },
};
