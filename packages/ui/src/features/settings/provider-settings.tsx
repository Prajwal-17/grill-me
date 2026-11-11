import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import type {
  CredentialStorage,
  LocalSettings,
  ModelCapabilities,
  ProviderHealth,
  ProviderInput,
  ProviderModel,
  ProviderPreset,
  ReasoningEffort,
  SavedProvider,
} from "@repo/contracts";
import { reasoningEffortSchema } from "@repo/contracts";
import { Button } from "@/shared/components/ui/button";
import { ChoiceSelect } from "@/shared/components/ui/choice-select";
import { Input } from "@/shared/components/ui/input";
import { SearchSelect } from "@/shared/components/ui/search-select";
import { Switch } from "@/shared/components/ui/switch";
import { apiRequest } from "@/shared/lib/api-client";
import {
  SettingsFeedback,
  SettingsHeading,
  SettingsRow,
} from "./settings-layout";
import { useSettingsMutation } from "./use-settings-mutation";

const presetOptions: {
  id: ProviderPreset;
  label: string;
  description: string;
}[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "OpenRouter API key",
  },
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
  {
    id: "openai",
    label: "OpenAI",
    description: "OpenAI API",
  },
  {
    id: "custom",
    label: "Custom endpoint",
    description: "OpenAI-compatible API",
  },
];
const presetNames = Object.fromEntries(
  presetOptions.map((preset) => [preset.id, preset.label]),
) as Record<ProviderPreset, string>;
const effortLabels: Record<string, string> = {
  none: "No reasoning",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Maximum",
  ultra: "Ultra",
};
const defaultCapabilities: ModelCapabilities = {
  tools: true,
  images: false,
  reasoning: false,
};

function defaultInput(preset: ProviderPreset): ProviderInput {
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
    model: preset === "openai" ? "gpt-6.1-sol" : "",
    storage: "keyring",
    binaryPath: "",
    codexHome: "",
  };
}

function modelsQuery(provider: SavedProvider, enabled: boolean) {
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

export function ProviderSettings({ data }: { data: LocalSettings }) {
  const change = useSettingsMutation();
  const [editing, setEditing] = useState<SavedProvider | "new" | null>(null);
  const api = data.providers.filter((provider) => provider.kind === "openai");
  const legacy = data.providers.filter(
    (provider) => provider.kind !== "openai",
  );
  const enabled = api.filter((provider) => provider.enabled);
  const activeId = enabled.some(
    (provider) => provider.id === data.activeProviderId,
  )
    ? data.activeProviderId!
    : "none";
  return (
    <>
      <SettingsHeading title="API connections" />
      <SettingsRow label="Use for AI requests" htmlFor="active-provider">
        <SearchSelect
          id="active-provider"
          label="Use for AI requests"
          value={activeId}
          disabled={change.isPending}
          onChange={(id) =>
            change.mutate({
              path: "/settings/active-provider",
              body: { id: id === "none" ? null : id },
            })
          }
          placeholder="None"
          searchPlaceholder="Search connections…"
          emptyMessage="No matching API connections."
          options={[
            {
              id: "none",
              label: "None",
              description: "No API connection selected",
            },
            ...enabled.map((provider) => ({
              id: provider.id,
              label: provider.name,
              description: presetNames[provider.preset],
            })),
          ]}
        />
      </SettingsRow>
      <SettingsFeedback error={change.error} />
      {!api.length && (
        <p className="mt-4 text-supporting text-muted">
          Add an API connection to generate challenges, quizzes, hints,
          discussions, and reviews. CLI integrations are inactive.
        </p>
      )}
      <div className="mt-6 overflow-hidden rounded-lg bg-surface">
        <div className="divide-y divide-line">
          {api.map((provider) => (
            <ConnectionRow
              key={provider.id}
              provider={provider}
              active={data.activeProviderId === provider.id}
              busy={change.isPending}
              onEdit={() => setEditing(provider)}
              onToggle={(value) =>
                change.mutate({
                  path: `/settings/providers/${provider.id}/enabled`,
                  body: { enabled: value },
                })
              }
              onDelete={() =>
                change.mutate({
                  path: `/settings/providers/${provider.id}`,
                  method: "DELETE",
                })
              }
            />
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={change.isPending}
          onClick={() => setEditing("new")}
          variant="secondary"
        >
          <Plus size={14} />
          Add API connection
        </Button>
      </div>
      {editing && (
        <ConnectionForm
          key={editing === "new" ? "new" : editing.id}
          provider={editing === "new" ? null : editing}
          data={data}
          onDone={() => setEditing(null)}
        />
      )}
      <WebSearchSettings data={data} />
      {legacy.length > 0 && (
        <p className="mt-8 border-t border-line pt-4 text-supporting text-muted">
          {legacy.length} legacy CLI{" "}
          {legacy.length === 1 ? "connection is" : "connections are"} preserved
          but inactive. Their settings and credentials are not changed.
        </p>
      )}
    </>
  );
}

function ConnectionRow({
  provider,
  active,
  busy,
  onEdit,
  onToggle,
  onDelete,
}: {
  provider: SavedProvider;
  active: boolean;
  busy: boolean;
  onEdit: () => void;
  onToggle: (value: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={onEdit}
        aria-label={`Edit ${provider.name}`}
      >
        <span className="flex flex-wrap items-center gap-2 text-ui font-medium">
          {provider.name}
          {active && (
            <span className="text-metadata font-normal text-muted">In use</span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-supporting text-muted">
          {presetNames[provider.preset]} · {provider.model || "No model"}
        </span>
      </button>
      <Switch
        aria-label={`Enable ${provider.name}`}
        checked={provider.enabled}
        disabled={busy}
        onCheckedChange={onToggle}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${provider.name}`}
        disabled={busy}
        onClick={onDelete}
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
}

function ConnectionForm({
  provider,
  data,
  onDone,
}: {
  provider: SavedProvider | null;
  data: LocalSettings;
  onDone: () => void;
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
  const change = useSettingsMutation(onDone);
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
  const selectedModel = models.data?.find((model) => model.id === values.model);
  const reasoningEfforts =
    selectedModel?.capabilities?.reasoningEfforts ??
    selectedModel?.reasoningEfforts ??
    values.capabilities?.reasoningEfforts ??
    reasoningEffortSchema.options;
  const update = (patch: Partial<ProviderInput>) =>
    setValues((current) => ({ ...current, ...patch }));
  const updateCapabilities = (patch: Partial<ModelCapabilities>) =>
    update({
      capabilities: {
        ...(values.capabilities ?? defaultCapabilities),
        ...patch,
      },
    });
  const isBuiltIn =
    values.preset === "openrouter" || values.preset === "opencode-go";
  const busy = change.isPending || testing;
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
            body: { ...values, enabled: provider?.enabled ?? true },
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
                const base = defaultInput(preset as ProviderPreset);
                update({
                  preset: preset as ProviderPreset,
                  endpoint: base.endpoint,
                  model: values.model || base.model,
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
                options={[
                  { id: "openai-responses", label: "OpenAI Responses" },
                  { id: "openai-completions", label: "OpenAI completions" },
                  { id: "anthropic-messages", label: "Anthropic messages" },
                  {
                    id: "google-generative-ai",
                    label: "Google generative AI",
                  },
                ]}
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
              options={[
                { id: "keyring", label: "System credential store" },
                { id: "file", label: "Plaintext file (owner-only)" },
                { id: "session", label: "This session only" },
              ]}
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
            hint="Exact model ID. Save the connection to load its catalog."
          >
            <Input
              id={`model-${values.id}`}
              required
              maxLength={160}
              value={values.model}
              onChange={(event) => update({ model: event.target.value })}
              placeholder="provider/model-id"
              spellCheck={false}
              list={models.data ? `models-${values.id}` : undefined}
            />
            {models.data && (
              <datalist id={`models-${values.id}`}>
                {models.data.map((model) => (
                  <option key={model.id} value={model.id} />
                ))}
              </datalist>
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
                ...reasoningEfforts
                  .filter((effort) => effort !== "none")
                  .map((effort) => ({
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
            Save connection
          </Button>
        </div>
      </form>
    </section>
  );
}

function WebSearchSettings({ data }: { data: LocalSettings }) {
  const [enabled, setEnabled] = useState(data.search.enabled);
  const [storage, setStorage] = useState<CredentialStorage>(
    data.search.storage,
  );
  const [apiKey, setApiKey] = useState("");
  const change = useSettingsMutation(() => setApiKey(""));
  return (
    <section className="mt-10 border-t border-line pt-6">
      <h3 className="text-reading font-semibold">Web search</h3>
      <p className="mt-1 text-supporting text-muted">
        Optional Brave Search key. Models can use it during generation and
        discussion; reviews never receive web access.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          change.mutate({
            path: "/settings/search",
            body: {
              enabled,
              storage,
              ...(apiKey ? { apiKey } : {}),
            },
          });
        }}
      >
        <label className="flex items-center gap-2 text-ui">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Enable web search {data.search.configured ? "(key saved)" : ""}
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brave Search API key" htmlFor="search-key">
            <Input
              id="search-key"
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                data.search.configured ? "Saved key unchanged" : "Enter key"
              }
            />
          </Field>
          <Field label="Key storage" htmlFor="search-storage">
            <ChoiceSelect
              id="search-storage"
              label="Web search key storage"
              value={storage}
              onChange={(value) => setStorage(value as CredentialStorage)}
              options={[
                { id: "keyring", label: "System credential store" },
                { id: "file", label: "Plaintext file (owner-only)" },
                { id: "session", label: "This session only" },
              ]}
            />
          </Field>
        </div>
        <SettingsFeedback error={change.error} />
        <div className="flex justify-end">
          <Button type="submit" disabled={change.isPending}>
            {change.isPending && (
              <LoaderCircle size={14} className="animate-spin" />
            )}
            Save web search
          </Button>
        </div>
      </form>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-supporting font-medium"
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-supporting text-muted">{hint}</p>}
    </div>
  );
}
