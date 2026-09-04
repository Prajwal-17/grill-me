import { ArrowUp, ClipboardCheck, LoaderCircle, X } from "lucide-react";
import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { cn } from "../../../shared/lib/cn";
import type { ComposerMode } from "../api/message-api";
import { shouldSubmitOnEnter } from "../lib/composer-keyboard";

export function ChatComposer({
  mode,
  message,
  busy,
  error,
  textareaRef,
  onModeChange,
  onMessageChange,
  onSubmit,
}: {
  mode: ComposerMode;
  message: string;
  busy: boolean;
  error?: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onModeChange: (mode: ComposerMode) => void;
  onMessageChange: (message: string) => void;
  onSubmit: () => void;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    if (message.trim() && !busy) onSubmit();
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!shouldSubmitOnEnter(event)) return;

    event.preventDefault();
    if (message.trim() && !busy) onSubmit();
  }

  return (
    <form
      className="border-t border-line bg-surface px-4 py-4 md:px-6"
      onSubmit={submit}
    >
      <div
        className={cn(
          "mx-auto w-full max-w-3xl overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-xl shadow-black/15 transition focus-within:border-brand/70 focus-within:ring-2 focus-within:ring-brand/10",
          mode === "review" && "border-violet/55 focus-within:border-violet/70",
        )}
      >
        {mode === "review" && (
          <div className="flex items-center justify-between border-b border-violet/20 bg-violet/[0.08] px-3 py-2 text-xs text-violet">
            <span className="inline-flex items-center gap-2">
              <ClipboardCheck size={14} /> Reviewing solution
            </span>
            <button
              type="button"
              aria-label="Exit solution review mode"
              className="grid size-6 place-items-center rounded hover:bg-violet/10"
              onClick={() => onModeChange("clarify")}
            >
              <X size={15} />
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          onKeyDown={keyDown}
          placeholder={
            mode === "review"
              ? "Paste your solution for review..."
              : "Ask a question about this exercise..."
          }
          rows={mode === "review" ? 6 : 3}
          maxLength={40_000}
          className="block min-h-20 w-full resize-y bg-transparent px-3.5 pt-3 pb-1 text-sm leading-6 outline-none placeholder:text-dim"
        />

        <div className="flex min-h-11 items-center justify-end px-3 py-2">
          <button
            type="submit"
            aria-label={
              mode === "review" ? "Send solution for review" : "Send message"
            }
            disabled={busy || !message.trim()}
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 disabled:pointer-events-none disabled:opacity-40"
          >
            {busy ? (
              <LoaderCircle className="animate-spin" size={17} />
            ) : (
              <ArrowUp size={17} />
            )}
          </button>
        </div>
      </div>
      {error && (
        <p
          className="mx-auto mt-2 w-full max-w-3xl text-xs text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}
    </form>
  );
}
