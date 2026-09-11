"use client";
import type { ReactNode } from "react";
import type { Challenge } from "../../../shared/types/api";
import type { ExerciseWorkspaceState } from "../hooks/use-exercise-workspace";
import { ChevronDown } from "lucide-react";
import { ChatMessage } from "./chat-message";
import { ChatComposer } from "./chat-composer";
import { Button } from "../../../shared/components/ui/button";
import { formatDate } from "../../challenges/lib/challenge-formatters";
import { TabsContent } from "../../../shared/components/ui/tabs";
export function SolutionPanel({
  finished,
  busy,
  send,
  solution,
  setSolution,
  solutionFiles,
  setSolutionFiles,
  solutionComposer,
  submissions,
  activityReady,
  setTab,
  challenge,
  messageFeedback,
}: Pick<
  ExerciseWorkspaceState,
  | "finished"
  | "busy"
  | "send"
  | "solution"
  | "setSolution"
  | "solutionFiles"
  | "setSolutionFiles"
  | "solutionComposer"
  | "submissions"
  | "activityReady"
  | "setTab"
> & { challenge: Challenge; messageFeedback: ReactNode }) {
  return (
    <TabsContent
      forceMount
      value="solution"
      className="min-h-0 overflow-y-auto px-5 py-8 data-[state=inactive]:hidden md:px-10 md:py-10"
    >
      <div className="mx-auto w-full max-w-[76ch]">
        <h1 className="page-title">Your solution</h1>
        <p className="mt-2 text-sm text-muted">{challenge.title}</p>
        {!finished && (
          <>
            <p className="mb-5 mt-6 text-sm text-muted">
              Work in your own tools. Paste your solution or attach files for
              review.
            </p>
            <ChatComposer
              mode="review"
              fixedMode
              large
              message={solution}
              attachments={solutionFiles}
              busy={busy}
              error={
                send.variables?.mode === "review"
                  ? send.error?.message
                  : undefined
              }
              textareaRef={solutionComposer}
              onModeChange={() => {}}
              onMessageChange={(value) => {
                setSolution(value);
                if (!busy) send.reset();
              }}
              onAttachmentsChange={setSolutionFiles}
              onSubmit={() => {
                if (!busy)
                  send.mutate({
                    content: solution,
                    attachments: solutionFiles,
                    mode: "review",
                  });
              }}
            />
          </>
        )}
        <section className="mt-8">
          <h2 className="section-heading">Submitted work</h2>
          <div className="mt-4">
            {messageFeedback}
            {activityReady && !submissions.length && (
              <p className="text-sm text-muted">No solutions submitted yet.</p>
            )}
            {[...submissions].reverse().map((item, index) => (
              <details key={item.id} className="border-b border-line py-4">
                <summary className="flex items-center justify-between gap-3 text-sm">
                  <span>Submission {submissions.length - index}</span>
                  <span className="ml-auto text-xs text-muted">
                    {formatDate(item.createdAt)}
                  </span>
                  <ChevronDown size={14} />
                </summary>
                <ChatMessage {...item} />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTab("review")}
                >
                  Read feedback
                </Button>
              </details>
            ))}
          </div>
        </section>
      </div>
    </TabsContent>
  );
}
