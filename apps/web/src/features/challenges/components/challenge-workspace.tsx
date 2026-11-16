import {
  ChevronDown,
  Copy,
  FolderGit2,
  FolderOpen,
  LoaderCircle,
  RotateCw,
} from "lucide-react";
import type { WorkspaceEditor } from "@repo/backend/shared/contracts";
import type { Challenge } from "@/shared/types/api";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { LoadingRegion, Skeleton } from "@/shared/components/ui/skeleton";
import { useToast } from "@/shared/components/ui/toast";
import { useAppStore } from "@/shared/stores/app-store";
import { cn } from "@/shared/lib/cn";
import { writeClipboardText } from "@/shared/lib/clipboard";
import { useChallengeWorkspace } from "@/features/challenges/hooks/use-challenge-workspace";
import {
  projectPreparationView,
  type ProjectTone,
} from "@/features/challenges/lib/project-preparation-view";
import {
  editorChoices,
  editorLaunchTarget,
  resolveSelectedEditor,
} from "@/features/challenges/lib/workspace-editor-selection";
import { WorkspaceEditorIcon } from "@/features/challenges/components/workspace-editor-icon";

const toneClass: Record<ProjectTone, string> = {
  neutral: "text-foreground",
  muted: "text-muted",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

type WorkspaceStatus = {
  label: string;
  tone: ProjectTone;
  detail: string | null;
  action: string | null;
};

function recordedWorkspacePath(error: Error) {
  const details = (error as Error & { details?: Record<string, unknown> })
    .details;
  return typeof details?.path === "string" ? details.path : null;
}

function workspaceStatus(
  preparation: Parameters<typeof projectPreparationView>[0] | undefined,
  pending: boolean,
  active: boolean,
  error: string | null,
): WorkspaceStatus {
  if (pending)
    return {
      label: "Checking project",
      tone: "muted",
      detail: null,
      action: null,
    };
  if (error)
    return {
      label: active ? "Project status unavailable" : "Workspace ready",
      tone: active ? "danger" : "muted",
      detail: active ? error : null,
      action: active ? "Review project" : null,
    };
  if (!preparation)
    return {
      label: "Workspace ready",
      tone: "muted",
      detail: null,
      action: null,
    };
  const view = projectPreparationView(preparation);
  if (!active)
    return {
      label: view.status === "ready" ? "Project ready" : "Workspace ready",
      tone: "muted",
      detail:
        view.status === "ready"
          ? [
              view.filesSummary,
              ...view.checkGroups.map((group) => group.summary),
            ]
              .filter(Boolean)
              .join(" · ")
          : null,
      action: null,
    };
  if (view.awaitingApproval)
    return {
      label: "Waiting for approval",
      tone: "warning",
      detail: view.summary,
      action: "Review approval",
    };
  if (view.recovery)
    return {
      label: view.recovery.title,
      tone: view.recovery.tone,
      detail: null,
      action: "Review project",
    };
  if (view.running)
    return {
      label: "Preparing project",
      tone: "neutral",
      detail: view.summary,
      action: "Review progress",
    };
  if (view.status === "ready")
    return {
      label: "Project ready",
      tone: "neutral",
      detail: view.filesSummary,
      action: null,
    };
  if (view.status === "not_started")
    return {
      label: "Project not prepared",
      tone: "muted",
      detail: "Open Activity to prepare the project files, TODOs, and checks.",
      action: "Set up",
    };
  return {
    label: view.statusLabel,
    tone: view.statusTone,
    detail: view.summary,
    action: "Review project",
  };
}

function WorkspaceLoading() {
  return (
    <LoadingRegion
      label="Loading challenge workspace"
      layout="challenge-workspace"
      className="rounded-lg border border-line bg-surface px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-8 w-32" />
      </div>
    </LoadingRegion>
  );
}

export function ChallengeWorkspaceBar({
  profileId,
  challenge,
  onOpenActivity,
}: {
  profileId: string;
  challenge: Challenge;
  onOpenActivity: () => void;
}) {
  const {
    workspace,
    editors,
    open,
    relink,
    desktop,
    destinationPath,
    preparation,
    projectLoading,
  } = useChallengeWorkspace(profileId, challenge.id);
  const { show } = useToast();
  const preferredEditor = useAppStore(
    (state) => state.preferredWorkspaceEditor,
  );
  const setPreferredEditor = useAppStore(
    (state) => state.setPreferredWorkspaceEditor,
  );
  if (workspace.isPending) return <WorkspaceLoading />;
  if (workspace.error) {
    const recordedPath = recordedWorkspacePath(workspace.error);
    return (
      <section
        aria-label="Challenge workspace"
        className="space-y-1.5 rounded-lg border border-line bg-surface px-3 py-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p
            role="alert"
            className="min-w-0 flex-1 break-words text-supporting text-destructive"
          >
            {workspace.error.message}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void workspace.refetch()}
            >
              Retry
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={relink.isPending}
              title="Point the challenge at its folder under the current workspace root. Files in the recorded folder are left untouched."
              onClick={() => relink.mutate()}
            >
              {relink.isPending && (
                <LoaderCircle size={14} className="animate-spin" />
              )}
              Use current root
            </Button>
          </div>
        </div>
        {recordedPath && (
          <p
            className="truncate font-mono text-metadata text-muted"
            title={recordedPath}
          >
            Recorded folder: {recordedPath}
          </p>
        )}
        {relink.error && (
          <p role="alert" className="text-supporting text-destructive">
            {relink.error.message}
          </p>
        )}
      </section>
    );
  }
  const info = workspace.data;
  if (!info) return null;
  const path = destinationPath ?? info.path;
  const options = editorChoices(editors.data);
  const selected = resolveSelectedEditor(options, preferredEditor);
  const launch = editorLaunchTarget(selected);
  const status = workspaceStatus(
    preparation.data,
    preparation.isPending,
    challenge.status === "active" && !challenge.archivedAt,
    preparation.error?.message ?? null,
  );
  const busyEditor = open.isPending ? open.variables : undefined;
  const launchBusy = open.isPending || projectLoading;
  const copyPath = async () => {
    try {
      await writeClipboardText(path);
      show({ message: "Workspace path copied", variant: "success" });
    } catch {
      show({
        message:
          "Clipboard unavailable. Copy the path from the workspace menu.",
        variant: "error",
      });
    }
  };
  const openEditor = (editor: WorkspaceEditor) => {
    open.mutate(editor);
  };
  return (
    <section
      aria-label="Challenge workspace"
      className="rounded-lg border border-line bg-surface px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-start gap-2">
          <FolderGit2
            size={15}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-muted"
          />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-supporting">
              <span
                className={cn("font-medium", toneClass[status.tone])}
                title={path}
              >
                {status.label}
              </span>
              {status.detail && (
                <span className="break-words text-muted">{status.detail}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {status.action && (
            <Button size="sm" variant="ghost" onClick={onOpenActivity}>
              {status.action}
            </Button>
          )}
          {desktop ? (
            <div
              role="group"
              aria-label="Open workspace"
              className="flex items-center"
            >
              <Button
                size="sm"
                variant="secondary"
                className="rounded-r-none"
                disabled={launchBusy}
                onClick={() => openEditor(launch.editor)}
              >
                {busyEditor === launch.editor ? (
                  <LoaderCircle
                    size={14}
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : launch.folder ? (
                  <FolderOpen size={14} />
                ) : (
                  <WorkspaceEditorIcon editor={launch.editor} />
                )}
                {launch.label}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="rounded-l-none border-l-0 px-2"
                    aria-label="Workspace actions"
                    disabled={open.isPending}
                  >
                    <ChevronDown size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {editors.isPending ? (
                    <DropdownMenuItem disabled>
                      <LoaderCircle size={14} className="animate-spin" />
                      Finding editors…
                    </DropdownMenuItem>
                  ) : editors.error ? (
                    <DropdownMenuItem onSelect={() => void editors.refetch()}>
                      <RotateCw size={14} />
                      Retry editor detection
                    </DropdownMenuItem>
                  ) : options.length ? (
                    <>
                      <DropdownMenuLabel>Open in</DropdownMenuLabel>
                      {options.map((option) => (
                        <DropdownMenuItem
                          key={option.id}
                          onSelect={() => setPreferredEditor(option.id)}
                        >
                          <WorkspaceEditorIcon editor={option.id} />
                          {option.label}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem disabled>
                        No supported editor found
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem
                    disabled={launchBusy}
                    onSelect={() => openEditor("file-manager")}
                  >
                    {busyEditor === "file-manager" ? (
                      <LoaderCircle size={14} className="animate-spin" />
                    ) : (
                      <FolderOpen size={14} />
                    )}
                    Open folder
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void copyPath()}>
                    <Copy size={14} />
                    Copy path
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <span className="text-metadata text-muted">
              Workspace actions are available in the desktop app.
            </span>
          )}
        </div>
      </div>
      {open.error && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p
            role="alert"
            className="min-w-0 flex-1 text-metadata text-destructive"
          >
            {open.error.message}
          </p>
          {open.variables && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => open.mutate(open.variables!)}
            >
              Try again
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => open.reset()}>
            Dismiss
          </Button>
        </div>
      )}
    </section>
  );
}
