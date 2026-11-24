import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FolderOpen, LoaderCircle } from "lucide-react";
import type {
  LocalSettings,
  RuntimeSettings,
} from "@repo/backend/shared/contracts";
import { Button } from "@/shared/components/ui/button";
import { ChoiceSelect } from "@/shared/components/ui/choice-select";
import { Input } from "@/shared/components/ui/input";
import {
  SettingsFeedback,
  SettingsHeading,
  SettingsRow,
} from "./settings-layout";
import { useSettingsMutation } from "./use-settings-mutation";
import { WorkspaceSettingsPanel } from "./workspace-settings";

const PERMISSION_OPTIONS = [
  { id: "approval-required", label: "Approval required" },
  { id: "auto-accept-edits", label: "Auto-accept edits" },
  { id: "auto", label: "Auto" },
  { id: "full-access", label: "Full access" },
] as const;

const PERMISSION_DESCRIPTIONS: Record<
  RuntimeSettings["agentPermissions"],
  string
> = {
  "approval-required":
    "The agent asks before editing files, running commands, installing packages, or using the network. Reading is always allowed.",
  "auto-accept-edits":
    "The agent may edit workspace files without asking. Commands, installs, and network access still ask.",
  auto: "The agent may edit files and run workspace commands. Installs and network access still ask.",
  "full-access":
    "The agent may edit files, run commands, install packages, and use the network. It still cannot read secrets or leave the workspace.",
};

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
  const openDataFolder = useMutation({
    mutationFn: () => window.desktopBridge!.openDataFolder(),
  });
  return (
    <>
      <SettingsHeading title="Advanced" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ path: "/settings/runtime", body: runtime });
        }}
      >
        <fieldset disabled={save.isPending} className="min-w-0">
          <SettingsRow label="Agent permissions" htmlFor="agent-permissions">
            <div className="max-w-md space-y-2">
              <ChoiceSelect
                id="agent-permissions"
                label="Agent permissions"
                value={runtime.agentPermissions}
                onChange={(value) =>
                  update({
                    agentPermissions:
                      value as RuntimeSettings["agentPermissions"],
                  })
                }
                options={PERMISSION_OPTIONS}
                disabled={save.isPending}
              />
              <p className="text-supporting text-muted">
                {PERMISSION_DESCRIPTIONS[runtime.agentPermissions]}
              </p>
              <p className="text-metadata text-muted">
                Applies to the next agent turn. Running approvals stay pending
                until the agent or you resolve them.
              </p>
            </div>
          </SettingsRow>
          <SettingsRow label="Run timeout" htmlFor="run-timeout">
            <div className="flex max-w-56 items-center gap-2.5">
              <Input
                id="run-timeout"
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
              <span className="text-supporting text-muted">seconds</span>
            </div>
          </SettingsRow>
        </fieldset>
        {window.desktopBridge && (
          <SettingsRow label="App data">
            <Button
              type="button"
              variant="secondary"
              disabled={openDataFolder.isPending}
              onClick={() => openDataFolder.mutate()}
            >
              <FolderOpen size={15} />
              Open folder
            </Button>
          </SettingsRow>
        )}
        <SettingsFeedback
          error={save.error ?? openDataFolder.error}
          message={save.isSuccess && !dirty ? "Settings saved." : undefined}
        />
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
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
            Discard
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!dirty || save.isPending}
          >
            {save.isPending && (
              <LoaderCircle size={14} className="animate-spin" />
            )}
            Save changes
          </Button>
        </div>
      </form>
      <WorkspaceSettingsPanel data={data} />
    </>
  );
}
