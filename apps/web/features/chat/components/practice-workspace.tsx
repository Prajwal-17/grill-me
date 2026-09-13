"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { ArrowLeft, Paperclip, LoaderCircle, X } from "lucide-react";
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
import { AttemptReview } from "./attempt-review";

type Draft = {
  content: string;
  uploads: { id: string; filename: string }[];
  projectId: string;
  subdirectory: string;
  baseRevision: string;
  question: string;
};
const emptyDraft: Draft = {
  content: "",
  uploads: [],
  projectId: "",
  subdirectory: "",
  baseRevision: "",
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
  const [path, setPath] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [reply, setReply] = useState("");
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
    queryFn: async () => {
      const data = await getSubmissions(profile.id, challenge.id);
      if (
        data.some((s) => s.reviews[0]?.response?.verdict === "accepted") &&
        challenge.status === "active"
      )
        void queries.invalidateQueries({
          queryKey: challengeKeys.detail(profile.id, challenge.id),
        });
      return data;
    },
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
    mutationFn: () => connectProject(profile.id, path),
    onSuccess: async (project) => {
      update({ projectId: project.id });
      setPath("");
      await queries.invalidateQueries({ queryKey: ["projects", profile.id] });
    },
  });
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const uploaded = await uploadFile(profile.id, file, (percent) =>
          setUploadProgress(`${file.name}: ${percent}%`),
        );
        const latest = useDrafts.getState().drafts[key] ?? emptyDraft;
        update({ uploads: [...latest.uploads, uploaded] });
      }
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
        subdirectory: draft.subdirectory,
        baseRevision: draft.baseRevision,
      });
    },
    onSuccess: async () => {
      update({ content: "", uploads: [] });
      await refresh();
    },
    onSettled: () => setUploadProgress(""),
  });
  const lifecycle = useMutation({
    mutationFn: (status: "active" | "paused" | "stopped") =>
      setChallengeStatus(profile.id, challenge.id, status),
    onSuccess: refresh,
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
  const busy =
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
  const legacyReviews = messages.data?.filter((m) => m.mode === "review") ?? [];
  return (
    <main className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 md:px-7 md:group-data-[sidebar-collapsed=true]/shell:pl-14">
        <Link
          href="/challenges"
          className="flex items-center gap-2 text-sm text-muted"
        >
          <ArrowLeft size={15} />
          Challenges
        </Link>
        <div className="flex items-center gap-2">
          {challenge.status === "completed" ? (
            <>
              <span className="text-xs text-success">
                {challenge.completionSource === "judge"
                  ? "Accepted"
                  : "Previously marked complete"}
              </span>
              <Button asChild size="sm">
                <Link href="/">Next challenge</Link>
              </Button>
            </>
          ) : active ? (
            <details className="relative">
              <summary className="cursor-pointer text-xs text-muted">
                Practice options
              </summary>
              <div className="absolute right-0 z-20 mt-2 grid min-w-36 gap-1 rounded-lg border border-line bg-surface p-2 shadow-lg">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || running}
                  onClick={() => lifecycle.mutate("paused")}
                >
                  Pause
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || running}
                  onClick={() => lifecycle.mutate("stopped")}
                >
                  Stop practicing
                </Button>
              </div>
            </details>
          ) : (
            <>
              <span className="text-xs text-muted capitalize">
                {challenge.status}
              </span>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => lifecycle.mutate("active")}
              >
                Resume
              </Button>
            </>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-7 md:px-10">
        <div className="mx-auto max-w-[900px] space-y-8">
          <ChallengeCard
            challenge={challenge}
            className="max-w-none"
            headerAction={
              <CopyButton
                text={statementMarkdown(challenge)}
                label="Copy challenge"
              />
            }
          />
          {challenge.contextSnapshot && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">
                Context used for this challenge
              </summary>
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-line p-3">
                {JSON.stringify(challenge.contextSnapshot, null, 2)}
              </pre>
            </details>
          )}
          {active && (
            <section
              aria-labelledby="submission-heading"
              className="border-t border-line pt-6"
            >
              <div className="flex items-center justify-between gap-4">
                <h2 id="submission-heading" className="text-lg font-semibold">
                  Your implementation
                </h2>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setHelpOpen(!helpOpen)}
                  aria-expanded={helpOpen}
                >
                  Help
                </Button>
              </div>
              <p className="mt-2 text-sm text-muted">
                Work in your editor. Paste your code, attach files, or connect
                your project.
              </p>
              <div className="mt-4 space-y-3">
                <Textarea
                  aria-label="Implementation or submission notes"
                  value={draft.content}
                  onChange={(e) => update({ content: e.target.value })}
                  disabled={busy}
                  placeholder={
                    draft.projectId
                      ? "What did you implement, and why did you choose this approach?"
                      : "Paste your implementation and any brief reasoning here…"
                  }
                  rows={7}
                  className="font-mono text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  {draft.uploads.map((file, index) => (
                    <span
                      key={file.id}
                      className="flex max-w-full items-center gap-2 rounded border border-line px-2 py-1 text-xs"
                    >
                      <span className="truncate">{file.filename}</span>
                      <button
                        disabled={busy}
                        aria-label={"Remove " + file.filename}
                        onClick={() =>
                          update({
                            uploads: draft.uploads.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
                <details
                  className="rounded-lg border border-line p-3"
                  open={Boolean(draft.projectId) || undefined}
                >
                  <summary className="cursor-pointer text-sm">
                    {draft.projectId
                      ? "Connected project"
                      : "Connect a local project"}
                  </summary>
                  <div className="mt-3 space-y-3">
                    <select
                      aria-label="Connected project"
                      value={draft.projectId}
                      onChange={(e) => update({ projectId: e.target.value })}
                      className="w-full rounded border border-line bg-surface px-3 py-2 text-sm"
                    >
                      <option value="">Use pasted code and attachments</option>
                      {projects.data?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {p.root}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <input
                        aria-label="Local project path"
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        placeholder="/absolute/path/to/project"
                        className="min-w-0 flex-1 rounded border border-line bg-surface px-3 py-2 text-sm"
                      />
                      <Button
                        size="sm"
                        disabled={!path.trim() || connection.isPending}
                        onClick={() => connection.mutate()}
                      >
                        Connect
                      </Button>
                    </div>
                    {draft.projectId && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          aria-label="Relevant subdirectory"
                          value={draft.subdirectory}
                          onChange={(e) =>
                            update({ subdirectory: e.target.value })
                          }
                          placeholder="Source subfolder (optional)"
                          className="rounded border border-line bg-surface px-3 py-2 text-sm"
                        />
                        <input
                          aria-label="Base Git revision"
                          value={draft.baseRevision}
                          onChange={(e) =>
                            update({ baseRevision: e.target.value })
                          }
                          placeholder="Base Git revision (optional)"
                          className="rounded border border-line bg-surface px-3 py-2 text-sm"
                        />
                      </div>
                    )}
                  </div>
                </details>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="relative flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm text-muted focus-within:ring-2">
                    <Paperclip size={16} />
                    Attach files
                    <input
                      aria-label="Attach source files"
                      type="file"
                      multiple
                      disabled={busy}
                      className="absolute inset-0 cursor-pointer opacity-0"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length) upload.mutate(files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <Button
                    variant="primary"
                    disabled={
                      busy ||
                      running ||
                      (!draft.content.trim() &&
                        !draft.uploads.length &&
                        !draft.projectId)
                    }
                    onClick={() => submit.mutate()}
                  >
                    {submit.isPending && (
                      <LoaderCircle size={15} className="animate-spin" />
                    )}
                    Submit for review
                  </Button>
                </div>
                {uploadProgress && (
                  <p role="status" className="text-xs text-muted">
                    Uploading {uploadProgress}
                  </p>
                )}
              </div>
              {helpOpen && (
                <section
                  className="mt-5 rounded-lg border border-line p-4"
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
                    className="mt-3 flex items-start gap-2"
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
                    <div aria-live="polite" className="mt-4">
                      <Markdown>{reply}</Markdown>
                    </div>
                  )}
                  {help.isPending && !reply && (
                    <p role="status" className="mt-3 text-xs text-muted">
                      Preparing help…
                    </p>
                  )}
                </section>
              )}
            </section>
          )}
          {error && (
            <p role="alert" className="text-sm leading-6 text-destructive">
              {error.message}
            </p>
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
                      {m.role === "user"
                        ? "You"
                        : m.mode === "hint"
                          ? "Guidance"
                          : "Clarification"}
                    </p>
                    <Markdown>{m.content}</Markdown>
                  </div>
                ))}
              </div>
            </details>
          )}
          <section aria-label="Submission reviews">
            {attempts.isLoading ? (
              <p role="status" className="text-sm text-muted">
                Loading attempts…
              </p>
            ) : attempts.error ? (
              <div role="alert">
                <p>{attempts.error.message}</p>
                <Button onClick={() => attempts.refetch()}>Retry</Button>
              </div>
            ) : (
              attempts.data?.map((attempt) => (
                <AttemptReview
                  key={attempt.id + ":" + attempt.reviews[0]?.id}
                  attempt={attempt}
                  busy={busy || Boolean(running)}
                  onRetry={(review, response) =>
                    reviewAction.mutate({ review, response })
                  }
                  onCancel={(review) =>
                    reviewAction.mutate({ review, cancel: true })
                  }
                />
              ))
            )}
          </section>
          {!!legacyReviews.length && (
            <details className="border-t border-line pt-4 text-sm">
              <summary className="cursor-pointer text-muted">
                Earlier submission feedback
              </summary>
              <div className="mt-4 space-y-4">
                {legacyReviews.map((m) => (
                  <div key={m.id}>
                    <p className="text-xs text-muted">
                      {m.role === "user"
                        ? "Submitted work"
                        : "Historical review · unscored"}
                    </p>
                    <Markdown>{m.content}</Markdown>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </main>
  );
}
