"use client";
// Adapted from Beautiful UI's PromptBar and ChatComposer. See LICENSE.
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
export function PromptSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("prompt-surface overflow-hidden", className)}>
      {children}
    </div>
  );
}
