import { useState } from "react";
import { Link } from "react-router";
import { useMutation } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Clock3,
  Bell,
  LoaderCircle,
  Square,
  X,
} from "lucide-react";
import { env } from "@/shared/config/env";
import { useAppStore } from "@/shared/stores/app-store";
import { Button } from "@/shared/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { useToastError } from "@/shared/components/ui/toast";
import { cancelGeneration, retryGeneration } from "../api/generation-api";
import {
  useGenerationJobs,
  useSaveGenerationJob,
} from "../hooks/use-generation-jobs";
import {
  generationHref,
  generationLabel,
  generationNoun,
  generationTitle,
  isGenerating,
  type GenerationJob,
} from "../types";

export function JobActions({
  job,
  onOpen,
  linkProgress = true,
  compact = false,
}: {
  job: GenerationJob;
  onOpen?: () => void;
  /** The progress page itself hides the link back to itself. */
  linkProgress?: boolean;
  compact?: boolean;
}) {
  const save = useSaveGenerationJob();
  const showError = useToastError();
  const mutation = useMutation({
    mutationFn: (action: "retry" | "skip" | "cancel") =>
      action === "cancel"
        ? cancelGeneration(job.profileId, job.id)
        : retryGeneration(job.profileId, job.id, action === "skip"),
    onSuccess: save,
    onError: (error) => {
      if (useAppStore.getState().profile?.id === job.profileId)
        showError(error.message);
    },
  });
  if (job.status === "cancelled") return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      {!compact &&
        (job.status === "completed" ||
          job.status === "needs_input" ||
          (isGenerating(job) && linkProgress)) && (
          <Button asChild size="sm" variant="secondary">
            <Link onClick={onOpen} to={generationHref(job)}>
              {job.status === "needs_input"
                ? "Answer"
                : isGenerating(job)
                  ? "View progress"
                  : `Open ${generationNoun(job)}`}
            </Link>
          </Button>
        )}
      {job.status === "failed" && job.error?.retryable && (
        <Button
          size="sm"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate("retry")}
        >
          {mutation.isPending ? "Retrying…" : "Retry"}
        </Button>
      )}
      {job.status === "failed" &&
        job.phase === "preparing" &&
        job.kind === "challenge" &&
        job.error?.retryable && (
          <Button
            size="sm"
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate("skip")}
          >
            Create without clarification
          </Button>
        )}
      {(isGenerating(job) || job.status === "needs_input") && (
        <Button
          size="sm"
          variant="ghost"
          disabled={mutation.isPending}
          aria-label={`Cancel ${generationNoun(job)} generation`}
          onClick={() => mutation.mutate("cancel")}
        >
          <Square size={12} />
          {mutation.isPending ? "Cancelling…" : "Cancel generation"}
        </Button>
      )}
    </div>
  );
}
export function GenerationJobRow({
  job,
  onOpen,
  onClear,
}: {
  job: GenerationJob;
  onOpen?: () => void;
  onClear?: () => void;
}) {
  const Icon = isGenerating(job)
    ? job.status === "queued"
      ? Clock3
      : LoaderCircle
    : job.status === "completed"
      ? CheckCircle2
      : job.status === "needs_input"
        ? CircleHelp
        : CircleAlert;
  const openable =
    job.status === "completed" ||
    job.status === "needs_input" ||
    isGenerating(job);
  const title = generationTitle(job);
  const timestamp = new Date(job.updatedAt);
  const detail = job.error?.message ?? title;
  return (
    <article className="px-4 py-2.5 transition-colors duration-150 hover:bg-elevated/50 focus-within:bg-elevated/50">
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${job.status === "completed" ? "bg-success/10 text-success" : job.status === "failed" ? "bg-destructive/10 text-destructive" : job.status === "needs_input" ? "bg-warning/10 text-warning" : "bg-surface text-muted"}`}
        >
          <Icon
            size={16}
            aria-hidden="true"
            className={
              job.status === "running"
                ? "animate-spin motion-reduce:animate-none"
                : ""
            }
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-metadata font-medium text-muted">
              {generationLabel(job)}
            </p>
            <time
              dateTime={job.updatedAt}
              title={timestamp.toLocaleString()}
              className="shrink-0 text-metadata text-muted"
            >
              {timestamp.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </time>
            {onClear && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="-mr-1 size-7 shrink-0 text-muted hover:text-foreground"
                    aria-label={`Clear notification: ${title}`}
                    onClick={onClear}
                  >
                    <X size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  Clear notification
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {openable ? (
            <Link
              to={generationHref(job)}
              onClick={onOpen}
              title={detail}
              className="mt-0.5 block rounded-sm text-ui font-medium leading-5 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              <span className="line-clamp-2 break-words">{detail}</span>
            </Link>
          ) : (
            <p className="mt-0.5 line-clamp-2 break-words text-ui leading-5">
              {detail}
            </p>
          )}
          {(job.status === "failed" ||
            job.status === "needs_input" ||
            isGenerating(job)) && (
            <div className="mt-2">
              <JobActions job={job} onOpen={onOpen} compact />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
export function GenerationActivity() {
  const profileId = useAppStore((state) => state.profile?.id);
  const jobs = useGenerationJobs(profileId);
  const [open, setOpen] = useState(false);
  const storageKey = `grill-me.generations.cleared.${env.appEnv}.${profileId}`;
  const [cleared, setCleared] = useState<Record<string, string[]>>({});
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "[]") as string[];
    } catch {
      return [];
    }
  })();
  const hidden = cleared[storageKey] ?? (Array.isArray(saved) ? saved : []);
  const key = (job: GenerationJob) =>
    `${job.id}:${job.status}:${job.updatedAt}`;
  const visible = (jobs.data ?? []).filter((job) => !hidden.includes(key(job)));
  const clearable = visible.filter(
    (job) => !isGenerating(job) && job.status !== "needs_input",
  );
  const clear = (items: GenerationJob[]) => {
    const next = [...new Set([...hidden, ...items.map(key)])].slice(-1000);
    setCleared((current) => ({ ...current, [storageKey]: next }));
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Keep this session usable without storage. */
    }
  };
  const running = visible.filter(isGenerating).length;
  const needsInput = visible.filter(
    (job) => job.status === "needs_input",
  ).length;
  if (!profileId) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className="shrink-0 px-2"
              aria-label={`Notifications${running ? `, ${running} generating` : needsInput ? `, ${needsInput} needs attention` : ""}`}
            >
              <Bell size={16} aria-hidden="true" />
              {(running > 0 || needsInput > 0) && (
                <span className="text-metadata tabular-nums">
                  {running + needsInput}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          Notifications
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        sideOffset={8}
        aria-label="Notifications"
        className="flex max-h-[min(560px,70dvh,var(--radix-popover-content-available-height))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden p-0"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2">
          <h2 className="text-ui font-semibold">Notifications</h2>
          <Button
            size="sm"
            variant="ghost"
            disabled={!clearable.length}
            onClick={() => clear(clearable)}
          >
            Clear all
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {!visible.length && !jobs.error && (
            <div className="flex flex-col items-center px-6 py-6 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-surface text-muted">
                <Bell size={18} />
              </span>
              <p className="mt-3 text-ui font-medium">You're all caught up</p>
              <p className="mt-1 text-metadata text-muted">
                Generation updates will appear here.
              </p>
            </div>
          )}
          {jobs.error && (
            <div className="space-y-2 p-4 text-supporting text-muted">
              <p role="status">
                Can’t refresh progress. Saved jobs continue on the server.
              </p>
              <Button size="sm" onClick={() => void jobs.refetch()}>
                Refresh status
              </Button>
            </div>
          )}
          {[
            {
              label: "Active",
              items: visible.filter(
                (job) => isGenerating(job) || job.status === "needs_input",
              ),
            },
            {
              label: "Recent",
              items: visible.filter(
                (job) => !isGenerating(job) && job.status !== "needs_input",
              ),
            },
          ]
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <section key={group.label} aria-label={group.label}>
                <h3 className="bg-surface/60 px-4 py-1.5 text-metadata font-medium text-muted">
                  {group.label}
                </h3>
                <div className="divide-y divide-line/60">
                  {group.items.map((job) => (
                    <GenerationJobRow
                      key={job.id}
                      job={job}
                      onOpen={() => setOpen(false)}
                      onClear={
                        !isGenerating(job) && job.status !== "needs_input"
                          ? () => clear([job])
                          : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
