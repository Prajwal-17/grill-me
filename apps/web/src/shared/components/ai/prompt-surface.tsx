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
        "overflow-hidden rounded-2xl border border-black/8 bg-surface transition-[border-color,box-shadow] duration-150 focus-within:border-foreground/20",
        "shadow-[0_1px_2px_rgba(0,0,0,0.05),0_12px_32px_-20px_rgba(0,0,0,0.10),inset_0_1px_0_rgba(255,255,255,0.6)]",
        "dark:border-white/8 dark:shadow-[0_14px_32px_-18px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.035)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
