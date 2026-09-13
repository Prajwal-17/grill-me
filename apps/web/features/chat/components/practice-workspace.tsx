"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import {
  ArrowLeft,
  LoaderCircle,
  Pause,
  Play,
  Check,
  Bookmark,
  Files,
} from "lucide-react";
import type { Challenge, Profile, ReviewJob } from "@/shared/types/api";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Markdown } from "@/shared/components/markdown";
import { ChallengeCard } from "@/features/challenges/components/challenge-card";
import { CopyButton } from "@/shared/components/ui/copy-button";
import { statementMarkdown } from "@/features/challenges/lib/challenge-statement";
import { challengeKeys } from "@/features/challenges/api/challenge-api";
import {
  getHint,
  getMessages,
  sendMessage,
} from "@/features/chat/api/message-api";
import {
  cancelReview,
  connectProject,
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

type Draft = {
  content: string;
  uploads: { id: string; filename: string }[];
  projectId: string;
  question: string;
};
const emptyDraft: Draft = {
  content: "",
  uploads: [],
  projectId: "",
  question: "",
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
}: {
  profile: Profile;
  challenge: Challenge;
}) {
  const queries = useQueryClient();
  const key = profile.id + ":" + challenge.id;
  const draft = useDrafts((s) => s.drafts[key] ?? emptyDraft);
  const updateDraft = useDrafts((s) => s.update);
  const update = (patch: Partial<Draft>) => updateDraft(key, patch);
  const router = useRouter();
  const [tab, setTab] = useState("challenge");
  const [folderOpen, setFolderOpen] = useState(false);
  const [uploadNotice, setUploadNotice] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
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
  const help = useMutation({
    mutationFn: async (kind: "clarify" | "hint" | "approach") => {
      setReply("");
      const delta = (text: string) => setReply((current) => current + text);
      return kind === "clarify"
        ? sendMessage(
            profile.id,
            challenge.id,
            draft.question,
            "clarify",
            [],
            delta,
          )
        : getHint(profile.id, challenge.id, delta, kind);
    },
    onSuccess: async () => {
      update({ question: "" });
      setReply("");
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
  const busy =
    connection.isPending ||
    submit.isPending ||
    upload.isPending ||
    help.isPending ||
    lifecycle.isPending ||
    reviewAction.isPending;
  const active = challenge.status === "active";
  const error =
    submit.error ??
    upload.error ??
    connection.error ??
    lifecycle.error ??
    reviewAction.error ??
    help.error;
  const savedHelp =
    messages.data?.filter((m) => m.mode === "hint" || m.mode === "clarify") ??
    [];
  return (
    <main className="relative flex h-full min-h-0 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-4 py-3 md:px-7 md:group-data-[sidebar-collapsed=true]/shell:pl-14">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              asChild
              size="icon-sm"
              variant="ghost"
              className="border border-line"
            >
              <Link href="/challenges" aria-label="Back to challenges">
                <ArrowLeft size={15} />
              </Link>
            </Button>
            <div className="min-w-0">
              <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-1 text-[11px] text-muted"
              >
                <Link href="/challenges" className="hover:text-foreground">
                  Challenges
                </Link>
              </nav>
              <h1 className="mt-0.5 truncate text-base font-semibold">
                {challenge.title}
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        </header>
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
          <div className="shrink-0 border-b border-line px-4 md:px-7">
            <TabsList
              variant="line"
              className="h-11 w-full justify-start"
              aria-label="Challenge workspace"
            >
              <TabsTrigger value="challenge" className="flex-none px-4">
                Overview
              </TabsTrigger>
              <TabsTrigger value="submit" className="flex-none px-4">
                Submit
              </TabsTrigger>
              <TabsTrigger value="reviews" className="flex-none px-4">
                Reviews
                {running && <LoaderCircle size={13} className="animate-spin" />}
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent
            value="challenge"
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
                    <Button variant="primary" onClick={() => setTab("submit")}>
                      Submit implementation
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setHelpOpen(!helpOpen)}
                      aria-expanded={helpOpen}
                    >
                      Help
                    </Button>
                  </div>
                )}
                {helpOpen && active && (
                  <section
                    className="space-y-4 rounded-lg border border-line p-4"
                    aria-label="Challenge help"
                  >
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => help.mutate("hint")}
                      >
                        Give me a hint
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => help.mutate("approach")}
                      >
                        High-level approach
                      </Button>
                    </div>
                    <form
                      className="flex items-start gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (draft.question.trim()) help.mutate("clarify");
                      }}
                    >
                      <Textarea
                        aria-label="Clarify a requirement"
                        value={draft.question}
                        onChange={(e) => update({ question: e.target.value })}
                        placeholder="What is unclear in the requirements?"
                        rows={2}
                      />
                      <Button
                        size="sm"
                        type="submit"
                        disabled={busy || !draft.question.trim()}
                      >
                        Clarify
                      </Button>
                    </form>
                    {reply && (
                      <div aria-live="polite">
                        <Markdown>{reply}</Markdown>
                      </div>
                    )}
                    {help.isPending && !reply && (
                      <p role="status" className="text-xs text-muted">
                        Preparing help…
                      </p>
                    )}
                  </section>
                )}
                {!!savedHelp.length && (
                  <details className="border-t border-line pt-4 text-sm">
                    <summary className="cursor-pointer text-muted">
                      Saved help ({savedHelp.length})
                    </summary>
                    <div className="mt-4 space-y-5">
                      {savedHelp.map((m) => (
                        <div key={m.id}>
                          <p className="mb-1 text-xs text-muted">
                            {m.role === "user" ? "You" : "Guidance"}
                          </p>
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
  );
}
