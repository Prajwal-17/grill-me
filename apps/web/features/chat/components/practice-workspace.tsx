"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
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
  BookOpen,
  FileCode2,
  ScanLine,
  ListChecks,
  PanelRight,
} from "lucide-react";
import type { Challenge, Profile, ReviewJob } from "@/shared/types/api";
import { PageIntro } from "@/shared/components/layout/page-intro";
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

import { ChallengeReference } from "./challenge-reference";
import { useWideWorkspace } from "../hooks/use-wide-workspace";
import { Sheet, SheetContent, SheetTitle } from "@/shared/components/ui/sheet";

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
  const [sidePanel, setSidePanel] = useState<"task" | "files" | null>(null);
  const wide = useWideWorkspace();
  const taskToggle = useRef<HTMLButtonElement>(null);
  const filesToggle = useRef<HTMLButtonElement>(null);
  const referenceOpen = sidePanel === "task" && tab !== "overview";
  const closeReference = () => {
    setSidePanel(null);
    taskToggle.current?.focus();
  };
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
      setSidePanel(null);
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
              variant="secondary"
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
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 border-b border-line bg-panel px-3 md:px-5">
              <div className="min-w-0 overflow-x-auto">
                <TabsList
                  variant="line"
                  className="h-11 min-w-max justify-start"
                  aria-label="Challenge workspace"
                >
                  <TabsTrigger
                    value="overview"
                    className="flex-none gap-2 px-3"
                  >
                    <BookOpen size={14} className="hidden sm:block" />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="submit" className="flex-none gap-2 px-3">
                    <FileCode2 size={14} className="hidden sm:block" />
                    Submit
                  </TabsTrigger>
                  <TabsTrigger value="reviews" className="flex-none gap-2 px-3">
                    <ScanLine size={14} className="hidden sm:block" />
                    Reviews
                    {running && (
                      <LoaderCircle size={13} className="animate-spin" />
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="quizzes" className="flex-none gap-2 px-3">
                    <ListChecks size={14} className="hidden sm:block" />
                    Quizzes
                  </TabsTrigger>
                </TabsList>
              </div>
              <div className="ml-auto flex items-center gap-1 py-1.5">
                {selectedAttempt && (
                  <Button
                    ref={filesToggle}
                    size="sm"
                    variant={sidePanel === "files" ? "secondary" : "ghost"}
                    aria-pressed={sidePanel === "files"}
                    onClick={() =>
                      setSidePanel(sidePanel === "files" ? null : "files")
                    }
                  >
                    <Files size={14} />
                    Files
                  </Button>
                )}
                {tab !== "overview" && (
                  <Button
                    ref={taskToggle}
                    size="sm"
                    variant={referenceOpen ? "secondary" : "ghost"}
                    aria-expanded={referenceOpen}
                    aria-controls={
                      referenceOpen ? "challenge-reference" : undefined
                    }
                    onClick={() => setSidePanel(referenceOpen ? null : "task")}
                  >
                    <PanelRight size={14} />
                    {referenceOpen ? "Hide task" : "Show task"}
                  </Button>
                )}
              </div>
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
                      className="rounded-lg border border-line bg-panel p-4"
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
                  <PageIntro
                    title="Submit your implementation"
                    description="Connect a local project, attach source files, or paste your code for review."
                  />
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
                <p role="status" className="p-6 text-sm text-muted">
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
        {referenceOpen && wide && (
          <aside
            id="challenge-reference"
            aria-label="Challenge reference"
            className="w-[340px] min-w-[300px] max-w-[35%] shrink-0 border-l border-line"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                closeReference();
              }
            }}
          >
            <ChallengeReference
              challenge={challenge}
              onClose={closeReference}
            />
          </aside>
        )}
        <Sheet
          open={referenceOpen && !wide}
          onOpenChange={(open) => {
            if (!open) closeReference();
          }}
        >
          <SheetContent
            id="challenge-reference"
            className="w-[min(100%,440px)] gap-0 p-0 sm:max-w-[440px]"
            showCloseButton={false}
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              taskToggle.current?.focus();
            }}
          >
            <SheetTitle className="sr-only">Challenge reference</SheetTitle>
            <ChallengeReference
              challenge={challenge}
              onClose={closeReference}
            />
          </SheetContent>
        </Sheet>
        {sidePanel === "files" && selectedAttempt && (
          <SubmissionFiles
            key={selectedAttempt.id}
            attempt={selectedAttempt}
            profileId={profile.id}
            projectPath={selectedProject?.root ?? null}
            submissionCount={attempts.data?.length ?? 0}
            returnFocusRef={filesToggle}
            onClose={() => {
              setSidePanel(null);
              filesToggle.current?.focus();
            }}
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
