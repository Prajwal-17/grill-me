// Adapted from Beautiful UI's PromptBar and ChatComposer. See LICENSE.
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";
export function PromptSurface({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="prompt-surface"
      className={cn(
        "overflow-hidden rounded-xl border border-input bg-surface transition-colors duration-150 focus-within:border-ring",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
