"use client";
import type { ReactNode } from "react";
import type { ChallengeWorkspaceState } from "@/features/chat/hooks/use-challenge-workspace";
import { ChevronDown } from "lucide-react";
import { ChatMessage } from "@/features/chat/components/chat-message";
import { ChatComposer } from "@/features/chat/components/chat-composer";
import { Button } from "@/shared/components/ui/button";
import { formatDate } from "@/features/challenges/lib/challenge-formatters";
import { TabsContent } from "@/shared/components/ui/tabs";
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
  messageFeedback,
}: Pick<
  ChallengeWorkspaceState,
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
> & { messageFeedback: ReactNode }) {
  return (
    <TabsContent
      forceMount
      value="solution"
      className="min-h-0 overflow-y-auto px-5 py-6 data-[state=inactive]:hidden md:px-10"
    >
      <div className="mx-auto w-full max-w-[76ch]">
        {!finished && (
          <>
            <p className="mb-4 text-sm text-muted">
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
        <section className={finished ? undefined : "mt-7"}>
          <h2 className="text-[15px] font-semibold">Submitted work</h2>
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
