import { useState, useSyncExternalStore } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { ArrowUpRight, FolderOpen, LoaderCircle } from "lucide-react";
import type { LocalSettings, RuntimeSettings } from "@repo/contracts";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { localClient } from "@/shared/lib/local-client";
import { useAppStore } from "@/shared/stores/app-store";
import {
  SettingsFeedback,
  SettingsGroup,
  SettingsHeading,
  SettingsRow,
} from "./settings-layout";
import { useSettingsMutation } from "./use-settings-mutation";
export function RuntimeSettingsPanel({ data }: { data: LocalSettings }) {
  const [draft, setDraft] = useState<RuntimeSettings | null>(null);
  const save = useSettingsMutation(() => setDraft(null));
  const runtime = draft ?? data.runtime;
  const dirty = Object.keys(data.runtime).some(
    (key) =>
      runtime[key as keyof RuntimeSettings] !==
      data.runtime[key as keyof RuntimeSettings],
  );
  function update(patch: Partial<RuntimeSettings>) {
    save.reset();
    setDraft({ ...runtime, ...patch });
  }
  return (
    <>
      <SettingsHeading
        title="Local runtime"
        description="Configure the tools and folders used for local code reviews."
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ path: "/settings/runtime", body: runtime });
        }}
      >
        <fieldset disabled={save.isPending} className="min-w-0">
          <SettingsGroup title="Codex">
            <SettingsRow
              label="Codex executable"
              htmlFor="codex-bin"
              description="Leave empty to find Codex in PATH."
            >
              <Input
                id="codex-bin"
                maxLength={4096}
                pattern="(/.*)?"
                title="Use an absolute path, or leave empty to find Codex in PATH."
                value={runtime.codexBin}
                onChange={(e) => update({ codexBin: e.target.value })}
                placeholder="/absolute/path/to/codex"
                spellCheck={false}
              />
            </SettingsRow>
            <SettingsRow
              label="Codex model"
              htmlFor="codex-model"
              description="Leave empty to use the default model."
            >
              <Input
                id="codex-model"
                maxLength={160}
                value={runtime.codexModel}
                onChange={(e) => update({ codexModel: e.target.value })}
                placeholder="Default model"
                spellCheck={false}
              />
            </SettingsRow>
          </SettingsGroup>
          <SettingsGroup title="Workspace">
            <SettingsRow
              label="Projects folder"
              htmlFor="projects-root"
              description="Default location for local projects."
            >
              <Input
                id="projects-root"
                maxLength={4096}
                pattern="(/.*)?"
                title="Use an absolute path."
                value={runtime.projectsRoot}
                onChange={(e) => update({ projectsRoot: e.target.value })}
                placeholder="/absolute/path/to/projects"
                spellCheck={false}
              />
            </SettingsRow>
          </SettingsGroup>
          <SettingsGroup title="Review limits">
            <SettingsRow
              label="Review context tokens"
              htmlFor="context-tokens"
              description="Maximum context passed to a review."
            >
              <Input
                id="context-tokens"
                type="number"
                min={1024}
                max={1000000}
                step={1}
                required
                value={runtime.contextTokens}
                onChange={(e) =>
                  update({ contextTokens: Number(e.target.value) })
                }
                className="tabular-nums"
              />
            </SettingsRow>
            <SettingsRow
              label="Review timeout (seconds)"
              htmlFor="review-timeout"
              description="Maximum time allowed for a review."
            >
              <Input
                id="review-timeout"
                type="number"
                min={1}
                max={3600}
                step={1}
                required
                value={runtime.judgeTimeoutMs / 1000}
                onChange={(e) =>
                  update({ judgeTimeoutMs: Number(e.target.value) * 1000 })
                }
                className="tabular-nums"
              />
            </SettingsRow>
          </SettingsGroup>
        </fieldset>
        <SettingsFeedback
          error={save.error}
          message={
            save.isSuccess && !dirty ? "Runtime settings saved." : undefined
          }
        />
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          {dirty && (
            <span className="mr-auto text-supporting text-muted">
              Unsaved changes
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            disabled={!dirty || save.isPending}
            onClick={() => {
              setDraft(null);
              save.reset();
            }}
          >
            Discard changes
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!dirty || save.isPending}
          >
            {save.isPending && (
              <LoaderCircle size={14} className="animate-spin" />
            )}
            Save runtime settings
          </Button>
        </div>
      </form>
    </>
  );
}
export function DataSettings({ data }: { data: LocalSettings }) {
  const connection = localClient();
  const connected = useSyncExternalStore(
    (listener) => connection.onStatus(listener),
    () => connection.isConnected,
  );
  const profile = useAppStore((s) => s.profile);
  const bridge = window.desktopBridge;
  const openFolder = useMutation({
    mutationFn: () => bridge!.openDataFolder(),
  });
  return (
    <>
      <SettingsHeading
        title="Data & connection"
        description="Storage and connection status for this installation."
      />
      <SettingsGroup title="Local backend">
        <SettingsRow
          label="Connection"
          description="The backend runs locally on your machine."
        >
          <span
            role="status"
            className="inline-flex items-center gap-2 text-ui"
          >
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${connected ? "bg-success" : "bg-warning"}`}
            />
            {connected ? "Connected" : "Reconnecting…"}
          </span>
        </SettingsRow>
        <SettingsRow
          label="Database"
          description="Practice data is stored on this device."
        >
          <span className="text-ui">SQLite</span>
        </SettingsRow>
        {bridge && (
          <SettingsRow
            label="Application data"
            description="Local database, settings, and app files."
          >
            <Button
              className="w-full"
              disabled={openFolder.isPending}
              onClick={() => openFolder.mutate()}
            >
              <FolderOpen size={15} />
              Open data folder
            </Button>
          </SettingsRow>
        )}
      </SettingsGroup>
      <SettingsFeedback error={openFolder.error} />
      <SettingsGroup title="Credentials">
        <SettingsRow label="Linux keyring" description={data.keyring.message}>
          <span className="text-ui">
            {data.keyring.available ? "Available" : "Unavailable"}
          </span>
        </SettingsRow>
        <SettingsRow
          label="Provider settings"
          description="Shared by the profiles on this installation."
        >
          <span className="text-ui">This device</span>
        </SettingsRow>
      </SettingsGroup>
      {profile && (
        <Button asChild variant="ghost" className="-ml-3">
          <Link to="/preferences">
            Profile learning preferences
            <ArrowUpRight size={15} />
          </Link>
        </Button>
      )}
    </>
  );
}
