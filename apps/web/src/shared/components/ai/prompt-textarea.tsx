// Auto-sizing input adapted from Beautiful UI's PromptBar. See LICENSE.
import {
  useLayoutEffect,
  useRef,
  useImperativeHandle,
  type ClipboardEvent,
  type ComponentProps,
} from "react";
import { cn } from "@/shared/lib/cn";

export function PromptTextarea({
  value,
  className,
  onAttachFiles,
  onPaste,
  ref: forwardedRef,
  minHeight = 76,
  ...props
}: ComponentProps<"textarea"> & {
  minHeight?: number;
  /** Files pasted into the composer (images, documents) become attachments. */
  onAttachFiles?: (files: File[]) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current!, []);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    const resize = () => {
      if (!input.clientWidth) return;
      input.style.height = "auto";
      input.style.height =
        Math.min(240, Math.max(minHeight, input.scrollHeight + 2)) + "px";
    };
    resize();
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      resize();
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [value, minHeight]);
  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    onPaste?.(event);
    if (!onAttachFiles || event.defaultPrevented || !event.clipboardData)
      return;
    const files = [...event.clipboardData.files];
    // Text still pastes normally; pasted screenshots and copied files, which
    // carry no text, take the attachment path instead.
    if (
      !files.length ||
      event.clipboardData.getData("text/plain").trim().length > 0
    )
      return;
    event.preventDefault();
    onAttachFiles(files);
  };
  return (
    <textarea
      {...props}
      onPaste={handlePaste}
      ref={ref}
      value={value}
      rows={1}
      className={cn(
        "block w-full resize-none bg-transparent px-4 py-4 text-sm leading-relaxed outline-none placeholder:text-muted disabled:opacity-60",
        className,
      )}
    />
  );
}
