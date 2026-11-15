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
} from "lucide-react";
import { env } from "@/shared/config/env";
import { useAppStore } from "@/shared/stores/app-store";
import { Button } from "@/shared/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import { useToastError } from "@/shared/components/ui/toast";
import { HarnessTranscript } from "@/features/harness";
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

function JobActions({
  job,
  onOpen,
}: {
  job: GenerationJob;
  onOpen?: () => void;
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
      {(job.status === "completed" || job.status === "needs_input") && (
        <Button asChild size="sm" variant="secondary">
          <Link onClick={onOpen} to={generationHref(job)}>
            {job.status === "needs_input"
              ? "Answer"
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
  return (
    <div className="flex items-start gap-3 p-3">
      <Icon
        size={16}
        aria-hidden="true"
        className={`mt-1 shrink-0 ${job.status === "running" ? "animate-spin motion-reduce:animate-none" : ""} ${job.status === "completed" ? "text-success" : job.status === "failed" ? "text-destructive" : "text-muted"}`}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-ui font-medium">{generationLabel(job)}</p>
          <p
            title={generationTitle(job)}
            className="mt-0.5 line-clamp-2 break-words text-supporting text-muted"
          >
            {job.error?.message ?? generationTitle(job)}
          </p>
        </div>
        <JobActions job={job} onOpen={onOpen} />
        {job.harnessThreadId && (
          <details className="rounded border border-line bg-canvas px-2 py-1.5">
            <summary className="cursor-pointer text-metadata text-muted hover:text-foreground">
              Run transcript
            </summary>
            <div className="mt-2">
              <HarnessTranscript
                profileId={job.profileId}
                threadId={job.harnessThreadId}
              />
            </div>
          </details>
        )}
      </div>
      {onClear && (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Clear notification: ${generationTitle(job)}`}
          onClick={onClear}
        >
          Clear
        </Button>
      )}
    </div>
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
      <PopoverContent
        align="end"
        className="max-h-[min(480px,70dvh)] w-[min(380px,calc(100vw-2rem))] overflow-y-auto p-0"
      >
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <h2 className="text-ui font-medium">Notifications</h2>
          <Button
            size="sm"
            variant="ghost"
            disabled={!clearable.length}
            onClick={() => clear(clearable)}
          >
            Clear all
          </Button>
        </div>
        {!visible.length && !jobs.error && (
          <p className="p-4 text-supporting text-muted">No notifications</p>
        )}
        {jobs.error && (
          <div className="space-y-2 p-3 text-supporting text-muted">
            <p role="status">
              Can’t refresh progress. Saved jobs continue on the server.
            </p>
            <Button size="sm" onClick={() => void jobs.refetch()}>
              Refresh status
            </Button>
          </div>
        )}
        <div className="divide-y divide-line">
          {[...visible]
            .sort(
              (a, b) =>
                Number(isGenerating(b) || b.status === "needs_input") -
                Number(isGenerating(a) || a.status === "needs_input"),
            )
            .map((job) => (
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
      </PopoverContent>
    </Popover>
  );
}
