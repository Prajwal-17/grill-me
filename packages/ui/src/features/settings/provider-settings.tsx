import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  providerInputSchema,
  type LocalSettings,
  type ProviderInput,
  type SavedProvider,
} from "@repo/contracts";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { ChoiceSelect } from "@/shared/components/ui/choice-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { apiRequest } from "@/shared/lib/api-client";
import { SettingsFeedback, SettingsHeading } from "./settings-layout";
import { useSettingsMutation } from "./use-settings-mutation";
import { CliProviderConnection } from "./cli-provider-connection";

export function ProviderSettings({ data }: { data: LocalSettings }) {
  const [editor, setEditor] = useState<ProviderInput | null>(null);
  const [deleting, setDeleting] = useState<SavedProvider | null>(null);
  const [notice, setNotice] = useState("");
  const [validation, setValidation] = useState<Error | null>(null);
  const [visibleKey, setVisibleKey] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const save = useSettingsMutation(() => {
    setEditor(null);
    setDeleting(null);
    setValidation(null);
    setVisibleKey(false);
    setNotice("Provider settings saved.");
    requestAnimationFrame(() => addButton.current?.focus());
  });
  const migration = useSettingsMutation(() =>
    setNotice("Existing provider settings imported."),
  );
  const test = useMutation({
    mutationFn: async (id: string) => ({
      id,
      ...(await apiRequest<{ ok: boolean; message: string }>(
        `/settings/providers/${id}/test`,
        { method: "POST" },
      )),
    }),
  });
  const busy = save.isPending || test.isPending || migration.isPending;
  const existing = data.providers.find((p) => p.id === editor?.id);
  function edit(provider?: SavedProvider) {
    save.reset();
    test.reset();
    setNotice("");
    setValidation(null);
    setVisibleKey(false);
    setEditor(
      provider
        ? { ...provider }
        : {
            id: crypto.randomUUID(),
            name: "",
            kind: "codex",
            binaryPath: "",
            endpoint: "http://127.0.0.1:20128/v1",
            model: "auto",
            storage: data.keyring.available ? "keyring" : "session",
          },
    );
  }
  function cancel() {
    setEditor(null);
    setVisibleKey(false);
    setValidation(null);
    save.reset();
    requestAnimationFrame(() => addButton.current?.focus());
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const result = providerInputSchema.safeParse(editor);
    if (!result.success) {
      setValidation(
        new Error(
          result.error.issues[0]?.message ?? "Check the provider settings.",
        ),
      );
      return;
    }
    setNotice("");
    setValidation(null);
    test.reset();
    save.mutate({ path: "/settings/providers", body: result.data });
  }
  return (
    <>
      <div hidden={Boolean(editor)}>
        <SettingsHeading
          title="AI providers"
          description="Connect your installed Codex or OpenCode CLI, or use an API provider."
          action={
            <Button
              ref={addButton}
              variant="primary"
              disabled={busy}
              onClick={() => edit()}
            >
              <Plus size={15} />
              Add provider
            </Button>
          }
        />
      </div>
      {editor && (
        <>
          <Button
            variant="ghost"
            className="mb-4 -ml-2"
            disabled={busy}
            onClick={cancel}
          >
            <ArrowLeft size={15} />
            Back to providers
          </Button>
          <SettingsHeading
            title={existing ? "Edit provider" : "Add provider"}
            description="Choose a connection and configure its model. CLI sign-in is available after saving."
          />
        </>
      )}
      <SettingsFeedback
        error={validation ?? save.error ?? migration.error ?? test.error}
        message={notice}
      />
      {editor ? (
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <ProviderField label="Connection type" htmlFor="provider-kind">
              <ChoiceSelect
                id="provider-kind"
                label="Connection type"
                value={editor.kind ?? "openai"}
                disabled={Boolean(existing)}
                onChange={(kind) =>
                  setEditor({
                    ...editor,
                    kind: kind as "codex" | "opencode" | "openai",
                    apiKey: undefined,
                    removeKey: false,
                    model: "auto",
                  })
                }
                options={[
                  { id: "codex", label: "Codex CLI" },
                  { id: "opencode", label: "OpenCode CLI" },
                  { id: "openai", label: "OpenAI-compatible API" },
                ]}
              />
            </ProviderField>
            <ProviderField label="Provider name" htmlFor="provider-name">
              <Input
                id="provider-name"
                autoFocus
                required
                maxLength={80}
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                placeholder="e.g. Local model server"
              />
            </ProviderField>
            {editor.kind !== "openai" && editor.kind !== undefined && (
              <ProviderField
                label="CLI executable"
                htmlFor="provider-binary"
                hint="Leave empty to detect the CLI installed on your machine."
              >
                <Input
                  id="provider-binary"
                  aria-describedby="provider-binary-hint"
                  value={editor.binaryPath ?? ""}
                  onChange={(e) =>
                    setEditor({ ...editor, binaryPath: e.target.value })
                  }
                  placeholder={`/absolute/path/to/${editor.kind}`}
                  pattern="(/.*)?"
                  title="Use an absolute executable path."
                  spellCheck={false}
                />
              </ProviderField>
            )}
            {(editor.kind === "openai" || editor.kind === undefined) && (
              <ProviderField
                label="API endpoint"
                htmlFor="provider-endpoint"
                hint="Base URL, including /v1 when required by your provider."
              >
                <Input
                  id="provider-endpoint"
                  aria-describedby="provider-endpoint-hint"
                  required
                  type="url"
                  maxLength={2048}
                  value={editor.endpoint}
                  onChange={(e) =>
                    setEditor({ ...editor, endpoint: e.target.value })
                  }
                  placeholder="https://api.example.com/v1"
                  spellCheck={false}
                />
              </ProviderField>
            )}
            <ProviderField label="Model" htmlFor="provider-model">
              <Input
                id="provider-model"
                required
                maxLength={160}
                value={editor.model}
                onChange={(e) =>
                  setEditor({ ...editor, model: e.target.value })
                }
                placeholder="Model ID"
                spellCheck={false}
              />
            </ProviderField>
            {(editor.kind === "openai" || editor.kind === undefined) && (
              <>
                <ProviderField
                  label="API key"
                  htmlFor="provider-key"
                  hint={
                    existing?.hasKey
                      ? "Leave empty to keep the saved key. Enter a value to replace it."
                      : "Optional for providers that accept requests without a key."
                  }
                >
                  <div className="relative">
                    <Input
                      id="provider-key"
                      aria-describedby="provider-key-hint"
                      type={visibleKey ? "text" : "password"}
                      autoComplete="new-password"
                      maxLength={8192}
                      value={editor.apiKey ?? ""}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          apiKey: e.target.value || undefined,
                          removeKey: false,
                        })
                      }
                      placeholder={
                        existing?.hasKey
                          ? "Saved key unchanged"
                          : "Enter API key"
                      }
                      className="pr-10"
                      spellCheck={false}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={visibleKey ? "Hide API key" : "Show API key"}
                      aria-pressed={visibleKey}
                      onClick={() => setVisibleKey(!visibleKey)}
                      className="absolute right-0.5 top-1/2 -translate-y-1/2"
                    >
                      {visibleKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </Button>
                  </div>
                </ProviderField>
                <ProviderField
                  label="Key storage"
                  htmlFor="provider-storage"
                  hint={
                    editor.storage === "session"
                      ? "Held in memory and cleared when the local backend stops."
                      : data.keyring.message
                  }
                >
                  <ChoiceSelect
                    id="provider-storage"
                    aria-describedby="provider-storage-hint"
                    label="Key storage"
                    value={editor.storage ?? "keyring"}
                    onChange={(storage) =>
                      setEditor({
                        ...editor,
                        storage: storage as "keyring" | "session",
                      })
                    }
                    options={[
                      { id: "keyring", label: "Linux keyring" },
                      { id: "session", label: "Session only" },
                    ]}
                  />
                </ProviderField>
                {existing?.hasKey && (
                  <label className="flex items-center gap-2 text-ui">
                    <input
                      type="checkbox"
                      checked={editor.removeKey ?? false}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          removeKey: e.target.checked,
                          apiKey: undefined,
                        })
                      }
                    />
                    Remove saved key
                  </label>
                )}
              </>
            )}
          </fieldset>
          <div className="mt-6 flex items-center justify-end gap-2 border-t border-line pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={cancel}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {save.isPending && (
                <LoaderCircle size={15} className="animate-spin" />
              )}
              Save provider
            </Button>
          </div>
        </form>
      ) : (
        <>
          {data.providers.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {data.providers.map((provider) => (
                <li key={provider.id} className="min-w-0 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-ui font-semibold">
                          {provider.name}
                        </h3>
                        {provider.id === data.activeProviderId && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-elevated px-2 py-0.5 text-metadata">
                            <Check size={12} />
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-1 break-all text-supporting text-muted">
                        {provider.kind === "openai"
                          ? provider.endpoint
                          : provider.kind === "codex"
                            ? "Codex CLI"
                            : "OpenCode CLI"}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`More options for ${provider.name}`}
                          disabled={busy}
                        >
                          <MoreHorizontal size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => edit(provider)}>
                          Edit provider
                        </DropdownMenuItem>
                        {provider.id !== data.activeProviderId && (
                          <DropdownMenuItem
                            onSelect={() => {
                              setNotice("");
                              save.mutate({
                                path: "/settings/active-provider",
                                body: { id: provider.id },
                              });
                            }}
                          >
                            Use provider
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => {
                            save.reset();
                            setNotice("");
                            setDeleting(provider);
                          }}
                        >
                          <Trash2 size={14} />
                          Delete provider
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-supporting text-muted">
                    <span className="break-all">
                      Model:{" "}
                      <span className="text-foreground">{provider.model}</span>
                    </span>
                    {provider.kind === "openai" && (
                      <span className="inline-flex items-center gap-1.5">
                        <KeyRound size={13} />
                        {provider.hasKey
                          ? provider.storage === "keyring"
                            ? "Key saved in keyring"
                            : "Key available for this session"
                          : "No key available"}
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {provider.kind === "openai" && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => test.mutate(provider.id)}
                      >
                        {test.isPending && test.variables === provider.id && (
                          <LoaderCircle size={14} className="animate-spin" />
                        )}
                        Test connection
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => edit(provider)}
                    >
                      Edit
                    </Button>
                    {provider.id !== data.activeProviderId && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setNotice("");
                          save.mutate({
                            path: "/settings/active-provider",
                            body: { id: provider.id },
                          });
                        }}
                      >
                        Use provider
                      </Button>
                    )}
                  </div>
                  {provider.kind !== "openai" && (
                    <CliProviderConnection
                      provider={provider}
                      onModelChange={(model) => {
                        setNotice("");
                        save.mutate({
                          path: "/settings/providers",
                          body: { ...provider, model },
                        });
                      }}
                    />
                  )}
                  {test.data?.id === provider.id && (
                    <p
                      role={test.data.ok ? "status" : "alert"}
                      className={`mt-3 text-supporting ${test.data.ok ? "text-success" : "text-destructive"}`}
                    >
                      {test.data.message}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-lg border border-dashed border-control-border px-6 py-10 text-center">
              <h3 className="text-ui font-medium">No providers configured</h3>
              <p className="mt-1 text-supporting text-muted">
                Add a provider to choose the model used for new requests.
              </p>
            </div>
          )}
          {(data.providers.some((p) => p.kind === "openai") ||
            data.migration.pending) && (
            <div className="mt-5 flex items-start gap-2 text-supporting text-muted">
              <ShieldCheck size={15} className="mt-0.5 shrink-0" />
              <p>{data.keyring.message}</p>
            </div>
          )}
          {data.migration.pending && (
            <details className="mt-5 rounded-lg border border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-ui font-medium">
                Import existing configuration
                <ChevronDown size={15} className="shrink-0" />
              </summary>
              <div className="border-t border-line p-4">
                <p className="mb-3 text-supporting text-muted">
                  {data.migration.message}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy || !data.keyring.available}
                    onClick={() =>
                      migration.mutate({
                        path: "/settings/import",
                        body: { storage: "keyring" },
                      })
                    }
                  >
                    Import to keyring
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      migration.mutate({
                        path: "/settings/import",
                        body: { storage: "session" },
                      })
                    }
                  >
                    Use for this session
                  </Button>
                </div>
              </div>
            </details>
          )}
        </>
      )}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !save.isPending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete provider?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes “{deleting?.name}” from Grill Me and stops its
              connection. Saved API keys are removed. Local CLI sign-in files
              remain in this installation’s data folder.{" "}
              {deleting?.id === data.activeProviderId
                ? "Choose another active provider before making new requests."
                : "You can add it again later."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <SettingsFeedback error={save.error} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={save.isPending}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={save.isPending}
              onClick={() => {
                if (deleting)
                  save.mutate({
                    path: `/settings/providers/${deleting.id}`,
                    method: "DELETE",
                  });
              }}
            >
              {save.isPending && (
                <LoaderCircle size={14} className="animate-spin" />
              )}
              Delete provider
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
function ProviderField({
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
    <div className="grid min-w-0 gap-2 @min-[600px]:grid-cols-[160px_minmax(0,1fr)] @min-[600px]:gap-x-6">
      <label htmlFor={htmlFor} className="pt-2 text-ui font-medium">
        {label}
      </label>
      <div className="min-w-0">
        {children}
        {hint && (
          <p
            id={`${htmlFor}-hint`}
            className="mt-1.5 text-supporting text-muted"
          >
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
