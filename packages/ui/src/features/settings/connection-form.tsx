import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import type {
  CredentialStorage,
  LocalSettings,
  ModelCapabilities,
  ProviderHealth,
  ProviderInput,
  ProviderPreset,
  ReasoningEffort,
  SavedProvider,
} from "@repo/contracts";
import { Button } from "@/shared/components/ui/button";
import { ChoiceSelect } from "@/shared/components/ui/choice-select";
import { Input } from "@/shared/components/ui/input";
import { SearchSelect } from "@/shared/components/ui/search-select";
import { apiRequest } from "@/shared/lib/api-client";
import { SettingsFeedback } from "./settings-layout";
import { Field } from "./settings-field";
import {
  defaultCapabilities,
  defaultInput,
  effortLabels,
  modelsQuery,
  presetNames,
  presetOptions,
  protocolOptions,
  storageOptions,
} from "./provider-options";
import { useSettingsMutation } from "./use-settings-mutation";

export function ConnectionForm({
  provider,
  data,
  onDone,
  onSaved,
}: {
  provider: SavedProvider | null;
  data: LocalSettings;
  onDone: () => void;
  onSaved: (provider: SavedProvider) => void;
}) {
  const [values, setValues] = useState<ProviderInput>(
    provider
      ? { ...provider }
      : {
          ...defaultInput("openrouter"),
          storage: data.keyring.available ? "keyring" : "file",
        },
  );
  const [test, setTest] = useState<ProviderHealth | null>(null);
  const [testing, setTesting] = useState(false);
  const change = useSettingsMutation((next) => {
    if (provider) {
      onDone();
      return;
    }
    const created = next.providers.find((item) => item.id === values.id);
    if (created) onSaved(created);
    else onDone();
  });
  const saved = provider;
  const models = useQuery(
    modelsQuery(
      {
        ...(saved ??
          ({
            id: values.id,
            name: values.name,
            kind: "openai",
            preset: values.preset ?? "custom",
            protocol: values.protocol ?? "openai-responses",
            capabilities: values.capabilities ?? defaultCapabilities,
            enabled: true,
            codexHome: "",
            binaryPath: "",
            model: values.model ?? "",
          } as SavedProvider)),
        ...values,
      } as SavedProvider,
      Boolean(saved?.enabled),
    ),
  );
  const usesCatalog =
    values.preset === "openrouter" ||
    values.preset === "opencode-go" ||
    values.preset === "openai";
  const isBuiltIn =
    values.preset === "openrouter" || values.preset === "opencode-go";
  const selectedModel = models.data?.find((model) => model.id === values.model);
  const reasoningEfforts =
    selectedModel?.capabilities?.reasoningEfforts ??
    selectedModel?.reasoningEfforts ??
    (usesCatalog ? [] : (values.capabilities?.reasoningEfforts ?? []));
  const update = (patch: Partial<ProviderInput>) =>
    setValues((current) => ({ ...current, ...patch }));
  const updateCapabilities = (patch: Partial<ModelCapabilities>) =>
    update({
      capabilities: {
        ...(values.capabilities ?? defaultCapabilities),
        ...patch,
      },
    });
  const busy = change.isPending || testing;
  const modelOptions = models.data?.map((model) => ({
    id: model.id,
    label: model.name,
    description: model.id === model.name ? undefined : model.id,
    keywords: [model.id],
  }));
  const pickerValue =
    values.model === "auto" && !usesCatalog ? "" : values.model;

  async function runTest() {
    if (!saved) return;
    setTesting(true);
    setTest(null);
    try {
      setTest(
        await apiRequest<ProviderHealth>(
          `/settings/providers/${saved.id}/test`,
          { method: "POST", body: "{}" },
        ),
      );
    } catch (error) {
      setTest({
        ok: false,
        message:
          error instanceof Error ? error.message : "Connection check failed.",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section
      aria-label={provider ? `Edit ${provider.name}` : "Add API connection"}
      className="mt-6 min-w-0 border-t border-line pt-6"
    >
      <h3 className="text-reading font-semibold">
        {provider ? provider.name : "New API connection"}
      </h3>
      <form
        className="mt-4 min-w-0 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          change.mutate({
            path: "/settings/providers",
            body: {
              ...values,
              model: values.model.trim() || "auto",
              enabled: provider?.enabled ?? true,
            },
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Connection type" htmlFor={`preset-${values.id}`}>
            <ChoiceSelect
              id={`preset-${values.id}`}
              label="Connection type"
              value={values.preset ?? "custom"}
              disabled={Boolean(provider) || busy}
              onChange={(preset) => {
                const nextPreset = preset as ProviderPreset;
                const base = defaultInput(nextPreset);
                update({
                  preset: nextPreset,
                  endpoint: base.endpoint,
                  model: base.model,
                  name:
                    values.name === presetNames[values.preset ?? "custom"]
                      ? presetNames[nextPreset]
                      : values.name,
                });
              }}
              options={presetOptions.map((preset) => ({
                id: preset.id,
                label: preset.label,
              }))}
            />
          </Field>
          <Field label="Name" htmlFor={`name-${values.id}`}>
            <Input
              id={`name-${values.id}`}
              required
              maxLength={80}
              value={values.name}
              onChange={(event) => update({ name: event.target.value })}
            />
          </Field>
        </div>
        {!isBuiltIn && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Endpoint"
              htmlFor={`endpoint-${values.id}`}
              hint="OpenAI-compatible base URL, including /v1."
            >
              <Input
                id={`endpoint-${values.id}`}
                required
                type="url"
                value={values.endpoint ?? ""}
                onChange={(event) => update({ endpoint: event.target.value })}
                placeholder="http://127.0.0.1:20128/v1"
              />
            </Field>
            <Field
              label="Protocol"
              htmlFor={`protocol-${values.id}`}
              hint="Match the endpoint's wire protocol."
            >
              <ChoiceSelect
                id={`protocol-${values.id}`}
                label="API protocol"
                value={values.protocol ?? "openai-responses"}
                onChange={(protocol) =>
                  update({
                    protocol: protocol as ProviderInput["protocol"],
                  })
                }
                options={protocolOptions}
              />
            </Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="API key"
            htmlFor={`key-${values.id}`}
            hint={
              provider?.hasKey
                ? "A key is saved. Leave empty to keep it."
                : "Required for hosted API connections."
            }
          >
            <Input
              id={`key-${values.id}`}
              type="password"
              autoComplete="new-password"
              value={values.apiKey ?? ""}
              onChange={(event) =>
                update({
                  apiKey: event.target.value || undefined,
                  removeKey: false,
                })
              }
              placeholder={
                provider?.hasKey ? "Saved key unchanged" : "Enter API key"
              }
            />
          </Field>
          <Field label="Key storage" htmlFor={`storage-${values.id}`}>
            <ChoiceSelect
              id={`storage-${values.id}`}
              label="API key storage"
              value={values.storage ?? "keyring"}
              onChange={(value) =>
                update({ storage: value as CredentialStorage })
              }
              options={storageOptions}
            />
          </Field>
        </div>
        {provider?.hasKey && (
          <label className="flex items-center gap-2 text-supporting">
            <input
              type="checkbox"
              checked={values.removeKey ?? false}
              onChange={(event) =>
                update({
                  removeKey: event.target.checked,
                  apiKey: undefined,
                })
              }
            />
            Remove saved API key
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Model"
            htmlFor={`model-${values.id}`}
            hint={
              modelOptions?.length
                ? "Choose any model this connection offers, or enter an exact custom ID."
                : usesCatalog
                  ? "Save the connection to load its catalog, or enter an exact model ID. Automatic uses the first available model."
                  : "Save the connection to load its catalog, or enter an exact model ID."
            }
          >
            {modelOptions?.length && !models.isError ? (
              <div className="space-y-2">
                <SearchSelect
                  id={`model-${values.id}`}
                  label="Model"
                  value={pickerValue}
                  onChange={(model) => update({ model })}
                  placeholder="Choose a model"
                  searchPlaceholder="Search models…"
                  emptyMessage="No matching models."
                  options={[
                    ...(usesCatalog
                      ? [
                          {
                            id: "auto",
                            label: "Automatic (first available)",
                            description:
                              "Uses the connection's first catalog model.",
                          },
                        ]
                      : []),
                    ...modelOptions,
                  ]}
                />
                <Input
                  aria-label="Custom model ID"
                  maxLength={160}
                  value={values.model === "auto" ? "" : values.model}
                  onChange={(event) =>
                    update({ model: event.target.value || "auto" })
                  }
                  placeholder="Or enter an exact model ID"
                  spellCheck={false}
                />
              </div>
            ) : (
              <Input
                id={`model-${values.id}`}
                maxLength={160}
                value={values.model === "auto" ? "" : values.model}
                onChange={(event) =>
                  update({ model: event.target.value || "auto" })
                }
                placeholder="provider/model-id (choose after saving)"
                spellCheck={false}
              />
            )}
          </Field>
          <Field label="Reasoning effort" htmlFor={`effort-${values.id}`}>
            <ChoiceSelect
              id={`effort-${values.id}`}
              label="Reasoning effort"
              value={values.reasoningEffort ?? "default"}
              onChange={(value) =>
                update({
                  reasoningEffort:
                    value === "default"
                      ? undefined
                      : (value as ReasoningEffort),
                })
              }
              options={[
                { id: "default", label: "Provider default" },
                ...reasoningEfforts.map((effort) => ({
                  id: effort,
                  label: effortLabels[effort] ?? effort,
                })),
              ]}
            />
          </Field>
        </div>
        {!isBuiltIn && (
          <fieldset className="space-y-2">
            <legend className="text-supporting font-medium">
              Endpoint capabilities
            </legend>
            {(
              [
                ["tools", "Tool calling (required for structured results)"],
                ["images", "Image inputs"],
                ["reasoning", "Reasoning controls"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 text-supporting"
              >
                <input
                  type="checkbox"
                  checked={Boolean(values.capabilities?.[key])}
                  onChange={(event) =>
                    updateCapabilities({ [key]: event.target.checked })
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
        )}
        {!isBuiltIn &&
          values.reasoningEffort &&
          !values.capabilities?.reasoning && (
            <p role="alert" className="text-supporting text-destructive">
              This connection has a saved reasoning effort but reasoning
              controls are disabled. Enable reasoning above or choose Provider
              default.
            </p>
          )}
        <SettingsFeedback error={change.error} />
        {test && (
          <p
            role="status"
            className={
              test.ok
                ? "text-supporting text-muted"
                : "text-supporting text-destructive"
            }
          >
            {test.message}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          {saved && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void runTest()}
            >
              {testing && <LoaderCircle size={14} className="animate-spin" />}
              Test connection
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onDone}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {change.isPending && (
              <LoaderCircle size={14} className="animate-spin" />
            )}
            {provider ? "Save changes" : "Save connection"}
          </Button>
        </div>
      </form>
    </section>
  );
}
