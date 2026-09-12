"use client";
// Adapted from Beautiful UI's PromptBar and ChatComposer. See LICENSE.
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";
export function PromptSurface({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div className={cn("prompt-surface overflow-hidden", className)} {...props}>
      {children}
    </div>
  );
}
