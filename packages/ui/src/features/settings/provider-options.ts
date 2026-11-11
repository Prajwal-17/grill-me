import type {
  ModelCapabilities,
  ProviderInput,
  ProviderModel,
  ProviderPreset,
  SavedProvider,
} from "@repo/contracts";
import { apiRequest } from "@/shared/lib/api-client";

export const presetOptions: {
  id: ProviderPreset;
  label: string;
  description: string;
}[] = [
  { id: "openrouter", label: "OpenRouter", description: "OpenRouter API key" },
  {
    id: "opencode-go",
    label: "OpenCode Go",
    description: "OpenCode Go API key",
  },
  {
    id: "omniroute",
    label: "OmniRoute",
    description: "OpenAI-compatible OmniRoute gateway",
  },
  { id: "openai", label: "OpenAI", description: "OpenAI API" },
  {
    id: "custom",
    label: "Custom endpoint",
    description: "OpenAI-compatible API",
  },
];

export const presetNames = Object.fromEntries(
  presetOptions.map((preset) => [preset.id, preset.label]),
) as Record<ProviderPreset, string>;

export const effortLabels: Record<string, string> = {
  none: "No reasoning",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Maximum",
  ultra: "Ultra",
};

export const defaultCapabilities: ModelCapabilities = {
  tools: true,
  images: false,
  reasoning: false,
};

export const storageOptions = [
  { id: "keyring", label: "System credential store" },
  { id: "file", label: "Plaintext file (owner-only)" },
] as const;

export const protocolOptions = [
  { id: "openai-responses", label: "OpenAI Responses" },
  { id: "openai-completions", label: "OpenAI completions" },
  { id: "anthropic-messages", label: "Anthropic messages" },
  { id: "google-generative-ai", label: "Google generative AI" },
] as const;

export function defaultInput(preset: ProviderPreset): ProviderInput {
  const endpoint =
    preset === "openai"
      ? "https://api.openai.com/v1"
      : preset === "omniroute" || preset === "custom"
        ? "http://127.0.0.1:20128/v1"
        : undefined;
  return {
    id: crypto.randomUUID(),
    name: presetNames[preset] ?? "API connection",
    kind: "openai",
    preset,
    protocol: "openai-responses",
    capabilities: defaultCapabilities,
    enabled: true,
    endpoint,
    model: "auto",
    storage: "keyring",
    binaryPath: "",
    codexHome: "",
  };
}

export function modelsQuery(provider: SavedProvider, enabled: boolean) {
  return {
    queryKey: [
      "provider-models",
      provider.id,
      provider.endpoint,
      provider.enabled,
    ],
    queryFn: () =>
      apiRequest<ProviderModel[]>(`/settings/providers/${provider.id}/models`),
    enabled,
    retry: false,
    staleTime: 30_000,
  };
}
