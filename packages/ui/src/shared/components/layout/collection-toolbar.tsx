import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";

export function CollectionToolbar({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="collection-toolbar"
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel/50 p-3",
        className,
      )}
      {...props}
    />
  );
}

export function CollectionSummary({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 py-3 text-metadata tabular-nums text-muted",
        className,
      )}
      {...props}
    />
  );
}
