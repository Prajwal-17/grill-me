import {
  ArrowUp,
  ClipboardCheck,
  FileCode2,
  LoaderCircle,
  Paperclip,
  X,
} from "lucide-react";
import {
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { cn } from "../../../shared/lib/cn";
import type { MessageAttachment } from "../../../shared/types/api";
import type { ComposerMode } from "../api/message-api";
import {
  attachmentBytes,
  MAX_ATTACHMENTS,
  readAttachments,
} from "../lib/attachment-utils";
import { shouldSubmitOnEnter } from "../lib/composer-keyboard";

export function ChatComposer({
  mode,
  message,
  attachments,
  busy,
  error,
  textareaRef,
  onModeChange,
  onMessageChange,
  onAttachmentsChange,
  onSubmit,
}: {
  mode: ComposerMode;
  message: string;
  attachments: MessageAttachment[];
  busy: boolean;
  error?: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onModeChange: (mode: ComposerMode) => void;
  onMessageChange: (message: string) => void;
  onAttachmentsChange: (attachments: MessageAttachment[]) => void;
  onSubmit: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    if ((message.trim() || attachments.length) && !busy) onSubmit();
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!shouldSubmitOnEnter(event)) return;

    event.preventDefault();
    if ((message.trim() || attachments.length) && !busy) onSubmit();
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setFileError(undefined);
    try {
      const next = await readAttachments(Array.from(files), attachments);
      onAttachmentsChange(next);
      onModeChange("review");
    } catch (error) {
      setFileError(
        error instanceof Error ? error.message : "Could not read that file.",
      );
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <form
      className="border-t border-line bg-canvas/55 px-4 py-4 backdrop-blur-xl md:px-6"
      onSubmit={submit}
    >
      <div
        className={cn(
          "surface-panel mx-auto w-full max-w-3xl overflow-hidden rounded-2xl transition-all duration-200 focus-within:border-brand/70 focus-within:shadow-2xl focus-within:shadow-brand/5 focus-within:ring-4 focus-within:ring-brand/10",
          mode === "review" && "border-brand/55 focus-within:border-brand/70",
        )}
      >
        {mode === "review" && (
          <div className="flex items-center justify-between border-b border-brand/20 bg-brand/[0.08] px-3 py-2 text-xs text-brand-bright">
            <span className="inline-flex items-center gap-2">
              <ClipboardCheck size={14} /> Reviewing solution
            </span>
            <button
              type="button"
              aria-label="Exit solution review mode"
              title={
                attachments.length
                  ? "Remove attached files before leaving review mode"
                  : undefined
              }
              disabled={attachments.length > 0}
              className="grid size-6 place-items-center rounded hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 disabled:cursor-not-allowed disabled:opacity-35"
              onClick={() => onModeChange("clarify")}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-line px-3 py-2.5">
            {attachments.map((attachment, index) => (
              <span
                className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-canvas/75 px-2.5 py-1.5 text-xs text-foreground"
                key={`${attachment.filename}-${index}`}
              >
                <FileCode2 className="shrink-0 text-brand" size={14} />
                <span className="max-w-48 truncate">{attachment.filename}</span>
                <button
                  type="button"
                  className="grid size-5 shrink-0 place-items-center rounded text-muted hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                  onClick={() =>
                    onAttachmentsChange(
                      attachments.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  aria-label={`Remove ${attachment.filename}`}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          onKeyDown={keyDown}
          placeholder={
            mode === "review"
              ? "Paste a solution or add finished files..."
              : "Ask a question about this exercise..."
          }
          rows={mode === "review" ? 6 : 3}
          maxLength={40_000}
          className="block min-h-20 w-full resize-y bg-transparent px-3.5 pt-3 pb-1 text-sm leading-6 outline-none placeholder:text-dim"
        />

        <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              multiple
              className="sr-only"
              accept=".txt,.md,.js,.jsx,.mjs,.ts,.tsx,.json,.css,.scss,.html,.py,.rb,.php,.java,.kt,.kts,.go,.rs,.c,.cc,.cpp,.h,.hpp,.cs,.swift,.scala,.sh,.bash,.ps1,.sql,.yaml,.yml,.toml,.xml,.vue,.svelte,.dart,.lua,.ex,.exs,.fs,.fsx,.hs,.clj,.r,.pl,.sol,.zig,.asm,.proto,.graphql,.csv,.ini,.cfg,.conf,.properties"
              onChange={(event) => void addFiles(event.target.files)}
            />
            <button
              type="button"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:opacity-40"
              disabled={busy || attachments.length >= MAX_ATTACHMENTS}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip size={15} /> Attach
            </button>
            {attachments.length > 0 && (
              <span className="truncate font-mono text-xs text-dim">
                {attachments.length}/5 ·{" "}
                {Math.ceil(attachmentBytes(attachments) / 1024)} KB
              </span>
            )}
          </div>
          <button
            type="submit"
            aria-label={
              mode === "review" ? "Send solution for review" : "Send message"
            }
            disabled={busy || (!message.trim() && attachments.length === 0)}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-brand bg-brand text-slate-950 shadow-lg shadow-brand/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-bright hover:shadow-brand/30 active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none"
          >
            {busy ? (
              <LoaderCircle className="animate-spin" size={17} />
            ) : (
              <ArrowUp size={17} />
            )}
          </button>
        </div>
      </div>
      {(fileError || error) && (
        <p
          className="mx-auto mt-2 w-full max-w-3xl text-xs text-red-400"
          role="alert"
        >
          {fileError || error}
        </p>
      )}
    </form>
  );
}
