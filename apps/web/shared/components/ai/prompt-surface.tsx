"use client";
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
        "overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_2px_8px_rgb(0_0_0/0.035),0_1px_2px_rgb(0_0_0/0.025)] transition-[border-color,box-shadow] duration-150 focus-within:border-line-strong focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--foreground)_5%,transparent)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
