import {
  useSyncExternalStore,
  useState,
  useId,
  cloneElement,
  isValidElement,
  type ReactElement,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  LoaderCircle,
  Plus,
  Settings2,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  LocalSettings,
  ProviderInput,
  RuntimeSettings,
  WindowSettings,
} from "@repo/contracts";
import { AppShell } from "@/shared/components/layout/app-shell";
import { BrandLockup } from "@/shared/components/brand";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { ChoiceSelect } from "@/shared/components/ui/choice-select";
import { ThemeSelect } from "@/shared/components/theme-provider";
import { useAppStore } from "@/shared/stores/app-store";
import { apiRequest } from "@/shared/lib/api-client";
import { localTransport, localClient } from "@/shared/lib/local-client";
const settingsKey = ["local-settings"];
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line py-7 last:border-0">
      <h2 className="text-ui font-semibold">{title}</h2>
      {description && (
        <p className="mt-1 text-supporting leading-6 text-muted">
          {description}
        </p>
      )}
      <div className="mt-5 grid gap-5">{children}</div>
    </section>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <label className="grid min-w-0 gap-2 text-ui font-medium">
      <span id={id}>{label}</span>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              "aria-labelledby"?: string;
              "aria-describedby"?: string;
            }>,
            {
              "aria-labelledby": id,
              "aria-describedby": hint ? id + "-hint" : undefined,
            },
          )
        : children}
      {hint && (
        <span
          id={id + "-hint"}
          className="text-supporting font-normal leading-5 text-muted"
        >
          {hint}
        </span>
      )}
    </label>
  );
}
export function SettingsPage() {
  const profile = useAppStore((s) => s.profile);
  const content = localTransport ? (
    <LocalSettingsPanel />
  ) : (
    <p className="p-6 text-ui text-muted">
      Application settings are available in the desktop app and local
      development server.
    </p>
  );
  if (profile)
    return (
      <AppShell profile={profile} title="Settings">
        {content}
      </AppShell>
    );
  return (
    <main className="min-h-dvh bg-canvas">
      <header className="flex min-h-[52px] items-center gap-5 border-b border-line px-5">
        <Link to="/" aria-label="Back to profile">
          <ArrowLeft size={17} />
        </Link>
        <BrandLockup markClassName="size-7" wordmarkClassName="text-ui" />
      </header>
      {content}
    </main>
  );
}
function LocalSettingsPanel() {
  const queries = useQueryClient();
  const settings = useQuery({
    queryKey: settingsKey,
    queryFn: () => apiRequest<LocalSettings>("/settings"),
    staleTime: 30000,
    retry: false,
  });
  const bridge = window.desktopBridge;
  const windowState = useQuery({
    queryKey: ["desktop-window"],
    queryFn: () => bridge!.getWindowState(),
    enabled: Boolean(bridge),
    staleTime: Infinity,
  });
  const [editor, setEditor] = useState<ProviderInput | null>(null);
  const [runtimeDraft, setRuntime] = useState<RuntimeSettings | null>(null);
  const runtime = runtimeDraft ?? settings.data?.runtime;
  const connection = localClient();
  const connected = useSyncExternalStore(
    (listener) => connection.onStatus(listener),
    () => connection.isConnected,
  );
  const [notice, setNotice] = useState("");
  const save = useMutation({
    mutationFn: async (input: {
      path: string;
      method?: string;
      body?: unknown;
      success: string;
    }) => {
      const next = await apiRequest<LocalSettings>(input.path, {
        method: input.method ?? "POST",
        ...(input.body !== undefined
          ? { body: JSON.stringify(input.body) }
          : {}),
      });
      return { next, success: input.success };
    },
    onSuccess: ({ next, success }) => {
      queries.setQueryData(settingsKey, next);
      setNotice(success);
      if (success === "Provider saved.") setEditor(null);
    },
  });
  const test = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ ok: boolean; message: string }>(
        `/settings/providers/${id}/test`,
        { method: "POST" },
      ),
    onSuccess: (result) => setNotice(result.message),
  });
  const native = useMutation({
    mutationFn: (input: Partial<WindowSettings>) =>
      bridge!.setWindowSettings(input),
    onSuccess: (value) => {
      queries.setQueryData(["desktop-window"], value);
    },
  });
  const busy = save.isPending || test.isPending;
  const data = settings.data;
  const newProvider = () => {
    setNotice("");
    setEditor({
      id: crypto.randomUUID(),
      name: "",
      endpoint: "http://127.0.0.1:20128/v1",
      model: "auto",
      storage: data?.keyring.available ? "keyring" : "session",
    });
  };
  function submitProvider(event: FormEvent) {
    event.preventDefault();
    if (editor)
      save.mutate({
        path: "/settings/providers",
        body: editor,
        success: "Provider saved.",
      });
  }
  const error = settings.error ?? save.error ?? test.error ?? native.error;
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-12 sm:px-8">
      <div className="flex items-center gap-3 border-b border-line py-6">
        <Settings2 size={19} className="text-muted" />
        <h1 className="text-section font-semibold tracking-[-0.02em]">
          Application settings
        </h1>
      </div>
      {error && (
        <p role="alert" className="mt-5 text-ui leading-6 text-destructive">
          {error.message}{" "}
          <Button
            variant="ghost"
            onClick={() => {
              save.reset();
              test.reset();
              native.reset();
              void settings.refetch();
            }}
          >
            Try again
          </Button>
        </p>
      )}
      {notice && (
        <p role="status" className="mt-5 text-ui leading-6">
          {notice}
        </p>
      )}
      {settings.isPending && (
        <p className="flex items-center gap-2 py-7 text-ui text-muted">
          <LoaderCircle size={16} className="animate-spin" />
          Loading settings…
        </p>
      )}
      <Section title="Appearance">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="text-ui">Theme</span>
          <div className="w-40">
            <ThemeSelect />
          </div>
        </div>
        {bridge && windowState.data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="text-ui">Application zoom</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="icon-sm"
                  aria-label="Zoom out"
                  disabled={windowState.data.zoom <= 0.5}
                  onClick={() =>
                    void bridge
                      .zoom("out")
                      .then((v) => queries.setQueryData(["desktop-window"], v))
                  }
                >
                  <ZoomOut size={16} />
                </Button>
                <output className="min-w-12 text-center text-ui tabular-nums">
                  {Math.round(windowState.data.zoom * 100)}%
                </output>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  aria-label="Zoom in"
                  disabled={windowState.data.zoom >= 2}
                  onClick={() =>
                    void bridge
                      .zoom("in")
                      .then((v) => queries.setQueryData(["desktop-window"], v))
                  }
                >
                  <ZoomIn size={16} />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    void bridge
                      .zoom("reset")
                      .then((v) => queries.setQueryData(["desktop-window"], v))
                  }
                >
                  Reset
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="text-ui">Open application in</span>
              <div className="w-48">
                <ChoiceSelect
                  label="Startup window mode"
                  value={windowState.data.startup}
                  onChange={(startup) =>
                    native.mutate({
                      startup: startup as WindowSettings["startup"],
                    })
                  }
                  options={[
                    { id: "fullscreen", label: "Fullscreen" },
                    { id: "maximized", label: "Maximized" },
                    { id: "windowed", label: "Windowed" },
                  ]}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="text-supporting text-muted">
                Ctrl + / − to zoom · Ctrl 0 to reset · F11 for fullscreen
              </span>
              <Button
                variant="secondary"
                onClick={() =>
                  void bridge
                    .toggleFullscreen()
                    .then((v) => queries.setQueryData(["desktop-window"], v))
                }
              >
                Toggle fullscreen
              </Button>
            </div>
          </>
        )}
      </Section>
      {data && (
        <>
          <Section
            title="AI providers"
            description="Save OpenAI-compatible endpoints and choose the provider used for new requests."
          >
            <p className="text-supporting leading-6 text-muted">
              {data.keyring.message}
            </p>
            {data.migration.pending && (
              <div className="grid gap-3 rounded-lg border border-line p-4">
                <p className="text-ui">{data.migration.message}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={busy || !data.keyring.available}
                    onClick={() =>
                      save.mutate({
                        path: "/settings/import",
                        body: { storage: "keyring" },
                        success: "Existing settings imported.",
                      })
                    }
                  >
                    Import to keyring
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      save.mutate({
                        path: "/settings/import",
                        body: { storage: "session" },
                        success: "Settings imported for this session.",
                      })
                    }
                  >
                    Use for this session
                  </Button>
                </div>
              </div>
            )}
            {!data.providers.length && !editor && (
              <p className="text-ui text-muted">No providers configured.</p>
            )}
            <ul className="divide-y divide-line">
              {data.providers.map((provider) => (
                <li
                  key={provider.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-ui font-medium">
                      <span className="truncate">{provider.name}</span>
                      {data.activeProviderId === provider.id && (
                        <span className="flex shrink-0 items-center gap-1 text-supporting font-normal text-success">
                          <Check size={13} />
                          Active
                        </span>
                      )}
                    </div>
                    <p className="mt-1 break-all text-supporting text-muted">
                      {provider.endpoint} · {provider.model}
                    </p>
                    <p className="mt-1 text-supporting text-muted">
                      {provider.hasKey
                        ? provider.storage === "keyring"
                          ? "Key saved in keyring"
                          : "Key available for this session"
                        : "No key available"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {data.activeProviderId !== provider.id && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          save.mutate({
                            path: "/settings/active-provider",
                            body: { id: provider.id },
                            success: "Active provider updated.",
                          })
                        }
                      >
                        Use provider
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => test.mutate(provider.id)}
                    >
                      Test connection
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setNotice("");
                        setEditor({ ...provider });
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${provider.name}`}
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete provider “${provider.name}” and its saved key?`,
                          )
                        )
                          save.mutate({
                            path: `/settings/providers/${provider.id}`,
                            method: "DELETE",
                            success: "Provider deleted.",
                          });
                      }}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {!editor ? (
              <div>
                <Button variant="secondary" onClick={newProvider}>
                  <Plus size={15} />
                  Add provider
                </Button>
              </div>
            ) : (
              <form
                onSubmit={submitProvider}
                className="grid gap-5 rounded-xl border border-line bg-surface p-5"
              >
                <h3 className="text-ui font-semibold">
                  {data.providers.some((p) => p.id === editor.id)
                    ? "Edit provider"
                    : "Add provider"}
                </h3>
                <Field label="Provider name">
                  <Input
                    required
                    maxLength={80}
                    value={editor.name}
                    onChange={(e) =>
                      setEditor({ ...editor, name: e.target.value })
                    }
                    placeholder="Local provider"
                  />
                </Field>
                <Field label="API endpoint">
                  <Input
                    required
                    type="url"
                    maxLength={2048}
                    value={editor.endpoint}
                    onChange={(e) =>
                      setEditor({ ...editor, endpoint: e.target.value })
                    }
                  />
                </Field>
                <Field label="Model">
                  <Input
                    required
                    maxLength={160}
                    value={editor.model}
                    onChange={(e) =>
                      setEditor({ ...editor, model: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="API key"
                  hint={
                    data.providers.find((p) => p.id === editor.id)?.hasKey
                      ? "Leave empty to keep the saved key. Enter a value to replace it."
                      : "Optional for providers that accept requests without a key."
                  }
                >
                  <Input
                    type="password"
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
                    placeholder="Enter API key"
                  />
                </Field>
                <Field label="Key storage">
                  <ChoiceSelect
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
                </Field>
                {data.providers.find((p) => p.id === editor.id)?.hasKey && (
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
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="primary" disabled={busy}>
                    {save.isPending && (
                      <LoaderCircle size={15} className="animate-spin" />
                    )}
                    Save provider
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setEditor(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </Section>
          {runtime && (
            <Section title="Local runtime">
              <form
                className="grid gap-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate({
                    path: "/settings/runtime",
                    body: runtime,
                    success: "Runtime settings saved.",
                  });
                }}
              >
                <Field
                  label="Codex executable"
                  hint="Leave empty to find Codex in PATH."
                >
                  <Input
                    value={runtime.codexBin}
                    onChange={(e) =>
                      setRuntime({ ...runtime, codexBin: e.target.value })
                    }
                    placeholder="/absolute/path/to/codex"
                  />
                </Field>
                <Field label="Codex model">
                  <Input
                    value={runtime.codexModel}
                    onChange={(e) =>
                      setRuntime({ ...runtime, codexModel: e.target.value })
                    }
                    placeholder="Default model"
                  />
                </Field>
                <Field label="Projects folder">
                  <Input
                    value={runtime.projectsRoot}
                    onChange={(e) =>
                      setRuntime({ ...runtime, projectsRoot: e.target.value })
                    }
                    placeholder="/absolute/path/to/projects"
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Review context tokens">
                    <Input
                      type="number"
                      min={1024}
                      max={1000000}
                      required
                      value={runtime.contextTokens}
                      onChange={(e) =>
                        setRuntime({
                          ...runtime,
                          contextTokens: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Review timeout (seconds)">
                    <Input
                      type="number"
                      min={1}
                      max={3600}
                      required
                      value={runtime.judgeTimeoutMs / 1000}
                      onChange={(e) =>
                        setRuntime({
                          ...runtime,
                          judgeTimeoutMs: Number(e.target.value) * 1000,
                        })
                      }
                    />
                  </Field>
                </div>
                <div>
                  <Button variant="secondary" type="submit" disabled={busy}>
                    Save runtime settings
                  </Button>
                </div>
              </form>
            </Section>
          )}
          <Section title="Data and connection">
            <p className="text-ui">
              {connected
                ? "Local backend connected · SQLite"
                : "Reconnecting to local backend…"}
            </p>
            {bridge && (
              <div>
                <Button
                  variant="secondary"
                  onClick={() => void bridge.openDataFolder()}
                >
                  Open data folder
                </Button>
              </div>
            )}
            <p className="text-supporting leading-6 text-muted">
              Provider settings belong to this local installation. Profile
              learning preferences remain under Preferences.
            </p>
          </Section>
        </>
      )}
    </div>
  );
}
