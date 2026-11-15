import { useNavigate, useSearchParams } from "react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LoaderCircle,
  Lightbulb,
  Pause,
  Play,
  Check,
  Archive,
  ArchiveRestore,
  BookOpen,
  ListChecks,
  PanelRight,
  CircleAlert,
  History,
} from "lucide-react";
import type { Challenge, Profile } from "@/shared/types/api";
import { AppShell } from "@/shared/components/layout/app-shell";
import { Button } from "@/shared/components/ui/button";
import { Markdown } from "@/shared/components/markdown";
import { ChallengeCard } from "@/features/challenges/components/challenge-card";
import { ChallengeWorkspaceSection } from "@/features/challenges/components/challenge-workspace";
import { CopyButton } from "@/shared/components/ui/copy-button";
import { statementMarkdown } from "@/features/challenges/lib/challenge-statement";
import {
  challengeKeys,
  completeChallenge,
  setChallengeArchived,
  setChallengeStatus,
} from "@/features/challenges/api/challenge-api";
import { getHint, getMessages } from "@/features/chat/api/message-api";
import { ChallengeDiscussion } from "./challenge-discussion";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/components/ui/tabs";
import { QuizWorkspace } from "@/features/quizzes/components/quiz-workspace";
import { HarnessThreadPanel } from "@/features/harness";
import { ChallengeReference } from "./challenge-reference";
import { useWideWorkspace } from "../hooks/use-wide-workspace";
import { Sheet, SheetContent, SheetTitle } from "@/shared/components/ui/sheet";
import { useProjectPreparation } from "@/features/challenges/hooks/use-project-preparation";
import { projectPreparationView } from "@/features/challenges/lib/project-preparation-view";

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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [focusProject, setFocusProject] = useState(false);
  const requestedTab = searchParams.get("tab");
  const tab =
    requestedTab === "quizzes" || requestedTab === "runs"
      ? requestedTab
      : "overview";
  const setTab = (value: string) => {
    if (value !== "overview" && value !== "runs" && value !== "quizzes") return;
    if (value !== "overview") setFocusProject(false);
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === value) return;
    url.searchParams.set("tab", value);
    void navigate(url.pathname + url.search + url.hash, {
      preventScrollReset: true,
    });
  };
  const [reply, setReply] = useState("");
  const [sidePanel, setSidePanel] = useState<"task" | null>(null);
  const wide = useWideWorkspace();
  const taskToggle = useRef<HTMLButtonElement>(null);
  const referenceOpen = sidePanel === "task" && tab !== "overview";
  const closeReference = () => {
    setSidePanel(null);
    taskToggle.current?.focus();
  };
  const refresh = async () => {
    await Promise.all([
      queries.invalidateQueries({ queryKey: ["challenges"] }),
      queries.invalidateQueries({ queryKey: ["progress"] }),
      queries.invalidateQueries({
        queryKey: challengeKeys.messages(challenge.id),
      }),
      queries.invalidateQueries({ queryKey: ["harness-threads"] }),
    ]);
  };
  const messages = useQuery({
    queryKey: challengeKeys.messages(challenge.id),
    queryFn: () => getMessages(profile.id, challenge.id),
  });
  const lifecycle = useMutation({
    mutationFn: (
      status: "active" | "paused" | "archived" | "restored" | "completed",
    ) =>
      status === "archived" || status === "restored"
        ? setChallengeArchived(profile.id, challenge.id, status === "archived")
        : status === "completed"
          ? completeChallenge(profile.id, challenge.id)
          : setChallengeStatus(profile.id, challenge.id, status),
    onSuccess: async (_result, status) => {
      await refresh();
      if (status === "archived") navigate("/challenges?status=archived");
    },
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
  const busy = hint.isPending || lifecycle.isPending;
  const archived =
    Boolean(challenge.archivedAt) || challenge.status === "saved";
  const active = challenge.status === "active" && !archived;
  const project = useProjectPreparation(profile.id, challenge.id, {
    enabled: active,
  });
  const projectView = project.preparation.data
    ? projectPreparationView(project.preparation.data)
    : null;
  const projectAttention =
    tab !== "overview" &&
    active &&
    Boolean(
      projectView?.recovery?.needsReview || projectView?.awaitingApproval,
    );
  const reviewProject = () => {
    setTab("overview");
    setFocusProject(true);
  };
  const error = lifecycle.error ?? hint.error;
  const savedHints = messages.data?.filter((m) => m.mode === "hint") ?? [];
  return (
    <AppShell
      profile={profile}
      title={`#${challenge.number} ${challenge.title}`}
      breadcrumbs={[backTo]}
      contentScrollable={false}
    >
      <main className="relative flex h-full min-h-0 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          {error && (
            <p
              role="alert"
              className="shrink-0 border-b border-line px-5 py-3 text-ui text-destructive"
            >
              {error.message}
            </p>
          )}
          {projectAttention && projectView && (
            <div
              role="region"
              aria-label="Practice project attention"
              className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-5 py-2.5"
            >
              <CircleAlert
                size={15}
                aria-hidden="true"
                className="shrink-0 text-warning"
              />
              <p className="min-w-0 flex-1 break-words text-supporting text-muted">
                Practice project: {projectView.statusLabel}.
              </p>
              <Button size="sm" variant="secondary" onClick={reviewProject}>
                Review project
              </Button>
            </div>
          )}
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="min-h-0 flex-1 gap-0 overflow-hidden"
          >
            <div className="practice-workspace-navigation flex shrink-0 flex-wrap items-center justify-between gap-x-3 border-b border-line bg-panel/60 px-2 md:px-5">
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
                  <TabsTrigger value="runs" className="flex-none gap-2 px-3">
                    <History size={14} className="hidden sm:block" />
                    Runs
                  </TabsTrigger>
                  <TabsTrigger value="quizzes" className="flex-none gap-2 px-3">
                    <ListChecks size={14} className="hidden sm:block" />
                    Quizzes
                  </TabsTrigger>
                </TabsList>
              </div>
              <div
                role="group"
                aria-label="Build actions"
                className="ml-auto flex flex-wrap items-center gap-1 py-1.5"
              >
                {challenge.status === "completed" && (
                  <span className="text-metadata text-success">Completed</span>
                )}
                {archived && (
                  <span className="text-metadata text-muted">Archived</span>
                )}
                {!archived && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => lifecycle.mutate("archived")}
                  >
                    <Archive size={14} /> Archive
                  </Button>
                )}
                {archived ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => lifecycle.mutate("restored")}
                  >
                    <ArchiveRestore size={14} /> Restore
                  </Button>
                ) : active ? (
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
                {!archived && challenge.status !== "completed" && (
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
              <div className="px-4 py-6 md:px-8">
                <div className="mx-auto max-w-[880px] space-y-6">
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
                  <ChallengeWorkspaceSection
                    profileId={profile.id}
                    challenge={challenge}
                    focusProject={focusProject}
                    onProjectFocus={() => setFocusProject(false)}
                  />
                  {active && (
                    <div className="flex gap-2">
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
                        <div className="text-ui leading-6">
                          <Markdown>{reply}</Markdown>
                        </div>
                      )}
                      {hint.isPending && !reply && (
                        <p role="status" className="text-metadata text-muted">
                          Preparing a hint…
                        </p>
                      )}
                    </section>
                  )}
                  <ChallengeDiscussion
                    profileId={profile.id}
                    challengeId={challenge.id}
                    active={active}
                  />
                  {!!savedHints.length && (
                    <details className="border-t border-line pt-4 text-ui">
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
                    <details className="text-metadata text-muted">
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
              value="runs"
              className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
            >
              <div className="mx-auto max-w-[880px] space-y-6">
                <section aria-labelledby="project-runs-title">
                  <h2
                    id="project-runs-title"
                    className="mb-2 text-ui font-medium"
                  >
                    Project preparation
                  </h2>
                  <HarnessThreadPanel
                    profileId={profile.id}
                    kind="project_scaffold"
                    challengeId={challenge.id}
                    empty="No project preparation runs yet."
                  />
                </section>
                <section aria-labelledby="chat-runs-title">
                  <h2 id="chat-runs-title" className="mb-2 text-ui font-medium">
                    Discussions
                  </h2>
                  <HarnessThreadPanel
                    profileId={profile.id}
                    kind="chat"
                    challengeId={challenge.id}
                    empty="No discussions recorded yet."
                  />
                </section>
                <section aria-labelledby="hint-runs-title">
                  <h2 id="hint-runs-title" className="mb-2 text-ui font-medium">
                    Hints
                  </h2>
                  <HarnessThreadPanel
                    profileId={profile.id}
                    kind="hint"
                    challengeId={challenge.id}
                    empty="No hints recorded yet."
                  />
                </section>
              </div>
            </TabsContent>
            <TabsContent
              value="quizzes"
              className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
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
            className="w-[340px] min-w-[300px] max-w-[35%] shrink-0 border-l border-line bg-panel"
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
      </main>
    </AppShell>
  );
}
