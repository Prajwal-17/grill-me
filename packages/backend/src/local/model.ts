import { createOpenAIModel } from "../modules/ai/openai.model";
import type { ModelGateway } from "../modules/ai/model-gateway";
import { createPiGateway } from "../modules/ai/agent/gateway";
import { readSnapshot } from "../modules/projects/snapshot";
import { createSettingsAgentRuntime } from "./agent-runtime";
import type { CliProviders } from "./providers";
import type { SettingsService } from "./settings";

// Kept for the preserved CLI adapter fixtures. Production never passes a CLI
// factory; configuredModel without it builds the embedded Pi runtime.
export async function withModelSnapshot<T>(work: () => Promise<T>): Promise<T> {
  return work();
}

export function configuredModel(
  settings: SettingsService,
  cli?: CliProviders,
): ModelGateway {
  if (cli) {
    const legacy = async () => {
      const p = await settings.snapshot();
      const model = createOpenAIModel({
        apiKey: p.apiKey ?? "local-provider",
        baseURL: p.kind === "openai" ? p.endpoint : `${p.kind}://local/${p.id}`,
        model: p.model,
        reasoningEffort: p.reasoningEffort,
        providerName: p.name,
        anonymous: p.kind === "openai" && !p.apiKey,
        timeoutMs: settings.runtime().judgeTimeoutMs,
        ...(p.kind === "openai" ? {} : { transport: cli.transport(p) }),
      });
      model.reviewWorkspace = async (input, workspace, manifest) =>
        model.judge!({
          ...input,
          ...(p.kind === "openai"
            ? { attachments: await readSnapshot(workspace, manifest) }
            : { workspace, attachments: [] }),
        });
      return model;
    };
    return new Proxy({} as ModelGateway, {
      get(_target, key) {
        if (key === "respond" || key === "generateHint")
          return async function* (input: never) {
            const m = await legacy();
            yield* m[key](input);
          };
        return async (...args: never[]) => {
          const m = await legacy();
          return (
            m[key as keyof ModelGateway] as (...args: never[]) => unknown
          )(...args);
        };
      },
    });
  }
  const runtime = createSettingsAgentRuntime(settings);
  settings.setAgent(runtime);
  return createPiGateway(runtime);
}
