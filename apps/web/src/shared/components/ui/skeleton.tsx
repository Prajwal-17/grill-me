import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";

// Adapted from shadcn/ui. See LICENSE.md.
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-md bg-elevated motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}
