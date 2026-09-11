"use client";
import { useRef, useState } from "react";
import type { MessageAttachment } from "../../../shared/types/api";
import type { ComposerMode } from "../api/message-api";
import { readAttachments } from "../lib/attachment-utils";
export function useComposerAttachments({
  busy,
  attachments,
  onAttachmentsChange,
  onModeChange,
}: {
  busy: boolean;
  attachments: MessageAttachment[];
  onAttachmentsChange: (files: MessageAttachment[]) => void;
  onModeChange: (mode: ComposerMode) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string>();
  const [reading, setReading] = useState(false);
  const disabled = busy || reading;
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
  return { fileInput, fileError, reading, disabled, addFiles };
}
