import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

// Adapted from shadcn/ui. See LICENSE.md.
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn("rounded-md bg-elevated", className)}
      {...props}
    />
  );
}

/** Reserve layout immediately; reveal placeholders only for perceptible waits. */
export function LoadingRegion({
  children,
  label,
  className,
  layout,
}: {
  children: ReactNode;
  label: string;
  className?: string;
  layout?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      data-loading-layout={layout}
      className={cn("loading-placeholder", className)}
    >
      {children}
    </div>
  );
}
