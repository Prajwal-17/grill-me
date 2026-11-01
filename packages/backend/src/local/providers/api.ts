import type { Provider, ProviderModel } from "@repo/contracts";
import { AppError } from "../../shared/errors/app-error";
import { providerError } from "./common";

export async function apiModels(
  provider: Provider & { apiKey?: string },
): Promise<ProviderModel[]> {
  try {
    const response = await fetch(`${provider.endpoint}/models`, {
      headers: provider.apiKey
        ? { Authorization: `Bearer ${provider.apiKey}` }
        : {},
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw providerError({ status: response.status }, provider.name);
    }
    const body = (await response.json()) as { data?: { id?: unknown }[] };
    if (!Array.isArray(body?.data)) throw new SyntaxError();
    return body.data.flatMap((model) =>
      typeof model?.id === "string" && model.id
        ? [{ id: model.id, name: model.id }]
        : [],
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof SyntaxError)
      throw new AppError(
        "PROVIDER_RESPONSE_INVALID",
        "The endpoint did not return an OpenAI-compatible model catalog. Check the base URL in Settings.",
        502,
      );
    if (error instanceof TypeError)
      throw new AppError(
        "PROVIDER_UNREACHABLE",
        "Cannot reach the API provider. Check your endpoint, network, TLS certificate, and whether OmniRoute or your provider is running.",
        503,
        true,
      );
    throw providerError(error, provider.name);
  }
}
