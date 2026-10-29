import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FolderOpen, LoaderCircle } from "lucide-react";
import type { LocalSettings, RuntimeSettings } from "@repo/contracts";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
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
  const chooseFolder = useMutation({
    mutationFn: (currentPath: string) =>
      window.desktopBridge!.selectProjectsFolder(currentPath),
    onSuccess: (path) => {
      if (path !== null) update({ projectsRoot: path });
    },
  });
  const openDataFolder = useMutation({
    mutationFn: () => window.desktopBridge!.openDataFolder(),
  });
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
        <fieldset
          disabled={save.isPending || chooseFolder.isPending}
          className="min-w-0"
        >
          <SettingsGroup title="Workspace">
            <SettingsRow
              label="Projects folder"
              htmlFor="projects-root"
              controlClassName="@min-[600px]:w-96"
              description="Default location for local projects."
            >
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  id="projects-root"
                  maxLength={4096}
                  pattern="(/.*)?"
                  title="Use an absolute path."
                  value={runtime.projectsRoot}
                  onChange={(e) => {
                    chooseFolder.reset();
                    update({ projectsRoot: e.target.value });
                  }}
                  placeholder="/absolute/path/to/projects"
                  spellCheck={false}
                  className="min-w-0 flex-1"
                />
                {window.desktopBridge && (
                  <Button
                    type="button"
                    size="icon"
                    aria-label="Browse for projects folder"
                    title="Browse for projects folder"
                    onClick={() => chooseFolder.mutate(runtime.projectsRoot)}
                  >
                    {chooseFolder.isPending ? (
                      <LoaderCircle size={16} className="animate-spin" />
                    ) : (
                      <FolderOpen size={16} />
                    )}
                  </Button>
                )}
              </div>
            </SettingsRow>
          </SettingsGroup>
          <SettingsGroup title="Review limits">
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
          error={save.error ?? chooseFolder.error ?? openDataFolder.error}
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
            disabled={!dirty || save.isPending || chooseFolder.isPending}
            onClick={() => {
              setDraft(null);
              save.reset();
              chooseFolder.reset();
            }}
          >
            Discard changes
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!dirty || save.isPending || chooseFolder.isPending}
          >
            {save.isPending && (
              <LoaderCircle size={14} className="animate-spin" />
            )}
            Save runtime settings
          </Button>
        </div>
      </form>
      {window.desktopBridge && (
        <Button
          variant="ghost"
          className="mt-5 -ml-3 text-muted"
          disabled={openDataFolder.isPending}
          onClick={() => openDataFolder.mutate()}
        >
          <FolderOpen size={15} />
          Open app data folder
        </Button>
      )}
    </>
  );
}
