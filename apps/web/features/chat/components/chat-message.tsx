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
  const label = user
    ? "You"
    : mode === "review"
      ? "Review"
      : mode === "hint"
        ? "Hint"
        : "Grill Me";
  return (
    <article className="min-w-0 py-4">
      <p className="mb-2 text-xs font-medium text-muted">{label}</p>
      <div
        className={cn(
          "reading min-w-0",
          user && "rounded-md border border-line bg-canvas p-3",
        )}
      >
        {content && <Markdown>{content}</Markdown>}
        {attachments.length > 0 && (
          <div className={cn("grid gap-2", content && "mt-3")}>
            {attachments.map((file, index) => (
              <details
                key={file.filename + index}
                className="overflow-hidden rounded-md border border-line bg-surface"
              >
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs">
                  <FileCode2 size={14} />
                  <span className="truncate">{file.filename}</span>
                </summary>
                <div className="border-t border-line [&>div]:my-0 [&>div]:rounded-none [&>div]:border-0">
                  <CodeBlock code={file.text} label={file.filename} />
                </div>
              </details>
            ))}
          </div>
        )}
        {streaming && (
          <span
            role="status"
            aria-label="Response streaming"
            className="ml-1 inline-block h-4 w-1 animate-pulse bg-foreground align-text-bottom"
          />
        )}
      </div>
    </article>
  );
}
