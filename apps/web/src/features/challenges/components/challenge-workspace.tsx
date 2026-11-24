import {
  ChevronDown,
  Copy,
  FolderOpen,
  LoaderCircle,
  RotateCw,
} from "lucide-react";
import type { WorkspaceEditor } from "@repo/backend/shared/contracts";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useToast } from "@/shared/components/ui/toast";
import { useAppStore } from "@/shared/stores/app-store";
import { writeClipboardText } from "@/shared/lib/clipboard";
import { useChallengeWorkspace } from "@/features/challenges/hooks/use-challenge-workspace";
import {
  editorChoices,
  editorLaunchTarget,
  resolveSelectedEditor,
} from "@/features/challenges/lib/workspace-editor-selection";
import { WorkspaceEditorIcon } from "@/features/challenges/components/workspace-editor-icon";

export function ChallengeWorkspaceMenu({
  profileId,
  challengeId,
}: {
  profileId: string;
  challengeId: string;
}) {
  const {
    workspace,
    editors,
    open,
    relink,
    desktop,
    destinationPath,
    projectLoading,
  } = useChallengeWorkspace(profileId, challengeId);
  const { show } = useToast();
  const preferredEditor = useAppStore(
    (state) => state.preferredWorkspaceEditor,
  );
  const setPreferredEditor = useAppStore(
    (state) => state.setPreferredWorkspaceEditor,
  );
  const options = editorChoices(editors.data);
  const selected = resolveSelectedEditor(options, preferredEditor);
  const launch = editorLaunchTarget(selected);
  const loading = workspace.isPending || open.isPending || relink.isPending;
  const launchBusy = loading || projectLoading || !workspace.data || !desktop;
  const path = destinationPath ?? workspace.data?.path;
  const reportError = (error: Error) =>
    show({ message: error.message, variant: "error" });
  const openEditor = (editor: WorkspaceEditor) => {
    open.mutate(editor, { onError: reportError });
  };
  const copyPath = async () => {
    if (!path) return;
    try {
      await writeClipboardText(path);
      show({ message: "Workspace path copied", variant: "success" });
    } catch {
      show({ message: "Could not copy the workspace path.", variant: "error" });
    }
  };

  return (
    <div
      role="group"
      aria-label="Open workspace"
      className="inline-flex min-w-0 items-stretch"
    >
      <Button
        size="sm"
        variant="secondary"
        className="h-auto min-h-8 min-w-0 shrink rounded-r-none py-1.5 text-left whitespace-normal"
        disabled={
          launchBusy ||
          Boolean(workspace.error) ||
          (desktop && editors.isPending)
        }
        onClick={() => openEditor(launch.editor)}
      >
        {loading ? (
          <LoaderCircle
            size={14}
            className="animate-spin motion-reduce:animate-none"
          />
        ) : selected && !workspace.error ? (
          <WorkspaceEditorIcon editor={selected.id} />
        ) : (
          <FolderOpen size={14} />
        )}
        {workspace.error ? "Workspace" : launch.label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="secondary"
            className="h-auto min-h-8 rounded-l-none border-l-0 px-2"
            aria-label="Workspace actions"
            disabled={loading}
          >
            <ChevronDown size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-xs">
          {!desktop && (
            <DropdownMenuLabel className="whitespace-normal font-normal text-muted">
              Opening folders is available in the desktop app.
            </DropdownMenuLabel>
          )}
          {workspace.error ? (
            <>
              <DropdownMenuLabel className="whitespace-normal font-normal text-destructive">
                {workspace.error.message}
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => void workspace.refetch()}>
                <RotateCw size={14} /> Retry workspace
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  relink.mutate(undefined, { onError: reportError })
                }
              >
                <FolderOpen size={14} /> Use current workspace root
              </DropdownMenuItem>
            </>
          ) : (
            <>
              {editors.isPending ? (
                <DropdownMenuItem disabled>Finding editors…</DropdownMenuItem>
              ) : editors.error ? (
                <DropdownMenuItem onSelect={() => void editors.refetch()}>
                  <RotateCw size={14} /> Retry editor detection
                </DropdownMenuItem>
              ) : options.length ? (
                <>
                  {options.map((option) => (
                    <DropdownMenuItem
                      key={option.id}
                      disabled={launchBusy}
                      onSelect={() => {
                        setPreferredEditor(option.id);
                        openEditor(option.id);
                      }}
                    >
                      <WorkspaceEditorIcon editor={option.id} />
                      Open in {option.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem
                disabled={launchBusy}
                onSelect={() => openEditor("file-manager")}
              >
                <FolderOpen size={14} /> Open folder
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!path}
                onSelect={() => void copyPath()}
              >
                <Copy size={14} /> Copy path
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
