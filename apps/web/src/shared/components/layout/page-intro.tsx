import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export function PageIntro({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-7 flex shrink-0 flex-wrap items-end justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold leading-tight tracking-[-0.025em]">
          {title}
        </h2>
        <p className="mt-2 max-w-[65ch] text-sm leading-6 text-muted">
          {description}
        </p>
      </div>
      {actions}
    </div>
  );
}
