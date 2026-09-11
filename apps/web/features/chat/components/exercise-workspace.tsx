"use client";
import { AlertCircle } from "lucide-react";
import type { Challenge } from "../../../shared/types/api";
import { Tabs } from "../../../shared/components/ui/tabs";
import type { WorkspaceTab } from "../types/workspace";
import type { ExerciseWorkspaceState } from "../hooks/use-exercise-workspace";
import { ActivityFeedback } from "./activity-feedback";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceTabs } from "./workspace-tabs";
import { StatementPanel } from "./statement-panel";
import { HintPanel } from "./hint-panel";
import { SolutionPanel } from "./solution-panel";
import { ReviewPanel } from "./review-panel";
import { ReportsPanel } from "./reports-panel";
import { DiscussionPanel } from "./discussion-panel";

export function ExerciseWorkspace({
  state,
}: {
  state: ExerciseWorkspaceState & { challenge: Challenge };
}) {
  const {
    activityReady,
    busy,
    challenge,
    chat,
    chatComposer,
    complete,
    finished,
    hint,
    messages,
    pending,
    question,
    reply,
    reviews,
    saved,
    scroll,
    send,
    setQuestion,
    onScroll,
    scrollToLatest,
    setSolution,
    setSolutionFiles,
    setTab,
    showLatest,
    solution,
    solutionComposer,
    solutionFiles,
    submissions,
    tab,
  } = state;
  const messageFeedback =
    !messages.isLoading && !messages.error ? null : (
      <ActivityFeedback messages={messages} />
    );
  return (
    <main className="workspace flex min-h-0 flex-col">
      <WorkspaceHeader finished={finished} busy={busy} complete={complete} />
      {(complete.error ||
        (send.error && tab !== "solution" && tab !== "chat")) && (
        <p role="alert" className="feedback border-b border-line px-5 py-3">
          <AlertCircle size={16} />
          {(complete.error ?? send.error)?.message}
          {send.error && (
            <button
              className="underline"
              onClick={() =>
                setTab(send.variables?.mode === "review" ? "solution" : "chat")
              }
            >
              Return to your draft
            </button>
          )}
        </p>
      )}

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as WorkspaceTab)}
        className="min-h-0 flex-1 gap-0"
      >
        <WorkspaceTabs reviews={reviews} send={send} />
        <StatementPanel
          finished={finished}
          setTab={setTab}
          challenge={challenge}
        />
        <HintPanel
          finished={finished}
          busy={busy}
          hint={hint}
          reply={reply}
          challenge={challenge}
        />
        <SolutionPanel
          finished={finished}
          busy={busy}
          send={send}
          solution={solution}
          setSolution={setSolution}
          solutionFiles={solutionFiles}
          setSolutionFiles={setSolutionFiles}
          solutionComposer={solutionComposer}
          submissions={submissions}
          activityReady={activityReady}
          setTab={setTab}
          challenge={challenge}
          messageFeedback={messageFeedback}
        />
        <ReviewPanel
          finished={finished}
          reply={reply}
          reviews={reviews}
          activityReady={activityReady}
          setTab={setTab}
          challenge={challenge}
          messageFeedback={messageFeedback}
        />
        <ReportsPanel
          saved={saved}
          setTab={setTab}
          challenge={challenge}
          messageFeedback={messageFeedback}
        />
        <DiscussionPanel
          finished={finished}
          busy={busy}
          send={send}
          question={question}
          setQuestion={setQuestion}
          chatComposer={chatComposer}
          scroll={scroll}
          onScroll={onScroll}
          scrollToLatest={scrollToLatest}
          showLatest={showLatest}
          chat={chat}
          pending={pending}
          reply={reply}
          messageFeedback={messageFeedback}
        />
      </Tabs>
    </main>
  );
}
