import {
  AlertCircle,
  ArrowUp,
  FileCode2,
  LoaderCircle,
  Paperclip,
  X,
} from "lucide-react";
import { useRef, useState, type FormEvent, type RefObject } from "react";
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
  const [reading, setReading] = useState(false);
  const disabled = busy || reading;
  function submit(event?: FormEvent) {
    event?.preventDefault();
    if ((message.trim() || attachments.length) && !disabled) onSubmit();
  }
  async function addFiles(files: FileList | null) {
    if (!files?.length || disabled) return;
    setFileError(undefined);
    setReading(true);
    try {
      const next = await readAttachments(Array.from(files), attachments);
      onAttachmentsChange(next);
      onModeChange("review");
    } catch (error) {
      setFileError(
        error instanceof Error ? error.message : "Could not read that file.",
      );
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  return (
    <form className="shrink-0 border-t border-line p-4" onSubmit={submit}>
      <div className="overflow-hidden rounded-lg border border-line-strong bg-surface focus-within:border-foreground">
        {mode === "review" && (
          <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs">
            <span>Solution review</span>
            <button
              type="button"
              aria-label="Exit solution review mode"
              className="rounded p-1 text-muted hover:bg-elevated disabled:opacity-40"
              disabled={disabled || attachments.length > 0}
              title={
                attachments.length
                  ? "Remove attachments to leave review mode"
                  : undefined
              }
              onClick={() => onModeChange("clarify")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {attachments.map((file, index) => (
              <span
                key={file.filename + index}
                className="inline-flex max-w-full items-center gap-2 rounded border border-line bg-canvas py-1 pl-2 pr-1 text-xs"
              >
                <FileCode2 size={13} />
                <span className="max-w-40 truncate">{file.filename}</span>
                <button
                  type="button"
                  aria-label={"Remove " + file.filename}
                  disabled={disabled}
                  className="rounded p-1 hover:bg-elevated disabled:opacity-40"
                  onClick={() =>
                    onAttachmentsChange(
                      attachments.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          aria-label={mode === "review" ? "Your solution" : "Your question"}
          disabled={disabled}
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          onKeyDown={(event) => {
            if (shouldSubmitOnEnter(event)) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={
            mode === "review"
              ? "Paste your solution or attach files…"
              : "Ask about this exercise…"
          }
          rows={3}
          maxLength={40000}
          className="block min-h-20 max-h-60 w-full resize-y bg-transparent px-3 pt-3 text-sm leading-6 outline-none placeholder:text-muted disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-3 p-2">
          <div className="flex min-w-0 items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              multiple
              tabIndex={-1}
              className="hidden"
              accept=".txt,.md,.js,.jsx,.mjs,.ts,.tsx,.json,.css,.scss,.html,.py,.rb,.php,.java,.kt,.kts,.go,.rs,.c,.cc,.cpp,.h,.hpp,.cs,.swift,.scala,.sh,.bash,.ps1,.sql,.yaml,.yml,.toml,.xml,.vue,.svelte,.dart,.lua,.ex,.exs,.fs,.fsx,.hs,.clj,.r,.pl,.sol,.zig,.asm,.proto,.graphql,.csv,.ini,.cfg,.conf,.properties"
              onChange={(event) => void addFiles(event.target.files)}
            />
            <button
              type="button"
              className="inline-flex min-h-9 items-center gap-1.5 rounded px-2 text-xs text-muted hover:bg-elevated disabled:opacity-40"
              disabled={disabled || attachments.length >= MAX_ATTACHMENTS}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip size={15} />
              {reading ? "Reading…" : "Attach"}
            </button>
            {attachments.length > 0 && (
              <span className="truncate text-xs text-muted">
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
            disabled={disabled || (!message.trim() && !attachments.length)}
            className="grid size-9 shrink-0 place-items-center rounded-md bg-foreground text-canvas disabled:opacity-35"
          >
            {busy ? (
              <LoaderCircle size={17} className="animate-spin" />
            ) : (
              <ArrowUp size={17} />
            )}
          </button>
        </div>
      </div>
      {(fileError || error) && (
        <p role="alert" className="feedback mt-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {fileError || error}
        </p>
      )}
    </form>
  );
}
