import { FileCode2 } from "lucide-react";
import type { MessageAttachment, MessageMode } from "../../../shared/types/api";
import { Markdown } from "../../../shared/components/markdown";
import { CodeBlock } from "../../../shared/components/ui/code-block";
import { cn } from "../../../shared/lib/cn";

export function ChatMessage({
  role,
  mode,
  content,
  attachments = [],
  streaming = false,
}: {
  role: "user" | "assistant";
  mode: MessageMode;
  content: string;
  attachments?: MessageAttachment[];
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
          "min-w-0 text-[15px] leading-7",
          user
            ? "max-w-[min(92%,42rem)] rounded-xl rounded-tr-sm border border-blue-600 bg-blue-700 px-3.5 py-2.5 text-white"
            : "w-full max-w-[42rem] py-2 text-slate-300",
        )}
      >
        {modeLabel && (
          <span
            className={cn(
              "mb-2 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium",
              mode === "hint"
                ? "border-brand/25 text-blue-300"
                : "border-brand/40 text-blue-200",
            )}
          >
            {modeLabel}
          </span>
        )}
        {content && <Markdown>{content}</Markdown>}
        {attachments.length > 0 && (
          <div className={cn("grid gap-2", content && "mt-3")}>
            {attachments.map((attachment, index) => (
              <details
                className="overflow-hidden rounded-lg border border-white/15 bg-[#0a0c0f]"
                key={`${attachment.filename}-${index}`}
              >
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-slate-200 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/60">
                  <FileCode2 className="text-blue-300" size={14} />
                  <span className="truncate">{attachment.filename}</span>
                </summary>
                <div className="border-t border-line [&>div]:my-0 [&>div]:rounded-none [&>div]:border-0">
                  <CodeBlock
                    code={attachment.text}
                    label={attachment.filename}
                  />
                </div>
              </details>
            ))}
          </div>
        )}
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
