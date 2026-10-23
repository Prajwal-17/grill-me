import Image from "next/image";
import { cn } from "@/shared/lib/cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center overflow-visible",
        className,
      )}
      aria-hidden="true"
    >
      <Image
        src="/icon.svg"
        width={160}
        height={160}
        alt=""
        unoptimized
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
          "font-sans text-[18px] font-semibold leading-none tracking-[-0.025em] text-foreground",
          wordmarkClassName,
        )}
      >
        Grill Me
      </span>
    </span>
  );
}
