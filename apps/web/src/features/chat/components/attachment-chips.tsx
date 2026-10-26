import { FileCode2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { MessageAttachment } from "@/shared/types/api";
export function AttachmentChips({
  attachments,
  disabled,
  onAttachmentsChange,
}: {
  attachments: MessageAttachment[];
  disabled: boolean;
  onAttachmentsChange: (files: MessageAttachment[]) => void;
}) {
  return (
    <>
      {" "}
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
                      attachments.filter((_, itemIndex) => itemIndex !== index),
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
    </>
  );
}
