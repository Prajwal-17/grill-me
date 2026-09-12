"use client";
import type { ReactNode } from "react";
import type { ChallengeWorkspaceState } from "@/features/chat/hooks/use-challenge-workspace";
import { ArrowDown } from "lucide-react";
import { ChatMessage } from "@/features/chat/components/chat-message";
import { ChatComposer } from "@/features/chat/components/chat-composer";
import { Button } from "@/shared/components/ui/button";
import { TabsContent } from "@/shared/components/ui/tabs";
export function DiscussionPanel({
  finished,
  busy,
  send,
  question,
  setQuestion,
  chatComposer,
  scroll,
  onScroll,
  scrollToLatest,
  showLatest,
  chat,
  pending,
  reply,
  messageFeedback,
}: Pick<
  ChallengeWorkspaceState,
  | "finished"
  | "busy"
  | "send"
  | "question"
  | "setQuestion"
  | "chatComposer"
  | "scroll"
  | "onScroll"
  | "scrollToLatest"
  | "showLatest"
  | "chat"
  | "pending"
  | "reply"
> & { messageFeedback: ReactNode }) {
  return (
    <TabsContent
      forceMount
      value="chat"
      className="relative flex min-h-0 flex-col data-[state=inactive]:hidden"
    >
      <div
        ref={scroll}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-10"
        onScroll={onScroll}
      >
        <div className="mx-auto w-full max-w-[76ch]">
          {messageFeedback}
          {chat.map((item) => (
            <ChatMessage key={item.id} {...item} />
          ))}
          {pending?.mode === "clarify" && (
            <ChatMessage role="user" {...pending} />
          )}{" "}
          {reply?.mode === "clarify" && (
            <ChatMessage role="assistant" {...reply} streaming />
          )}
        </div>
      </div>
      {showLatest && (
        <Button
          size="sm"
          className="absolute bottom-44 left-1/2 -translate-x-1/2 rounded-full shadow-sm"
          onClick={scrollToLatest}
        >
          <ArrowDown size={13} />
          Latest messages
        </Button>
      )}
      {!finished && (
        <div className="mx-auto w-full max-w-[calc(76ch+40px)]">
          <ChatComposer
            mode="clarify"
            fixedMode
            allowAttachments={false}
            message={question}
            attachments={[]}
            busy={busy}
            error={
              send.variables?.mode === "clarify"
                ? send.error?.message
                : undefined
            }
            textareaRef={chatComposer}
            onModeChange={() => {}}
            onMessageChange={(value) => {
              setQuestion(value);
              if (!busy) send.reset();
            }}
            onAttachmentsChange={() => {}}
            onSubmit={() => {
              if (!busy)
                send.mutate({
                  content: question,
                  mode: "clarify",
                  attachments: [],
                });
            }}
          />
        </div>
      )}
    </TabsContent>
  );
}
