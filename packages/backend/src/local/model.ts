import type { ModelGateway } from "../modules/ai/model-gateway";
import { createPiGateway } from "../modules/ai/agent/gateway";
import { createSettingsAgentRuntime } from "./agent-runtime";
import type { SettingsService } from "./settings";

export function configuredModel(settings: SettingsService): ModelGateway {
  const runtime = createSettingsAgentRuntime(settings);
  settings.setAgent(runtime);
  return createPiGateway(runtime);
}
