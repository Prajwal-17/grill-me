import { AsyncLocalStorage } from "node:async_hooks";
import { createOpenAIModel } from "../modules/ai/openai.model";
import type { ModelGateway } from "../modules/ai/model-gateway";
import type { SettingsService } from "./settings";
import type { CliProviders } from "./providers";
import { readSnapshot } from "../modules/projects/snapshot";
const scope = new AsyncLocalStorage<ModelGateway>();
let resolveModel: (() => Promise<ModelGateway>) | undefined;
export async function withModelSnapshot<T>(work: () => Promise<T>): Promise<T> {
  if (!resolveModel || scope.getStore()) return work();
  const model = await resolveModel();
  return scope.run(model, work);
}
export function configuredModel(
  settings: SettingsService,
  cli: CliProviders,
): ModelGateway {
  resolveModel = async () => {
    const p = await settings.snapshot();
    const model = createOpenAIModel({
      apiKey: p.apiKey ?? "local-provider",
      baseURL: p.kind === "openai" ? p.endpoint : `${p.kind}://local/${p.id}`,
      model: p.model,
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
  const get = async () => scope.getStore() ?? resolveModel!();
  return new Proxy({} as ModelGateway, {
    get(_target, key) {
      if (key === "respond" || key === "generateHint")
        return async function* (input: never) {
          const m = await get();
          yield* m[key](input);
        };
      return async (...args: never[]) => {
        const m = await get();
        return (m[key as keyof ModelGateway] as (...args: never[]) => unknown)(
          ...args,
        );
      };
    },
  });
}
