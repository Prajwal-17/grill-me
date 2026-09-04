import type { MessageMode } from "../../../shared/types/api";
import { Markdown } from "../../../shared/components/markdown";
import { cn } from "../../../shared/lib/cn";

export function ChatMessage({
  role,
  mode,
  content,
  streaming = false,
}: {
  role: "user" | "assistant";
  mode: MessageMode;
  content: string;
  streaming?: boolean;
}) {
  const user = role === "user";
  const modeLabel =
    mode === "review" ? "Solution review" : mode === "hint" ? "Hint" : null;

  return (
    <article
      className={cn("flex py-2.5", user ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "min-w-0 text-sm leading-6",
          user
            ? "max-w-[min(84%,40rem)] rounded-xl rounded-tr-sm border border-blue-600 bg-blue-700 px-3.5 py-2.5 text-white"
            : "w-full max-w-[42rem] py-2 text-slate-300",
        )}
      >
        {modeLabel && (
          <span
            className={cn(
              "mb-2 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium",
              mode === "hint"
                ? "border-amber/35 text-amber"
                : "border-violet/40 text-violet",
            )}
          >
            {modeLabel}
          </span>
        )}
        {content && <Markdown>{content}</Markdown>}
        {streaming && (
          <span
            className="mt-1 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-brand align-text-bottom"
            aria-label="Streaming"
          />
        )}
      </div>
    </article>
  );
}
