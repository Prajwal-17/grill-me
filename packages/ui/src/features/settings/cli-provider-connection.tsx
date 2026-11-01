import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import type { ProviderConnection, SavedProvider } from "@repo/contracts";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { ChoiceSelect } from "@/shared/components/ui/choice-select";
import { Input } from "@/shared/components/ui/input";
import { SettingsFeedback } from "./settings-layout";
import { settingsKey } from "./use-settings-mutation";
import {
  ProviderModelControls,
  type ModelChange,
} from "./provider-model-controls";
import { providerHealthKey } from "./provider-health";
export function CliProviderConnection({
  provider,
  onModelChange,
  disabled,
}: {
  provider: SavedProvider;
  onModelChange: ModelChange;
  disabled: boolean;
}) {
  const queries = useQueryClient();
  const key = ["provider-connection", provider.id, provider.binaryPath];
  const connection = useQuery({
    queryKey: key,
    queryFn: () =>
      apiRequest<ProviderConnection>(
        `/settings/providers/${provider.id}/connection`,
      ),
    staleTime: 15000,
    retry: false,
    refetchInterval: (query) => (query.state.data?.login ? 2000 : false),
  });
  const [accountOpen, setAccountOpen] = useState(false);
  const [account, setAccount] = useState("");
  const [method, setMethod] = useState("0");
  const [secret, setSecret] = useState("");
  const status = connection.data;
  const accountProvider =
    status?.authMethods?.find((p) => p.providerId === account) ??
    status?.authMethods?.[0];
  const authMethod =
    accountProvider?.methods.find((m) => m.index === Number(method)) ??
    accountProvider?.methods[0];
  const connect = useMutation({
    mutationFn: () =>
      apiRequest<ProviderConnection>(
        `/settings/providers/${provider.id}/connect`,
        { method: "POST", body: "{}" },
      ),
    onSuccess: (value) => {
      queries.setQueryData(key, value);
      void queries.invalidateQueries({ queryKey: providerHealthKey });
    },
  });
  const login = useMutation({
    mutationFn: (complete: boolean) =>
      apiRequest<ProviderConnection>(
        `/settings/providers/${provider.id}/login`,
        {
          method: "POST",
          body: JSON.stringify(
            provider.kind === "codex"
              ? {}
              : {
                  providerId:
                    status?.login?.providerId ?? accountProvider?.providerId,
                  methodIndex: status?.login?.methodIndex ?? authMethod?.index,
                  ...(complete
                    ? { complete: true, code: secret }
                    : { key: secret }),
                },
          ),
        },
      ),
    onSuccess: (value) => {
      setSecret("");
      if (value.connected) setAccountOpen(false);
      queries.setQueryData(key, value);
      void queries.invalidateQueries({ queryKey: providerHealthKey });
    },
  });
  const disconnect = useMutation({
    mutationFn: () =>
      apiRequest(`/settings/providers/${provider.id}/disconnect`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: (value) => {
      queries.setQueryData(settingsKey, value);
      void queries.invalidateQueries({ queryKey: providerHealthKey });
      queries.setQueryData(key, {
        ...status,
        connected: false,
        authenticated: false,
        code: "PROVIDER_DISCONNECTED",
        login: undefined,
        models: [],
        message: "Disconnected. Connect again when ready.",
      });
    },
  });
  const busy =
    disabled ||
    connection.isFetching ||
    connect.isPending ||
    login.isPending ||
    disconnect.isPending;
  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          role={status?.code ? "alert" : "status"}
          className={`min-w-0 text-supporting ${status?.code ? "text-destructive" : "text-muted"}`}
        >
          {connection.isPending ? "Checking CLI connection…" : status?.message}
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            status?.connected ? void connection.refetch() : connect.mutate()
          }
        >
          {connection.isFetching || connect.isPending ? (
            <LoaderCircle size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          {status?.connected ? "Refresh" : "Connect"}
        </Button>
      </div>
      {(connection.error ||
        connect.error ||
        login.error ||
        disconnect.error) && (
        <div className="mt-3">
          <SettingsFeedback
            error={
              connection.error ??
              connect.error ??
              login.error ??
              disconnect.error
            }
          />
        </div>
      )}
      {status?.version && (
        <p className="mt-1 break-all text-metadata text-muted">
          {status.version} · {status.binaryPath}
        </p>
      )}
      {status?.connected &&
        provider.model !== "auto" &&
        !status.models.some((m) => m.id === provider.model) && (
          <p role="alert" className="mt-2 text-supporting text-destructive">
            The saved model is unavailable. Choose another model.
          </p>
        )}
      {status?.connected && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => disconnect.mutate()}
          >
            Disconnect
          </Button>
        </div>
      )}
      {status?.connected && (
        <ProviderModelControls
          provider={provider}
          models={status.models}
          disabled={busy}
          onChange={onModelChange}
        />
      )}
      {provider.kind === "opencode" && status?.connected && !accountOpen && (
        <Button
          variant="ghost"
          className="mt-2"
          onClick={() => setAccountOpen(true)}
        >
          Connect account
        </Button>
      )}
      {status?.installed &&
        status.code !== "PROVIDER_DISCONNECTED" &&
        (!status.code ||
          [
            "PROVIDER_AUTH_REQUIRED",
            "PROVIDER_LOGIN_FAILED",
            "PROVIDER_LOGIN_EXPIRED",
          ].includes(status.code)) &&
        (!status.authenticated || accountOpen) &&
        !status.login && (
          <div className="mt-3 space-y-3">
            {provider.kind === "opencode" && accountProvider && (
              <>
                <ChoiceSelect
                  label={`Account for ${provider.name}`}
                  value={accountProvider.providerId}
                  onChange={(value) => {
                    setAccount(value);
                    setMethod("0");
                    setSecret("");
                  }}
                  options={status.authMethods!.map((p) => ({
                    id: p.providerId,
                    label: p.name,
                  }))}
                />
                <ChoiceSelect
                  label={`Sign-in method for ${provider.name}`}
                  value={String(authMethod?.index ?? 0)}
                  onChange={(value) => {
                    setMethod(value);
                    setSecret("");
                  }}
                  options={accountProvider.methods.map((m) => ({
                    id: String(m.index),
                    label: m.label,
                  }))}
                />
                {authMethod?.type === "api" && (
                  <label className="grid gap-1.5 text-ui">
                    Account API key
                    <Input
                      type="password"
                      aria-label="Account API key"
                      value={secret}
                      autoComplete="new-password"
                      onChange={(e) => setSecret(e.target.value)}
                    />
                    <span className="text-supporting text-muted">
                      Managed by OpenCode for this Grill Me installation.
                    </span>
                  </label>
                )}
              </>
            )}
            <Button
              disabled={
                busy ||
                (provider.kind === "opencode" &&
                  (!authMethod || (authMethod.type === "api" && !secret)))
              }
              onClick={() => login.mutate(false)}
            >
              {login.isPending && (
                <LoaderCircle size={14} className="animate-spin" />
              )}
              Sign in
            </Button>
          </div>
        )}
      {status?.login && (
        <div className="mt-3 space-y-3">
          <p className="text-supporting text-muted">
            {status.login.instructions}
          </p>
          {status.login.url && (
            <Button asChild>
              <a href={status.login.url} target="_blank" rel="noreferrer">
                Open sign-in page
                <ExternalLink size={14} />
              </a>
            </Button>
          )}
          {status.login.method === "code" && (
            <label className="grid gap-1.5 text-ui">
              Authorization code
              <Input
                value={secret}
                autoComplete="off"
                onChange={(e) => setSecret(e.target.value)}
              />
            </label>
          )}
          {provider.kind === "opencode" && (
            <Button
              disabled={busy || (status.login.method === "code" && !secret)}
              onClick={() => login.mutate(true)}
            >
              {login.isPending && (
                <LoaderCircle size={14} className="animate-spin" />
              )}
              Finish sign in
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
