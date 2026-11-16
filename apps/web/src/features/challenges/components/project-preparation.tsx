import { CircleAlert, LoaderCircle, Terminal } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/cn";
import { projectPreparationView } from "@/features/challenges/lib/project-preparation-view";
import { useProjectPreparation } from "@/features/challenges/hooks/use-project-preparation";

const toneClass = {
  warning: "text-warning",
  danger: "text-destructive",
} as const;

function ActionError({ messages }: { messages: (Error | null)[] }) {
  const error = messages.find((value): value is Error => Boolean(value));
  if (!error) return null;
  return (
    <p role="alert" className="mt-2 break-words text-metadata text-destructive">
      {error.message}
    </p>
  );
}

/**
 * Only the project preparation controls that need a decision or a transition.
 * Report details, files, checks, commands, and activity stay in Activity; they
 * belong to the transcript and the file viewer.
 */
export function ProjectPreparationActions({
  profileId,
  challengeId,
  active,
}: {
  profileId: string;
  challengeId: string;
  active: boolean;
}) {
  const {
    preparation,
    start,
    cancel,
    retry,
    resume,
    fresh,
    approve,
    reject,
    authorize,
  } = useProjectPreparation(profileId, challengeId, { enabled: active });
  if (!active) return null;
  if (preparation.error) {
    return (
      <div className="rounded-lg border border-line bg-panel/60 px-3 py-2.5">
        <p
          role="alert"
          className="break-words text-supporting text-destructive"
        >
          {preparation.error.message}
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="mt-1"
          onClick={() => void preparation.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }
  if (!preparation.data) return null;
  const view = projectPreparationView(preparation.data);
  const pending = view.commands.filter(
    (command) => command.status === "pending",
  );
  const recovery = view.recovery;
  if (!recovery && !pending.length && !view.canStart && !view.canCancel)
    return null;

  const recoveryBusy = resume.isPending || retry.isPending || fresh.isPending;
  const recoveryAction = resume.isPending
    ? "resume"
    : retry.isPending
      ? "retry"
      : fresh.isPending
        ? "fresh"
        : null;
  const runRecovery = (action: "resume" | "retry" | "fresh") => {
    if (action === "resume") resume.mutate();
    else if (action === "retry") retry.mutate();
    else fresh.mutate();
  };
  const recoveryLabels = { resume: "Resume", retry: "Retry", fresh: "Start" };
  const commandPending =
    approve.isPending || reject.isPending || authorize.isPending;

  if (recovery) {
    const recoveryError = resume.error ?? retry.error ?? fresh.error;
    return (
      <section
        aria-label="Project preparation recovery"
        className="rounded-lg border border-line bg-panel/60 px-3 py-2.5"
      >
        <div className="flex gap-2">
          <CircleAlert
            size={15}
            aria-hidden="true"
            className={cn("mt-0.5 shrink-0", toneClass[recovery.tone])}
          />
          <div className="min-w-0 flex-1">
            <p className="text-supporting font-medium text-foreground">
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
            {recovery.settling && (
              <p className="mt-1 text-metadata text-warning">
                The previous run is still stopping. Recovery actions unlock when
                it settles.
              </p>
            )}
            {!recovery.settling && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {recovery.actions.map((action) => (
                  <Button
                    key={action.action}
                    size="sm"
                    variant={action.primary ? "primary" : "ghost"}
                    disabled={!action.enabled || recoveryBusy}
                    title={action.description}
                    onClick={() => runRecovery(action.action)}
                  >
                    {recoveryAction === action.action ? (
                      <LoaderCircle
                        size={14}
                        className="animate-spin motion-reduce:animate-none"
                      />
                    ) : null}
                    {recoveryAction === action.action
                      ? "Starting…"
                      : recoveryLabels[action.action]}
                  </Button>
                ))}
              </div>
            )}
            <ActionError messages={[recoveryError]} />
          </div>
        </div>
      </section>
    );
  }

  if (pending.length) {
    return (
      <section
        aria-label="Project command approval"
        className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2.5"
      >
        <p className="flex items-center gap-1.5 text-metadata font-medium text-warning">
          <Terminal size={14} aria-hidden="true" />
          {pending.length === 1
            ? "A setup command needs approval"
            : `${pending.length} setup commands need approval`}
        </p>
        <p className="mt-1 text-metadata text-muted">
          Commands run on this computer as your user account, not in a sandbox.
        </p>
        <ul className="mt-2 space-y-2">
          {pending.map((command) => (
            <li key={command.id} className="min-w-0">
              <p className="break-words text-metadata text-foreground">
                {command.label}
                {command.install ? " · installs dependencies" : ""}
                {command.network ? " · uses network" : ""}
              </p>
              <pre className="mt-0.5 max-h-20 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-canvas px-2 py-1.5 font-mono text-code text-muted">
                {command.command}
              </pre>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={commandPending}
                  onClick={() => approve.mutate(command.id)}
                >
                  {approve.isPending && approve.variables === command.id ? (
                    <LoaderCircle
                      size={14}
                      className="animate-spin motion-reduce:animate-none"
                    />
                  ) : null}
                  {approve.isPending && approve.variables === command.id
                    ? "Allowing…"
                    : "Allow"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={commandPending}
                  title="Allow the remaining setup and check commands for this attempt."
                  onClick={() =>
                    authorize.mutate({
                      install: command.install,
                      network: command.network,
                    })
                  }
                >
                  Allow attempt
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={commandPending}
                  onClick={() => reject.mutate(command.id)}
                >
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <ActionError
          messages={[approve.error, reject.error, authorize.error]}
        />
      </section>
    );
  }

  if (view.canStart) {
    return (
      <section
        aria-label="Project preparation"
        className="rounded-lg border border-line bg-panel/60 px-3 py-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 text-supporting text-muted">
            <span className="font-medium text-foreground">
              Project not prepared.
            </span>{" "}
            {view.startExplanation ??
              "Start project preparation from Activity."}
          </p>
          <Button
            size="sm"
            variant="primary"
            disabled={start.isPending}
            onClick={() => start.mutate(undefined)}
          >
            {start.isPending ? (
              <LoaderCircle
                size={14}
                className="animate-spin motion-reduce:animate-none"
              />
            ) : null}
            {start.isPending ? "Starting…" : view.startLabel}
          </Button>
        </div>
        <ActionError messages={[start.error]} />
      </section>
    );
  }

  if (view.canCancel) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel/60 px-3 py-2">
        <p className="flex items-center gap-1.5 text-metadata text-muted">
          <LoaderCircle
            size={13}
            className="animate-spin motion-reduce:animate-none"
          />
          Preparing project files…
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          {cancel.isPending ? "Cancelling…" : "Cancel preparation"}
        </Button>
        <ActionError messages={[cancel.error]} />
      </div>
    );
  }

  return null;
}
