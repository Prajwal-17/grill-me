import { useState } from "react";
import { Link } from "react-router";
import { useMutation } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Clock3,
  History,
  LoaderCircle,
  X,
} from "lucide-react";
import { useAppStore } from "@/shared/stores/app-store";
import { Button } from "@/shared/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
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
  if (job.status === "running" || job.status === "cancelled") return null;
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
      {(job.status === "queued" || job.status === "needs_input") && (
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={mutation.isPending}
          aria-label={`Cancel ${generationNoun(job)} generation`}
          onClick={() => mutation.mutate("cancel")}
        >
          <X size={14} />
        </Button>
      )}
    </div>
  );
}
export function GenerationJobRow({
  job,
  onOpen,
}: {
  job: GenerationJob;
  onOpen?: () => void;
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
      </div>
    </div>
  );
}
export function GenerationActivity() {
  const profileId = useAppStore((state) => state.profile?.id);
  const jobs = useGenerationJobs(profileId);
  const [open, setOpen] = useState(false);
  const running = jobs.data?.filter(isGenerating).length ?? 0;
  const needsInput =
    jobs.data?.filter((job) => job.status === "needs_input").length ?? 0;
  if (!jobs.data?.length && !jobs.error) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="shrink-0 px-2"
          aria-label={`Generation activity${running ? `, ${running} generating` : needsInput ? `, ${needsInput} needs attention` : ""}`}
        >
          {running ? (
            <LoaderCircle
              size={16}
              className="animate-spin motion-reduce:animate-none"
            />
          ) : needsInput ? (
            <CircleHelp size={16} />
          ) : (
            <History size={16} />
          )}
          <span className="hidden text-supporting sm:inline">
            {running
              ? `${running} generating`
              : needsInput
                ? "Needs attention"
                : "Activity"}
          </span>
          {(running > 0 || needsInput > 0) && (
            <span className="text-metadata tabular-nums sm:hidden">
              {running || needsInput}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(480px,70dvh)] w-[min(380px,calc(100vw-2rem))] overflow-y-auto p-0"
      >
        <h2 className="border-b border-line px-3 py-3 text-ui font-medium">
          Generation activity
        </h2>
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
          {[...(jobs.data ?? [])]
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
              />
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
export function GenerationProgress({
  profileId,
  kind,
  challengeId = null,
  excludeId,
}: {
  profileId: string;
  kind: "challenge" | "quiz";
  challengeId?: string | null;
  excludeId?: string;
}) {
  const jobs = useGenerationJobs(profileId);
  const pending =
    jobs.data?.filter(
      (job) =>
        job.id !== excludeId &&
        (isGenerating(job) || job.status === "needs_input") &&
        (kind === "challenge"
          ? job.kind === "challenge"
          : job.kind !== "challenge" && job.challengeId === challengeId),
    ) ?? [];
  if (!pending.length) return null;
  return (
    <section
      aria-label="Generation progress"
      aria-live="polite"
      className="shrink-0 divide-y divide-line rounded-lg border border-line bg-surface"
    >
      {pending.map((job) => (
        <GenerationJobRow key={job.id} job={job} />
      ))}
    </section>
  );
}
