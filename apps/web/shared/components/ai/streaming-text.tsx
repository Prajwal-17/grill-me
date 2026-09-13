"use client";
// Beautiful UI StreamingText, adapted to live deltas instead of its demo timer.
import { Markdown } from "@/shared/components/markdown";
import { StreamingStatus } from "@/shared/components/ai/streaming-status";

export function StreamingText({
  content,
  streaming = false,
  waitingLabel = "Thinking…",
}: {
  content: string;
  streaming?: boolean;
  waitingLabel?: string;
}) {
  return (
    <div className="min-w-0" aria-busy={streaming} data-slot="streaming-text">
      {content && <Markdown streaming={streaming}>{content}</Markdown>}
      {streaming &&
        (content ? (
          <span
            role="status"
            aria-label="Response streaming"
            className="ml-0.5 inline-flex h-5 items-center align-middle"
          >
            <span
              aria-hidden="true"
              className="inline-block h-3.5 w-0.5 animate-[stream-cursor-pulse_1s_ease-in-out_infinite] rounded-full bg-foreground"
            />
          </span>
        ) : (
          <StreamingStatus label={waitingLabel} />
        ))}
    </div>
  );
}
