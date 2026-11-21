import { useNavigate, useSearchParams } from "react-router";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  LoaderCircle,
  Pause,
  Play,
  Check,
  Archive,
  ArchiveRestore,
  BookOpen,
  ClipboardCheck,
  FolderTree,
  ListChecks,
  CircleAlert,
} from "lucide-react";
import type { Challenge, Profile } from "@/shared/types/api";
import { AppShell } from "@/shared/components/layout/app-shell";
import { Button } from "@/shared/components/ui/button";
import { ChallengeCard } from "@/features/challenges/components/challenge-card";
import { ChallengePrompt } from "@/features/challenges/components/challenge-prompt";
import { ChallengeWorkspaceMenu } from "@/features/challenges/components/challenge-workspace";
import { ChallengeReviewSection } from "@/features/challenges/components/challenge-review";
import { CopyButton } from "@/shared/components/ui/copy-button";
import { statementMarkdown } from "@/features/challenges/lib/challenge-statement";
import {
  completeChallenge,
  setChallengeArchived,
  setChallengeStatus,
} from "@/features/challenges/api/challenge-api";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/components/ui/tabs";
import { QuizWorkspace } from "@/features/quizzes/components/quiz-workspace";
import { HarnessActivity } from "@/features/harness";
import {
  activityCategory,
  parseActivityCategory,
  type ActivityCategory,
  type ActivityView,
} from "@/features/harness/lib/activity";
import { useWideWorkspace } from "../hooks/use-wide-workspace";
import { Sheet, SheetContent, SheetTitle } from "@/shared/components/ui/sheet";
import { useProjectPreparation } from "@/features/challenges/hooks/use-project-preparation";
import { projectPreparationView } from "@/features/challenges/lib/project-preparation-view";
import { ProjectPreparationActions } from "@/features/challenges/components/project-preparation";
import { ProjectFilesPanel } from "@/features/challenges/components/project-files";

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
  const requestedTab = searchParams.get("tab");
  const activityParam = searchParams.get("activity");
  const activityRequested =
    requestedTab === "runs" ||
    requestedTab === "activity" ||
    activityParam !== null;
  const tab = activityRequested
    ? "activity"
    : requestedTab === "review" || requestedTab === "quizzes"
      ? requestedTab
      : "overview";
  const selectedActivityCategory =
    parseActivityCategory(activityParam) ?? "build";
  const selectedRunId = searchParams.get("run") ?? undefined;
  const activityView: ActivityView =
    searchParams.get("view") === "trajectory" ? "trajectory" : "transcript";
  const updateParams = (update: (params: URLSearchParams) => void) => {
    const url = new URL(window.location.href);
    const before = url.search;
    update(url.searchParams);
    if (url.search === before) return;
    void navigate(url.pathname + url.search + url.hash, {
      preventScrollReset: true,
    });
  };
  const setTab = (value: string) => {
    if (
      value !== "overview" &&
      value !== "review" &&
      value !== "activity" &&
      value !== "quizzes"
    )
      return;
    updateParams((params) => {
      if (params.get("tab") === value) return;
      params.set("tab", value);
      if (value !== "activity") {
        params.delete("activity");
        params.delete("run");
      }
    });
  };
  const [filesOpen, setFilesOpen] = useState(false);
  const [filesExpanded, setFilesExpanded] = useState(false);
  const wide = useWideWorkspace();
  const filesToggle = useRef<HTMLButtonElement>(null);
  const filesExpandToggle = useRef<HTMLButtonElement>(null);
  const filesShown = filesOpen;
  const filesOverlay = filesShown && filesExpanded && wide;
  const closeFiles = () => {
    setFilesOpen(false);
    setFilesExpanded(false);
    window.requestAnimationFrame(() => filesToggle.current?.focus());
  };
  const openFiles = () => {
    setFilesOpen(true);
  };
  const openActivity = (category?: ActivityCategory) => {
    updateParams((params) => {
      params.set("tab", "activity");
      if (category) params.set("activity", category);
      params.delete("run");
    });
  };
  const selectActivityCategory = (category: ActivityCategory) => {
    updateParams((params) => {
      params.set("tab", "activity");
      params.set("activity", category);
      params.delete("run");
    });
  };
  const selectActivityView = (view: ActivityView) => {
    updateParams((params) => {
      if (view === "trajectory") {
        if (params.get("view") === "trajectory") return;
        params.set("view", "trajectory");
      } else {
        if (!params.get("view")) return;
        params.delete("view");
      }
    });
  };
  const selectActivityRun = (thread: { id: string; kind: string }) => {
    const url = new URL(window.location.href);
    const before = url.search;
    url.searchParams.set("tab", "activity");
    url.searchParams.set("activity", activityCategory(thread.kind));
    url.searchParams.set("run", thread.id);
    if (url.search === before) return;
    void navigate(url.pathname + url.search + url.hash, {
      preventScrollReset: true,
      replace: true,
    });
  };
  const toggleFilesExpanded = () => {
    setFilesExpanded((expanded) => {
      if (expanded) {
        window.requestAnimationFrame(() => filesExpandToggle.current?.focus());
      }
      return !expanded;
    });
  };
  const refresh = async () => {
    await Promise.all([
      queries.invalidateQueries({ queryKey: ["challenges"] }),
      queries.invalidateQueries({ queryKey: ["progress"] }),
      queries.invalidateQueries({ queryKey: ["harness-threads"] }),
    ]);
  };
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
  const busy = lifecycle.isPending;
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
    tab !== "activity" &&
    active &&
    Boolean(
      projectView?.recovery?.needsReview || projectView?.awaitingApproval,
    );
  const reviewProject = () => {
    openActivity("build");
  };
  const error = lifecycle.error;
  return (
    <AppShell
      profile={profile}
      title={`#${challenge.number} ${challenge.title}`}
      breadcrumbs={[backTo]}
      contentScrollable={false}
    >
      <main className="relative flex h-full min-h-0 overflow-clip">
        <div
          className="flex min-w-0 flex-1 flex-col"
          inert={filesOverlay}
          aria-hidden={filesOverlay || undefined}
        >
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
            className="min-h-0 flex-1 gap-0 overflow-clip"
          >
            <div className="practice-workspace-navigation flex shrink-0 flex-wrap items-center justify-between gap-x-3 border-b border-line bg-panel/60 px-2 md:px-5">
              <div className="scrollbar-quiet min-w-0 overflow-x-auto">
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
                  <TabsTrigger value="review" className="flex-none gap-2 px-3">
                    <ClipboardCheck size={14} className="hidden sm:block" />
                    Review
                  </TabsTrigger>
                  <TabsTrigger
                    value="activity"
                    className="flex-none gap-2 px-3"
                  >
                    <Activity size={14} className="hidden sm:block" />
                    Activity
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
                <ChallengeWorkspaceMenu
                  profileId={profile.id}
                  challengeId={challenge.id}
                />
                <Button
                  ref={filesToggle}
                  size="sm"
                  variant={filesShown ? "secondary" : "ghost"}
                  aria-expanded={filesShown}
                  aria-controls={filesShown ? "project-files" : undefined}
                  title="Browse the prepared project's files"
                  onClick={() => (filesShown ? closeFiles() : openFiles())}
                >
                  <FolderTree size={14} />
                  {filesShown ? "Hide files" : "Files"}
                </Button>
              </div>
            </div>
            <TabsContent
              value="overview"
              className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto"
            >
              <div className="px-4 py-6 md:px-8">
                <div className="mx-auto max-w-[880px] space-y-6">
                  <ChallengePrompt challenge={challenge} />
                  <ChallengeCard
                    challenge={challenge}
                    className="max-w-none"
                    showTitle={false}
                    reading
                    headerAction={
                      <CopyButton
                        text={statementMarkdown(challenge)}
                        label="Copy challenge"
                      />
                    }
                  />
                </div>
              </div>
            </TabsContent>
            <TabsContent
              value="review"
              className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 md:px-8 md:py-6"
            >
              <ChallengeReviewSection
                profileId={profile.id}
                challenge={challenge}
                enabled={!archived}
              />
            </TabsContent>
            <TabsContent
              value="activity"
              className="min-h-0 flex-1 overflow-clip"
            >
              <HarnessActivity
                profileId={profile.id}
                challengeId={challenge.id}
                category={selectedActivityCategory}
                selectedRunId={selectedRunId}
                view={activityView}
                onSelectCategory={selectActivityCategory}
                onSelectRun={selectActivityRun}
                onSelectView={selectActivityView}
                prelude={
                  <ProjectPreparationActions
                    profileId={profile.id}
                    challengeId={challenge.id}
                    active={active}
                  />
                }
              />
            </TabsContent>
            <TabsContent
              value="quizzes"
              className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 md:p-5"
            >
              <QuizWorkspace
                profileId={profile.id}
                challengeId={challenge.id}
              />
            </TabsContent>
          </Tabs>
        </div>
        {filesShown && wide && (
          <aside
            id="project-files"
            aria-label={
              filesExpanded ? "Project files, expanded" : "Project files"
            }
            className={
              filesExpanded
                ? "absolute inset-0 z-20 flex w-full min-w-0 flex-col bg-panel"
                : "w-[56%] min-w-[520px] max-w-[920px] shrink-0 border-l border-line bg-panel"
            }
            onKeyDown={(event) => {
              if (event.key === "Escape" && !filesExpanded) {
                event.stopPropagation();
                closeFiles();
              }
            }}
          >
            <ProjectFilesPanel
              profileId={profile.id}
              challengeId={challenge.id}
              onClose={closeFiles}
              expanded={filesExpanded}
              onToggleExpanded={toggleFilesExpanded}
              expandButtonRef={filesExpandToggle}
            />
          </aside>
        )}
        <Sheet
          open={filesShown && !wide}
          onOpenChange={(open) => {
            if (!open) closeFiles();
          }}
        >
          <SheetContent
            id="project-files"
            className={
              filesExpanded
                ? "w-screen max-w-none gap-0 p-0 sm:max-w-none"
                : "w-[min(100%,780px)] gap-0 p-0 sm:max-w-[780px]"
            }
            showCloseButton={false}
            aria-describedby={undefined}
            onEscapeKeyDown={(event) => {
              if (!filesExpanded) return;
              event.preventDefault();
              toggleFilesExpanded();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              filesToggle.current?.focus();
            }}
          >
            <SheetTitle className="sr-only">Project files</SheetTitle>
            <ProjectFilesPanel
              profileId={profile.id}
              challengeId={challenge.id}
              onClose={closeFiles}
              defaultTreeOpen={false}
              expanded={filesExpanded}
              onToggleExpanded={toggleFilesExpanded}
              expandButtonRef={filesExpandToggle}
            />
          </SheetContent>
        </Sheet>
      </main>
    </AppShell>
  );
}
