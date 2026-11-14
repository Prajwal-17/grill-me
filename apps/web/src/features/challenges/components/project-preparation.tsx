import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  CircleAlert,
  FileCode2,
  FolderGit2,
  FolderOpen,
  LoaderCircle,
  MoreHorizontal,
  Terminal,
} from "lucide-react";
import type { WorkspaceEditorOption } from "@repo/backend/shared/contracts";
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
import { cn } from "@/shared/lib/cn";
import type {
  ProjectCheckGroupView,
  ProjectPreparationView,
  ProjectTone,
} from "@/features/challenges/lib/project-preparation-view";
import { projectPreparationView } from "@/features/challenges/lib/project-preparation-view";
import { useProjectPreparation } from "@/features/challenges/hooks/use-project-preparation";

const toneClass: Record<ProjectTone, string> = {
  neutral: "text-foreground",
  muted: "text-muted",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

function CommandBlock({
  command,
  describedBy,
}: {
  command: string;
  describedBy?: string;
}) {
  return (
    <pre
      tabIndex={0}
      aria-label="Exact command"
      aria-describedby={describedBy}
      className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-canvas px-2 py-1.5 font-mono text-code focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {command}
    </pre>
  );
}

function ProjectFiles({ view }: { view: ProjectPreparationView }) {
  if (!view.files.length && !view.todos.length) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-metadata text-muted hover:text-foreground">
        View files and TODOs
      </summary>
      <div
        tabIndex={0}
        role="region"
        aria-label="Prepared project files and TODOs"
        className="mt-2 max-h-56 space-y-3 overflow-y-auto pr-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {!!view.files.length && (
          <div>
            <p className="text-metadata text-muted">Files</p>
            <ul className="mt-1 space-y-1">
              {view.files.map((file) => (
                <li key={file.path} className="min-w-0 text-metadata">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <code className="break-all font-mono text-foreground">
                      {file.path}
                    </code>
                    <span className="text-muted">{file.role}</span>
                  </div>
                  {file.purpose && (
                    <p className="break-words text-muted">{file.purpose}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!!view.todos.length && (
          <div>
            <p className="text-metadata text-muted">TODOs</p>
            <ul className="mt-1 space-y-1">
              {view.todos.map((todo) => (
                <li key={todo.location} className="min-w-0 text-metadata">
                  <code className="break-all font-mono text-foreground">
                    {todo.location}
                  </code>
                  <p className="break-words text-muted">{todo.note}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

function CheckGroup({ group }: { group: ProjectCheckGroupView }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-metadata text-muted hover:text-foreground">
        View {group.checks.length === 1 ? "check" : "checks"}
      </summary>
      <ul
        tabIndex={0}
        role="region"
        aria-label={`${group.label} detail`}
        className="mt-1 max-h-56 space-y-1.5 overflow-y-auto pr-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {group.checks.map((check) => (
          <li key={check.id} className="min-w-0 text-metadata">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className={cn("font-medium", toneClass[check.tone])}>
                {check.statusLabel}
              </span>
              <span className="break-words text-foreground">{check.label}</span>
              <span className="text-muted">{check.kind}</span>
            </div>
            {check.detail && (
              <p className="break-words text-muted">{check.detail}</p>
            )}
            {check.command && (
              <p className="break-all font-mono text-muted">
                {check.command}
                {check.cwd !== "." ? ` · ${check.cwd}` : ""}
              </p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function StatusRow({
  label,
  tone = "neutral",
  children,
}: {
  label: string;
  tone?: ProjectTone;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
      <dt className="w-full shrink-0 text-metadata text-muted sm:w-32">
        {label}
      </dt>
      <dd className={cn("min-w-0 flex-1 text-supporting", toneClass[tone])}>
        {children}
      </dd>
    </div>
  );
}

function ProjectActions({
  view,
  workspacePath,
  editors,
  editorsPending,
  desktop,
  open,
}: {
  view: ProjectPreparationView;
  workspacePath: string;
  editors: WorkspaceEditorOption[] | undefined;
  editorsPending: boolean;
  desktop: boolean;
  open: ReturnType<typeof useProjectPreparation>["open"];
}) {
  if (!view.projectDirectory) return null;
  if (!desktop)
    return (
      <p className="mt-2 text-metadata text-muted">
        Folder and editor actions are available in the desktop app.
      </p>
    );
  const projectDirectory = view.projectDirectory;
  const busyEditor = open.isPending ? open.variables?.editor : undefined;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={open.isPending}
        onClick={() =>
          open.mutate({
            editor: "file-manager",
            projectDirectory,
            workspacePath,
          })
        }
      >
        {busyEditor === "file-manager" ? (
          <LoaderCircle
            size={14}
            className="animate-spin motion-reduce:animate-none"
          />
        ) : (
          <FolderOpen size={14} />
        )}
        Open project folder
      </Button>
      {editorsPending ? (
        <span role="status" className="text-metadata text-muted">
          Finding editors…
        </span>
      ) : (
        editors?.map((option) => (
          <Button
            key={option.id}
            size="sm"
            variant="ghost"
            disabled={open.isPending}
            onClick={() =>
              open.mutate({
                editor: option.id,
                projectDirectory,
                workspacePath,
              })
            }
          >
            {busyEditor === option.id ? (
              <LoaderCircle
                size={14}
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <FileCode2 size={14} />
            )}
            Open in {option.label}
          </Button>
        ))
      )}
      {!editorsPending && editors?.length === 0 && (
        <span className="text-metadata text-muted">
          No supported editor found.
        </span>
      )}
      {open.error && (
        <span
          role="alert"
          className="w-full break-words text-metadata text-destructive"
        >
          {open.error.message}
        </span>
      )}
    </div>
  );
}

function RecoveryAlert({
  view,
  start,
}: {
  view: ProjectPreparationView;
  start: ReturnType<typeof useProjectPreparation>["start"];
}) {
  const recovery = view.recovery;
  if (!recovery) return null;
  return (
    <div
      role={view.status === "failed" ? "alert" : undefined}
      aria-labelledby={`project-recovery-${view.status}`}
      className="mt-3 rounded-md border border-line bg-panel px-3 py-2.5"
    >
      <div className="flex gap-2">
        <CircleAlert
          size={15}
          aria-hidden="true"
          className={cn(
            "mt-0.5 shrink-0",
            recovery.tone === "danger" ? "text-destructive" : "text-warning",
          )}
        />
        <div className="min-w-0">
          <p
            id={`project-recovery-${view.status}`}
            className="text-supporting font-medium text-foreground"
          >
            {recovery.title}
          </p>
          <p className="mt-0.5 break-words text-metadata text-muted">
            {recovery.description}
          </p>
          {recovery.conflictPath && (
            <p className="mt-1 break-all font-mono text-metadata text-muted">
              Changed file: {recovery.conflictPath}
            </p>
          )}
          {!!view.problems.length && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-metadata text-muted">
              {view.problems.map((problem) => (
                <li key={problem} className="break-words">
                  {problem}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {recovery.canStart && (
          <Button
            size="sm"
            variant="primary"
            disabled={start.isPending}
            onClick={() => start.mutate(undefined)}
          >
            {start.isPending && (
              <LoaderCircle
                size={14}
                className="animate-spin motion-reduce:animate-none"
              />
            )}
            {start.isPending ? "Starting…" : recovery.startLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

function CommandSection({
  view,
  approve,
  reject,
  authorize,
}: {
  view: ProjectPreparationView;
  approve: ReturnType<typeof useProjectPreparation>["approve"];
  reject: ReturnType<typeof useProjectPreparation>["reject"];
  authorize: ReturnType<typeof useProjectPreparation>["authorize"];
}) {
  const warningId = useId();
  if (!view.commands.length) return null;
  const canDecide = view.status === "running";
  const commandPending =
    approve.isPending || reject.isPending || authorize.isPending;
  const actionError = approve.error ?? reject.error ?? authorize.error;
  const ordered = (
    [
      { label: "Setup", purpose: "setup" },
      { label: "Checks", purpose: "check" },
      { label: "Run", purpose: "run" },
      { label: "Inspect", purpose: "inspect" },
    ] as const
  ).map((group) => ({
    ...group,
    commands: view.commands.filter(
      (command) => command.purpose === group.purpose,
    ),
  }));
  return (
    <details
      key={view.awaitingApproval ? "awaiting-approval" : "commands"}
      open={view.awaitingApproval ? true : undefined}
      className="mt-3 border-t border-line pt-3"
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-metadata text-muted hover:text-foreground">
        <Terminal size={14} aria-hidden="true" />
        Review commands ({view.commands.length})
      </summary>
      <p
        id={warningId}
        className="mt-2 flex gap-1.5 text-metadata text-warning"
      >
        <CircleAlert size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
        Runs on this computer as your user account, not in a sandbox.
      </p>
      {view.authorization && (
        <p className="mt-1 break-words text-metadata text-muted">
          Commands approved for attempt {view.authorization.attempt}
          {view.authorization.install ? " · installs dependencies" : ""}
          {view.authorization.network ? " · uses network" : ""}.
        </p>
      )}
      <div className="mt-2 space-y-3">
        {ordered.map((group) => {
          if (!group.commands.length) return null;
          return (
            <div key={group.purpose}>
              <p className="text-metadata text-muted">{group.label}</p>
              <ul className="mt-1 space-y-2">
                {group.commands.map((command) => (
                  <li
                    key={command.id}
                    role="group"
                    aria-label={command.label}
                    aria-describedby={warningId}
                    className="min-w-0"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className="break-words text-metadata text-foreground">
                        {command.label}
                      </p>
                      <span
                        className={cn(
                          "text-metadata",
                          toneClass[command.statusTone],
                        )}
                      >
                        {command.statusLabel}
                      </span>
                      {command.exitCode !== null && (
                        <span className="text-metadata text-muted">
                          Exit {command.exitCode}
                        </span>
                      )}
                      {command.install && (
                        <span className="text-metadata text-warning">
                          Installs dependencies
                        </span>
                      )}
                      {command.network && (
                        <span className="text-metadata text-warning">
                          Uses network
                        </span>
                      )}
                    </div>
                    <CommandBlock
                      command={command.command}
                      describedBy={warningId}
                    />
                    <p className="mt-1 break-all text-metadata text-muted">
                      Working directory:{" "}
                      <span className="font-mono text-foreground">
                        {command.cwd}
                      </span>
                    </p>
                    {canDecide && command.status === "pending" && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="primary"
                          aria-describedby={warningId}
                          disabled={commandPending}
                          onClick={() => approve.mutate(command.id)}
                        >
                          {approve.isPending &&
                          approve.variables === command.id ? (
                            <LoaderCircle
                              size={14}
                              className="animate-spin motion-reduce:animate-none"
                            />
                          ) : null}
                          {approve.isPending && approve.variables === command.id
                            ? "Allowing…"
                            : "Allow command"}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`More approval options for ${command.label}`}
                              aria-describedby={warningId}
                              disabled={commandPending}
                            >
                              <MoreHorizontal size={14} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-64">
                            <DropdownMenuLabel>
                              Approve for this attempt
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                              disabled={commandPending}
                              onSelect={() =>
                                authorize.mutate({
                                  install: command.install,
                                  network: command.network,
                                })
                              }
                            >
                              Allow this attempt
                              {command.install || command.network
                                ? ` (${[
                                    command.install && "install",
                                    command.network && "network",
                                  ]
                                    .filter(Boolean)
                                    .join(" + ")})`
                                : " (no install or network)"}
                            </DropdownMenuItem>
                            {!(command.install && command.network) && (
                              <DropdownMenuItem
                                disabled={commandPending}
                                onSelect={() =>
                                  authorize.mutate({
                                    install: true,
                                    network: true,
                                  })
                                }
                              >
                                Allow this attempt (install + network)
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={commandPending}
                              className="text-destructive"
                              onSelect={() => reject.mutate(command.id)}
                            >
                              Decline command
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                    {(command.outputTail || command.errorMessage) && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-metadata text-muted hover:text-foreground">
                          View output
                        </summary>
                        {command.errorMessage && (
                          <p className="mt-1 break-words text-metadata text-destructive">
                            {command.errorMessage}
                          </p>
                        )}
                        {command.outputTail && (
                          <pre
                            tabIndex={0}
                            aria-label={`Output for ${command.label}`}
                            className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-canvas px-2 py-1.5 font-mono text-code text-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          >
                            {command.outputTail}
                          </pre>
                        )}
                        {command.outputTruncated && (
                          <p className="mt-1 text-metadata text-muted">
                            Showing the last 4,000 characters.
                          </p>
                        )}
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {view.awaitingApproval && canDecide && (
        <p className="mt-2 text-metadata text-warning">
          Allow this command, allow the rest of this attempt, or decline it.
        </p>
      )}
      {view.commands.some((command) => command.status === "pending") &&
        !canDecide && (
          <p className="mt-2 text-metadata text-muted">
            This approval is no longer current. Refresh the preparation status.
          </p>
        )}
      {actionError && (
        <p
          role="alert"
          className="mt-2 break-words text-metadata text-destructive"
        >
          {actionError.message}
        </p>
      )}
      {view.commands.every((command) => command.status === "not_run") && (
        <p className="mt-2 text-metadata text-muted">
          These commands have not run.
        </p>
      )}
    </details>
  );
}

export function ProjectPreparationRegion({
  profileId,
  challengeId,
  active,
  workspacePath,
  editors,
  editorsPending,
  focusOnMount,
  onFocusHandled,
}: {
  profileId: string;
  challengeId: string;
  active: boolean;
  workspacePath: string;
  editors: WorkspaceEditorOption[] | undefined;
  editorsPending: boolean;
  focusOnMount?: boolean;
  onFocusHandled?: () => void;
}) {
  const {
    preparation,
    start,
    cancel,
    approve,
    reject,
    authorize,
    open,
    desktop,
  } = useProjectPreparation(profileId, challengeId, { enabled: active });
  const root = useRef<HTMLElement>(null);
  const headingId = `practice-project-${challengeId}`;
  useEffect(() => {
    if (!focusOnMount) return;
    root.current?.focus({ preventScroll: false });
    onFocusHandled?.();
  }, [focusOnMount, onFocusHandled]);
  if (!active) return null;
  const view = preparation.data
    ? projectPreparationView(preparation.data)
    : null;
  return (
    <section
      ref={root}
      id={headingId}
      tabIndex={-1}
      aria-labelledby={`${headingId}-title`}
      className="mt-4 border-t border-line pt-4 outline-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3
          id={`${headingId}-title`}
          className="flex items-center gap-2 text-ui font-medium"
        >
          <FolderGit2 size={15} className="text-muted" aria-hidden="true" />
          Practice project
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {view?.attempt !== null && view?.attempt !== undefined && (
            <span className="text-metadata text-muted">
              Attempt {view.attempt}
            </span>
          )}
          {view && (
            <span
              role="status"
              aria-live="polite"
              className={cn(
                "inline-flex items-center gap-1.5 text-metadata",
                toneClass[view.statusTone],
              )}
            >
              {view.running && (
                <LoaderCircle
                  size={13}
                  className="animate-spin motion-reduce:animate-none"
                />
              )}
              {view.statusLabel}
            </span>
          )}
        </div>
      </div>
      {preparation.isPending ? (
        <LoadingRegion
          label="Loading practice project"
          className="mt-3 space-y-2"
        >
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-3/4" />
        </LoadingRegion>
      ) : preparation.error ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p
            role="alert"
            className="min-w-0 break-words text-supporting text-destructive"
          >
            {preparation.error.message}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void preparation.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : view ? (
        <>
          {view.projectPath && (
            <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 break-all font-mono text-metadata text-muted">
                {view.projectPath}
              </p>
              <CopyButton
                text={view.projectPath}
                label="Copy project path"
                ariaLabel="Copy practice project path"
              />
            </div>
          )}
          <ProjectActions
            view={view}
            workspacePath={view.workspacePath ?? workspacePath}
            editors={editors}
            editorsPending={editorsPending}
            desktop={desktop}
            open={open}
          />
          {view.summary && (
            <p className="mt-2 text-supporting text-muted">{view.summary}</p>
          )}
          {view.previousAttempt && (
            <p className="mt-1 break-words text-metadata text-muted">
              {view.previousAttempt}
            </p>
          )}
          <RecoveryAlert view={view} start={start} />
          <dl className="mt-3 divide-y divide-line border-y border-line">
            <StatusRow label="Files prepared">
              {view.filesSummary}
              <ProjectFiles view={view} />
            </StatusRow>
            {view.checkGroups.length ? (
              view.checkGroups.map((group) => (
                <StatusRow key={group.id} label={group.label} tone={group.tone}>
                  {group.summary}
                  <CheckGroup group={group} />
                </StatusRow>
              ))
            ) : (
              <StatusRow label="Checks" tone="muted">
                {view.status === "running"
                  ? "Preparing…"
                  : view.status === "not_started"
                    ? "Not started"
                    : "Not available"}
              </StatusRow>
            )}
          </dl>
          {view.running && !!view.activity.length && (
            <div className="mt-3">
              <p className="text-metadata text-muted">Current activity</p>
              <ul className="mt-1 space-y-0.5">
                {view.activity.map((entry) => (
                  <li
                    key={entry.key}
                    className="break-words text-metadata text-muted"
                  >
                    {entry.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!view.running && view.lastActivity && !view.recovery && (
            <p className="mt-2 break-words text-metadata text-muted">
              Last activity: {view.lastActivity.label}
            </p>
          )}
          {view.canCancel && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                {cancel.isPending && (
                  <LoaderCircle
                    size={14}
                    className="animate-spin motion-reduce:animate-none"
                  />
                )}
                {cancel.isPending ? "Cancelling…" : "Cancel preparation"}
              </Button>
            </div>
          )}
          {view.canStart && !view.recovery && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={start.isPending}
                onClick={() => start.mutate(undefined)}
              >
                {start.isPending && (
                  <LoaderCircle
                    size={14}
                    className="animate-spin motion-reduce:animate-none"
                  />
                )}
                {start.isPending ? "Starting…" : view.startLabel}
              </Button>
              {view.startExplanation && (
                <p className="text-metadata text-muted">
                  {view.startExplanation}
                </p>
              )}
            </div>
          )}
          {(start.error || cancel.error) && (
            <p
              role="alert"
              className="mt-2 break-words text-supporting text-destructive"
            >
              {(start.error ?? cancel.error)?.message}
            </p>
          )}
          <CommandSection
            view={view}
            approve={approve}
            reject={reject}
            authorize={authorize}
          />
        </>
      ) : null}
    </section>
  );
}
