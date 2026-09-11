"use client";
// Message layout adapted from Beautiful UI's ChatComposer and StreamingText.
import { Check, Copy, FileCode2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MessageAttachment, MessageMode } from "../../../shared/types/api";
import { Markdown } from "../../../shared/components/markdown";
import { CodeBlock } from "../../../shared/components/ui/code-block";
import { Button } from "../../../shared/components/ui/button";
import { BrandMark } from "../../../shared/components/brand";
import { StreamingStatus } from "../../../shared/components/ai/streaming-status";
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
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const label = user
    ? "You"
    : mode === "review"
      ? "Solution review"
      : mode === "hint"
        ? "Hint"
        : "Grill Me";
  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setCopyError(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <article
      className={cn("group min-w-0 py-5", user && "ml-auto max-w-[92%]")}
    >
      <div
        className={cn("mb-2.5 flex items-center gap-2", user && "justify-end")}
      >
        {!user && <BrandMark className="size-5 rounded-[5px] [&_svg]:size-3" />}
        <p className="text-xs font-medium text-muted">{label}</p>
      </div>
      <div
        className={cn(
          "reading min-w-0",
          user && "rounded-xl rounded-tr-sm bg-canvas px-4 py-3",
        )}
      >
        {content && <Markdown>{content}</Markdown>}
        {attachments.length > 0 && (
          <div className={cn("grid gap-2", content && "mt-3")}>
            {attachments.map((file, index) => (
              <details
                key={file.filename + index}
                className="overflow-hidden rounded-lg border border-line bg-surface"
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
        {streaming && !content && (
          <StreamingStatus
            label={
              mode === "review"
                ? "Reviewing solution…"
                : mode === "hint"
                  ? "Preparing a hint…"
                  : "Thinking…"
            }
          />
        )}
        {streaming && content && (
          <span
            role="status"
            aria-label="Response streaming"
            className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-foreground align-middle"
          />
        )}
      </div>
      {!user && !streaming && content && (
        <div className="mt-2 flex items-center gap-2">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={copied ? "Response copied" : "Copy response"}
            onClick={() => void copy()}
            className="text-muted"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </Button>
          {copied && (
            <span role="status" className="text-xs text-muted">
              Copied
            </span>
          )}
          {copyError && (
            <span role="alert" className="text-xs text-muted">
              Could not copy. Select the text to copy it.
            </span>
          )}
        </div>
      )}
    </article>
  );
}
