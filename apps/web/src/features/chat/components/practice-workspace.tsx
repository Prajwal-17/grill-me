import { Link, useNavigate, useSearchParams } from "react-router";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LoaderCircle,
  ArrowLeft,
  Pause,
  Play,
  Check,
  Archive,
  ArchiveRestore,
  FolderTree,
  CircleAlert,
} from "lucide-react";
import type { Challenge, Profile } from "@/shared/types/api";
import { CompactShell } from "@/shared/components/layout/compact-shell";
import { Button } from "@/shared/components/ui/button";
import { ChallengeWorkspaceMenu } from "@/features/challenges/components/challenge-workspace";
import { ChallengeReviewSection } from "@/features/challenges/components/challenge-review";
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
import { cn } from "@/shared/lib/cn";
import { ChallengeOverview } from "./challenge-overview";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "review", label: "Review" },
  { id: "activity", label: "Activity" },
  { id: "quizzes", label: "Quizzes" },
] as const;

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
  const [inspectorModal, setInspectorModal] = useState(false);
  const wide = useWideWorkspace();
  const filesToggle = useRef<HTMLButtonElement>(null);
  const [workspaceElement, setWorkspaceElement] = useState<HTMLElement | null>(
    null,
  );
  const filesExpandToggle = useRef<HTMLButtonElement>(null);
  const filesShown = filesOpen;
  const filesOverlay = filesShown && filesExpanded && wide;
  const sideNavigation = wide && !filesShown;
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
      params.delete("view");
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
    <CompactShell profile={profile}>
      <main
        ref={setWorkspaceElement}
        className="relative flex h-full min-h-0 overflow-clip"
      >
        <div
          className="flex min-w-0 flex-1 flex-col"
          inert={filesOverlay || inspectorModal}
          aria-hidden={filesOverlay || inspectorModal || undefined}
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
            orientation={sideNavigation ? "vertical" : "horizontal"}
            className="min-h-0 flex-1 gap-0 overflow-clip"
          >
            <div
              className={cn(
                "shrink-0",
                sideNavigation
                  ? "w-44 overflow-y-auto px-5 pt-5"
                  : "scrollbar-quiet overflow-x-auto px-3",
              )}
            >
              <TabsList
                variant="line"
                aria-label="Challenge sections"
                className={cn(
                  "gap-0.5 p-0",
                  sideNavigation ? "w-full" : "min-w-max",
                )}
              >
                {SECTIONS.map(({ id, label }) => (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className={cn(
                      "min-h-9 flex-none px-3 data-[state=active]:text-foreground dark:data-[state=active]:text-foreground after:bg-foreground",
                      sideNavigation &&
                        "after:left-0 after:rounded-full data-[orientation=vertical]:after:inset-y-2.5 data-[orientation=vertical]:after:right-auto",
                    )}
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <header className="mx-auto flex w-full max-w-[1152px] shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-4 pb-3 sm:px-6 md:pt-5">
                <div className="relative flex min-w-0 flex-[1_1_22rem] items-start gap-2">
                  <Button
                    asChild
                    size="icon-sm"
                    variant="ghost"
                    className={cn(
                      "shrink-0 text-muted",
                      sideNavigation ? "absolute top-0 -left-8" : "-ml-2",
                    )}
                  >
                    <Link
                      to={backTo.href}
                      aria-label={`Back to ${backTo.label}`}
                      title={`Back to ${backTo.label}`}
                    >
                      <ArrowLeft size={16} aria-hidden="true" />
                    </Link>
                  </Button>
                  <h1 className="flex min-h-8 min-w-0 items-start gap-2 py-1 text-section leading-tight font-semibold tracking-tight">
                    <span className="shrink-0 font-mono text-supporting leading-6 font-medium text-muted">
                      #{challenge.number}
                    </span>
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {challenge.title}
                    </span>
                  </h1>
                </div>
                <Button
                  ref={filesToggle}
                  size="sm"
                  variant={filesShown ? "secondary" : "ghost"}
                  aria-expanded={filesShown}
                  aria-controls={filesShown ? "project-files" : undefined}
                  onClick={() => (filesShown ? closeFiles() : openFiles())}
                >
                  <FolderTree size={14} aria-hidden="true" />
                  {filesShown ? "Hide files" : "Files"}
                </Button>
              </header>
              <TabsContent
                value="overview"
                className="scrollbar-quiet min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
              >
                <ChallengeOverview
                  challenge={challenge}
                  archived={archived}
                  actions={
                    <>
                      <ChallengeWorkspaceMenu
                        profileId={profile.id}
                        challengeId={challenge.id}
                      />
                      {archived ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => lifecycle.mutate("restored")}
                        >
                          <ArchiveRestore size={14} aria-hidden="true" />{" "}
                          Restore
                        </Button>
                      ) : (
                        <>
                          {challenge.status !== "completed" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => lifecycle.mutate("completed")}
                            >
                              <Check size={14} aria-hidden="true" /> Mark
                              completed
                            </Button>
                          )}
                          <div className="flex flex-wrap items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                lifecycle.mutate(active ? "paused" : "active")
                              }
                            >
                              {active ? (
                                <Pause size={14} aria-hidden="true" />
                              ) : (
                                <Play size={14} aria-hidden="true" />
                              )}
                              {active ? "Pause" : "Resume"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => lifecycle.mutate("archived")}
                            >
                              <Archive size={14} aria-hidden="true" /> Archive
                            </Button>
                          </div>
                        </>
                      )}
                    </>
                  }
                />
              </TabsContent>
              <TabsContent
                value="review"
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <ChallengeReviewSection
                  profileId={profile.id}
                  challenge={challenge}
                  enabled={!archived}
                  onOpenRun={(threadId) =>
                    updateParams((params) => {
                      params.set("tab", "activity");
                      params.set("activity", "reviews");
                      params.set("run", threadId);
                      params.set("view", "trajectory");
                    })
                  }
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
                  projectFilesOpen={filesShown}
                  inspectorContainer={workspaceElement}
                  onInspectorModalChange={setInspectorModal}
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
                className="mx-auto flex min-h-0 w-full max-w-[1152px] flex-1 flex-col overflow-hidden px-4 pb-3 sm:px-6"
              >
                <QuizWorkspace
                  profileId={profile.id}
                  challengeId={challenge.id}
                />
              </TabsContent>
            </div>
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
    </CompactShell>
  );
}
