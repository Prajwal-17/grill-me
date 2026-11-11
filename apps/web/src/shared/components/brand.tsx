import { env } from "@/shared/config/env";
import { cn } from "@/shared/lib/cn";

export function DevelopmentBadge({ className }: { className?: string }) {
  if (env.appEnv !== "development") return null;
  return (
    <span
      aria-label="Development build"
      className={cn(
        "inline-flex shrink-0 items-center rounded border border-line-strong px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-warning",
        className,
      )}
    >
      dev
    </span>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center overflow-visible",
        className,
      )}
      aria-hidden="true"
    >
      <img
        src="/icon.svg"
        width={160}
        height={160}
        alt=""
        className="size-full object-contain"
      />
    </span>
  );
}

export function BrandLockup({
  className,
  markClassName,
  wordmarkClassName,
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap",
        className,
      )}
    >
      <BrandMark className={cn("size-11", markClassName)} />
      <span
        className={cn(
          "font-sans text-question font-semibold leading-none tracking-[-0.02em] text-foreground",
          wordmarkClassName,
        )}
      >
        Grill Me
      </span>
      <DevelopmentBadge />
    </span>
  );
}
