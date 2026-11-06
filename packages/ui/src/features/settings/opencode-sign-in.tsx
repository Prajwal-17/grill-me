import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, LoaderCircle } from "lucide-react";
import type { ProviderConnection, SavedProvider } from "@repo/contracts";
import { Button } from "@/shared/components/ui/button";
import { ChoiceSelect } from "@/shared/components/ui/choice-select";
import { Input } from "@/shared/components/ui/input";
import { apiRequest } from "@/shared/lib/api-client";
import { SettingsFeedback } from "./settings-layout";
import { providerHealthKey } from "./provider-health";

type SignInInput = {
  providerId: string;
  methodIndex: number;
  key?: string;
  code?: string;
  complete?: boolean;
};

/**
 * OpenCode owns the accounts behind its catalog. Grill Me only asks OpenCode to
 * start or finish an account sign-in, then refreshes the model list.
 */
export function OpenCodeSignIn({
  provider,
  status,
  disabled,
}: {
  provider: SavedProvider;
  status?: ProviderConnection;
  disabled: boolean;
}) {
  const queries = useQueryClient();
  const [account, setAccount] = useState("");
  const [method, setMethod] = useState("");
  const [secret, setSecret] = useState("");
  const [editing, setEditing] = useState(false);
  const accountProvider =
    status?.authMethods?.find((entry) => entry.providerId === account) ??
    status?.authMethods?.[0];
  const authMethod =
    accountProvider?.methods.find((entry) => entry.index === Number(method)) ??
    accountProvider?.methods[0];
  const login = useMutation({
    mutationFn: (input: SignInInput) =>
      apiRequest<ProviderConnection>(
        `/settings/providers/${provider.id}/login`,
        { method: "POST", body: JSON.stringify(input) },
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
      setSecret("");
      if (value.connected) setEditing(false);
    },
  });
  const busy = disabled || login.isPending;

  if (!status?.installed) return null;
  if (status.login) {
    return (
      <div className="mt-3 space-y-3 rounded-lg border border-line bg-canvas/40 p-3">
        <p className="text-supporting text-muted">
          {status.login.instructions ??
            "Complete sign-in in your browser, then return here."}
        </p>
        {status.login.url && (
          <Button asChild size="sm">
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
              onChange={(event) => setSecret(event.target.value)}
            />
          </label>
        )}
        <Button
          variant="primary"
          disabled={
            busy || (status.login.method === "code" && secret.trim().length < 1)
          }
          onClick={() =>
            login.mutate({
              providerId: status.login!.providerId!,
              methodIndex: status.login!.methodIndex ?? 0,
              complete: true,
              ...(status.login!.method === "code" ? { code: secret } : {}),
            })
          }
        >
          {login.isPending && (
            <LoaderCircle size={14} className="animate-spin" />
          )}
          Finish sign in
        </Button>
        <SettingsFeedback error={login.error} />
      </div>
    );
  }

  if (!status.authMethods?.length) return null;
  if (status.connected && !editing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="mt-3 -ml-2"
        disabled={busy}
        onClick={() => setEditing(true)}
      >
        Connect another account
      </Button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-line bg-canvas/40 p-3">
      <p className="text-supporting text-muted">
        Sign in through OpenCode to add its models to this provider.
      </p>
      <ChoiceSelect
        label={`Account for ${provider.name}`}
        value={accountProvider?.providerId ?? ""}
        disabled={busy}
        onChange={(value) => {
          const next = status.authMethods!.find(
            (entry) => entry.providerId === value,
          );
          setAccount(value);
          setMethod(String(next?.methods[0]?.index ?? 0));
          setSecret("");
        }}
        options={status.authMethods.map((entry) => ({
          id: entry.providerId,
          label: entry.name,
        }))}
      />
      {accountProvider && (
        <ChoiceSelect
          label={`Sign-in method for ${accountProvider.name}`}
          value={String(authMethod?.index ?? 0)}
          disabled={busy}
          onChange={(value) => {
            setMethod(value);
            setSecret("");
          }}
          options={accountProvider.methods.map((entry) => ({
            id: String(entry.index),
            label: entry.label,
          }))}
        />
      )}
      {authMethod?.type === "api" && (
        <label className="grid gap-1.5 text-ui">
          Account API key
          <Input
            type="password"
            aria-label="Account API key"
            value={secret}
            autoComplete="new-password"
            onChange={(event) => setSecret(event.target.value)}
          />
          <span className="text-supporting text-muted">
            Managed by OpenCode for this Grill Me installation.
          </span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={
            busy ||
            !authMethod ||
            (authMethod.type === "api" && secret.trim().length < 1)
          }
          onClick={() => {
            if (!accountProvider || !authMethod) return;
            login.mutate({
              providerId: accountProvider.providerId,
              methodIndex: authMethod.index,
              ...(authMethod.type === "api" ? { key: secret } : {}),
            });
          }}
        >
          {login.isPending && (
            <LoaderCircle size={14} className="animate-spin" />
          )}
          Sign in
        </Button>
        {editing && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setSecret("");
            }}
          >
            Cancel
          </Button>
        )}
      </div>
      <SettingsFeedback error={login.error} />
    </div>
  );
}
