import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  SquareTerminal,
  Terminal,
  Waypoints,
} from "lucide-react";
import type {
  LocalSettings,
  ProviderConnection,
  ProviderInput,
  ProviderModel,
  SavedProvider,
} from "@repo/contracts";
import { Button } from "@/shared/components/ui/button";
import { ChoiceSelect } from "@/shared/components/ui/choice-select";
import { Input } from "@/shared/components/ui/input";
import { Switch } from "@/shared/components/ui/switch";
import { apiRequest } from "@/shared/lib/api-client";
import { cn } from "@/shared/lib/cn";
import {
  SettingsFeedback,
  SettingsHeading,
  SettingsRow,
} from "./settings-layout";
import { useSettingsMutation } from "./use-settings-mutation";
import { ProviderModelControls } from "./provider-model-controls";
import { OpenCodeSignIn } from "./opencode-sign-in";
import { providerHealthKey } from "./provider-health";

type ProviderKind = "codex" | "opencode" | "openai";
const providerNames = {
  codex: "Codex",
  opencode: "OpenCode",
  openai: "OmniRoute",
};
const providerDescriptions = {
  codex: "ChatGPT through the Codex CLI",
  opencode: "OpenCode CLI accounts",
  openai: "OpenAI-compatible gateway",
};
const providerFallbackIds = {
  codex: "00000000-0000-4000-8000-000000000001",
  opencode: "00000000-0000-4000-8000-000000000003",
  openai: "00000000-0000-4000-8000-000000000002",
};
const signInCodes = [
  "PROVIDER_AUTH_REQUIRED",
  "PROVIDER_LOGIN_FAILED",
  "PROVIDER_LOGIN_EXPIRED",
];
function planLabel(plan: string) {
  return (
    (
      {
        pro: "Pro",
        prolite: "Pro Lite",
        plus: "Plus",
        team: "Team",
        business: "Business",
        enterprise: "Enterprise",
        free: "Free",
      } as Record<string, string>
    )[plan] ?? plan
  );
}
function primaryProvider(
  data: LocalSettings,
  kind: ProviderKind,
): SavedProvider {
  return (
    data.providers.find(
      (p) => p.kind === kind && p.id === data.activeProviderId,
    ) ??
    data.providers.find((p) => p.kind === kind) ?? {
      id: providerFallbackIds[kind],
      name: providerNames[kind],
      kind,
      enabled: false,
      codexHome: "",
      binaryPath: "",
      endpoint: kind === "openai" ? "http://127.0.0.1:20128/v1" : undefined,
      ...(kind === "opencode" ? { model: "auto" } : data.providerDefaults),
      storage: data.keyring.available ? "keyring" : "session",
      hasKey: false,
    }
  );
}
function useProviderStatus(provider: SavedProvider) {
  return useQuery({
    queryKey: [
      "provider-status",
      provider.id,
      provider.binaryPath,
      provider.codexHome,
      provider.endpoint,
      provider.enabled,
    ],
    queryFn: async (): Promise<ProviderConnection> => {
      if (provider.kind !== "openai")
        return apiRequest(`/settings/providers/${provider.id}/connection`);
      const models = await apiRequest<ProviderModel[]>(
        `/settings/providers/${provider.id}/models`,
      );
      return {
        installed: true,
        connected: true,
        authenticated: true,
        version: null,
        binaryPath: null,
        message: "Connected to OmniRoute",
        models,
      };
    },
    enabled: provider.enabled,
    staleTime: 15000,
    retry: false,
    refetchInterval: (query) =>
      provider.enabled ? (query.state.data?.login ? 2000 : 30000) : false,
  });
}

export function ProviderSettings({ data }: { data: LocalSettings }) {
  const providers = (["codex", "opencode", "openai"] as const).map((kind) =>
    primaryProvider(data, kind),
  );
  const [selected, setSelected] = useState<ProviderKind>(
    () =>
      (data.providers.find((p) => p.id === data.activeProviderId)?.kind as
        ProviderKind | undefined) ?? "codex",
  );
  const change = useSettingsMutation();
  const enabled = providers.filter((p) => p.enabled);
  return (
    <>
      <SettingsHeading title="Providers" />
      <SettingsRow label="Use for AI requests">
        <ChoiceSelect
          label="Provider used for AI requests"
          value={
            enabled.some((p) => p.id === data.activeProviderId)
              ? data.activeProviderId!
              : "none"
          }
          disabled={change.isPending}
          onChange={(id) =>
            change.mutate({
              path: "/settings/active-provider",
              body: { id: id === "none" ? null : id },
            })
          }
          options={[
            { id: "none", label: "None" },
            ...enabled.map((p) => ({
              id: p.id,
              label: providerNames[p.kind as ProviderKind],
            })),
          ]}
        />
      </SettingsRow>
      <SettingsFeedback error={change.error} />
      <div className="provider-workbench mt-6 grid min-w-0 overflow-hidden rounded-lg border border-line bg-surface @min-[740px]:grid-cols-[230px_minmax(0,1fr)]">
        <div
          className="divide-y divide-line border-b border-line @min-[740px]:border-b-0 @min-[740px]:border-r"
          role="group"
          aria-label="AI providers"
        >
          {providers.map((provider) => (
            <ProviderListItem
              key={provider.id}
              provider={provider}
              selected={selected === provider.kind}
              active={data.activeProviderId === provider.id}
              busy={change.isPending}
              onSelect={() => setSelected(provider.kind as ProviderKind)}
              onToggle={(value) => {
                change.reset();
                change.mutate(
                  data.providers.some((p) => p.id === provider.id)
                    ? {
                        path: `/settings/providers/${provider.id}/enabled`,
                        body: { enabled: value },
                      }
                    : {
                        path: "/settings/providers",
                        body: { ...provider, enabled: value },
                      },
                );
              }}
            />
          ))}
        </div>
        <div className="min-w-0">
          {providers.map((provider) => (
            <div key={provider.id} hidden={selected !== provider.kind}>
              <ProviderDetails provider={provider} data={data} />
            </div>
          ))}
        </div>
      </div>
      {data.migration.pending && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="mb-3 text-supporting text-muted">
            Existing OmniRoute settings are available to import.
          </p>
          <Button
            disabled={change.isPending}
            onClick={() =>
              change.mutate({
                path: "/settings/import",
                body: {
                  storage: data.keyring.available ? "keyring" : "session",
                },
              })
            }
          >
            Import existing settings
          </Button>
        </div>
      )}
    </>
  );
}

function ProviderListItem({
  provider,
  selected,
  active,
  busy,
  onSelect,
  onToggle,
}: {
  provider: SavedProvider;
  selected: boolean;
  active: boolean;
  busy: boolean;
  onSelect: () => void;
  onToggle: (value: boolean) => void;
}) {
  const status = useProviderStatus(provider);
  const Icon =
    provider.kind === "codex"
      ? Terminal
      : provider.kind === "opencode"
        ? SquareTerminal
        : Waypoints;
  const summary = !provider.enabled
    ? "Off"
    : status.isFetching && !status.data
      ? "Checking connection…"
      : status.error
        ? "Connection unavailable"
        : (status.data?.account?.email ??
          (status.data?.connected ? "Connected" : "Sign-in needed"));
  return (
    <div
      className={cn(
        "flex items-start gap-2 px-4 py-4 transition-colors",
        selected ? "bg-elevated" : "bg-transparent",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-controls={`provider-detail-${provider.id}`}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left outline-offset-4"
        onClick={onSelect}
      >
        <Icon
          size={16}
          className={cn(
            "mt-0.5 shrink-0",
            selected ? "text-foreground" : "text-muted",
          )}
        />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 text-ui font-medium">
            {providerNames[provider.kind as ProviderKind]}
            {active && (
              <span className="text-metadata font-normal text-muted">
                In use
              </span>
            )}
          </span>
          <span
            className="mt-1 block truncate text-supporting text-muted"
            title={summary}
          >
            {summary}
          </span>
          {status.data?.account?.plan && provider.enabled && (
            <span className="mt-1 block text-metadata text-muted">
              ChatGPT {planLabel(status.data.account.plan)}
            </span>
          )}
        </span>
      </button>
      <Switch
        aria-label={`Enable ${providerNames[provider.kind as ProviderKind]}`}
        checked={provider.enabled}
        disabled={busy}
        onCheckedChange={onToggle}
      />
    </div>
  );
}

function ProviderDetails({
  provider,
  data,
}: {
  provider: SavedProvider;
  data: LocalSettings;
}) {
  const queries = useQueryClient();
  const status = useProviderStatus(provider);
  const [draft, setDraft] = useState<ProviderInput | null>(null);
  const save = useSettingsMutation(() => setDraft(null));
  const values: ProviderInput = draft ?? provider;
  const update = (patch: Partial<ProviderInput>) => {
    save.reset();
    setDraft({ ...values, ...patch });
  };
  const dirty = draft !== null;
  const login = useMutation({
    mutationFn: () =>
      apiRequest<ProviderConnection>(
        `/settings/providers/${provider.id}/login`,
        { method: "POST", body: "{}" },
      ),
    onSuccess: (value) => {
      queries.setQueriesData(
        { queryKey: ["provider-status", provider.id] },
        value,
      );
      void queries.invalidateQueries({
        queryKey: ["provider-status", provider.id],
      });
      void queries.invalidateQueries({ queryKey: providerHealthKey });
    },
  });
  const busy = save.isPending || login.isPending;
  const state = status.data;
  const name = providerNames[provider.kind];
  return (
    <section
      id={`provider-detail-${provider.id}`}
      aria-label={`${name} settings`}
      className="min-w-0 p-5 sm:p-6"
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-ui font-semibold">{name}</h3>
          <p className="mt-1 text-supporting text-muted">
            {providerDescriptions[provider.kind]}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={!provider.enabled || status.isFetching || busy}
          onClick={() => void status.refetch()}
        >
          <RefreshCw
            size={14}
            className={status.isFetching ? "animate-spin" : ""}
          />
          Refresh
        </Button>
      </div>
      <div className="mb-6 border-b border-line pb-5">
        <div className="flex items-center gap-2 text-ui">
          <span
            className={cn(
              "size-2 rounded-full",
              !provider.enabled
                ? "bg-muted"
                : state?.connected && !status.error
                  ? "bg-success"
                  : "bg-warning",
            )}
          />
          <span className="font-medium">
            {!provider.enabled
              ? "Turned off"
              : status.isFetching && !state
                ? "Checking connection…"
                : state?.connected && !status.error
                  ? "Connected"
                  : "Needs attention"}
          </span>
        </div>
        {!provider.enabled ? (
          <p className="mt-2 text-supporting text-muted">
            Turn on {name} to use its models.
          </p>
        ) : (
          <>
            {state?.account && (
              <p className="mt-2 break-words text-ui">
                {state.account.email ??
                  (state.account.type === "apiKey"
                    ? "API key account"
                    : "Codex account")}
                {state.account.plan && (
                  <span className="ml-2 text-supporting text-muted">
                    ChatGPT {planLabel(state.account.plan)}
                  </span>
                )}
              </p>
            )}
            {state?.version && (
              <p className="mt-1 text-metadata text-muted">{state.version}</p>
            )}
            {(status.error || (state?.code && !state.login)) && (
              <div className="mt-3">
                <SettingsFeedback
                  error={status.error ?? new Error(state?.message)}
                />
              </div>
            )}
            {provider.kind === "codex" &&
              state?.installed &&
              (!state.code || signInCodes.includes(state.code)) &&
              !state.authenticated &&
              !state.login && (
                <div className="mt-3">
                  <Button disabled={busy} onClick={() => login.mutate()}>
                    {login.isPending && (
                      <LoaderCircle size={14} className="animate-spin" />
                    )}
                    Sign in to Codex
                  </Button>
                  <p className="mt-2 text-supporting text-muted">
                    Or run <code>codex login</code>, then refresh.
                  </p>
                </div>
              )}
            {provider.kind === "codex" && state?.login && (
              <div className="mt-3 space-y-3">
                <p className="text-supporting text-muted">
                  Complete Codex sign-in in your browser, then return here.
                </p>
                {state.login.url && (
                  <Button asChild>
                    <a href={state.login.url} target="_blank" rel="noreferrer">
                      Open sign-in page
                      <ExternalLink size={14} />
                    </a>
                  </Button>
                )}
              </div>
            )}
            {provider.kind === "opencode" && (
              <OpenCodeSignIn
                provider={provider}
                status={state}
                disabled={busy}
              />
            )}
          </>
        )}
      </div>
      <SettingsFeedback error={save.error ?? login.error} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({
            path: "/settings/providers",
            body: { ...values, enabled: provider.enabled },
          });
        }}
      >
        <fieldset disabled={busy} className="min-w-0 space-y-6">
          {provider.kind === "openai" && (
            <div className="space-y-4">
              <DetailField
                label="Endpoint"
                htmlFor={`endpoint-${provider.id}`}
                hint="OmniRoute base URL, including /v1."
              >
                <Input
                  id={`endpoint-${provider.id}`}
                  required
                  type="url"
                  value={values.endpoint ?? ""}
                  onChange={(e) => update({ endpoint: e.target.value })}
                  placeholder="http://127.0.0.1:20128/v1"
                />
              </DetailField>
              <DetailField
                label="API key"
                htmlFor={`key-${provider.id}`}
                hint={
                  provider.hasKey
                    ? "A key is saved. Leave empty to keep it."
                    : "Optional if your gateway does not require a key."
                }
              >
                <Input
                  id={`key-${provider.id}`}
                  type="password"
                  autoComplete="new-password"
                  value={values.apiKey ?? ""}
                  onChange={(e) =>
                    update({
                      apiKey: e.target.value || undefined,
                      removeKey: false,
                    })
                  }
                  placeholder={
                    provider.hasKey ? "Saved key unchanged" : "Enter API key"
                  }
                />
              </DetailField>
            </div>
          )}
          <section aria-label="Model settings">
            <ProviderModelControls
              provider={{ ...provider, ...values } as SavedProvider}
              models={provider.enabled ? (state?.models ?? []) : []}
              disabled={busy}
              onChange={update}
            />
            {provider.enabled &&
              provider.kind !== "openai" &&
              state?.connected &&
              values.model !== "auto" &&
              !state.models.some((model) => model.id === values.model) && (
                <p
                  role="alert"
                  className="mt-3 text-supporting text-destructive"
                >
                  Not available to {name}. Choose another model.
                </p>
              )}
          </section>
          <details className="group border-t border-line pt-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-ui font-medium">
              Advanced
              <ChevronDown
                size={15}
                className="transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="space-y-4 pt-5">
              <DetailField
                label="Custom model ID"
                htmlFor={`model-${provider.id}`}
                hint="Exact model ID."
              >
                <Input
                  id={`model-${provider.id}`}
                  value={values.model}
                  required
                  maxLength={160}
                  onChange={(e) => update({ model: e.target.value })}
                  spellCheck={false}
                />
              </DetailField>
              {provider.kind !== "openai" ? (
                <>
                  <DetailField
                    label="Binary path"
                    htmlFor={`binary-${provider.id}`}
                    hint={`Leave empty to find ${provider.kind} on PATH.`}
                  >
                    <Input
                      id={`binary-${provider.id}`}
                      value={values.binaryPath ?? ""}
                      onChange={(e) => update({ binaryPath: e.target.value })}
                      placeholder={`${provider.kind} (auto-detect)`}
                      spellCheck={false}
                    />
                  </DetailField>
                  {provider.kind === "codex" && (
                    <>
                      <DetailField
                        label="CODEX_HOME"
                        htmlFor={`home-${provider.id}`}
                        hint="Leave empty to reuse your existing Codex login."
                      >
                        <Input
                          id={`home-${provider.id}`}
                          value={values.codexHome ?? ""}
                          onChange={(e) =>
                            update({ codexHome: e.target.value })
                          }
                          placeholder="~/.codex"
                          spellCheck={false}
                        />
                      </DetailField>
                      {state?.homePath && (
                        <p className="break-all text-metadata text-muted">
                          Resolved home: {state.homePath}
                        </p>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <DetailField
                    label="Key storage"
                    htmlFor={`storage-${provider.id}`}
                    hint={data.keyring.message}
                  >
                    <ChoiceSelect
                      id={`storage-${provider.id}`}
                      label="API key storage"
                      value={values.storage ?? "keyring"}
                      onChange={(value) =>
                        update({ storage: value as "keyring" | "session" })
                      }
                      options={[
                        { id: "keyring", label: "System credential store" },
                        { id: "session", label: "This session only" },
                      ]}
                    />
                  </DetailField>
                  {provider.hasKey && (
                    <label className="flex items-center gap-2 text-supporting">
                      <input
                        type="checkbox"
                        checked={values.removeKey ?? false}
                        onChange={(e) =>
                          update({
                            removeKey: e.target.checked,
                            apiKey: undefined,
                          })
                        }
                      />
                      Remove saved API key
                    </label>
                  )}
                </>
              )}
            </div>
          </details>
        </fieldset>
        {dirty && (
          <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            <span className="mr-auto text-supporting text-muted">
              Unsaved changes
            </span>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                save.reset();
              }}
            >
              Discard
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {save.isPending && (
                <LoaderCircle size={14} className="animate-spin" />
              )}
              Save changes
            </Button>
          </div>
        )}
        {save.isSuccess && !dirty && (
          <p role="status" className="mt-4 text-supporting text-muted">
            Changes saved.
          </p>
        )}
      </form>
    </section>
  );
}

function DetailField({
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
    <div className="mt-4 min-w-0">
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
