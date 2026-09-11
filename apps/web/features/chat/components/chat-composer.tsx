"use client";
// Prompt and toolbar layout adapted from Beautiful UI.
import {
  AlertCircle,
  ArrowUp,
  FileCode2,
  LoaderCircle,
  Paperclip,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { PromptTextarea } from "../../../shared/components/ai/prompt-textarea";
import { PromptSurface } from "../../../shared/components/ai/prompt-surface";
import { Button } from "../../../shared/components/ui/button";
import { ChoiceSelect } from "../../../shared/components/ui/choice-select";
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
  fixedMode = false,
  allowAttachments = true,
  large = false,
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
  fixedMode?: boolean;
  allowAttachments?: boolean;
  large?: boolean;
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
    <form
      className={large ? "shrink-0" : "shrink-0 p-3 pt-2 md:p-4 md:pt-2"}
      onSubmit={submit}
    >
      <PromptSurface>
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            <AnimatePresence initial={false}>
              {attachments.map((file, index) => (
                <motion.span
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
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
                        attachments.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      )
                    }
                  >
                    <X size={13} />
                  </button>
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        )}
        <PromptTextarea
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
          minHeight={large ? 96 : 64}
          maxLength={40000}
          className="block w-full resize-none bg-transparent px-3 pt-3 text-base md:text-sm leading-6 outline-none placeholder:text-muted disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-2 p-2">
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
            {allowAttachments && (
              <button
                type="button"
                className="inline-flex min-h-9 items-center gap-1.5 rounded px-2 text-xs text-muted hover:bg-elevated disabled:opacity-40"
                disabled={disabled || attachments.length >= MAX_ATTACHMENTS}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip size={15} />
                {reading ? "Reading…" : "Attach"}
              </button>
            )}
            {!fixedMode && (
              <ChoiceSelect
                label="Message mode"
                value={mode}
                disabled={disabled || attachments.length > 0}
                options={[
                  { id: "clarify", label: "Ask a question" },
                  { id: "review", label: "Review solution" },
                ]}
                onChange={(value) => onModeChange(value as ComposerMode)}
                className="h-8 max-w-[160px] border-0 bg-canvas px-2 text-xs shadow-none"
              />
            )}
            {attachments.length > 0 && (
              <span className="hidden truncate text-xs text-muted xl:block">
                {attachments.length}/5 ·{" "}
                {Math.ceil(attachmentBytes(attachments) / 1024)} KB
              </span>
            )}
          </div>
          <Button
            type="submit"
            size={large ? "default" : "icon"}
            variant="primary"
            aria-label={
              mode === "review" ? "Send solution for review" : "Send message"
            }
            disabled={disabled || (!message.trim() && !attachments.length)}
            className="rounded-lg"
          >
            {large && (busy ? "Reviewing…" : "Submit for review")}
            {busy ? (
              <LoaderCircle size={17} className="animate-spin" />
            ) : (
              <ArrowUp size={17} />
            )}
          </Button>
        </div>
      </PromptSurface>
      {(fileError || error) && (
        <p role="alert" className="feedback mt-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {fileError || error}
        </p>
      )}
    </form>
  );
}
