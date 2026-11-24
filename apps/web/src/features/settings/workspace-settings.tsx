import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, LoaderCircle } from "lucide-react";
import type { LocalSettings } from "@repo/backend/shared/contracts";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  SettingsFeedback,
  SettingsHeading,
  SettingsRow,
} from "./settings-layout";
import { useSettingsMutation } from "./use-settings-mutation";

export function WorkspaceSettingsPanel({ data }: { data: LocalSettings }) {
  const bridge = window.desktopBridge;
  const queries = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const root = draft ?? data.workspace.root;
  const save = useSettingsMutation(() => {
    setDraft(null);
    void queries.invalidateQueries({ queryKey: ["challenges", "workspace"] });
  });
  const browse = useMutation({
    mutationFn: () =>
      bridge!.selectWorkspaceFolder(root || data.workspace.defaultRoot),
    onSuccess: (selected) => {
      if (selected === null) return;
      save.reset();
      setDraft(selected);
    },
  });
  const dirty = root.trim() !== data.workspace.root;
  const useDefault =
    root === "" ||
    (draft === null && data.workspace.root === data.workspace.defaultRoot);
  return (
    <div className="mt-6">
      <SettingsHeading
        title="Challenge workspace"
        description="New challenge folders are created here. Existing folders stay in place."
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!dirty) return;
          browse.reset();
          save.mutate({
            path: "/settings/workspace",
            body: { root: root.trim() },
          });
        }}
      >
        <fieldset disabled={save.isPending} className="min-w-0">
          <SettingsRow label="Folder" htmlFor="workspace-root">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="workspace-root"
                value={root}
                maxLength={4096}
                spellCheck={false}
                autoComplete="off"
                placeholder={data.workspace.defaultRoot}
                onChange={(event) => {
                  save.reset();
                  browse.reset();
                  setDraft(event.target.value);
                }}
                className="min-w-0 flex-[1_1_20rem] font-mono text-metadata"
              />
              {bridge && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={browse.isPending}
                  onClick={() => browse.mutate()}
                >
                  {browse.isPending ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <FolderOpen size={14} />
                  )}
                  Browse
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                disabled={useDefault}
                onClick={() => {
                  save.reset();
                  browse.reset();
                  setDraft("");
                }}
              >
                Use default
              </Button>
            </div>
            <p className="mt-1.5 break-all text-metadata text-muted">
              Default: {data.workspace.defaultRoot}
            </p>
          </SettingsRow>
        </fieldset>
        <SettingsFeedback
          error={save.error ?? browse.error}
          message={
            save.isSuccess && !dirty ? "Workspace folder saved." : undefined
          }
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
              browse.reset();
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
    </div>
  );
}
