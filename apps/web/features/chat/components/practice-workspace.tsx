"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import {
  ArrowLeft,
  Paperclip,
  LoaderCircle,
  X,
  Pause,
  Play,
  Check,
  Folder,
  Bookmark,
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
  const router = useRouter();
  const [tab, setTab] = useState("challenge");
  const [folderOpen, setFolderOpen] = useState(false);
  const [uploadNotice, setUploadNotice] = useState("");
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
        subdirectory: draft.subdirectory,
        baseRevision: draft.baseRevision,
      });
    },
    onSuccess: async () => {
      update({ content: "", uploads: [] });
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
  const legacyReviews = messages.data?.filter((m) => m.mode === "review") ?? [];
  return (
    <main className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 md:px-7 md:group-data-[sidebar-collapsed=true]/shell:pl-14">
        <Link
          href="/challenges"
          className="flex items-center gap-2 text-sm text-muted"
        >
          <ArrowLeft size={15} />
          Challenges
        </Link>
        <div className="flex flex-wrap items-center gap-2">
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
      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
        <div className="shrink-0 border-b border-line px-4 md:px-7">
          <TabsList
            variant="line"
            className="h-12 w-full max-w-sm"
            aria-label="Challenge workspace"
          >
            <TabsTrigger value="challenge">Challenge</TabsTrigger>
            <TabsTrigger value="submit">Submit</TabsTrigger>
            <TabsTrigger value="reviews">
              Reviews
              {running && <LoaderCircle size={13} className="animate-spin" />}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent
          value="challenge"
          className="min-h-0 overflow-y-auto px-5 py-7 md:px-10"
        >
          <div className="mx-auto max-w-[850px] space-y-6">
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
                <summary className="cursor-pointer">Generation details</summary>
                <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-line p-3">
                  {JSON.stringify(challenge.contextSnapshot, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </TabsContent>
        <TabsContent
          value="submit"
          className="min-h-0 overflow-y-auto px-5 py-7 md:px-10"
        >
          <section
            className="mx-auto max-w-[800px] space-y-6"
            aria-label="Submit implementation"
          >
            <div>
              <h2 className="text-xl font-semibold">Your implementation</h2>
              <p className="mt-2 text-sm text-muted">
                Attach code or connect a folder. No explanation needed.
              </p>
            </div>
            {!active && (
              <div className="rounded border border-line p-4 text-sm text-muted">
                {challenge.status === "completed"
                  ? "You marked this challenge completed."
                  : challenge.status === "saved"
                    ? "This challenge is saved for later."
                    : "This challenge is paused."}{" "}
                Resume to submit another version.
              </div>
            )}
            <fieldset
              disabled={!active || busy}
              className="space-y-5 disabled:opacity-60"
            >
              <div className="flex flex-wrap gap-3">
                <label className="relative flex cursor-pointer items-center gap-2 rounded-md border border-line px-4 py-3 text-sm hover:bg-elevated focus-within:ring-2">
                  <Paperclip size={16} />
                  Attach files
                  <input
                    aria-label="Attach source files"
                    type="file"
                    multiple
                    disabled={!active || busy}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length) upload.mutate(files);
                      e.target.value = "";
                    }}
                  />
                </label>
                <Button
                  className="h-auto py-3"
                  variant="ghost"
                  onClick={() => setFolderOpen(true)}
                >
                  <Folder size={16} />
                  Connect folder
                </Button>
              </div>
              {draft.uploads.length > 0 && (
                <div className="rounded-lg border border-line">
                  <div className="flex items-center justify-between border-b border-line px-4 py-2">
                    <span className="text-sm">
                      {draft.uploads.length}{" "}
                      {draft.uploads.length === 1 ? "file" : "files"} attached
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => update({ uploads: [] })}
                    >
                      Clear files
                    </Button>
                  </div>
                  <ul className="max-h-44 overflow-y-auto divide-y divide-line">
                    {draft.uploads.map((file) => (
                      <li
                        key={file.id}
                        className="flex items-center justify-between gap-3 px-4 py-2 text-xs"
                      >
                        <span className="min-w-0 break-all">
                          {file.filename}
                        </span>
                        <button
                          aria-label={"Remove " + file.filename}
                          onClick={() =>
                            update({
                              uploads: draft.uploads.filter(
                                (f) => f.id !== file.id,
                              ),
                            })
                          }
                          className="shrink-0 rounded p-1 hover:bg-elevated"
                        >
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(draft.projectId || Boolean(projects.data?.length)) && (
                <div className="space-y-3 rounded-lg border border-line p-4">
                  <label className="grid gap-2 text-sm">
                    Connected project
                    <select
                      aria-label="Connected project"
                      value={draft.projectId}
                      onChange={(e) => update({ projectId: e.target.value })}
                      className="w-full min-w-0 rounded border border-line bg-surface px-3 py-2 text-sm"
                    >
                      <option value="">
                        Use uploaded files or pasted code
                      </option>
                      {projects.data?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {p.root}
                        </option>
                      ))}
                    </select>
                  </label>
                  {draft.projectId && (
                    <details className="text-xs text-muted">
                      <summary className="cursor-pointer">
                        Project options
                      </summary>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input
                          aria-label="Relevant subdirectory"
                          value={draft.subdirectory}
                          onChange={(e) =>
                            update({ subdirectory: e.target.value })
                          }
                          placeholder="Source subfolder (optional)"
                          className="min-w-0 rounded border border-line bg-surface px-3 py-2 text-sm"
                        />
                        <input
                          aria-label="Base Git revision"
                          value={draft.baseRevision}
                          onChange={(e) =>
                            update({ baseRevision: e.target.value })
                          }
                          placeholder="Base Git revision (optional)"
                          className="min-w-0 rounded border border-line bg-surface px-3 py-2 text-sm"
                        />
                      </div>
                    </details>
                  )}
                </div>
              )}
              <details className="text-sm">
                <summary className="cursor-pointer text-muted">
                  Or paste code
                </summary>
                <Textarea
                  aria-label="Implementation code"
                  value={draft.content}
                  onChange={(e) => update({ content: e.target.value })}
                  placeholder="Paste code here…"
                  rows={9}
                  className="mt-3 font-mono text-sm"
                />
              </details>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                <p role="status" className="text-xs text-muted">
                  {uploadProgress ||
                    (draft.projectId
                      ? "A fresh snapshot is saved with each submission."
                      : "Files are saved with this submission.")}
                </p>
                <Button
                  variant="primary"
                  disabled={
                    !active ||
                    busy ||
                    Boolean(running) ||
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
            </fieldset>
            {uploadNotice && (
              <p className="text-xs text-muted">{uploadNotice}</p>
            )}
            {running && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setTab("reviews")}
              >
                View running review
              </Button>
            )}
          </section>
        </TabsContent>
        <TabsContent
          value="reviews"
          className="min-h-0 overflow-y-auto px-5 py-7 md:px-10"
        >
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
              busy={busy || Boolean(running) || !active}
              onRetry={(review, response) =>
                reviewAction.mutate({ review, response })
              }
              onCancel={(review) =>
                reviewAction.mutate({ review, cancel: true })
              }
            />
          )}
          {!!legacyReviews.length && (
            <details className="mx-auto mt-5 max-w-[900px] border-t border-line pt-4 text-sm">
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
        </TabsContent>
      </Tabs>
      <ProjectPicker
        profileId={profile.id}
        open={folderOpen}
        onOpenChange={setFolderOpen}
        onSelect={(path) => connection.mutate(path)}
      />
    </main>
  );
}
