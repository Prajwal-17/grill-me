"use client";
import type { ReactNode } from "react";
import type { Challenge } from "@/shared/types/api";
import type { ChallengeWorkspaceState } from "@/features/chat/hooks/use-challenge-workspace";
import { Upload } from "lucide-react";
import { ChatMessage } from "@/features/chat/components/chat-message";
import { Button } from "@/shared/components/ui/button";
import { formatDate } from "@/features/challenges/lib/challenge-formatters";
import { TabsContent } from "@/shared/components/ui/tabs";
export function ReviewPanel({
  finished,
  reply,
  reviews,
  activityReady,
  setTab,
  challenge,
  messageFeedback,
}: Pick<
  ChallengeWorkspaceState,
  "finished" | "reply" | "reviews" | "activityReady" | "setTab"
> & { challenge: Challenge; messageFeedback: ReactNode }) {
  return (
    <TabsContent
      value="review"
      className="min-h-0 overflow-y-auto px-5 py-8 md:px-10 md:py-10"
    >
      <div className="mx-auto w-full max-w-[76ch]">
        <h1 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.025em]">
          Review
        </h1>
        <p className="mb-6 mt-2 text-sm text-muted">{challenge.title}</p>
        {messageFeedback}
        {reply?.mode === "review" && (
          <ChatMessage role="assistant" {...reply} streaming />
        )}
        {activityReady && !reviews.length && reply?.mode !== "review" && (
          <div className="py-6">
            <p className="text-sm text-muted">
              Submit your solution to get feedback.
            </p>
            {!finished && (
              <Button className="mt-4" onClick={() => setTab("solution")}>
                <Upload size={15} />
                Add solution
              </Button>
            )}
          </div>
        )}
        {[...reviews].reverse().map((item, index) => (
          <section
            key={item.id}
            className="border-b border-line py-4 last:border-b-0"
          >
            <p className="flex items-center justify-between text-xs text-muted">
              <span>Review {reviews.length - index}</span>
              <time dateTime={item.createdAt}>
                {formatDate(item.createdAt)}
              </time>
            </p>
            <ChatMessage {...item} />
          </section>
        ))}
      </div>
    </TabsContent>
  );
}
