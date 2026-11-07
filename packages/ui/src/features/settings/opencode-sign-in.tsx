import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Eye, EyeOff, LoaderCircle } from "lucide-react";
import type { ProviderConnection, SavedProvider } from "@repo/contracts";
import { Button } from "@/shared/components/ui/button";
import { ChoiceSelect } from "@/shared/components/ui/choice-select";
import { Input } from "@/shared/components/ui/input";
import { SearchSelect } from "@/shared/components/ui/search-select";
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
  editing,
  onDone,
}: {
  provider: SavedProvider;
  status?: ProviderConnection;
  disabled: boolean;
  editing: boolean;
  onDone: () => void;
}) {
  const queries = useQueryClient();
  const [account, setAccount] = useState("");
  const [method, setMethod] = useState("");
  const [secret, setSecret] = useState("");
  const [showKey, setShowKey] = useState(false);
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
      setShowKey(false);
      if (value.connected) onDone();
    },
  });
  const busy = disabled || login.isPending;

  if (!status?.installed) return null;
  if (status.login) {
    return (
      <div className="mt-4 rounded-lg border border-line bg-canvas/40 p-4">
        <p className="text-ui font-medium">Finish OpenCode sign-in</p>
        <p className="mt-1 text-supporting text-muted">
          {status.login.instructions ??
            "Complete sign-in in your browser, then return here."}
        </p>
        {status.login.url && (
          <Button asChild size="sm" className="mt-3">
            <a href={status.login.url} target="_blank" rel="noreferrer">
              Open sign-in page
              <ExternalLink size={14} />
            </a>
          </Button>
        )}
        {status.login.method === "code" && (
          <label className="mt-3 grid gap-1.5 text-supporting font-medium">
            Authorization code
            <Input
              value={secret}
              autoComplete="off"
              onChange={(event) => setSecret(event.target.value)}
            />
          </label>
        )}
        <div className="mt-3">
          <Button
            variant="primary"
            disabled={
              busy ||
              (status.login.method === "code" && secret.trim().length < 1)
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
        </div>
        <SettingsFeedback error={login.error} />
      </div>
    );
  }

  if (!status.authMethods?.length) return null;
  if (status.connected && !editing) return null;

  return (
    <div className="mt-4 rounded-lg border border-line bg-canvas/40 p-4">
      <div>
        <p className="text-ui font-medium">Add an OpenCode account</p>
        <p className="mt-1 text-supporting text-muted">
          Sign in through OpenCode to use its models.
        </p>
      </div>
      <div className="mt-4 grid gap-4 @min-[520px]:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <label
            htmlFor="opencode-account"
            className="block text-supporting font-medium"
          >
            Provider
          </label>
          <SearchSelect
            id="opencode-account"
            label={`Provider for ${provider.name}`}
            value={accountProvider?.providerId ?? ""}
            disabled={busy}
            placeholder="Choose a provider"
            searchPlaceholder="Search providers…"
            emptyMessage="No providers found."
            onChange={(value) => {
              const next = status.authMethods!.find(
                (entry) => entry.providerId === value,
              );
              setAccount(value);
              setMethod(String(next?.methods[0]?.index ?? 0));
              setSecret("");
              setShowKey(false);
            }}
            options={status.authMethods.map((entry) => ({
              id: entry.providerId,
              label: entry.name,
            }))}
          />
        </div>
        {accountProvider && (
          <div className="min-w-0 space-y-1.5">
            <label
              htmlFor="opencode-method"
              className="block text-supporting font-medium"
            >
              Method
            </label>
            <ChoiceSelect
              id="opencode-method"
              label={`Sign-in method for ${accountProvider.name}`}
              value={String(authMethod?.index ?? 0)}
              disabled={busy}
              onChange={(value) => {
                setMethod(value);
                setSecret("");
                setShowKey(false);
              }}
              options={accountProvider.methods.map((entry) => ({
                id: String(entry.index),
                label: entry.label,
              }))}
            />
          </div>
        )}
      </div>
      {authMethod?.type === "api" && (
        <div className="mt-4">
          <label
            htmlFor="opencode-api-key"
            className="mb-1.5 block text-supporting font-medium"
          >
            Account API key
          </label>
          <div className="relative">
            <Input
              id="opencode-api-key"
              type={showKey ? "text" : "password"}
              value={secret}
              autoComplete="new-password"
              className="pr-10"
              onChange={(event) => setSecret(event.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              aria-label={showKey ? "Hide API key" : "Show API key"}
              aria-pressed={showKey}
              disabled={busy}
              onClick={() => setShowKey((value) => !value)}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </Button>
          </div>
          <p className="mt-1.5 text-supporting text-muted">
            Managed by OpenCode.
          </p>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
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
              onDone();
              setSecret("");
              setShowKey(false);
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
