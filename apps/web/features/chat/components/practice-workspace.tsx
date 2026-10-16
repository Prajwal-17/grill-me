"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import {
  LoaderCircle,
  Lightbulb,
  Pause,
  Play,
  Check,
  Bookmark,
  Files,
} from "lucide-react";
import type { Challenge, Profile, ReviewJob } from "@/shared/types/api";
import { AppShell } from "@/shared/components/layout/app-shell";
import { Button } from "@/shared/components/ui/button";
import { Markdown } from "@/shared/components/markdown";
import { ChallengeCard } from "@/features/challenges/components/challenge-card";
import { CopyButton } from "@/shared/components/ui/copy-button";
import { statementMarkdown } from "@/features/challenges/lib/challenge-statement";
import { challengeKeys } from "@/features/challenges/api/challenge-api";
import { getHint, getMessages } from "@/features/chat/api/message-api";
import {
  cancelReview,
  connectProject,
  getJudgeStatus,
  getProjects,
  getSubmissions,
  retryReview,
  setChallengeStatus,
  submitAttempt,
  uploadFile,
} from "@/features/chat/api/review-api";
import { SubmissionHistory } from "./submission-history";
import { SubmissionFiles } from "./submission-files";
import { SubmissionComposer } from "./submission-composer";
import { ProjectPicker } from "./project-picker";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/components/ui/tabs";
import { completeChallenge } from "@/features/challenges/api/challenge-api";
import { QuizWorkspace } from "@/features/quizzes/components/quiz-workspace";

type Draft = {
  content: string;
  uploads: { id: string; filename: string }[];
  projectId: string;
};
const emptyDraft: Draft = {
  content: "",
  uploads: [],
  projectId: "",
};

const useDrafts = create<{
  drafts: Record<string, Draft>;
  update: (id: string, patch: Partial<Draft>) => void;
}>((set) => ({
  drafts: {},
  update: (id, patch) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [id]: { ...(state.drafts[id] ?? emptyDraft), ...patch },
      },
    })),
}));
export function PracticeWorkspace({
  profile,
  challenge,
  backTo = { label: "Challenges", href: "/challenges" },
}: {
  profile: Profile;
  challenge: Challenge;
  backTo?: { label: string; href: string };
}) {
  const queries = useQueryClient();
  const key = profile.id + ":" + challenge.id;
  const draft = useDrafts((s) => s.drafts[key] ?? emptyDraft);
  const updateDraft = useDrafts((s) => s.update);
  const update = (patch: Partial<Draft>) => updateDraft(key, patch);
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab =
    requestedTab === "submit" ||
    requestedTab === "reviews" ||
    requestedTab === "quizzes"
      ? requestedTab
      : "overview";
  const setTab = (value: string) => {
    if (
      value !== "overview" &&
      value !== "submit" &&
      value !== "reviews" &&
      value !== "quizzes"
    )
      return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === value) return;
    url.searchParams.set("tab", value);
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
  };
  const [folderOpen, setFolderOpen] = useState(false);
  const [uploadNotice, setUploadNotice] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");
  const [reply, setReply] = useState("");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [filesOpen, setFilesOpen] = useState(true);
  const refresh = async () => {
    await Promise.all([
      queries.invalidateQueries({ queryKey: ["submissions", challenge.id] }),
      queries.invalidateQueries({ queryKey: ["challenges"] }),
      queries.invalidateQueries({ queryKey: ["progress"] }),
      queries.invalidateQueries({
        queryKey: challengeKeys.messages(challenge.id),
      }),
    ]);
  };
  const attempts = useQuery({
    queryKey: ["submissions", challenge.id],
    queryFn: () => getSubmissions(profile.id, challenge.id),
    refetchInterval: (query) =>
      query.state.data?.some((s) =>
        s.reviews.some((r) => r.status === "running" || r.status === "queued"),
      )
        ? 1500
        : false,
  });
  const projects = useQuery({
    queryKey: ["projects", profile.id],
    queryFn: () => getProjects(profile.id),
  });
  const judgeStatus = useQuery({
    queryKey: ["judge-status", profile.id],
    queryFn: () => getJudgeStatus(profile.id),
    enabled: tab === "submit",
    retry: false,
    staleTime: 15_000,
  });
  const messages = useQuery({
    queryKey: challengeKeys.messages(challenge.id),
    queryFn: () => getMessages(profile.id, challenge.id),
  });
  const connection = useMutation({
    mutationFn: (path: string) => connectProject(profile.id, path),
    onSuccess: async (project) => {
      update({ projectId: project.id });
      await queries.invalidateQueries({ queryKey: ["projects", profile.id] });
    },
  });
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      let skipped = 0;
      for (const file of files) {
        const filename = file.webkitRelativePath || file.name;
        if (
          filename
            .split("/")
            .some(
              (p) =>
                [
                  ".git",
                  "node_modules",
                  "vendor",
                  ".next",
                  "dist",
                  "build",
                  "__pycache__",
                  ".venv",
                  "venv",
                  ".data",
                  ".codex",
                  ".ssh",
                  ".aws",
                  ".azure",
                ].includes(p) ||
                /^\.env(?:\.|$)/i.test(p) ||
                /(?:\.pem|\.key|\.p12|\.pfx)$/i.test(p) ||
                /^(?:credentials|auth\.json|id_rsa|id_ed25519)$/i.test(p),
            )
        ) {
          skipped++;
          continue;
        }
        const uploaded = await uploadFile(
          profile.id,
          file,
          (percent) => setUploadProgress(`${filename}: ${percent}%`),
          filename,
        );
        const latest = useDrafts.getState().drafts[key] ?? emptyDraft;
        update({
          uploads: [
            ...latest.uploads.filter((f) => f.filename !== uploaded.filename),
            uploaded,
          ],
        });
      }
      setUploadNotice(
        skipped ? `${skipped} credential or generated files excluded.` : "",
      );
    },
    onSettled: () => setUploadProgress(""),
  });
  const submit = useMutation({
    mutationFn: async () => {
      let content = draft.content;
      const uploadIds = draft.uploads.map((f) => f.id);
      if (new TextEncoder().encode(content).length > 65536) {
        const uploaded = await uploadFile(
          profile.id,
          new File([content], "submission.txt"),
          (percent) => setUploadProgress(`Submission: ${percent}%`),
        );
        uploadIds.push(uploaded.id);
        content = "Implementation is in submission.txt.";
      }
      return submitAttempt(profile.id, challenge.id, {
        content,
        uploadIds,
        projectId: draft.projectId || null,
        subdirectory: "",
        baseRevision: "",
      });
    },
    onSuccess: async () => {
      update({ content: "", uploads: [] });
      setSelectedSubmissionId("");
      setFilesOpen(true);
      setTab("reviews");
      await refresh();
    },
    onSettled: () => setUploadProgress(""),
  });
  const lifecycle = useMutation({
    mutationFn: (status: "active" | "paused" | "saved" | "completed") =>
      status === "completed"
        ? completeChallenge(profile.id, challenge.id)
        : setChallengeStatus(profile.id, challenge.id, status),
    onSuccess: async (_result, status) => {
      await refresh();
      if (status === "saved") router.push("/challenges");
    },
  });
  const reviewAction = useMutation({
    mutationFn: ({
      review,
      response,
      cancel,
    }: {
      review: ReviewJob;
      response?: string | null;
      cancel?: boolean;
    }) =>
      cancel
        ? cancelReview(profile.id, review.id)
        : retryReview(profile.id, review.id, response ?? null),
    onSuccess: refresh,
  });
  const hint = useMutation({
    mutationFn: async () => {
      setReply("");
      const delta = (text: string) => setReply((current) => current + text);
      return getHint(profile.id, challenge.id, delta);
    },
    onSuccess: async () => {
      await refresh();
    },
  });
  const running = attempts.data?.some((s) =>
    s.reviews.some((r) => r.status === "running" || r.status === "queued"),
  );
  const selectedAttempt =
    attempts.data?.find((attempt) => attempt.id === selectedSubmissionId) ??
    attempts.data?.[0];
  const selectedProject = projects.data?.find(
    (project) => project.id === selectedAttempt?.projectId,
  );
  const projectReview =
    Boolean(draft.projectId) ||
    draft.uploads.some((file) => file.filename.includes("/"));
  const reviewIssue = judgeStatus.data
    ? projectReview
      ? !judgeStatus.data.codex.installed
        ? "Codex is not installed. " + judgeStatus.data.codex.message
        : !judgeStatus.data.codex.authenticated
          ? "Codex is not signed in. " + judgeStatus.data.codex.message
          : null
      : !judgeStatus.data.omniroute.configured ||
          !judgeStatus.data.omniroute.online
        ? judgeStatus.data.omniroute.message
        : null
    : null;
  const busy =
    connection.isPending ||
    submit.isPending ||
    upload.isPending ||
    hint.isPending ||
    lifecycle.isPending ||
    reviewAction.isPending;
  const active = challenge.status === "active";
  const error =
    submit.error ??
    upload.error ??
    connection.error ??
    lifecycle.error ??
    reviewAction.error ??
    hint.error;
  const savedHints = messages.data?.filter((m) => m.mode === "hint") ?? [];
  return (
    <AppShell
      profile={profile}
      title={`#${challenge.number} ${challenge.title}`}
      breadcrumbs={[backTo]}
      contentScrollable={false}
      actions={
        <>
          {selectedAttempt && (
            <Button
              size="sm"
              variant={filesOpen ? "secondary" : "ghost"}
              aria-pressed={filesOpen}
              onClick={() => setFilesOpen((open) => !open)}
            >
              <Files size={14} />
              Files
            </Button>
          )}
          {challenge.status === "completed" && (
            <span className="text-xs text-success">Completed</span>
          )}
          {challenge.status === "saved" && (
            <span className="text-xs text-muted">Saved for later</span>
          )}
          {(active || challenge.status === "paused") && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || lifecycle.isPending}
              onClick={() => lifecycle.mutate("saved")}
            >
              <Bookmark size={14} /> Save for later
            </Button>
          )}
          {active ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => lifecycle.mutate("paused")}
            >
              <Pause size={14} />
              Pause
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => lifecycle.mutate("active")}
            >
              <Play size={14} />
              Resume
            </Button>
          )}
          {challenge.status !== "completed" && (
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => lifecycle.mutate("completed")}
            >
              <Check size={15} />
              Mark completed
            </Button>
          )}
        </>
      }
    >
      <main className="relative flex h-full min-h-0 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          {error && (
            <p
              role="alert"
              className="shrink-0 border-b border-line px-5 py-3 text-sm text-destructive"
            >
              {error.message}
            </p>
          )}
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="min-h-0 flex-1 gap-0 overflow-hidden"
          >
            <div className="shrink-0 overflow-x-auto border-b border-line px-4 md:px-7">
              <TabsList
                variant="line"
                className="h-11 min-w-max justify-start"
                aria-label="Challenge workspace"
              >
                <TabsTrigger value="overview" className="flex-none px-4">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="submit" className="flex-none px-4">
                  Submit
                </TabsTrigger>
                <TabsTrigger value="reviews" className="flex-none px-4">
                  Reviews
                  {running && (
                    <LoaderCircle size={13} className="animate-spin" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="quizzes" className="flex-none px-4">
                  Quizzes
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent
              value="overview"
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <div className="px-5 py-6 md:px-10">
                <div className="mx-auto max-w-[850px] space-y-6">
                  <ChallengeCard
                    challenge={challenge}
                    className="max-w-none"
                    showTitle={false}
                    headerAction={
                      <CopyButton
                        text={statementMarkdown(challenge)}
                        label="Copy challenge"
                      />
                    }
                  />
                  {active && (
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        onClick={() => setTab("submit")}
                      >
                        Submit implementation
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => hint.mutate()}
                      >
                        {hint.isPending ? (
                          <LoaderCircle size={14} className="animate-spin" />
                        ) : (
                          <Lightbulb size={14} />
                        )}
                        Hint
                      </Button>
                    </div>
                  )}
                  {(reply || hint.isPending) && active && (
                    <section
                      className="border-l-2 border-[var(--grill-accent)] py-1 pl-4"
                      aria-label="Challenge hint"
                      aria-live="polite"
                    >
                      {reply && (
                        <div className="text-sm leading-6">
                          <Markdown>{reply}</Markdown>
                        </div>
                      )}
                      {hint.isPending && !reply && (
                        <p role="status" className="text-xs text-muted">
                          Preparing a hint…
                        </p>
                      )}
                    </section>
                  )}
                  {!!savedHints.length && (
                    <details className="border-t border-line pt-4 text-sm">
                      <summary className="cursor-pointer text-muted">
                        Previous hints ({savedHints.length})
                      </summary>
                      <div className="mt-4 space-y-5">
                        {savedHints.map((m) => (
                          <div key={m.id}>
                            <Markdown>{m.content}</Markdown>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {challenge.contextSnapshot && (
                    <details className="text-xs text-muted">
                      <summary className="cursor-pointer">
                        Generation details
                      </summary>
                      <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-line p-3">
                        {JSON.stringify(challenge.contextSnapshot, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </TabsContent>
            <TabsContent
              value="submit"
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <div className="px-5 py-6 md:px-10">
                <section
                  className="mx-auto max-w-[900px] space-y-5"
                  aria-label="Submit implementation"
                >
                  {!active && (
                    <div className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">
                      {challenge.status === "completed"
                        ? "You marked this challenge completed."
                        : challenge.status === "saved"
                          ? "This challenge is saved for later."
                          : "This challenge is paused."}{" "}
                      Resume to submit another version.
                    </div>
                  )}
                  <SubmissionComposer
                    active={active}
                    busy={busy}
                    running={Boolean(running)}
                    projects={projects.data ?? []}
                    projectsLoading={projects.isLoading}
                    projectsError={Boolean(projects.error)}
                    projectId={draft.projectId}
                    uploads={draft.uploads}
                    content={draft.content}
                    uploadProgress={uploadProgress}
                    uploadNotice={uploadNotice}
                    onProjectChange={(projectId) => update({ projectId })}
                    onConnectFolder={() => setFolderOpen(true)}
                    onUpload={(files) => upload.mutate(files)}
                    onRemoveUpload={(id) =>
                      update({
                        uploads: draft.uploads.filter((file) => file.id !== id),
                      })
                    }
                    onClearUploads={() => update({ uploads: [] })}
                    onContentChange={(content) => update({ content })}
                    onSubmit={() => submit.mutate()}
                    onViewReview={() => setTab("reviews")}
                    reviewIssue={reviewIssue}
                    reviewStatusLoading={judgeStatus.isLoading}
                    reviewStatusError={Boolean(judgeStatus.error)}
                    onRetryReviewStatus={() => judgeStatus.refetch()}
                  />
                </section>
              </div>
            </TabsContent>
            <TabsContent value="reviews" className="min-h-0 overflow-hidden">
              {attempts.isLoading ? (
                <p role="status" className="text-sm text-muted">
                  Loading submissions…
                </p>
              ) : attempts.error ? (
                <div role="alert">
                  <p>{attempts.error.message}</p>
                  <Button onClick={() => attempts.refetch()}>Retry</Button>
                </div>
              ) : (
                <SubmissionHistory
                  attempts={attempts.data ?? []}
                  selectedId={selectedSubmissionId}
                  onSelectedChange={setSelectedSubmissionId}
                  busy={busy || Boolean(running) || !active}
                  onRetry={(review, response) =>
                    reviewAction.mutate({ review, response })
                  }
                  onCancel={(review) =>
                    reviewAction.mutate({ review, cancel: true })
                  }
                />
              )}
            </TabsContent>
            <TabsContent
              value="quizzes"
              className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-10"
            >
              <QuizWorkspace
                profileId={profile.id}
                challengeId={challenge.id}
              />
            </TabsContent>
          </Tabs>
        </div>
        {filesOpen && selectedAttempt && (
          <SubmissionFiles
            key={selectedAttempt.id}
            attempt={selectedAttempt}
            profileId={profile.id}
            projectPath={selectedProject?.root ?? null}
            submissionCount={attempts.data?.length ?? 0}
            onClose={() => setFilesOpen(false)}
          />
        )}
        <ProjectPicker
          profileId={profile.id}
          open={folderOpen}
          onOpenChange={setFolderOpen}
          onSelect={(path) => connection.mutate(path)}
        />
      </main>
    </AppShell>
  );
}
