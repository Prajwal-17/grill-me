import { AsyncLocalStorage } from "node:async_hooks";
import { createOpenAIModel } from "../modules/ai/openai.model";
import type { ModelGateway } from "../modules/ai/model-gateway";
import type { SettingsService } from "./settings";
const scope = new AsyncLocalStorage<ModelGateway>();
let resolveModel: (() => Promise<ModelGateway>) | undefined;
export async function withModelSnapshot<T>(work: () => Promise<T>): Promise<T> {
  if (!resolveModel || scope.getStore()) return work();
  let model: ModelGateway;
  try {
    model = await resolveModel();
  } catch {
    return work();
  }
  return scope.run(model, work);
}
export function configuredModel(settings: SettingsService): ModelGateway {
  resolveModel = async () => {
    const p = await settings.snapshot();
    return createOpenAIModel({
      apiKey: p.apiKey ?? "local-provider",
      baseURL: p.endpoint,
      model: p.model,
    });
  };
  const get = async () => scope.getStore() ?? resolveModel!();
  return new Proxy({} as ModelGateway, {
    get(_target, key) {
      if (key === "respond" || key === "generateHint")
        return async function* (input: never) {
          const m = await get();
          yield* m[key](input);
        };
      return async (input: never) => {
        const m = await get();
        return (m[key as keyof ModelGateway] as (input: never) => unknown)(
          input,
        );
      };
    },
  });
}
