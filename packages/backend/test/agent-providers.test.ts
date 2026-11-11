import { expect, test } from "bun:test";
import type { AgentConnection } from "@repo/backend/modules/ai/agent/providers";
import { resolveAgentModel } from "@repo/backend/modules/ai/agent/providers";
import { testConnection } from "@repo/backend/modules/ai/agent/provider-catalog";
import { AppError } from "@repo/backend/shared/errors/app-error";

test("custom API capabilities map declared reasoning levels and reject unsupported values", async () => {
  const connection: AgentConnection = {
    id: crypto.randomUUID(),
    name: "Custom fixture",
    kind: "openai" as const,
    preset: "custom" as const,
    protocol: "openai-completions" as const,
    capabilities: {
      tools: true,
      images: false,
      reasoning: true,
      reasoningEfforts: ["low", "high"],
    },
    enabled: true,
    endpoint: "http://127.0.0.1:1/v1",
    codexHome: "",
    binaryPath: "",
    model: "fixture-model",
  };
  const resolved = resolveAgentModel(connection, {
    reasoningEffort: "high",
  });
  expect(resolved.thinkingLevel).toBe("high");
  expect(resolved.providerModel.capabilities?.reasoningEfforts).toContain(
    "high",
  );
  expect(
    resolveAgentModel(connection, { reasoningEffort: "none" }).thinkingLevel,
  ).toBe("off");
  expect(() =>
    resolveAgentModel(connection, { reasoningEffort: "minimal" }),
  ).toThrow(AppError);
  const noTools = {
    ...connection,
    capabilities: { ...connection.capabilities, tools: false },
  };
  expect(resolveAgentModel(noTools).providerModel.capabilities?.tools).toBe(
    false,
  );
});

test("built-in API connections can start from the first catalog model while custom endpoints require an exact model", async () => {
  const base: AgentConnection = {
    id: crypto.randomUUID(),
    name: "OpenRouter fixture",
    kind: "openai",
    preset: "openrouter",
    protocol: "openai-responses",
    capabilities: { tools: true, images: false, reasoning: false },
    enabled: true,
    codexHome: "",
    binaryPath: "",
    model: "auto",
    apiKey: "fixture-key",
  };
  const resolved = resolveAgentModel(base);
  expect(resolved.model.id).not.toBe("auto");
  expect(resolved.model.id.length).toBeGreaterThan(0);
  expect(await testConnection(base)).toMatchObject({ ok: true });
  expect(() =>
    resolveAgentModel({
      ...base,
      preset: "custom",
      endpoint: "http://127.0.0.1:1/v1",
      model: "auto",
    }),
  ).toThrow(AppError);
});

test("legacy CLI connections cannot resolve or run through the production gateway", async () => {
  expect(() =>
    resolveAgentModel({
      id: crypto.randomUUID(),
      name: "Codex fixture",
      kind: "codex",
      preset: "custom",
      protocol: "openai-responses",
      capabilities: { tools: true, images: false, reasoning: false },
      enabled: true,
      binaryPath: "/tmp/fixture-codex",
      codexHome: "",
      model: "auto",
    }),
  ).toThrow(AppError);
  expect(() =>
    resolveAgentModel({
      id: crypto.randomUUID(),
      name: "OpenCode Go",
      kind: "openai",
      preset: "opencode-go",
      protocol: "openai-responses",
      capabilities: { tools: true, images: false, reasoning: true },
      enabled: true,
      codexHome: "",
      binaryPath: "",
      model: "claude-haiku-5-5",
      reasoningEffort: "ultra",
    }),
  ).toThrow(AppError);
});
