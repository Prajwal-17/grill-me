import {
  ActivitySkeleton,
  BuildProgressSkeleton,
} from "@/shared/components/ui/loading-layouts";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";
import { CompactShell } from "@/shared/components/layout/compact-shell";
import { LoadingScreen } from "@/shared/components/ui/feedback";
import { Button } from "@/shared/components/ui/button";
import { ClarificationCard } from "@/shared/components/ai/clarification-card";
import { PromptSurface } from "@/shared/components/ai/prompt-surface";
import { useProfile } from "@/features/profile/hooks/use-profile";
import { ProjectPreparationActions } from "@/features/challenges/components/project-preparation";
import { useProjectPreparation } from "@/features/challenges/hooks/use-project-preparation";
import { projectPreparationView } from "@/features/challenges/lib/project-preparation-view";
import {
  HarnessTranscriptContent,
  useFollowActivity,
  useHarnessThreads,
  useHarnessTranscripts,
} from "@/features/harness";
import { answerGeneration } from "../api/generation-api";
import { JobActions } from "../components/generation-activity";
import {
  useGenerationJobs,
  useSaveGenerationJob,
} from "../hooks/use-generation-jobs";
import {
  generationHref,
  generationLabel,
  generationTitle,
  isGenerating,
  type GenerationJob,
} from "../types";

export function GenerationProgressPage() {
  const { id } = useParams<{ id: string }>();
  const profile = useProfile();
  const jobs = useGenerationJobs(profile?.id, true);
  const job = jobs.data?.find((entry) => entry.id === id);
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  if (!job) {
    if (jobs.isPending)
      return (
        <CompactShell profile={profile}>
          <BuildProgressSkeleton />
        </CompactShell>
      );
    return <Navigate to="/" replace />;
  }
  if (job.kind !== "challenge" && job.status === "completed" && job.resultId)
    return <Navigate to={generationHref(job)} replace />;
  return (
    <CompactShell profile={profile}>
      <GenerationProgress key={job.id} job={job} />
    </CompactShell>
  );
}

function GenerationProgress({ job }: { job: GenerationJob }) {
  const challengeId =
    job.kind === "challenge" && job.status === "completed"
      ? job.resultId
      : null;
  const { preparation } = useProjectPreparation(
    job.profileId,
    challengeId ?? "",
    {
      enabled: Boolean(challengeId),
    },
  );
  const setup = preparation.data
    ? projectPreparationView(preparation.data)
    : null;
  const setupThreads = useHarnessThreads(
    job.profileId,
    {
      challengeId: challengeId ?? undefined,
      kind: "project_scaffold",
      limit: 1_000,
    },
    { enabled: Boolean(challengeId) },
  );
  const threadIds = [
    ...(job.harnessThreadId ? [job.harnessThreadId] : []),
    ...(setupThreads.data ?? [])
      .slice()
      .reverse()
      .map((thread) => thread.id),
  ];
  const transcripts = useHarnessTranscripts(job.profileId, threadIds);
  const working =
    isGenerating(job) || Boolean(setup?.running && !setup.awaitingApproval);
  const {
    paneRef,
    contentRef,
    onScroll,
    onWheel,
    onPointerDown,
    onKeyDown,
    onTouchStart,
    following,
    jumpToLatest,
  } = useFollowActivity({
    active: working,
    ready: transcripts.every((query) => !query.isPending),
    resetKey: job.id,
  });
  const clarification = job.status === "needs_input" ? job.clarification : null;
  const resultHref = generationHref(job);
  const title = job.kind === "challenge" ? "Build challenge" : "Generate quiz";
  const setupLabel = preparation.isError
    ? "Status unavailable"
    : (setup?.statusLabel ??
      (challengeId ? "Checking setup…" : "Waiting for brief"));

  return (
    <main className="relative flex h-full min-h-0 flex-col">
      <header className="mx-auto w-full max-w-4xl shrink-0 px-4 pt-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <Button
              asChild
              size="icon-sm"
              variant="ghost"
              className="-ml-2 shrink-0"
            >
              <Link to="/" aria-label="Back to Home" title="Back to Home">
                <ArrowLeft size={16} aria-hidden="true" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-section font-semibold tracking-tight">
                {title}
              </h1>
              <p className="mt-0.5 line-clamp-2 text-supporting break-words text-muted">
                {generationTitle(job)}
              </p>
            </div>
          </div>
          {challengeId ? (
            <Button
              asChild
              size="sm"
              variant={setup?.status === "ready" ? "primary" : "secondary"}
            >
              <Link to={resultHref}>
                Open challenge <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <JobActions job={job} linkProgress={false} compact />
          )}
        </div>
        <ol
          aria-label="Build progress"
          className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-b border-line pb-3"
        >
          <ProgressStep
            label={job.kind === "challenge" ? "Challenge brief" : "Quiz"}
            status={challengeId ? "Ready" : generationLabel(job)}
            working={isGenerating(job)}
            complete={job.status === "completed"}
          />
          {job.kind === "challenge" && (
            <ProgressStep
              label="Project setup"
              status={setupLabel}
              working={Boolean(setup?.running && !setup.awaitingApproval)}
              complete={setup?.status === "ready"}
            />
          )}
        </ol>
      </header>
      <div
        ref={paneRef}
        onScroll={onScroll}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        tabIndex={0}
        aria-label="Build activity"
        className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:outline-offset-[-2px]"
      >
        <div
          ref={contentRef}
          className="mx-auto w-full max-w-4xl space-y-4 px-4 py-4 sm:px-6"
        >
          {job.error && (
            <p role="alert" className="text-supporting text-destructive">
              {job.error.message}
            </p>
          )}
          {threadIds.length === 0 && isGenerating(job) && (
            <p role="status" className="text-supporting text-muted">
              Waiting for the run to start…
            </p>
          )}
          {transcripts.map((transcript, index) => (
            <div key={threadIds[index]}>
              {transcript.data ? (
                <HarnessTranscriptContent
                  profileId={job.profileId}
                  detail={
                    clarification && threadIds[index] === job.harnessThreadId
                      ? {
                          ...transcript.data,
                          turns: transcript.data.turns.map((turn) => ({
                            ...turn,
                            items: turn.items.filter(
                              (item) =>
                                item.type !== "user_input_request" ||
                                item.status !== "pending" ||
                                item.payload.kind !== "clarification",
                            ),
                          })),
                        }
                      : transcript.data
                  }
                  joined
                  showRunControls={false}
                />
              ) : transcript.isError ? (
                <div className="flex flex-wrap items-center gap-2 text-supporting">
                  <p role="alert" className="text-destructive">
                    {transcript.error.message}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void transcript.refetch()}
                  >
                    Retry transcript
                  </Button>
                </div>
              ) : (
                <ActivitySkeleton header={false} />
              )}
            </div>
          ))}
          {clarification && (
            <GenerationClarification
              key={clarification.question}
              job={job}
              {...clarification}
            />
          )}
          {challengeId && (
            <ProjectPreparationActions
              profileId={job.profileId}
              challengeId={challengeId}
              active
            />
          )}
          {setupThreads.isError && (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="text-supporting text-destructive">
                {setupThreads.error.message}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void setupThreads.refetch()}
              >
                Retry setup transcript
              </Button>
            </div>
          )}
        </div>
      </div>
      {working && !following && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            size="sm"
            variant="secondary"
            className="pointer-events-auto"
            onClick={jumpToLatest}
          >
            Jump to latest
          </Button>
        </div>
      )}
    </main>
  );
}

function ProgressStep({
  label,
  status,
  working,
  complete,
}: {
  label: string;
  status: string;
  working: boolean;
  complete: boolean;
}) {
  return (
    <li
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-supporting"
      aria-current={working ? "step" : undefined}
    >
      {working ? (
        <LoaderCircle
          size={14}
          aria-hidden="true"
          className="animate-spin text-muted motion-reduce:animate-none"
        />
      ) : complete ? (
        <CheckCircle2 size={14} aria-hidden="true" className="text-success" />
      ) : null}
      <span className="font-medium">{label}</span>
      <span
        aria-live="polite"
        className={complete ? "text-success" : "text-muted"}
      >
        {status}
      </span>
    </li>
  );
}

function GenerationClarification({
  job,
  question,
  options,
}: {
  job: GenerationJob;
  question: string;
  options: string[];
}) {
  const [choice, setChoice] = useState("");
  const [custom, setCustom] = useState("");
  const saveJob = useSaveGenerationJob();
  const navigate = useNavigate();
  const answer = useMutation({
    mutationFn: (value: string) =>
      answerGeneration(job.profileId, job.id, question, value),
    onSuccess: saveJob,
  });
  return (
    <PromptSurface>
      <ClarificationCard
        question={question}
        options={options}
        choice={choice}
        custom={custom}
        busy={answer.isPending}
        onChoice={setChoice}
        onCustom={setCustom}
        onAnswer={(value) => answer.mutate(value)}
        onEdit={() => navigate(generationHref(job))}
        editLabel="Open in composer"
      />
      {answer.error && (
        <p role="alert" className="px-4 pb-3 text-supporting text-destructive">
          {answer.error.message}
        </p>
      )}
    </PromptSurface>
  );
}
