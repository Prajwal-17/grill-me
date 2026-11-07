import {
  reasoningEffortSchema,
  type ProviderModel,
  type SavedProvider,
  type ReasoningEffort,
} from "@repo/contracts";
import { ChoiceSelect } from "@/shared/components/ui/choice-select";
import { cn } from "@/shared/lib/cn";
import { ProviderModelPicker } from "./provider-model-picker";

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
    <div className="space-y-3">
      <div
        className={cn(
          "grid min-w-0 gap-3",
          provider.kind !== "opencode" && "sm:grid-cols-2",
        )}
      >
        <label className="grid min-w-0 gap-1.5 text-supporting">
          Model
          <ProviderModelPicker
            providerName={provider.name}
            value={provider.model}
            models={models}
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
