"use client";
import type { Challenge } from "@/shared/types/api";
import type { ChallengeWorkspaceState } from "@/features/chat/hooks/use-challenge-workspace";
import { AlertCircle, Lightbulb } from "lucide-react";
import { Markdown } from "@/shared/components/markdown";
import { ChatMessage } from "@/features/chat/components/chat-message";
import { Button } from "@/shared/components/ui/button";
import { TabsContent } from "@/shared/components/ui/tabs";
export function HintPanel({
  finished,
  busy,
  hint,
  reply,
  challenge,
}: Pick<ChallengeWorkspaceState, "finished" | "busy" | "hint" | "reply"> & {
  challenge: Challenge;
}) {
  return (
    <TabsContent
      value="hints"
      className="min-h-0 overflow-y-auto px-5 py-4 md:px-8"
    >
      <div className="mx-auto max-w-[76ch]">
        {!challenge.hint && !finished && (
          <div className="mb-4 flex items-center justify-end">
            <Button onClick={() => hint.mutate()} disabled={busy}>
              <Lightbulb size={15} />
              {hint.isPending ? "Getting hint…" : "Get a hint"}
            </Button>
          </div>
        )}
        {hint.error ? (
          <p
            role="alert"
            className="flex items-start gap-2 text-sm leading-6 text-destructive"
          >
            <AlertCircle size={16} />
            {hint.error.message}
          </p>
        ) : challenge.hint ? (
          <div className="text-base leading-7 [overflow-wrap:anywhere]">
            <Markdown>{challenge.hint}</Markdown>
          </div>
        ) : reply?.mode === "hint" ? (
          <ChatMessage role="assistant" {...reply} streaming />
        ) : (
          <p className="text-sm text-muted">
            {finished
              ? "No hint was requested for this build."
              : "Request a hint when you need a nudge."}
          </p>
        )}
      </div>
    </TabsContent>
  );
}
