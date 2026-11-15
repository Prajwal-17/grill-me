import { FileCode2, FolderGit2, FolderOpen, LoaderCircle } from "lucide-react";
import type { WorkspaceEditor } from "@repo/backend/shared/contracts";
import type { Challenge } from "@/shared/types/api";
import { Button } from "@/shared/components/ui/button";
import { CopyButton } from "@/shared/components/ui/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { LoadingRegion, Skeleton } from "@/shared/components/ui/skeleton";
import { useChallengeWorkspace } from "@/features/challenges/hooks/use-challenge-workspace";
import { ProjectPreparationRegion } from "./project-preparation";

function editorOptions(
  options: { id: WorkspaceEditor; label: string }[] | undefined,
) {
  return (options ?? []).filter((option) => option.id !== "file-manager");
}

function EditorIcon({ editor }: { editor: WorkspaceEditor }) {
  return editor === "file-manager" ? (
    <FolderOpen size={14} />
  ) : (
    <FileCode2 size={14} />
  );
}

function recordedWorkspacePath(error: Error) {
  const details = (error as Error & { details?: Record<string, unknown> })
    .details;
  return typeof details?.path === "string" ? details.path : null;
}

function WorkspaceLoading() {
  return (
    <LoadingRegion
      label="Loading challenge workspace"
      layout="challenge-workspace"
      className="space-y-3 rounded-lg border border-line bg-surface p-4"
    >
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-8 w-52" />
    </LoadingRegion>
  );
}

export function ChallengeWorkspaceSection({
  profileId,
  challenge,
  focusProject,
  onProjectFocus,
}: {
  profileId: string;
  challenge: Challenge;
  focusProject?: boolean;
  onProjectFocus?: () => void;
}) {
  const {
    workspace,
    editors,
    open,
    relink,
    desktop,
    destinationPath,
    projectDirectory,
    projectLoading,
  } = useChallengeWorkspace(profileId, challenge.id);
  if (workspace.isPending) return <WorkspaceLoading />;
  if (workspace.error) {
    const recordedPath = recordedWorkspacePath(workspace.error);
    return (
      <section
        aria-label="Challenge workspace"
        className="space-y-2 rounded-lg border border-line bg-surface p-4"
      >
        <h2 className="flex items-center gap-2 text-ui font-medium">
          <FolderGit2 size={15} className="text-muted" />
          Workspace
        </h2>
        <p role="alert" className="text-supporting text-destructive">
          {workspace.error.message}
        </p>
        {recordedPath && (
          <p className="break-all font-mono text-metadata text-muted">
            Recorded folder: {recordedPath}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void workspace.refetch()}
          >
            Retry workspace
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={relink.isPending}
            onClick={() => relink.mutate()}
          >
            {relink.isPending && (
              <LoaderCircle size={14} className="animate-spin" />
            )}
            Use current workspace root
          </Button>
        </div>
        <p className="text-metadata text-muted">
          This points the challenge at its folder under the current workspace
          root. Files in the recorded folder are left untouched.
        </p>
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
  const options = editorOptions(editors.data);
  const busyEditor = open.isPending ? open.variables : undefined;
  return (
    <section
      aria-labelledby={`challenge-workspace-${challenge.id}`}
      className="rounded-lg border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={`challenge-workspace-${challenge.id}`}
            className="flex items-center gap-2 text-ui font-medium"
          >
            <FolderGit2 size={15} className="text-muted" />
            Workspace
          </h2>
          <p className="mt-1 break-all font-mono text-metadata text-muted">
            {destinationPath ?? info.path}
          </p>
        </div>
        <CopyButton
          text={destinationPath ?? info.path}
          label="Copy path"
          ariaLabel={
            projectDirectory ? "Copy project path" : "Copy workspace path"
          }
        />
      </div>
      <p className="mt-2 text-supporting text-muted">
        {projectDirectory
          ? "Implement the TODOs in this project. Preparation and setup progress are shown below."
          : "Project preparation creates the source files and supporting configuration here. Existing files are preserved."}
      </p>
      {info.starterFile && !projectDirectory && (
        <p className="mt-1 text-metadata text-muted">
          Starter file:{" "}
          <span className="font-mono text-foreground">{info.starterFile}</span>
        </p>
      )}
      {desktop ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={open.isPending || projectLoading}
            onClick={() => open.mutate("file-manager")}
          >
            {busyEditor === "file-manager" ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <EditorIcon editor="file-manager" />
            )}
            {projectDirectory ? "Open project folder" : "Open workspace folder"}
          </Button>
          {editors.isPending ? (
            <span role="status" className="text-metadata text-muted">
              Finding editors…
            </span>
          ) : editors.error ? (
            <span className="flex items-center gap-1 text-metadata text-muted">
              Editors could not be detected.
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => void editors.refetch()}
              >
                Retry
              </button>
            </span>
          ) : options.length ? (
            options.map((option) => (
              <Button
                key={option.id}
                size="sm"
                variant="secondary"
                disabled={open.isPending || projectLoading}
                onClick={() => open.mutate(option.id)}
              >
                {busyEditor === option.id ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <EditorIcon editor={option.id} />
                )}
                Open in {option.label}
              </Button>
            ))
          ) : (
            <span className="text-metadata text-muted">
              No supported editor found. Install Zed, VS Code, or Cursor, or
              open the folder.
            </span>
          )}
        </div>
      ) : (
        <p className="mt-3 text-metadata text-muted">
          Folder and editor actions are available in the desktop app.
        </p>
      )}
      {open.error && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p role="alert" className="text-supporting text-destructive">
            {open.error.message}
          </p>
          {open.variables && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => open.mutate(open.variables)}
            >
              Try again
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => open.reset()}>
            Dismiss
          </Button>
        </div>
      )}
      <ProjectPreparationRegion
        profileId={profileId}
        challengeId={challenge.id}
        active={challenge.status === "active" && !challenge.archivedAt}
        workspacePath={info.path}
        editors={options}
        editorsPending={editors.isPending}
        focusOnMount={focusProject}
        onFocusHandled={onProjectFocus}
      />
    </section>
  );
}

export function ChallengeWorkspaceMenu({
  profileId,
  challenge,
}: {
  profileId: string;
  challenge: Challenge;
}) {
  const {
    workspace,
    editors,
    open,
    openRoot,
    relink,
    desktop,
    projectDirectory,
    projectLoading,
  } = useChallengeWorkspace(profileId, challenge.id);
  if (!desktop) return null;
  const options = editorOptions(editors.data);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Challenge workspace actions"
        >
          {workspace.isPending ? (
            <LoaderCircle size={14} className="animate-spin" />
          ) : (
            <FolderOpen size={14} />
          )}
          Workspace
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          {projectDirectory ? "Practice project" : "Challenge workspace"}
        </DropdownMenuLabel>
        {workspace.error ? (
          <>
            <DropdownMenuItem onSelect={() => void workspace.refetch()}>
              Retry workspace
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={relink.isPending}
              onSelect={() => relink.mutate()}
            >
              Use current workspace root
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem
            disabled={!workspace.data || open.isPending || projectLoading}
            onSelect={() => open.mutate("file-manager")}
          >
            {open.isPending && open.variables === "file-manager" ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <FolderOpen size={14} />
            )}
            {projectDirectory ? "Open project folder" : "Open workspace folder"}
          </DropdownMenuItem>
        )}
        {!editors.error && options.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Open in</DropdownMenuLabel>
            {options.map((option) => (
              <DropdownMenuItem
                key={option.id}
                disabled={!workspace.data || open.isPending || projectLoading}
                onSelect={() => open.mutate(option.id)}
              >
                {open.isPending && open.variables === option.id ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <FileCode2 size={14} />
                )}
                {option.label}
              </DropdownMenuItem>
            ))}
          </>
        )}
        {projectDirectory && (
          <DropdownMenuItem
            disabled={!workspace.data || openRoot.isPending}
            onSelect={() => openRoot.mutate()}
          >
            <FolderOpen size={14} />
            Open parent workspace folder
          </DropdownMenuItem>
        )}
        {openRoot.error && (
          <DropdownMenuItem
            disabled
            className="whitespace-normal break-words text-destructive"
          >
            {openRoot.error.message}
          </DropdownMenuItem>
        )}
        {open.error && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled
              className="whitespace-normal break-words text-destructive"
            >
              {open.error.message}
            </DropdownMenuItem>
            {open.variables && (
              <DropdownMenuItem onSelect={() => open.mutate(open.variables!)}>
                Try again
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => open.reset()}>
              Dismiss
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
