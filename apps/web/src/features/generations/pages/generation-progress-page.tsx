import { useEffect, useRef } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { LoaderCircle } from "lucide-react";
import { AppShell } from "@/shared/components/layout/app-shell";
import { LoadingScreen } from "@/shared/components/ui/feedback";
import { useProfile } from "@/features/profile/hooks/use-profile";
import {
  HarnessTranscriptContent,
  formatRunDate,
  useHarnessThread,
} from "@/features/harness";
import { JobActions } from "../components/generation-activity";
import { useGenerationJobs } from "../hooks/use-generation-jobs";
import {
  generationHref,
  generationLabel,
  generationTitle,
  isGenerating,
  type GenerationJob,
} from "../types";

function completionHref(job: GenerationJob) {
  // Challenges open on their activity so the build transcript and the project
  // setup are in view; quizzes follow their regular destination.
  if (job.kind === "challenge" && job.resultId)
    return `/chat?id=${encodeURIComponent(job.resultId)}&tab=activity`;
  return generationHref(job);
}

/**
 * Live progress for one queued generation: a single run header with the
 * job's own status and controls, the transcript as the body, and a redirect
 * into the result when it completes.
 */
export function GenerationProgressPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const profile = useProfile();
  const jobs = useGenerationJobs(profile?.id, true);
  const job = jobs.data?.find((entry) => entry.id === params.id);
  const redirected = useRef(false);
  useEffect(() => {
    if (!job || redirected.current) return;
    if (job.status === "completed" && job.resultId) {
      redirected.current = true;
      navigate(completionHref(job), { replace: true });
    } else if (job.status === "needs_input") {
      // The clarification card lives in the home composer.
      redirected.current = true;
      navigate(generationHref(job), { replace: true });
    }
  }, [job, navigate]);
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  if (!job) {
    if (jobs.isPending) return <LoadingScreen />;
    return <Navigate to="/" replace />;
  }
  const working = isGenerating(job);
  return (
    <AppShell
      profile={profile}
      title="Generating"
      breadcrumbs={[{ label: "Home", href: "/" }]}
    >
      <section className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6 md:px-8">
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line pb-3">
          <div className="min-w-0">
            <h1
              title={generationTitle(job)}
              className="min-w-0 text-ui font-medium"
            >
              {generationTitle(job)}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-metadata text-muted">
              {working && (
                <LoaderCircle
                  size={13}
                  aria-hidden="true"
                  className="shrink-0 animate-spin motion-reduce:animate-none"
                />
              )}
              <span>{generationLabel(job)}</span>
              <span aria-hidden="true">·</span>
              <span>started {formatRunDate(job.createdAt)}</span>
            </p>
          </div>
          <JobActions job={job} linkProgress={false} />
        </header>
        <Transcript profile={profile.id} job={job} />
      </section>
    </AppShell>
  );
}

function Transcript({ profile, job }: { profile: string; job: GenerationJob }) {
  const thread = useHarnessThread(profile, job.harnessThreadId ?? undefined);
  if (!job.harnessThreadId || !thread.data)
    return (
      <p className="mt-5 text-supporting text-muted">
        {thread.isPending
          ? "Loading the run transcript."
          : "Queued. The run transcript appears here as soon as the model starts."}
      </p>
    );
  return (
    <HarnessTranscriptContent
      profileId={profile}
      detail={thread.data}
      joined
      className="mt-5"
    />
  );
}
