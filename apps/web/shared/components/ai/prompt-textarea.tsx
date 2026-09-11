"use client";
// Auto-sizing input adapted from Beautiful UI's PromptBar. See LICENSE.
import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { cn } from "../../lib/cn";

export function PromptTextarea({
  value,
  className,
  ...props
}: ComponentProps<"textarea">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = Math.min(220, Math.max(76, input.scrollHeight)) + "px";
  }, [value]);
  return (
    <textarea
      {...props}
      ref={ref}
      value={value}
      rows={1}
      className={cn(
        "block w-full resize-none bg-transparent px-4 py-4 text-base leading-6 outline-none placeholder:text-muted disabled:opacity-60",
        className,
      )}
    />
  );
}
