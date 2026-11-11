import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Square } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { challengeKeys } from "@/features/challenges/api/challenge-api";
import { getMessages, retryMessage, sendMessage } from "../api/message-api";
import { ChatMessage } from "./chat-message";
import {
  ModelPicker,
  useComposerModel,
} from "@/shared/components/ai/model-picker";
export function ReviewDiscussion({
  profileId,
  challengeId,
  active,
}: {
  profileId: string;
  challengeId: string;
  active: boolean;
}) {
  const queries = useQueryClient();
  const composer = useComposerModel();
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const key = challengeKeys.messages(challengeId);
  const messages = useQuery({
    queryKey: key,
    queryFn: () => getMessages(profileId, challengeId),
    refetchInterval: (query) =>
      query.state.data?.some((m) => m.status === "streaming") ? 1000 : false,
  });
  const send = useMutation({
    mutationFn: async (retryId?: string) => {
      controller.current = new AbortController();
      setReply("");
      let first = true;
      const onDelta = (text: string) => {
        setReply((current) => current + text);
        if (first) {
          first = false;
          void queries.invalidateQueries({ queryKey: key });
        }
      };
      return retryId
        ? retryMessage(
            profileId,
            challengeId,
            retryId,
            onDelta,
            controller.current.signal,
            composer.selection,
          )
        : sendMessage(
            profileId,
            challengeId,
            draft,
            "clarify",
            [],
            onDelta,
            controller.current.signal,
            composer.selection,
          );
    },
    onSuccess: () => setDraft(""),
    onSettled: async () => {
      controller.current = null;
      await queries.invalidateQueries({ queryKey: key });
      setReply("");
    },
  });
  const history =
    messages.data?.filter((m) => m.mode === "clarify" || m.mode === "review") ??
    [];
  const last = history.at(-1);
  const savedFailure =
    last?.error === send.error?.message ||
    (send.error?.name === "AbortError" && last?.status === "cancelled");
  const inFlight =
    send.isPending || history.some((m) => m.status === "streaming");
  return (
    <section
      className="border-t border-line pt-6"
      aria-labelledby="discussion-title"
    >
      <h2 id="discussion-title" className="text-ui font-semibold">
        Questions & follow-ups
      </h2>
      {messages.error && (
        <p role="alert" className="mt-3 text-supporting text-destructive">
          Could not load the discussion.{" "}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void messages.refetch()}
          >
            Try again
          </Button>
        </p>
      )}
      <div className="divide-y divide-line">
        {history
          .filter((m) => !send.isPending || m.status !== "streaming")
          .map((message) => (
            <div key={message.id}>
              <ChatMessage
                {...message}
                streaming={message.status === "streaming"}
              />
              {message.status &&
                !["completed", "streaming"].includes(message.status) && (
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 text-supporting text-muted">
                      {message.error ?? "This response was interrupted."}
                    </p>
                    {active && (
                      <Button
                        size="sm"
                        disabled={inFlight}
                        onClick={() => send.mutate(message.id)}
                      >
                        Retry response
                      </Button>
                    )}
                  </div>
                )}
            </div>
          ))}
      </div>
      {send.isPending && (
        <ChatMessage
          role="assistant"
          mode="clarify"
          content={reply}
          streaming
        />
      )}
      {send.error && !send.isPending && !savedFailure && (
        <p role="alert" className="my-3 text-supporting text-destructive">
          {send.error.name === "AbortError"
            ? "Response stopped. Your conversation is saved."
            : send.error.message}
        </p>
      )}
      {active && (
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim() && !inFlight) send.mutate(undefined);
          }}
        >
          <label htmlFor="discussion-message" className="sr-only">
            Ask about this challenge
          </label>
          <Textarea
            id="discussion-message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={inFlight}
            placeholder="Ask about this challenge or a review…"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ModelPicker disabled={inFlight} />
            {send.isPending ? (
              <Button type="button" onClick={() => controller.current?.abort()}>
                <Square size={13} />
                Stop response
              </Button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                disabled={!draft.trim() || inFlight}
              >
                <Send size={14} />
                Send message
              </Button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
