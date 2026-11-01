import { useQuery } from "@tanstack/react-query";
import {
  reasoningEffortSchema,
  type ProviderModel,
  type SavedProvider,
  type ReasoningEffort,
} from "@repo/contracts";
import { apiRequest } from "@/shared/lib/api-client";
import { ChoiceSelect } from "@/shared/components/ui/choice-select";
import { Button } from "@/shared/components/ui/button";
import { SettingsFeedback } from "./settings-layout";

export const reasoningOptions = reasoningEffortSchema.options.map((id) => ({
  id,
  label:
    (
      { xhigh: "Extra high", max: "Maximum", ultra: "Ultra" } as Record<
        string,
        string
      >
    )[id] ?? id[0]!.toUpperCase() + id.slice(1),
}));
export type ModelChange = (change: {
  model?: string;
  reasoningEffort?: ReasoningEffort;
}) => void;

export function ProviderModelControls({
  provider,
  models,
  disabled,
  onChange,
}: {
  provider: SavedProvider;
  models: ProviderModel[];
  disabled: boolean;
  onChange: ModelChange;
}) {
  const selected =
    provider.model === "auto"
      ? models[0]
      : models.find((model) => model.id === provider.model);
  const efforts =
    provider.kind === "codex" ? selected?.reasoningEfforts : undefined;
  const unsupported =
    provider.reasoningEffort &&
    efforts &&
    !efforts.includes(provider.reasoningEffort);
  return (
    <div className="mt-3 space-y-3">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="grid min-w-0 gap-1.5 text-supporting">
          Model
          <ChoiceSelect
            label={`Model for ${provider.name}`}
            value={provider.model}
            disabled={disabled}
            onChange={(model) => {
              const next =
                model === "auto"
                  ? models[0]
                  : models.find((entry) => entry.id === model);
              const supported =
                provider.kind === "codex" ? next?.reasoningEfforts : undefined;
              onChange({
                model,
                reasoningEffort:
                  provider.reasoningEffort &&
                  supported &&
                  !supported.includes(provider.reasoningEffort)
                    ? next?.defaultReasoningEffort
                    : provider.reasoningEffort,
              });
            }}
            options={[
              { id: "auto", label: "Provider default" },
              ...(!selected && provider.model !== "auto"
                ? [{ id: provider.model, label: `${provider.model} (saved)` }]
                : []),
              ...models
                .filter((model) => model.id !== "auto")
                .map((model) => ({ id: model.id, label: model.name })),
            ]}
          />
        </label>
        {provider.kind !== "opencode" && (
          <label className="grid min-w-0 gap-1.5 text-supporting">
            Reasoning effort
            <ChoiceSelect
              label={`Reasoning effort for ${provider.name}`}
              value={provider.reasoningEffort ?? "default"}
              disabled={disabled}
              onChange={(value) =>
                onChange({
                  reasoningEffort:
                    value === "default"
                      ? undefined
                      : (value as ReasoningEffort),
                })
              }
              options={[
                { id: "default", label: "Provider default" },
                ...(unsupported
                  ? [
                      {
                        id: provider.reasoningEffort!,
                        label: `${provider.reasoningEffort} (unavailable)`,
                      },
                    ]
                  : []),
                ...reasoningOptions.filter((effort) =>
                  efforts ? efforts.includes(effort.id) : effort.id !== "ultra",
                ),
              ]}
            />
          </label>
        )}
      </div>
      {unsupported && (
        <p role="alert" className="text-supporting text-destructive">
          Choose a reasoning effort supported by this model.
        </p>
      )}
    </div>
  );
}

export function ApiProviderModels({
  provider,
  disabled,
  onChange,
}: {
  provider: SavedProvider;
  disabled: boolean;
  onChange: ModelChange;
}) {
  const catalog = useQuery({
    queryKey: [
      "provider-models",
      provider.id,
      provider.endpoint,
      provider.hasKey,
    ],
    queryFn: () =>
      apiRequest<ProviderModel[]>(`/settings/providers/${provider.id}/models`),
    staleTime: 15000,
    retry: false,
  });
  return (
    <div className="mt-4 border-t border-line pt-4">
      <SettingsFeedback error={catalog.error} />
      {catalog.data && !catalog.isError && (
        <p role="status" className="mb-2 text-supporting text-muted">
          {catalog.data.length
            ? `Connected · ${catalog.data.length} models available`
            : "Connected. No models listed; enter a model ID in Edit."}
        </p>
      )}
      <Button
        variant="ghost"
        disabled={catalog.isFetching || disabled}
        onClick={() => void catalog.refetch()}
      >
        {catalog.isFetching
          ? "Checking connection…"
          : "Refresh models and connection"}
      </Button>
      <ProviderModelControls
        provider={provider}
        models={catalog.data ?? []}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}
